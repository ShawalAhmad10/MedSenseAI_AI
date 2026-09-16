"""Reusable engineering conformance harness for future DDI adapters.

The harness operates only on provider-neutral DTOs and induced synthetic or
authorized evaluation scenarios. A passing report never authorizes clinical
or production use.
"""

from __future__ import annotations

from enum import Enum
from collections.abc import Callable
from typing import Literal, Protocol

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    ValidationError,
    model_validator,
)

from medsense_ai.ddi_providers.adapter import lookup_batch_fail_closed
from medsense_ai.ddi_providers.contracts import (
    CanonicalIngredientReference,
    DDIProvider,
    ProviderBatchLookupRequest,
    ProviderFailureCategory,
    ProviderLookupStatus,
    ProviderMappingStatus,
    ProviderMetadata,
    ProviderPairLookupRequest,
    ProviderPairLookupResult,
    ProviderReadinessStatus,
    lookup_pair_fail_closed,
)

DDI_PROVIDER_CONTRACT_VERSION = "1.0.0"


class ConformanceOutcome(str, Enum):
    """Engineering result for a single conformance requirement."""

    PASS = "pass"
    FAIL = "fail"
    BLOCKED = "blocked"


class ConformanceScenario(str, Enum):
    """Provider-neutral scenarios an authorized test probe must induce."""

    ASSERTION_FOUND = "assertion_found"
    NO_ASSERTION = "no_assertion"
    INGREDIENT_A_UNMAPPED = "ingredient_a_unmapped"
    INGREDIENT_B_UNMAPPED = "ingredient_b_unmapped"
    BOTH_INGREDIENTS_UNMAPPED = "both_ingredients_unmapped"
    AMBIGUOUS_MAPPING = "ambiguous_mapping"
    INSUFFICIENT_COVERAGE = "insufficient_coverage"
    PROVIDER_UNAVAILABLE = "provider_unavailable"
    PROVIDER_ERROR = "provider_error"
    MALFORMED_RESPONSE = "malformed_response"
    VERSION_MISMATCH = "version_mismatch"
    MAPPING_PROVENANCE_MISMATCH = "mapping_provenance_mismatch"
    TIMEOUT = "timeout"
    RATE_LIMIT = "rate_limit"
    AUTHORIZATION_FAILURE = "authorization_failure"
    UNEXPECTED_EXCEPTION = "unexpected_exception"
    BATCH_PARTIAL_FAILURE = "batch_partial_failure"
    BATCH_MISSING_RESULT = "batch_missing_result"
    BATCH_DUPLICATE_PAIR = "batch_duplicate_pair"


class ConformanceRequirementResult(BaseModel):
    """One deterministic conformance observation."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    requirement_identifier: str = Field(min_length=1, max_length=100)
    outcome: ConformanceOutcome
    detail: str = Field(min_length=1, max_length=1000)


class DDIAdapterConformanceReport(BaseModel):
    """Engineering evidence that cannot represent clinical authorization."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    adapter_name: str = Field(min_length=1, max_length=200)
    provider_name: str = Field(min_length=1, max_length=200)
    contract_version: str = Field(min_length=1, max_length=100)
    adapter_version: str = Field(min_length=1, max_length=100)
    provider_version: str = Field(min_length=1, max_length=200)
    provider_release_identifier: str = Field(min_length=1, max_length=255)
    tested_capability_set: tuple[str, ...]
    tested_at: AwareDatetime
    overall_outcome: ConformanceOutcome
    requirement_results: tuple[ConformanceRequirementResult, ...] = Field(min_length=1)
    failed_requirement_ids: tuple[str, ...]
    warnings: tuple[str, ...]
    environment_label: str = Field(min_length=1, max_length=100)
    clinical_use_authorized: Literal[False] = False

    @model_validator(mode="after")
    def validate_report_consistency(self) -> DDIAdapterConformanceReport:
        identifiers = [item.requirement_identifier for item in self.requirement_results]
        if len(identifiers) != len(set(identifiers)):
            raise ValueError("conformance requirement identifiers must be unique")
        expected_failures = tuple(
            item.requirement_identifier
            for item in self.requirement_results
            if item.outcome is ConformanceOutcome.FAIL
        )
        if self.failed_requirement_ids != expected_failures:
            raise ValueError("failed requirement identifiers must match failed results")
        expected_overall = _overall_outcome(self.requirement_results)
        if self.overall_outcome is not expected_overall:
            raise ValueError("overall conformance outcome does not match requirement results")
        if len(self.tested_capability_set) != len(set(self.tested_capability_set)):
            raise ValueError("tested capabilities must be unique")
        return self


