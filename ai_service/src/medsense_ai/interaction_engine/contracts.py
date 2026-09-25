"""Immutable contracts for non-clinical DDI orchestration.

These DTOs summarize identity, mapping, transport, and provider state only.
They define no MedSenseAI severity, recommendation, or safety conclusion.
"""

from __future__ import annotations

from enum import Enum

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

from medsense_ai.ddi_providers import (
    ProviderCoverageAssessment,
    ProviderCoverageStatus,
    ProviderFailure,
    ProviderIngredientMapping,
    ProviderLookupStatus,
    ProviderMappingStatus,
    ProviderMetadata,
    ProviderSourceAssertion,
)
from medsense_ai.product_mapping import (
    CandidateIngredientPair,
    CandidatePairExpansionResult,
    CanonicalIngredient,
    PakistanMedicineProduct,
    PairExpansionStatus,
    RxNormIngredientCrosswalk,
    SameIngredientOverlap,
    SourceProvenance,
)


class DDIOrchestrationStatus(str, Enum):
    """Aggregate execution state without medical interpretation."""

    LOOKUP_COMPLETED = "lookup_completed"
    NO_DISTINCT_CANDIDATE_PAIRS = "no_distinct_candidate_pairs"
    BLOCKED_BY_PRODUCT_MAPPING = "blocked_by_product_mapping"
    BLOCKED_BY_PROVIDER_MAPPING = "blocked_by_provider_mapping"
    COMPLETED_WITH_PROVIDER_UNCERTAINTY = "completed_with_provider_uncertainty"
    PROVIDER_UNAVAILABLE = "provider_unavailable"
    PROVIDER_ERROR = "provider_error"


class DDIOrchestratedPairStatus(str, Enum):
    """Pair-level orchestration state; no value is a clinical conclusion."""

    ASSERTION_RETURNED = "assertion_returned"
    NO_ASSERTION_RETURNED = "no_assertion_returned"
    PROVIDER_MAPPING_UNRESOLVED = "provider_mapping_unresolved"
    INSUFFICIENT_PROVIDER_COVERAGE = "insufficient_provider_coverage"
    PROVIDER_UNAVAILABLE = "provider_unavailable"
    PROVIDER_ERROR = "provider_error"


class ProviderMappingIssueCode(str, Enum):
    """Deterministic reasons an ingredient cannot enter provider lookup."""

    RXNORM_MAPPING_MISSING = "rxnorm_mapping_missing"
    RXNORM_MAPPING_UNMAPPED = "rxnorm_mapping_unmapped"
    RXNORM_MAPPING_AMBIGUOUS = "rxnorm_mapping_ambiguous"
    RXNORM_MAPPING_REVIEW_REQUIRED = "rxnorm_mapping_review_required"
    RXNORM_MAPPING_DEPRECATED = "rxnorm_mapping_deprecated"
    RXNORM_MAPPING_SUPERSEDED = "rxnorm_mapping_superseded"
    RXNORM_RELEASE_MISMATCH = "rxnorm_release_mismatch"
    PROVIDER_MAPPING_UNMAPPED = "provider_mapping_unmapped"
    PROVIDER_MAPPING_AMBIGUOUS = "provider_mapping_ambiguous"
    PROVIDER_MAPPING_REVIEW_REQUIRED = "provider_mapping_review_required"
    PROVIDER_MAPPING_DEPRECATED = "provider_mapping_deprecated"
    PROVIDER_MAPPING_SUPERSEDED = "provider_mapping_superseded"
    PROVIDER_MAPPING_FAILURE = "provider_mapping_failure"
    PROVIDER_IDENTITY_MISMATCH = "provider_identity_mismatch"
    PROVIDER_RELEASE_MISMATCH = "provider_release_mismatch"


