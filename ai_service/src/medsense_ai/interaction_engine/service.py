"""Deterministic, fail-closed orchestration over provider-neutral DDI contracts."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone

from pydantic import ValidationError

from medsense_ai.ddi_providers import (
    CanonicalIngredientReference,
    DDIProvider,
    ProviderAdapterError,
    ProviderBatchLookupRequest,
    ProviderCoverageAssessment,
    ProviderFailure,
    ProviderFailureCategory,
    ProviderHealth,
    ProviderIngredientMapping,
    ProviderLookupStatus,
    ProviderMappingStatus,
    ProviderMetadata,
    ProviderPairLookupRequest,
    ProviderPairLookupResult,
    ProviderReadinessStatus,
    ProviderSourceAssertion,
    lookup_batch_fail_closed,
    lookup_pair_fail_closed,
)
from medsense_ai.interaction_engine.contracts import (
    DDIOrchestratedPairResult,
    DDIOrchestratedPairStatus,
    DDIOrchestrationCounts,
    DDIOrchestrationRequest,
    DDIOrchestrationResult,
    DDIOrchestrationStatus,
    PairSourceProvenance,
    ProviderMappingIssue,
    ProviderMappingIssueCode,
)
from medsense_ai.product_mapping import (
    CandidateIngredientPair,
    CandidatePairExpansionResult,
    CrosswalkMappingStatus,
    ReviewStatus,
    RxNormIngredientCrosswalk,
    expand_candidate_ingredient_pairs,
)

logger = logging.getLogger(__name__)

_UNAVAILABLE_FAILURES = {
    ProviderFailureCategory.TIMEOUT,
    ProviderFailureCategory.RATE_LIMIT,
    ProviderFailureCategory.PROVIDER_MAINTENANCE_OR_UNAVAILABLE,
}


@dataclass(frozen=True)
class _MappingResolution:
    reference: CanonicalIngredientReference | None = None
    mapping: ProviderIngredientMapping | None = None
    issues: tuple[ProviderMappingIssue, ...] = ()
    failure: ProviderFailure | None = None


def orchestrate_ddi(
    request: DDIOrchestrationRequest,
    provider: DDIProvider,
) -> DDIOrchestrationResult:
    """Prepare and execute provider lookups without interpreting medical meaning."""

    started_at = datetime.now(timezone.utc)
    metadata = provider.metadata
    if not isinstance(metadata, ProviderMetadata):
        raise TypeError("DDI provider must expose validated provider metadata")

    expansion = expand_candidate_ingredient_pairs(request.product_a, request.product_b)
    if not expansion.candidate_pairs:
        status = (
            DDIOrchestrationStatus.BLOCKED_BY_PRODUCT_MAPPING
            if not expansion.same_ingredient_overlaps
            else DDIOrchestrationStatus.NO_DISTINCT_CANDIDATE_PAIRS
        )
        return _aggregate_result(request, metadata, expansion, (), status, started_at)

    identity_failure = _provider_identity_failure(request, metadata)
    if identity_failure is not None:
        issue_code, failure = identity_failure
        pair_results = tuple(
            _prelookup_failure_pair(
                request,
                pair,
                metadata,
                issue_code,
                failure,
            )
            for pair in expansion.candidate_pairs
        )
        return _aggregate_result(
            request,
            metadata,
            expansion,
            pair_results,
            DDIOrchestrationStatus.PROVIDER_ERROR,
            started_at,
        )

    health_failure = _provider_health_failure(provider, metadata)
    if health_failure is not None:
        failure = health_failure
        pair_results = tuple(
            _prelookup_failure_pair(
                request,
                pair,
                metadata,
                ProviderMappingIssueCode.PROVIDER_MAPPING_FAILURE,
                failure,
            )
            for pair in expansion.candidate_pairs
        )
        aggregate_status = (
            DDIOrchestrationStatus.PROVIDER_UNAVAILABLE
            if failure.category in _UNAVAILABLE_FAILURES
            else DDIOrchestrationStatus.PROVIDER_ERROR
        )
        return _aggregate_result(
            request,
            metadata,
            expansion,
            pair_results,
            aggregate_status,
            started_at,
        )

    ingredients = {
        ingredient.ingredient_identifier: ingredient
        for pair in expansion.candidate_pairs
        for ingredient in (pair.ingredient_a, pair.ingredient_b)
    }
    resolutions = {
        identifier: _resolve_provider_mapping(
            request,
            provider,
            ingredient_identifier=identifier,
        )
        for identifier in sorted(ingredients)
    }

    pair_results_by_identifier: dict[str, DDIOrchestratedPairResult] = {}
    lookup_entries: list[
        tuple[
            CandidateIngredientPair,
            ProviderIngredientMapping,
            ProviderIngredientMapping,
            ProviderPairLookupRequest,
        ]
    ] = []
    for index, pair in enumerate(expansion.candidate_pairs, start=1):
        resolution_a = resolutions[pair.ingredient_a.ingredient_identifier]
        resolution_b = resolutions[pair.ingredient_b.ingredient_identifier]
        issues = _sorted_issues(resolution_a.issues + resolution_b.issues)
        failures = tuple(
            failure
            for failure in (resolution_a.failure, resolution_b.failure)
            if failure is not None
        )
        if issues or failures:
            pair_results_by_identifier[pair.pair_identifier] = _mapping_blocked_pair(
                request,
                pair,
                metadata,
                resolution_a,
                resolution_b,
                issues,
                failures,
            )
            continue

        mapping_a = resolution_a.mapping
        mapping_b = resolution_b.mapping
        if mapping_a is None or mapping_b is None:
            raise RuntimeError("mapping resolution invariant failed")
        if (
            mapping_a.ingredient.rxnorm_rxcui
            == mapping_b.ingredient.rxnorm_rxcui
            or mapping_a.provider_concept_identifier
            == mapping_b.provider_concept_identifier
        ):
            failure = ProviderFailure(
                category=ProviderFailureCategory.MAPPING_FAILURE,
                message="distinct ingredients resolve to one external lookup identity",
                retryable=False,
            )
            pair_results_by_identifier[pair.pair_identifier] = (
                _prelookup_failure_pair(
                    request,
                    pair,
                    metadata,
                    ProviderMappingIssueCode.PROVIDER_MAPPING_FAILURE,
                    failure,
                )
            )
            continue
        provider_request = ProviderPairLookupRequest(
            request_identifier=(
                f"{request.correlation_identifier}::pair::{index:04d}"
            ),
            ingredient_a=mapping_a.ingredient,
            ingredient_b=mapping_b.ingredient,
            required_provider_release_identifier=(
                request.required_provider_release_identifier
            ),
        )
        lookup_entries.append((pair, mapping_a, mapping_b, provider_request))

    if lookup_entries:
        provider_results = _perform_lookups(request, provider, lookup_entries)
        for entry, provider_result in zip(
            lookup_entries, provider_results, strict=True
        ):
            pair, mapping_a, mapping_b, _ = entry
            pair_results_by_identifier[pair.pair_identifier] = _lookup_pair_result(
                request,
                pair,
                mapping_a,
                mapping_b,
                provider_result,
            )

    pair_results = tuple(
        pair_results_by_identifier[pair.pair_identifier]
        for pair in expansion.candidate_pairs
    )
    aggregate_status = _aggregate_status(pair_results)
    return _aggregate_result(
        request,
        metadata,
        expansion,
        pair_results,
        aggregate_status,
        started_at,
    )


def _provider_health_failure(
    provider: DDIProvider,
    metadata: ProviderMetadata,
) -> ProviderFailure | None:
    try:
        health = provider.health()
    except ProviderAdapterError as exc:
        logger.warning(
            "Provider health failed provider=%s category=%s",
            metadata.provider_namespace,
            exc.failure.category.value,
        )
        return exc.failure
    except ValidationError:
        logger.error(
            "Provider health response failed validation provider=%s",
            metadata.provider_namespace,
        )
        return ProviderFailure(
            category=ProviderFailureCategory.MALFORMED_PROVIDER_RESPONSE,
            message="provider health response failed contract validation",
            retryable=False,
        )
    except Exception as exc:
        logger.error(
            "Unexpected provider health failure provider=%s exception_type=%s",
            metadata.provider_namespace,
            type(exc).__name__,
        )
        return ProviderFailure(
            category=ProviderFailureCategory.UNEXPECTED_PROVIDER_ERROR,
            message="unexpected provider health failure",
            retryable=False,
        )
    if not isinstance(health, ProviderHealth) or health.metadata != metadata:
        return ProviderFailure(
            category=ProviderFailureCategory.MALFORMED_PROVIDER_RESPONSE,
            message="provider health provenance does not match adapter metadata",
            retryable=False,
        )
    if health.readiness is ProviderReadinessStatus.READY:
        return None
    return health.failure or ProviderFailure(
        category=ProviderFailureCategory.PROVIDER_MAINTENANCE_OR_UNAVAILABLE,
        message="provider is not ready for lookup",
        retryable=False,
    )


def _provider_identity_failure(
    request: DDIOrchestrationRequest,
    metadata: ProviderMetadata,
) -> tuple[ProviderMappingIssueCode, ProviderFailure] | None:
    if metadata.provider_namespace != request.provider_namespace:
        return (
            ProviderMappingIssueCode.PROVIDER_IDENTITY_MISMATCH,
            ProviderFailure(
                category=ProviderFailureCategory.MAPPING_FAILURE,
                message="selected provider namespace does not match adapter metadata",
                retryable=False,
            ),
        )
    if metadata.release_identifier != request.required_provider_release_identifier:
        return (
            ProviderMappingIssueCode.PROVIDER_RELEASE_MISMATCH,
            ProviderFailure(
                category=ProviderFailureCategory.VERSION_MISMATCH,
                message="selected provider release does not match adapter metadata",
                retryable=False,
            ),
        )
    return None


def _resolve_provider_mapping(
    request: DDIOrchestrationRequest,
    provider: DDIProvider,
    *,
    ingredient_identifier: str,
) -> _MappingResolution:
    crosswalk_resolution = _resolve_rxnorm_reference(request, ingredient_identifier)
    if crosswalk_resolution.issues:
        return crosswalk_resolution
    reference = crosswalk_resolution.reference
    if reference is None:
        raise RuntimeError("RxNorm crosswalk resolution invariant failed")

    try:
        mapping = provider.map_ingredient(reference)
    except ProviderAdapterError as exc:
        return _mapping_failure_resolution(reference, ingredient_identifier, exc.failure)
    except ValidationError:
        failure = ProviderFailure(
            category=ProviderFailureCategory.MALFORMED_PROVIDER_RESPONSE,
            message="provider mapping response failed contract validation",
            retryable=False,
        )
        logger.error(
            "Malformed provider mapping response provider=%s ingredient=%s",
            provider.metadata.provider_namespace,
            ingredient_identifier,
        )
        return _mapping_failure_resolution(reference, ingredient_identifier, failure)
    except Exception as exc:
        failure = ProviderFailure(
            category=ProviderFailureCategory.UNEXPECTED_PROVIDER_ERROR,
            message="unexpected provider mapping failure",
            retryable=False,
        )
        logger.error(
            "Unexpected provider mapping failure provider=%s ingredient=%s exception_type=%s",
            provider.metadata.provider_namespace,
            ingredient_identifier,
            type(exc).__name__,
        )
        return _mapping_failure_resolution(reference, ingredient_identifier, failure)

    metadata = provider.metadata
    if (
        mapping.ingredient != reference
        or mapping.provider_name != metadata.provider_name
        or mapping.provider_namespace != metadata.provider_namespace
        or mapping.provider_version != metadata.provider_version
    ):
        failure = ProviderFailure(
            category=ProviderFailureCategory.MAPPING_FAILURE,
            message="provider mapping identity or provenance does not match the request",
            retryable=False,
        )
        return _MappingResolution(
            reference=reference,
            issues=(
                _mapping_issue(
                    ingredient_identifier,
                    ProviderMappingIssueCode.PROVIDER_IDENTITY_MISMATCH,
                    failure.message,
                    failure=failure,
                ),
            ),
            failure=failure,
        )

    if mapping.provider_release_identifier != request.required_provider_release_identifier:
        failure = ProviderFailure(
            category=ProviderFailureCategory.VERSION_MISMATCH,
            message="provider mapping release does not match the required release",
            retryable=False,
        )
        return _MappingResolution(
            reference=reference,
            issues=(
                _mapping_issue(
                    ingredient_identifier,
                    ProviderMappingIssueCode.PROVIDER_RELEASE_MISMATCH,
                    failure.message,
                    failure=failure,
                ),
            ),
            failure=failure,
        )

    issue_by_status = {
        ProviderMappingStatus.UNMAPPED: (
            ProviderMappingIssueCode.PROVIDER_MAPPING_UNMAPPED,
            False,
        ),
        ProviderMappingStatus.AMBIGUOUS: (
            ProviderMappingIssueCode.PROVIDER_MAPPING_AMBIGUOUS,
            True,
        ),
        ProviderMappingStatus.REVIEW_REQUIRED: (
            ProviderMappingIssueCode.PROVIDER_MAPPING_REVIEW_REQUIRED,
            True,
        ),
        ProviderMappingStatus.DEPRECATED: (
            ProviderMappingIssueCode.PROVIDER_MAPPING_DEPRECATED,
            True,
        ),
        ProviderMappingStatus.SUPERSEDED: (
            ProviderMappingIssueCode.PROVIDER_MAPPING_SUPERSEDED,
            True,
        ),
    }
    issue_spec = issue_by_status.get(mapping.status)
    if issue_spec is not None:
        code, review_required = issue_spec
        return _MappingResolution(
            reference=reference,
            mapping=mapping,
            issues=(
                _mapping_issue(
                    ingredient_identifier,
                    code,
                    f"provider mapping status is {mapping.status.value}",
                    review_required=review_required,
                ),
            ),
        )
    if mapping.status is not ProviderMappingStatus.MAPPED or mapping.human_review_required:
        return _MappingResolution(
            reference=reference,
            mapping=mapping,
            issues=(
                _mapping_issue(
                    ingredient_identifier,
                    ProviderMappingIssueCode.PROVIDER_MAPPING_REVIEW_REQUIRED,
                    "provider mapping is not accepted for lookup",
                    review_required=True,
                ),
            ),
        )
    return _MappingResolution(reference=reference, mapping=mapping)


def _resolve_rxnorm_reference(
    request: DDIOrchestrationRequest,
    ingredient_identifier: str,
) -> _MappingResolution:
    candidates = tuple(
        crosswalk
        for crosswalk in request.rxnorm_crosswalks
        if crosswalk.canonical_ingredient_identifier == ingredient_identifier
    )
    if not candidates:
        return _rxnorm_issue_resolution(
            ingredient_identifier,
            ProviderMappingIssueCode.RXNORM_MAPPING_MISSING,
            "no RxNorm crosswalk is supplied for the canonical ingredient",
        )
    release_candidates = tuple(
        crosswalk
        for crosswalk in candidates
        if crosswalk.rxnorm_release_identifier
        == request.required_rxnorm_release_identifier
    )
    if not release_candidates:
        return _rxnorm_issue_resolution(
            ingredient_identifier,
            ProviderMappingIssueCode.RXNORM_RELEASE_MISMATCH,
            "no RxNorm crosswalk matches the required release",
        )
    if len(release_candidates) != 1:
        return _rxnorm_issue_resolution(
            ingredient_identifier,
            ProviderMappingIssueCode.RXNORM_MAPPING_AMBIGUOUS,
            "multiple RxNorm crosswalks match the required release",
            review_required=True,
        )

    crosswalk = release_candidates[0]
    issue_by_status = {
        CrosswalkMappingStatus.UNMAPPED: (
            ProviderMappingIssueCode.RXNORM_MAPPING_UNMAPPED,
            False,
        ),
        CrosswalkMappingStatus.AMBIGUOUS: (
            ProviderMappingIssueCode.RXNORM_MAPPING_AMBIGUOUS,
            True,
        ),
        CrosswalkMappingStatus.REVIEW_REQUIRED: (
            ProviderMappingIssueCode.RXNORM_MAPPING_REVIEW_REQUIRED,
            True,
        ),
        CrosswalkMappingStatus.DEPRECATED: (
            ProviderMappingIssueCode.RXNORM_MAPPING_DEPRECATED,
            True,
        ),
        CrosswalkMappingStatus.SUPERSEDED: (
            ProviderMappingIssueCode.RXNORM_MAPPING_SUPERSEDED,
            True,
        ),
    }
    issue_spec = issue_by_status.get(crosswalk.mapping_status)
    if issue_spec is not None:
        code, review_required = issue_spec
        return _rxnorm_issue_resolution(
            ingredient_identifier,
            code,
            f"RxNorm crosswalk status is {crosswalk.mapping_status.value}",
            review_required=review_required,
        )
    if (
        crosswalk.mapping_status is not CrosswalkMappingStatus.MAPPED
        or crosswalk.rxnorm_rxcui is None
        or crosswalk.review_status is ReviewStatus.REQUIRED
    ):
        return _rxnorm_issue_resolution(
            ingredient_identifier,
            ProviderMappingIssueCode.RXNORM_MAPPING_REVIEW_REQUIRED,
            "RxNorm crosswalk is not accepted for provider mapping",
            review_required=True,
        )
    return _MappingResolution(
        reference=CanonicalIngredientReference(
            medsense_ingredient_identifier=ingredient_identifier,
            rxnorm_rxcui=crosswalk.rxnorm_rxcui,
            rxnorm_release_identifier=crosswalk.rxnorm_release_identifier,
        )
    )


def _perform_lookups(
    request: DDIOrchestrationRequest,
    provider: DDIProvider,
    entries: list[
        tuple[
            CandidateIngredientPair,
            ProviderIngredientMapping,
            ProviderIngredientMapping,
            ProviderPairLookupRequest,
        ]
    ],
) -> tuple[ProviderPairLookupResult, ...]:
    provider_requests = tuple(entry[3] for entry in entries)
    use_batch = (
        provider.metadata.capabilities.batch_lookup
        and (request.execution_metadata is None or request.execution_metadata.use_batch_when_available)
        and hasattr(provider, "lookup_pairs")
    )
    if use_batch:
        batch = ProviderBatchLookupRequest(requests=provider_requests)
        return lookup_batch_fail_closed(provider, batch).results
    return tuple(
        lookup_pair_fail_closed(provider, provider_request)
        for provider_request in provider_requests
    )


def _lookup_pair_result(
    request: DDIOrchestrationRequest,
    pair: CandidateIngredientPair,
    mapping_a: ProviderIngredientMapping,
    mapping_b: ProviderIngredientMapping,
    result: ProviderPairLookupResult,
) -> DDIOrchestratedPairResult:
    mapping_mismatch = (
        result.mapping_a is not None and result.mapping_a != mapping_a
    ) or (
        result.mapping_b is not None and result.mapping_b != mapping_b
    )
    unexpected_mapping_status = result.status in {
        ProviderLookupStatus.INGREDIENT_A_UNMAPPED,
        ProviderLookupStatus.INGREDIENT_B_UNMAPPED,
        ProviderLookupStatus.BOTH_INGREDIENTS_UNMAPPED,
        ProviderLookupStatus.AMBIGUOUS_MAPPING,
    }
    if mapping_mismatch or unexpected_mapping_status:
        failure = ProviderFailure(
            category=ProviderFailureCategory.MAPPING_FAILURE,
            message="provider lookup mapping differs from the accepted mapping gate",
            retryable=False,
        )
        return _pair_result(
            request,
            pair,
            mapping_a,
            mapping_b,
            DDIOrchestratedPairStatus.PROVIDER_ERROR,
            result.request.request_identifier,
            ProviderLookupStatus.PROVIDER_ERROR,
            result.completed_at,
            failure=failure,
        )

    status_by_lookup = {
        ProviderLookupStatus.INTERACTION_ASSERTION_FOUND: (
            DDIOrchestratedPairStatus.ASSERTION_RETURNED
        ),
        ProviderLookupStatus.NO_ASSERTION_RETURNED: (
            DDIOrchestratedPairStatus.NO_ASSERTION_RETURNED
        ),
        ProviderLookupStatus.INSUFFICIENT_PROVIDER_COVERAGE: (
            DDIOrchestratedPairStatus.INSUFFICIENT_PROVIDER_COVERAGE
        ),
        ProviderLookupStatus.PROVIDER_UNAVAILABLE: (
            DDIOrchestratedPairStatus.PROVIDER_UNAVAILABLE
        ),
        ProviderLookupStatus.PROVIDER_ERROR: DDIOrchestratedPairStatus.PROVIDER_ERROR,
    }
    pair_status = status_by_lookup.get(result.status)
    if pair_status is None:
        raise RuntimeError("unsupported provider lookup status after mapping gate")
    return _pair_result(
        request,
        pair,
        mapping_a,
        mapping_b,
        pair_status,
        result.request.request_identifier,
        result.status,
        result.completed_at,
        coverage=result.coverage,
        assertions=result.assertions,
        failure=result.failure,
    )


def _mapping_blocked_pair(
    request: DDIOrchestrationRequest,
    pair: CandidateIngredientPair,
    metadata: ProviderMetadata,
    resolution_a: _MappingResolution,
    resolution_b: _MappingResolution,
    issues: tuple[ProviderMappingIssue, ...],
    failures: tuple[ProviderFailure, ...],
) -> DDIOrchestratedPairResult:
    failure = failures[0] if failures else None
    if failure is None:
        status = DDIOrchestratedPairStatus.PROVIDER_MAPPING_UNRESOLVED
        lookup_status = None
    elif failure.category in _UNAVAILABLE_FAILURES:
        status = DDIOrchestratedPairStatus.PROVIDER_UNAVAILABLE
        lookup_status = ProviderLookupStatus.PROVIDER_UNAVAILABLE
    else:
        status = DDIOrchestratedPairStatus.PROVIDER_ERROR
        lookup_status = ProviderLookupStatus.PROVIDER_ERROR
    return _pair_result(
        request,
        pair,
        resolution_a.mapping,
        resolution_b.mapping,
        status,
        None,
        lookup_status,
        datetime.now(timezone.utc),
        mapping_issues=issues,
        failure=failure,
        provider_release_identifier=metadata.release_identifier,
    )


def _prelookup_failure_pair(
    request: DDIOrchestrationRequest,
    pair: CandidateIngredientPair,
    metadata: ProviderMetadata,
    issue_code: ProviderMappingIssueCode,
    failure: ProviderFailure,
) -> DDIOrchestratedPairResult:
    pair_status = (
        DDIOrchestratedPairStatus.PROVIDER_UNAVAILABLE
        if failure.category in _UNAVAILABLE_FAILURES
        else DDIOrchestratedPairStatus.PROVIDER_ERROR
    )
    lookup_status = (
        ProviderLookupStatus.PROVIDER_UNAVAILABLE
        if pair_status is DDIOrchestratedPairStatus.PROVIDER_UNAVAILABLE
        else ProviderLookupStatus.PROVIDER_ERROR
    )
    issues = tuple(
        _mapping_issue(
            ingredient.ingredient_identifier,
            issue_code,
            failure.message,
            failure=failure,
        )
        for ingredient in (pair.ingredient_a, pair.ingredient_b)
    )
    return _pair_result(
        request,
        pair,
        None,
        None,
        pair_status,
        None,
        lookup_status,
        datetime.now(timezone.utc),
        mapping_issues=issues,
        failure=failure,
        provider_release_identifier=metadata.release_identifier,
    )


def _pair_result(
    request: DDIOrchestrationRequest,
    pair: CandidateIngredientPair,
    mapping_a: ProviderIngredientMapping | None,
    mapping_b: ProviderIngredientMapping | None,
    status: DDIOrchestratedPairStatus,
    provider_request_identifier: str | None,
    provider_lookup_status: ProviderLookupStatus | None,
    completed_at: datetime,
    *,
    mapping_issues: tuple[ProviderMappingIssue, ...] = (),
    coverage: ProviderCoverageAssessment | None = None,
    assertions: tuple[ProviderSourceAssertion, ...] = (),
    failure: ProviderFailure | None = None,
    provider_release_identifier: str | None = None,
) -> DDIOrchestratedPairResult:
    return DDIOrchestratedPairResult(
        candidate_pair=pair,
        source_provenance=_source_provenance(request, pair),
        status=status,
        provider_request_identifier=provider_request_identifier,
        provider_release_identifier=(
            provider_release_identifier
            or request.required_provider_release_identifier
        ),
        mapping_a=mapping_a,
        mapping_b=mapping_b,
        provider_concept_a_identifier=(
            mapping_a.provider_concept_identifier if mapping_a else None
        ),
        provider_concept_b_identifier=(
            mapping_b.provider_concept_identifier if mapping_b else None
        ),
        mapping_issues=mapping_issues,
        provider_lookup_status=provider_lookup_status,
        coverage=coverage,
        assertions=assertions,
        failure=failure,
        review_required=any(issue.review_required for issue in mapping_issues)
        or any(
            mapping is not None and mapping.human_review_required
            for mapping in (mapping_a, mapping_b)
        ),
        completed_at=completed_at,
    )


def _source_provenance(
    request: DDIOrchestrationRequest,
    pair: CandidateIngredientPair,
) -> tuple[PairSourceProvenance, ...]:
    products = {
        product.product_identifier: product
        for product in (request.product_a, request.product_b)
    }
    keys: set[tuple[str, str]] = set()
    for contribution in pair.contributions:
        keys.update(
            (contribution.product_a_identifier, component_identifier)
            for component_identifier in contribution.product_a_component_identifiers
        )
        keys.update(
            (contribution.product_b_identifier, component_identifier)
            for component_identifier in contribution.product_b_component_identifiers
        )
    result: list[PairSourceProvenance] = []
    for product_identifier, component_identifier in sorted(keys):
        product = products[product_identifier]
        components = {
            component.component_identifier: component
            for component in product.components
        }
        component = components[component_identifier]
        result.append(
            PairSourceProvenance(
                product_identifier=product_identifier,
                product_provenance=product.provenance,
                component_identifier=component_identifier,
                component_provenance=component.provenance,
            )
        )
    return tuple(result)


def _mapping_failure_resolution(
    reference: CanonicalIngredientReference,
    ingredient_identifier: str,
    failure: ProviderFailure,
) -> _MappingResolution:
    return _MappingResolution(
        reference=reference,
        issues=(
            _mapping_issue(
                ingredient_identifier,
                ProviderMappingIssueCode.PROVIDER_MAPPING_FAILURE,
                failure.message,
                failure=failure,
            ),
        ),
        failure=failure,
    )


def _rxnorm_issue_resolution(
    ingredient_identifier: str,
    code: ProviderMappingIssueCode,
    detail: str,
    *,
    review_required: bool = False,
) -> _MappingResolution:
    return _MappingResolution(
        issues=(
            _mapping_issue(
                ingredient_identifier,
                code,
                detail,
                review_required=review_required,
            ),
        )
    )


def _mapping_issue(
    ingredient_identifier: str,
    code: ProviderMappingIssueCode,
    detail: str,
    *,
    review_required: bool = False,
    failure: ProviderFailure | None = None,
) -> ProviderMappingIssue:
    return ProviderMappingIssue(
        ingredient_identifier=ingredient_identifier,
        code=code,
        detail=detail,
        review_required=review_required,
        failure=failure,
    )


def _sorted_issues(
    issues: tuple[ProviderMappingIssue, ...],
) -> tuple[ProviderMappingIssue, ...]:
    return tuple(
        sorted(
            issues,
            key=lambda issue: (issue.ingredient_identifier, issue.code.value),
        )
    )


def _aggregate_status(
    pair_results: tuple[DDIOrchestratedPairResult, ...],
) -> DDIOrchestrationStatus:
    statuses = tuple(item.status for item in pair_results)
    completed = {
        DDIOrchestratedPairStatus.ASSERTION_RETURNED,
        DDIOrchestratedPairStatus.NO_ASSERTION_RETURNED,
    }
    if statuses and all(status in completed for status in statuses):
        return DDIOrchestrationStatus.LOOKUP_COMPLETED
    if statuses and all(
        status is DDIOrchestratedPairStatus.PROVIDER_MAPPING_UNRESOLVED
        for status in statuses
    ):
        return DDIOrchestrationStatus.BLOCKED_BY_PROVIDER_MAPPING
    if statuses and all(
        status is DDIOrchestratedPairStatus.PROVIDER_UNAVAILABLE
        for status in statuses
    ):
        return DDIOrchestrationStatus.PROVIDER_UNAVAILABLE
    if statuses and all(
        status is DDIOrchestratedPairStatus.PROVIDER_ERROR
        for status in statuses
    ):
        return DDIOrchestrationStatus.PROVIDER_ERROR
    return DDIOrchestrationStatus.COMPLETED_WITH_PROVIDER_UNCERTAINTY


def _aggregate_result(
    request: DDIOrchestrationRequest,
    metadata: ProviderMetadata,
    expansion: CandidatePairExpansionResult,
    pair_results: tuple[DDIOrchestratedPairResult, ...],
    status: DDIOrchestrationStatus,
    started_at: datetime,
) -> DDIOrchestrationResult:
    unmapped_codes = {
        ProviderMappingIssueCode.RXNORM_MAPPING_MISSING,
        ProviderMappingIssueCode.RXNORM_MAPPING_UNMAPPED,
        ProviderMappingIssueCode.PROVIDER_MAPPING_UNMAPPED,
    }
    counts = DDIOrchestrationCounts(
        candidate_pairs=len(expansion.candidate_pairs),
        pairs_looked_up=sum(
            item.provider_request_identifier is not None for item in pair_results
        ),
        assertions_returned=sum(len(item.assertions) for item in pair_results),
        no_assertion_results=sum(
            item.status is DDIOrchestratedPairStatus.NO_ASSERTION_RETURNED
            for item in pair_results
        ),
        unmapped_pairs=sum(
            any(issue.code in unmapped_codes for issue in item.mapping_issues)
            for item in pair_results
        ),
        provider_failure_pairs=sum(item.failure is not None for item in pair_results),
        review_required_pairs=sum(item.review_required for item in pair_results),
        same_ingredient_overlaps=len(expansion.same_ingredient_overlaps),
    )
    return DDIOrchestrationResult(
        correlation_identifier=request.correlation_identifier,
        status=status,
        provider_metadata=metadata,
        required_provider_release_identifier=(
            request.required_provider_release_identifier
        ),
        pair_expansion=expansion,
        pair_results=pair_results,
        same_ingredient_overlaps=expansion.same_ingredient_overlaps,
        counts=counts,
        execution_metadata=request.execution_metadata,
        started_at=started_at,
        completed_at=datetime.now(timezone.utc),
    )