class AdapterConformanceProbe(Protocol):
    """Fixture factory implemented per adapter using authorized test responses."""

    @property
    def adapter_name(self) -> str: ...

    @property
    def metadata(self) -> ProviderMetadata: ...

    @property
    def environment_label(self) -> str: ...

    @property
    def tested_at(self) -> AwareDatetime: ...

    @property
    def mapping_ingredient(self) -> CanonicalIngredientReference: ...

    @property
    def expected_classification_code(self) -> str: ...

    @property
    def expected_classification_label(self) -> str: ...

    def provider_for(self, scenario: ConformanceScenario) -> DDIProvider: ...

    def pair_request_for(
        self, scenario: ConformanceScenario
    ) -> ProviderPairLookupRequest: ...

    def batch_request_for(
        self, scenario: ConformanceScenario
    ) -> ProviderBatchLookupRequest: ...


class _CheckFailure(Exception):
    """Internal deterministic check failure with no provider payload."""


class ConformanceScenarioBlocked(Exception):
    """Signal that an authorized test scenario is unavailable, never passed."""

    def __init__(self, reason_code: str) -> None:
        if not reason_code or not reason_code.replace("_", "").isalnum():
            raise ValueError("blocked conformance reason must be a safe identifier")
        super().__init__(reason_code)
        self.reason_code = reason_code