class EngineExecutionMetadata(BaseModel):
    """Optional caller-supplied, non-clinical execution metadata."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    engine_version: str = Field(default="1.0.0", min_length=1, max_length=100)
    requested_at: AwareDatetime
    execution_label: str | None = Field(default=None, min_length=1, max_length=200)
    use_batch_when_available: bool = True


class DDIOrchestrationRequest(BaseModel):
    """Validated product-pair request plus pinned external identity assertions."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    correlation_identifier: str = Field(min_length=1, max_length=120)
    product_a: PakistanMedicineProduct
    product_b: PakistanMedicineProduct
    provider_namespace: str = Field(min_length=1, max_length=100)
    required_provider_release_identifier: str = Field(min_length=1, max_length=255)
    required_rxnorm_release_identifier: str = Field(min_length=1, max_length=255)
    rxnorm_crosswalks: tuple[RxNormIngredientCrosswalk, ...]
    execution_metadata: EngineExecutionMetadata | None = None

    @model_validator(mode="after")
    def validate_request_identity(self) -> DDIOrchestrationRequest:
        if self.product_a.product_identifier == self.product_b.product_identifier:
            raise ValueError("orchestration requires two distinct product identities")
        candidates_by_product: list[dict[str, list[CanonicalIngredient]]] = []
        for product in (self.product_a, self.product_b):
            candidates: dict[str, list[CanonicalIngredient]] = {}
            for component in product.components:
                candidate = component.normalized_candidate
                if candidate is not None:
                    candidates.setdefault(candidate.ingredient_identifier, []).append(
                        candidate
                    )
            candidates_by_product.append(candidates)
        for ingredient_identifier in (
            set(candidates_by_product[0]) & set(candidates_by_product[1])
        ):
            candidates_a = candidates_by_product[0][ingredient_identifier]
            candidates_b = candidates_by_product[1][ingredient_identifier]
            internally_consistent = all(
                candidate == candidates[0]
                for candidates in (candidates_a, candidates_b)
                for candidate in candidates
            )
            if internally_consistent and candidates_a[0] != candidates_b[0]:
                raise ValueError(
                    "shared canonical ingredient identities must have identical metadata"
                )
        mapping_identifiers = tuple(
            crosswalk.mapping_identifier for crosswalk in self.rxnorm_crosswalks
        )
        if len(mapping_identifiers) != len(set(mapping_identifiers)):
            raise ValueError("RxNorm crosswalk mapping identifiers must be unique")
        return self


class PairSourceProvenance(BaseModel):
    """Product/component source evidence contributing to one candidate pair."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    product_identifier: str = Field(min_length=1, max_length=255)
    product_provenance: SourceProvenance
    component_identifier: str = Field(min_length=1, max_length=255)
    component_provenance: SourceProvenance


class ProviderMappingIssue(BaseModel):
    """One fail-closed mapping-gate observation for a canonical ingredient."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    ingredient_identifier: str = Field(min_length=1, max_length=255)
    code: ProviderMappingIssueCode
    detail: str = Field(min_length=1, max_length=1000)
    review_required: bool
    failure: ProviderFailure | None = None


class DDIOrchestratedPairResult(BaseModel):
    """Source-preserved pair execution result without clinical interpretation."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    candidate_pair: CandidateIngredientPair
    source_provenance: tuple[PairSourceProvenance, ...]
    status: DDIOrchestratedPairStatus
    provider_request_identifier: str | None = Field(
        default=None, min_length=1, max_length=255
    )
    provider_release_identifier: str = Field(min_length=1, max_length=255)
    mapping_a: ProviderIngredientMapping | None = None
    mapping_b: ProviderIngredientMapping | None = None
    provider_concept_a_identifier: str | None = Field(
        default=None, min_length=1, max_length=255
    )
    provider_concept_b_identifier: str | None = Field(
        default=None, min_length=1, max_length=255
    )
    mapping_issues: tuple[ProviderMappingIssue, ...] = ()
    provider_lookup_status: ProviderLookupStatus | None = None
    coverage: ProviderCoverageAssessment | None = None
    assertions: tuple[ProviderSourceAssertion, ...] = ()
    failure: ProviderFailure | None = None
    review_required: bool
    completed_at: AwareDatetime

    @model_validator(mode="after")
    def validate_pair_result(self) -> DDIOrchestratedPairResult:
        expected_concepts = (
            self.mapping_a.provider_concept_identifier if self.mapping_a else None,
            self.mapping_b.provider_concept_identifier if self.mapping_b else None,
        )
        if expected_concepts != (
            self.provider_concept_a_identifier,
            self.provider_concept_b_identifier,
        ):
            raise ValueError("provider concept identifiers must match preserved mappings")

        provenance_keys = tuple(
            (item.product_identifier, item.component_identifier)
            for item in self.source_provenance
        )
        if not provenance_keys or tuple(sorted(set(provenance_keys))) != provenance_keys:
            raise ValueError("pair source provenance must be sorted and unique")
        expected_provenance_keys = tuple(
            sorted(
                {
                    (product_identifier, component_identifier)
                    for contribution in self.candidate_pair.contributions
                    for product_identifier, component_identifiers in (
                        (
                            contribution.product_a_identifier,
                            contribution.product_a_component_identifiers,
                        ),
                        (
                            contribution.product_b_identifier,
                            contribution.product_b_component_identifiers,
                        ),
                    )
                    for component_identifier in component_identifiers
                }
            )
        )
        if provenance_keys != expected_provenance_keys:
            raise ValueError("pair source provenance must cover every contribution")

        expected_ingredients = (
            self.candidate_pair.ingredient_a.ingredient_identifier,
            self.candidate_pair.ingredient_b.ingredient_identifier,
        )
        for mapping, expected_identifier in zip(
            (self.mapping_a, self.mapping_b), expected_ingredients, strict=True
        ):
            if (
                mapping is not None
                and mapping.ingredient.medsense_ingredient_identifier
                != expected_identifier
            ):
                raise ValueError("provider mappings must match candidate pair endpoints")
            if (
                mapping is not None
                and mapping.provider_release_identifier
                != self.provider_release_identifier
            ):
                raise ValueError("provider mapping release must match pair result release")

        issue_keys = tuple(
            (issue.ingredient_identifier, issue.code.value)
            for issue in self.mapping_issues
        )
        if tuple(sorted(set(issue_keys))) != issue_keys:
            raise ValueError("provider mapping issues must be sorted and unique")

        expected_review = any(issue.review_required for issue in self.mapping_issues) or any(
            mapping is not None and mapping.human_review_required
            for mapping in (self.mapping_a, self.mapping_b)
        )
        if self.review_required != expected_review:
            raise ValueError("pair review state must match mapping evidence")

        if self.status is DDIOrchestratedPairStatus.PROVIDER_MAPPING_UNRESOLVED:
            if not self.mapping_issues or self.provider_lookup_status is not None:
                raise ValueError("unresolved provider mappings must block lookup")
            if (
                self.provider_request_identifier is not None
                or self.coverage is not None
                or self.assertions
            ):
                raise ValueError("mapping-blocked pairs cannot contain provider lookup data")
        else:
            if self.provider_lookup_status is None:
                raise ValueError("provider outcomes require a typed provider status")
            if self.status not in {
                DDIOrchestratedPairStatus.PROVIDER_UNAVAILABLE,
                DDIOrchestratedPairStatus.PROVIDER_ERROR,
            } and self.provider_request_identifier is None:
                raise ValueError("completed lookups require provider correlation")

        expected_statuses = {
            DDIOrchestratedPairStatus.ASSERTION_RETURNED: (
                ProviderLookupStatus.INTERACTION_ASSERTION_FOUND
            ),
            DDIOrchestratedPairStatus.NO_ASSERTION_RETURNED: (
                ProviderLookupStatus.NO_ASSERTION_RETURNED
            ),
            DDIOrchestratedPairStatus.INSUFFICIENT_PROVIDER_COVERAGE: (
                ProviderLookupStatus.INSUFFICIENT_PROVIDER_COVERAGE
            ),
            DDIOrchestratedPairStatus.PROVIDER_UNAVAILABLE: (
                ProviderLookupStatus.PROVIDER_UNAVAILABLE
            ),
            DDIOrchestratedPairStatus.PROVIDER_ERROR: ProviderLookupStatus.PROVIDER_ERROR,
        }
        expected_lookup = expected_statuses.get(self.status)
        if expected_lookup is not None and self.provider_lookup_status is not expected_lookup:
            raise ValueError("pair orchestration status must match provider lookup status")

        if self.status is DDIOrchestratedPairStatus.ASSERTION_RETURNED:
            if not self.assertions or self.failure is not None:
                raise ValueError("assertion outcome requires assertions and no failure")
        elif self.assertions:
            raise ValueError("only assertion-returned outcomes may contain assertions")

        if self.status in {
            DDIOrchestratedPairStatus.PROVIDER_UNAVAILABLE,
            DDIOrchestratedPairStatus.PROVIDER_ERROR,
        } and self.failure is None:
            raise ValueError("provider failure outcomes require failure detail")
        if self.failure is not None and self.status not in {
            DDIOrchestratedPairStatus.PROVIDER_UNAVAILABLE,
            DDIOrchestratedPairStatus.PROVIDER_ERROR,
        }:
            raise ValueError("non-failure pair outcomes cannot include provider failure")
        if self.status in {
            DDIOrchestratedPairStatus.ASSERTION_RETURNED,
            DDIOrchestratedPairStatus.NO_ASSERTION_RETURNED,
            DDIOrchestratedPairStatus.INSUFFICIENT_PROVIDER_COVERAGE,
        } and (self.mapping_a is None or self.mapping_b is None):
            raise ValueError("completed provider outcomes require both accepted mappings")
        if (
            self.mapping_a is not None
            and self.mapping_b is not None
            and self.mapping_a.status is ProviderMappingStatus.MAPPED
            and self.mapping_b.status is ProviderMappingStatus.MAPPED
            and self.mapping_a.provider_concept_identifier
            == self.mapping_b.provider_concept_identifier
        ):
            raise ValueError("distinct ingredients cannot share one provider concept")
        if self.status in {
            DDIOrchestratedPairStatus.ASSERTION_RETURNED,
            DDIOrchestratedPairStatus.NO_ASSERTION_RETURNED,
        }:
            if (
                self.coverage is None
                or self.coverage.status is not ProviderCoverageStatus.IN_SCOPE
            ):
                raise ValueError(
                    "completed assertion outcomes require in-scope coverage evidence"
                )
        if self.status is DDIOrchestratedPairStatus.INSUFFICIENT_PROVIDER_COVERAGE:
            if self.coverage is None or self.coverage.status not in {
                ProviderCoverageStatus.OUT_OF_SCOPE,
                ProviderCoverageStatus.UNKNOWN,
            }:
                raise ValueError(
                    "insufficient coverage requires out-of-scope or unknown evidence"
                )
        if (
            self.coverage is not None
            and self.coverage.provider_release_identifier
            != self.provider_release_identifier
        ):
            raise ValueError("coverage evidence must match the pair provider release")
        for assertion in self.assertions:
            if assertion.provider_release_identifier != self.provider_release_identifier:
                raise ValueError("assertion release must match the pair provider release")
            if (
                assertion.ingredient_a_mapping != self.mapping_a
                or assertion.ingredient_b_mapping != self.mapping_b
            ):
                raise ValueError("assertion mappings must match the pair mappings")
        return self


class DDIOrchestrationCounts(BaseModel):
    """Deterministic engine-state counts, never clinical summary counts."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    candidate_pairs: int = Field(ge=0)
    pairs_looked_up: int = Field(ge=0)
    assertions_returned: int = Field(ge=0)
    no_assertion_results: int = Field(ge=0)
    unmapped_pairs: int = Field(ge=0)
    provider_failure_pairs: int = Field(ge=0)
    review_required_pairs: int = Field(ge=0)
    same_ingredient_overlaps: int = Field(ge=0)