def run_adapter_conformance(
    probe: AdapterConformanceProbe,
) -> DDIAdapterConformanceReport:
    """Run the reusable provider-neutral suite and return immutable evidence."""

    checks: list[ConformanceRequirementResult] = []

    def check(requirement_id: str, operation: Callable[[], None]) -> None:
        try:
            operation()
        except ConformanceScenarioBlocked as exc:
            checks.append(
                ConformanceRequirementResult(
                    requirement_identifier=requirement_id,
                    outcome=ConformanceOutcome.BLOCKED,
                    detail=f"conformance scenario blocked: {exc.reason_code}",
                )
            )
        except _CheckFailure as exc:
            checks.append(
                ConformanceRequirementResult(
                    requirement_identifier=requirement_id,
                    outcome=ConformanceOutcome.FAIL,
                    detail=str(exc),
                )
            )
        except Exception as exc:
            checks.append(
                ConformanceRequirementResult(
                    requirement_identifier=requirement_id,
                    outcome=ConformanceOutcome.FAIL,
                    detail=f"conformance check raised {type(exc).__name__}",
                )
            )
        else:
            checks.append(
                ConformanceRequirementResult(
                    requirement_identifier=requirement_id,
                    outcome=ConformanceOutcome.PASS,
                    detail="provider-neutral requirement passed",
                )
            )

    check("DDI-CONF-001-metadata", lambda: _check_metadata(probe))
    check("DDI-CONF-002-capabilities", lambda: _check_capabilities(probe))
    check("DDI-CONF-003-readiness", lambda: _check_readiness(probe))
    check("DDI-CONF-004-mapping", lambda: _check_mapping(probe))

    pair_expectations = (
        (
            "DDI-CONF-005-assertion-found",
            ConformanceScenario.ASSERTION_FOUND,
            ProviderLookupStatus.INTERACTION_ASSERTION_FOUND,
            None,
        ),
        (
            "DDI-CONF-006-no-assertion",
            ConformanceScenario.NO_ASSERTION,
            ProviderLookupStatus.NO_ASSERTION_RETURNED,
            None,
        ),
        (
            "DDI-CONF-007-ingredient-a-unmapped",
            ConformanceScenario.INGREDIENT_A_UNMAPPED,
            ProviderLookupStatus.INGREDIENT_A_UNMAPPED,
            None,
        ),
        (
            "DDI-CONF-008-ingredient-b-unmapped",
            ConformanceScenario.INGREDIENT_B_UNMAPPED,
            ProviderLookupStatus.INGREDIENT_B_UNMAPPED,
            None,
        ),
        (
            "DDI-CONF-009-both-unmapped",
            ConformanceScenario.BOTH_INGREDIENTS_UNMAPPED,
            ProviderLookupStatus.BOTH_INGREDIENTS_UNMAPPED,
            None,
        ),
        (
            "DDI-CONF-010-ambiguous",
            ConformanceScenario.AMBIGUOUS_MAPPING,
            ProviderLookupStatus.AMBIGUOUS_MAPPING,
            None,
        ),
        (
            "DDI-CONF-011-insufficient-coverage",
            ConformanceScenario.INSUFFICIENT_COVERAGE,
            ProviderLookupStatus.INSUFFICIENT_PROVIDER_COVERAGE,
            None,
        ),
        (
            "DDI-CONF-012-provider-unavailable",
            ConformanceScenario.PROVIDER_UNAVAILABLE,
            ProviderLookupStatus.PROVIDER_UNAVAILABLE,
            ProviderFailureCategory.PROVIDER_MAINTENANCE_OR_UNAVAILABLE,
        ),
        (
            "DDI-CONF-013-provider-error",
            ConformanceScenario.PROVIDER_ERROR,
            ProviderLookupStatus.PROVIDER_ERROR,
            ProviderFailureCategory.AUTHENTICATION_FAILURE,
        ),
        (
            "DDI-CONF-014-malformed",
            ConformanceScenario.MALFORMED_RESPONSE,
            ProviderLookupStatus.PROVIDER_ERROR,
            ProviderFailureCategory.MALFORMED_PROVIDER_RESPONSE,
        ),
        (
            "DDI-CONF-015-version-mismatch",
            ConformanceScenario.VERSION_MISMATCH,
            ProviderLookupStatus.PROVIDER_ERROR,
            ProviderFailureCategory.VERSION_MISMATCH,
        ),
        (
            "DDI-CONF-016-mapping-provenance-mismatch",
            ConformanceScenario.MAPPING_PROVENANCE_MISMATCH,
            ProviderLookupStatus.PROVIDER_ERROR,
            ProviderFailureCategory.MALFORMED_PROVIDER_RESPONSE,
        ),
        (
            "DDI-CONF-017-timeout",
            ConformanceScenario.TIMEOUT,
            ProviderLookupStatus.PROVIDER_UNAVAILABLE,
            ProviderFailureCategory.TIMEOUT,
        ),
        (
            "DDI-CONF-018-rate-limit",
            ConformanceScenario.RATE_LIMIT,
            ProviderLookupStatus.PROVIDER_UNAVAILABLE,
            ProviderFailureCategory.RATE_LIMIT,
        ),
        (
            "DDI-CONF-019-authorization",
            ConformanceScenario.AUTHORIZATION_FAILURE,
            ProviderLookupStatus.PROVIDER_ERROR,
            ProviderFailureCategory.AUTHORIZATION_OR_LICENSE_FAILURE,
        ),
        (
            "DDI-CONF-020-unexpected",
            ConformanceScenario.UNEXPECTED_EXCEPTION,
            ProviderLookupStatus.PROVIDER_ERROR,
            ProviderFailureCategory.UNEXPECTED_PROVIDER_ERROR,
        ),
    )
    for requirement_id, scenario, status, category in pair_expectations:
        check(
            requirement_id,
            lambda scenario=scenario, status=status, category=category: _check_pair_outcome(
                probe, scenario, status, category
            ),
        )

    check("DDI-CONF-021-native-classification", lambda: _check_classification(probe))
    check("DDI-CONF-022-provenance", lambda: _check_provenance(probe))
    check("DDI-CONF-023-immutable-dtos", lambda: _check_immutability(probe))
    if probe.metadata.capabilities.batch_lookup:
        check("DDI-CONF-024-batch-correlation", lambda: _check_batch_partial(probe))
        check("DDI-CONF-025-batch-missing", lambda: _check_batch_missing(probe))
        check("DDI-CONF-026-duplicate-pairs", lambda: _check_duplicate_pairs(probe))
    else:
        for requirement_id in (
            "DDI-CONF-024-batch-correlation",
            "DDI-CONF-025-batch-missing",
            "DDI-CONF-026-duplicate-pairs",
        ):
            checks.append(
                ConformanceRequirementResult(
                    requirement_identifier=requirement_id,
                    outcome=ConformanceOutcome.PASS,
                    detail="optional batch capability is not declared",
                )
            )

    results = tuple(checks)
    failed = tuple(
        item.requirement_identifier
        for item in results
        if item.outcome is ConformanceOutcome.FAIL
    )
    capabilities = tuple(
        name
        for name, enabled in probe.metadata.capabilities.model_dump().items()
        if enabled
    )
    return DDIAdapterConformanceReport(
        adapter_name=probe.adapter_name,
        provider_name=probe.metadata.provider_name,
        contract_version=DDI_PROVIDER_CONTRACT_VERSION,
        adapter_version=probe.metadata.adapter_version,
        provider_version=probe.metadata.provider_version,
        provider_release_identifier=probe.metadata.release_identifier,
        tested_capability_set=capabilities,
        tested_at=probe.tested_at,
        overall_outcome=_overall_outcome(results),
        requirement_results=results,
        failed_requirement_ids=failed,
        warnings=(
            "Engineering conformance does not authorize clinical or production use.",
        ),
        environment_label=probe.environment_label,
        clinical_use_authorized=False,
    )