class DDIOrchestrationResult(BaseModel):
    """Aggregate product-pair orchestration result with no clinical conclusion."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    correlation_identifier: str = Field(min_length=1, max_length=120)
    status: DDIOrchestrationStatus
    provider_metadata: ProviderMetadata
    required_provider_release_identifier: str = Field(min_length=1, max_length=255)
    pair_expansion: CandidatePairExpansionResult
    pair_results: tuple[DDIOrchestratedPairResult, ...]
    same_ingredient_overlaps: tuple[SameIngredientOverlap, ...]
    counts: DDIOrchestrationCounts
    execution_metadata: EngineExecutionMetadata | None = None
    started_at: AwareDatetime
    completed_at: AwareDatetime

    @model_validator(mode="after")
    def validate_aggregate(self) -> DDIOrchestrationResult:
        if self.completed_at < self.started_at:
            raise ValueError("orchestration completion cannot predate its start")
        if self.same_ingredient_overlaps != self.pair_expansion.same_ingredient_overlaps:
            raise ValueError("aggregate overlaps must preserve pair-expansion output")
        pair_identifiers = tuple(
            item.candidate_pair.pair_identifier for item in self.pair_results
        )
        if tuple(sorted(set(pair_identifiers))) != pair_identifiers:
            raise ValueError("orchestrated pair results must be sorted and unique")
        expected_candidate_ids = tuple(
            item.pair_identifier for item in self.pair_expansion.candidate_pairs
        )
        if pair_identifiers != expected_candidate_ids:
            raise ValueError("every candidate pair must have one orchestrated result")
        for index, pair_result in enumerate(self.pair_results, start=1):
            if (
                pair_result.provider_release_identifier
                != self.provider_metadata.release_identifier
            ):
                raise ValueError("pair provider release must match aggregate metadata")
            if (
                pair_result.provider_request_identifier is not None
                and pair_result.provider_request_identifier
                != f"{self.correlation_identifier}::pair::{index:04d}"
            ):
                raise ValueError("pair request correlation must match the aggregate")
            for mapping in (pair_result.mapping_a, pair_result.mapping_b):
                if mapping is None:
                    continue
                if (
                    mapping.provider_name != self.provider_metadata.provider_name
                    or mapping.provider_namespace
                    != self.provider_metadata.provider_namespace
                    or mapping.provider_version
                    != self.provider_metadata.provider_version
                    or mapping.provider_release_identifier
                    != self.provider_metadata.release_identifier
                ):
                    raise ValueError(
                        "pair mapping provenance must match aggregate provider metadata"
                    )
            for assertion in pair_result.assertions:
                if (
                    assertion.provider_name != self.provider_metadata.provider_name
                    or assertion.provider_namespace
                    != self.provider_metadata.provider_namespace
                    or assertion.provider_version
                    != self.provider_metadata.provider_version
                    or assertion.provider_release_identifier
                    != self.provider_metadata.release_identifier
                ):
                    raise ValueError(
                        "pair assertion provenance must match aggregate provider metadata"
                    )
        if any(
            pair_result.provider_request_identifier is not None
            for pair_result in self.pair_results
        ) and (
            self.required_provider_release_identifier
            != self.provider_metadata.release_identifier
        ):
            raise ValueError(
                "looked-up pairs require the aggregate's selected provider release"
            )

        unmapped_codes = {
            ProviderMappingIssueCode.RXNORM_MAPPING_MISSING,
            ProviderMappingIssueCode.RXNORM_MAPPING_UNMAPPED,
            ProviderMappingIssueCode.PROVIDER_MAPPING_UNMAPPED,
        }
        expected_counts = DDIOrchestrationCounts(
            candidate_pairs=len(self.pair_expansion.candidate_pairs),
            pairs_looked_up=sum(
                item.provider_request_identifier is not None for item in self.pair_results
            ),
            assertions_returned=sum(
                len(item.assertions) for item in self.pair_results
            ),
            no_assertion_results=sum(
                item.status is DDIOrchestratedPairStatus.NO_ASSERTION_RETURNED
                for item in self.pair_results
            ),
            unmapped_pairs=sum(
                any(issue.code in unmapped_codes for issue in item.mapping_issues)
                for item in self.pair_results
            ),
            provider_failure_pairs=sum(
                item.failure is not None for item in self.pair_results
            ),
            review_required_pairs=sum(
                item.review_required for item in self.pair_results
            ),
            same_ingredient_overlaps=len(self.same_ingredient_overlaps),
        )
        if self.counts != expected_counts:
            raise ValueError("aggregate counts must match pair results exactly")
        expected_status = _expected_aggregate_status(
            self.pair_expansion.status,
            self.pair_results,
            self.same_ingredient_overlaps,
        )
        if self.status is not expected_status:
            raise ValueError("aggregate status must match product and pair execution state")
        return self


def _expected_aggregate_status(
    expansion_status: PairExpansionStatus,
    pair_results: tuple[DDIOrchestratedPairResult, ...],
    overlaps: tuple[SameIngredientOverlap, ...],
) -> DDIOrchestrationStatus:
    if expansion_status is PairExpansionStatus.BLOCKED_BY_ELIGIBILITY:
        return DDIOrchestrationStatus.BLOCKED_BY_PRODUCT_MAPPING
    if not pair_results:
        if overlaps:
            return DDIOrchestrationStatus.NO_DISTINCT_CANDIDATE_PAIRS
        raise ValueError("eligible expansion requires pair or overlap output")
    statuses = tuple(item.status for item in pair_results)
    completed = {
        DDIOrchestratedPairStatus.ASSERTION_RETURNED,
        DDIOrchestratedPairStatus.NO_ASSERTION_RETURNED,
    }
    if all(status in completed for status in statuses):
        return DDIOrchestrationStatus.LOOKUP_COMPLETED
    if all(
        status is DDIOrchestratedPairStatus.PROVIDER_MAPPING_UNRESOLVED
        for status in statuses
    ):
        return DDIOrchestrationStatus.BLOCKED_BY_PROVIDER_MAPPING
    if all(
        status is DDIOrchestratedPairStatus.PROVIDER_UNAVAILABLE
        for status in statuses
    ):
        return DDIOrchestrationStatus.PROVIDER_UNAVAILABLE
    if all(
        status is DDIOrchestratedPairStatus.PROVIDER_ERROR for status in statuses
    ):
        return DDIOrchestrationStatus.PROVIDER_ERROR
    return DDIOrchestrationStatus.COMPLETED_WITH_PROVIDER_UNCERTAINTY