def _check_metadata(probe: AdapterConformanceProbe) -> None:
    metadata = probe.metadata
    _require(
        all(
            value.strip()
            for value in (
                metadata.provider_name,
                metadata.provider_namespace,
                metadata.adapter_version,
                metadata.provider_version,
                metadata.release_identifier,
            )
        ),
        "provider metadata fields must be non-blank",
    )


def _check_capabilities(probe: AdapterConformanceProbe) -> None:
    _require(probe.metadata.capabilities.pair_lookup, "pair lookup must be declared")


def _check_readiness(probe: AdapterConformanceProbe) -> None:
    health = probe.provider_for(ConformanceScenario.ASSERTION_FOUND).health()
    _require(health.metadata == probe.metadata, "health metadata must match the adapter")
    _require(health.readiness is ProviderReadinessStatus.READY, "test adapter must be ready")
    _require(health.failure is None, "ready health cannot contain a failure")
    unavailable = probe.provider_for(ConformanceScenario.PROVIDER_UNAVAILABLE).health()
    _require(
        unavailable.readiness is ProviderReadinessStatus.UNAVAILABLE,
        "unavailable readiness was not preserved",
    )
    _require(unavailable.failure is not None, "unavailable readiness requires a failure")


def _check_mapping(probe: AdapterConformanceProbe) -> None:
    mapping = probe.provider_for(ConformanceScenario.ASSERTION_FOUND).map_ingredient(
        probe.mapping_ingredient
    )
    _require(mapping.ingredient == probe.mapping_ingredient, "mapping input was not preserved")
    _require(mapping.status is ProviderMappingStatus.MAPPED, "mapping must be resolved")
    _require(
        mapping.provider_release_identifier == probe.metadata.release_identifier,
        "mapping release must match metadata",
    )
    _require(bool(mapping.provenance.source_version), "mapping provenance is required")


def _pair_result(
    probe: AdapterConformanceProbe, scenario: ConformanceScenario
) -> ProviderPairLookupResult:
    return lookup_pair_fail_closed(
        probe.provider_for(scenario), probe.pair_request_for(scenario)
    )


def _check_pair_outcome(
    probe: AdapterConformanceProbe,
    scenario: ConformanceScenario,
    expected_status: ProviderLookupStatus,
    expected_category: ProviderFailureCategory | None,
) -> None:
    result = _pair_result(probe, scenario)
    _require(result.status is expected_status, "pair outcome status did not match")
    if expected_category is None:
        _require(result.failure is None, "non-failure outcome contained a failure")
    else:
        _require(result.failure is not None, "failure outcome omitted failure detail")
        _require(result.failure.category is expected_category, "failure category did not match")
        _require(not result.assertions, "failure outcome contained assertions")


def _check_classification(probe: AdapterConformanceProbe) -> None:
    result = _pair_result(probe, ConformanceScenario.ASSERTION_FOUND)
    _require(bool(result.assertions), "found result omitted provider assertions")
    assertion = result.assertions[0]
    _require(
        assertion.source_native_classification_code
        == probe.expected_classification_code,
        "source-native classification code was not preserved",
    )
    _require(
        assertion.source_native_classification_label
        == probe.expected_classification_label,
        "source-native classification label was not preserved",
    )
    _require("severity" not in type(assertion).model_fields, "universal severity is forbidden")


def _check_provenance(probe: AdapterConformanceProbe) -> None:
    result = _pair_result(probe, ConformanceScenario.ASSERTION_FOUND)
    assertion = result.assertions[0]
    _require(
        assertion.provider_release_identifier == probe.metadata.release_identifier,
        "release provenance was not preserved",
    )
    _require(
        assertion.ingredient_a_mapping == result.mapping_a,
        "mapping A provenance differs",
    )
    _require(
        assertion.ingredient_b_mapping == result.mapping_b,
        "mapping B provenance differs",
    )
    _require(assertion.retrieved_at.tzinfo is not None, "retrieval time must be timezone-aware")


def _check_immutability(probe: AdapterConformanceProbe) -> None:
    result = _pair_result(probe, ConformanceScenario.ASSERTION_FOUND)
    try:
        result.status = ProviderLookupStatus.NO_ASSERTION_RETURNED
    except ValidationError:
        pass
    else:
        raise _CheckFailure("provider result DTO is mutable")
    _require(isinstance(result.assertions, tuple), "assertions must use an immutable tuple")


def _check_batch_partial(probe: AdapterConformanceProbe) -> None:
    scenario = ConformanceScenario.BATCH_PARTIAL_FAILURE
    request = probe.batch_request_for(scenario)
    result = lookup_batch_fail_closed(probe.provider_for(scenario), request)
    _require(len(result.results) == len(request.requests), "batch result count changed")
    _require(
        all(
            item.request == expected
            for item, expected in zip(result.results, request.requests, strict=True)
        ),
        "batch result correlation changed",
    )
    statuses = {item.status for item in result.results}
    _require(ProviderLookupStatus.PROVIDER_UNAVAILABLE in statuses, "partial failure was lost")
    _require(len(statuses) > 1, "batch partial outcomes were collapsed")


def _check_batch_missing(probe: AdapterConformanceProbe) -> None:
    scenario = ConformanceScenario.BATCH_MISSING_RESULT
    request = probe.batch_request_for(scenario)
    result = lookup_batch_fail_closed(probe.provider_for(scenario), request)
    _require(len(result.results) == len(request.requests), "missing pair was not reconstructed")
    malformed = [
        item
        for item in result.results
        if item.failure is not None
        and item.failure.category is ProviderFailureCategory.MALFORMED_PROVIDER_RESPONSE
    ]
    _require(bool(malformed), "missing pair did not fail closed as malformed")


def _check_duplicate_pairs(probe: AdapterConformanceProbe) -> None:
    scenario = ConformanceScenario.BATCH_DUPLICATE_PAIR
    request = probe.batch_request_for(scenario)
    _require(len(request.requests) >= 2, "duplicate-pair case requires at least two requests")
    first, second = request.requests[:2]
    _require(first.ingredient_a == second.ingredient_a, "duplicate pair A endpoint differs")
    _require(first.ingredient_b == second.ingredient_b, "duplicate pair B endpoint differs")
    _require(first.request_identifier != second.request_identifier, "duplicate pairs need unique correlation IDs")
    result = lookup_batch_fail_closed(probe.provider_for(scenario), request)
    _require(
        tuple(item.request for item in result.results) == request.requests,
        "duplicate pairs were not correlated independently",
    )


def _require(condition: bool, detail: str) -> None:
    if not condition:
        raise _CheckFailure(detail)


def _overall_outcome(
    results: tuple[ConformanceRequirementResult, ...],
) -> ConformanceOutcome:
    if any(item.outcome is ConformanceOutcome.FAIL for item in results):
        return ConformanceOutcome.FAIL
    if any(item.outcome is ConformanceOutcome.BLOCKED for item in results):
        return ConformanceOutcome.BLOCKED
    return ConformanceOutcome.PASS
