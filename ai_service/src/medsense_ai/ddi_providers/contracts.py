"""Provider-neutral contracts for future licensed DDI knowledge providers.

This module defines transport and provenance boundaries only. It contains no
medical knowledge, interaction interpretation, severity normalization, or
claim that a missing provider assertion is safe.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from enum import Enum
from typing import Protocol, runtime_checkable

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    ValidationError,
    model_validator,
)

logger = logging.getLogger(__name__)


class ProviderReadinessStatus(str, Enum):
    """Operational readiness reported by a provider adapter."""

    READY = "ready"
    DEGRADED = "degraded"
    NOT_READY = "not_ready"
    UNAVAILABLE = "unavailable"


class ProviderLookupStatus(str, Enum):
    """Provider lookup outcomes that preserve uncertainty explicitly."""

    INTERACTION_ASSERTION_FOUND = "interaction_assertion_found"
    NO_ASSERTION_RETURNED = "no_assertion_returned"
    INGREDIENT_A_UNMAPPED = "ingredient_a_unmapped"
    INGREDIENT_B_UNMAPPED = "ingredient_b_unmapped"
    BOTH_INGREDIENTS_UNMAPPED = "both_ingredients_unmapped"
    AMBIGUOUS_MAPPING = "ambiguous_mapping"
    INSUFFICIENT_PROVIDER_COVERAGE = "insufficient_provider_coverage"
    PROVIDER_UNAVAILABLE = "provider_unavailable"
    PROVIDER_ERROR = "provider_error"


class ProviderCoverageStatus(str, Enum):
    """Provider-declared coverage state for the requested lookup domain."""

    IN_SCOPE = "in_scope"
    OUT_OF_SCOPE = "out_of_scope"
    UNKNOWN = "unknown"


class ProviderPairEndpoint(str, Enum):
    """Transport endpoint within a requested pair, without clinical meaning."""

    INGREDIENT_A = "ingredient_a"
    INGREDIENT_B = "ingredient_b"


class ProviderMappingStatus(str, Enum):
    """Lifecycle state of one provider-specific ingredient mapping."""

    MAPPED = "mapped"
    UNMAPPED = "unmapped"
    AMBIGUOUS = "ambiguous"
    REVIEW_REQUIRED = "review_required"
    DEPRECATED = "deprecated"
    SUPERSEDED = "superseded"


class ProviderMappingMethod(str, Enum):
    """Permitted deterministic mapping methods.

    Fuzzy-name mapping is intentionally absent.
    """

    PROVIDER_CROSSWALK = "provider_crosswalk"
    EXACT_EXTERNAL_IDENTIFIER = "exact_external_identifier"
    HUMAN_VERIFIED = "human_verified"
    NO_MATCH = "no_match"


class ProviderMappingConfidence(str, Enum):
    """Mapping confidence without a fabricated numeric score."""

    EXACT = "exact"
    PROVIDER_ASSERTED = "provider_asserted"
    HUMAN_VERIFIED = "human_verified"
    REVIEW_REQUIRED = "review_required"
    AMBIGUOUS = "ambiguous"
    NONE = "none"


class ProviderFailureCategory(str, Enum):
    """Typed adapter and provider failures for fail-closed translation."""

    AUTHENTICATION_FAILURE = "authentication_failure"
    AUTHORIZATION_OR_LICENSE_FAILURE = "authorization_or_license_failure"
    TIMEOUT = "timeout"
    RATE_LIMIT = "rate_limit"
    MALFORMED_PROVIDER_RESPONSE = "malformed_provider_response"
    UNSUPPORTED_CONCEPT = "unsupported_concept"
    MAPPING_FAILURE = "mapping_failure"
    PROVIDER_MAINTENANCE_OR_UNAVAILABLE = "provider_maintenance_or_unavailable"
    VERSION_MISMATCH = "version_mismatch"
    UNSUPPORTED_OPERATION = "unsupported_operation"
    UNEXPECTED_PROVIDER_ERROR = "unexpected_provider_error"


class ProviderCapabilityDescriptor(BaseModel):
    """Features an adapter declares without implying any vendor capability."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    pair_lookup: bool
    batch_lookup: bool
    source_native_classification: bool
    source_native_description: bool
    source_native_effect: bool
    source_native_management: bool
    source_native_evidence_classification: bool
    source_native_directionality: bool
    source_native_context: bool
    group_expansion_provenance: bool
    evidence_references: bool
    stable_concept_identifiers: bool
    stable_interaction_identifiers: bool
    versioned_releases: bool
    synchronous_api: bool
    offline_database: bool
    coverage_reporting: bool


class ProviderMetadata(BaseModel):
    """Identity and pinned content version for one configured provider."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    provider_name: str = Field(min_length=1, max_length=200)
    provider_namespace: str = Field(min_length=1, max_length=100)
    adapter_version: str = Field(min_length=1, max_length=100)
    provider_version: str = Field(min_length=1, max_length=200)
    release_identifier: str = Field(min_length=1, max_length=255)
    capabilities: ProviderCapabilityDescriptor


class ProviderFailure(BaseModel):
    """Sanitized failure information safe to cross the provider boundary."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    category: ProviderFailureCategory
    message: str = Field(min_length=1, max_length=1000)
    retryable: bool
    provider_status_code: str | None = Field(default=None, min_length=1, max_length=100)


class ProviderCoverageAssessment(BaseModel):
    """Versioned coverage evidence kept separate from interaction assertions."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    status: ProviderCoverageStatus
    provider_release_identifier: str = Field(min_length=1, max_length=255)
    coverage_basis_identifier: str | None = Field(default=None, min_length=1, max_length=512)
    detail: str | None = Field(default=None, min_length=1, max_length=1000)
    checked_at: AwareDatetime


class ProviderHealth(BaseModel):
    """Result of a non-clinical provider health/readiness check."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    metadata: ProviderMetadata
    readiness: ProviderReadinessStatus
    checked_at: AwareDatetime
    detail: str | None = Field(default=None, min_length=1, max_length=1000)
    failure: ProviderFailure | None = None

    @model_validator(mode="after")
    def validate_readiness_failure(self) -> ProviderHealth:
        if self.readiness is ProviderReadinessStatus.READY and self.failure is not None:
            raise ValueError("a ready provider health result cannot include a failure")
        if self.readiness is ProviderReadinessStatus.UNAVAILABLE and self.failure is None:
            raise ValueError("an unavailable provider health result requires a failure")
        return self


class CanonicalIngredientReference(BaseModel):
    """Opaque MedSenseAI ingredient identity with its pinned RxNorm identity."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    medsense_ingredient_identifier: str = Field(min_length=1, max_length=255)
    rxnorm_rxcui: str = Field(min_length=1, max_length=64)
    rxnorm_release_identifier: str = Field(min_length=1, max_length=255)


class MappingProvenance(BaseModel):
    """Traceability for a provider concept mapping assertion or attempt."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    source_name: str = Field(min_length=1, max_length=200)
    source_version: str = Field(min_length=1, max_length=255)
    source_record_identifier: str | None = Field(default=None, min_length=1, max_length=512)
    source_record_checksum: str | None = Field(default=None, min_length=1, max_length=255)
    transformation_description: str | None = Field(default=None, min_length=1, max_length=1000)


class ProviderIngredientMapping(BaseModel):
    """Versioned mapping from canonical/RxNorm identity to provider identity."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    mapping_identifier: str = Field(min_length=1, max_length=255)
    provider_name: str = Field(min_length=1, max_length=200)
    provider_namespace: str = Field(min_length=1, max_length=100)
    provider_version: str = Field(min_length=1, max_length=200)
    provider_release_identifier: str = Field(min_length=1, max_length=255)
    ingredient: CanonicalIngredientReference
    provider_concept_identifier: str | None = Field(default=None, min_length=1, max_length=255)
    candidate_provider_concept_identifiers: tuple[str, ...] = ()
    mapping_method: ProviderMappingMethod
    mapping_confidence: ProviderMappingConfidence
    status: ProviderMappingStatus
    human_review_required: bool
    provenance: MappingProvenance
    mapped_at: AwareDatetime
    deprecated_at: AwareDatetime | None = None
    superseded_by_mapping_identifier: str | None = Field(
        default=None, min_length=1, max_length=255
    )

    @model_validator(mode="after")
    def validate_mapping_state(self) -> ProviderIngredientMapping:
        candidates = self.candidate_provider_concept_identifiers
        if any(not candidate.strip() or len(candidate) > 255 for candidate in candidates):
            raise ValueError(
                "candidate provider concept identifiers must be non-blank and at most 255 characters"
            )
        if len(candidates) != len(set(candidates)):
            raise ValueError("candidate provider concept identifiers must be unique")

        if self.status is ProviderMappingStatus.MAPPED:
            if self.provider_concept_identifier is None:
                raise ValueError("mapped status requires a provider concept identifier")
            if candidates:
                raise ValueError("mapped status cannot include unresolved candidates")
            if self.mapping_method is ProviderMappingMethod.NO_MATCH:
                raise ValueError("mapped status cannot use the no-match method")
            if self.mapping_confidence in {
                ProviderMappingConfidence.NONE,
                ProviderMappingConfidence.AMBIGUOUS,
                ProviderMappingConfidence.REVIEW_REQUIRED,
            }:
                raise ValueError("mapped status requires resolved mapping confidence")
            if self.human_review_required:
                raise ValueError("mapped status cannot still require human review")

        if self.status is ProviderMappingStatus.UNMAPPED:
            if self.provider_concept_identifier is not None or candidates:
                raise ValueError("unmapped status cannot include provider concepts")
            if self.mapping_method is not ProviderMappingMethod.NO_MATCH:
                raise ValueError("unmapped status requires the no-match method")
            if self.mapping_confidence is not ProviderMappingConfidence.NONE:
                raise ValueError("unmapped status requires no mapping confidence")

        if self.status is ProviderMappingStatus.AMBIGUOUS:
            if self.provider_concept_identifier is not None or len(candidates) < 2:
                raise ValueError("ambiguous status requires at least two candidate concepts")
            if self.mapping_confidence is not ProviderMappingConfidence.AMBIGUOUS:
                raise ValueError("ambiguous status requires ambiguous confidence")
            if not self.human_review_required:
                raise ValueError("ambiguous status requires human review")

        if self.status is ProviderMappingStatus.REVIEW_REQUIRED:
            if self.provider_concept_identifier is not None or not candidates:
                raise ValueError("review-required status needs unresolved candidate concepts")
            if self.mapping_confidence is not ProviderMappingConfidence.REVIEW_REQUIRED:
                raise ValueError("review-required status requires matching confidence")
            if not self.human_review_required:
                raise ValueError("review-required status requires human review")

        if self.status in {
            ProviderMappingStatus.DEPRECATED,
            ProviderMappingStatus.SUPERSEDED,
        }:
            if self.provider_concept_identifier is None or self.deprecated_at is None:
                raise ValueError("deprecated mappings require a concept and deprecation time")
            if self.deprecated_at < self.mapped_at:
                raise ValueError("mapping deprecation cannot predate mapping creation")
        elif self.deprecated_at is not None:
            raise ValueError("only deprecated or superseded mappings may have deprecated_at")

        if self.status is ProviderMappingStatus.SUPERSEDED:
            if self.superseded_by_mapping_identifier is None:
                raise ValueError("superseded mappings require a replacement mapping identifier")
            if self.superseded_by_mapping_identifier == self.mapping_identifier:
                raise ValueError("a superseded mapping cannot replace itself")
        elif self.superseded_by_mapping_identifier is not None:
            raise ValueError("only superseded mappings may identify a replacement")

        return self


class ProviderEvidenceReference(BaseModel):
    """Provider-supplied evidence locator preserved without interpretation."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    identifier: str = Field(min_length=1, max_length=512)
    namespace: str | None = Field(default=None, min_length=1, max_length=100)
    uri: str | None = Field(default=None, min_length=1, max_length=2000)
    citation_text: str | None = Field(default=None, min_length=1, max_length=4000)


class ProviderSourceContext(BaseModel):
    """Provider-native route/form/population or other assertion context."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    provider_context_type: str = Field(min_length=1, max_length=255)
    source_native_code: str | None = Field(default=None, min_length=1, max_length=500)
    source_native_label: str | None = Field(default=None, min_length=1, max_length=1000)
    source_native_description: str | None = Field(default=None, min_length=1, max_length=4000)

    @model_validator(mode="after")
    def validate_context_value(self) -> ProviderSourceContext:
        if not any(
            (
                self.source_native_code,
                self.source_native_label,
                self.source_native_description,
            )
        ):
            raise ValueError("provider source context requires a source-native value")
        return self


class ProviderGroupExpansionProvenance(BaseModel):
    """Provider-native group/class expansion retained for one pair endpoint."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    endpoint: ProviderPairEndpoint
    provider_group_identifier: str = Field(min_length=1, max_length=512)
    provider_group_label: str | None = Field(default=None, min_length=1, max_length=1000)
    expanded_provider_concept_identifier: str = Field(min_length=1, max_length=255)
    provider_release_identifier: str = Field(min_length=1, max_length=255)
    expansion_release_identifier: str = Field(min_length=1, max_length=255)
    source_record_identifier: str | None = Field(default=None, min_length=1, max_length=512)
    source_record_checksum: str | None = Field(default=None, min_length=1, max_length=255)


class ProviderUseRestrictions(BaseModel):
    """Provider-supplied use restrictions; ``None`` means not established."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    storage_permitted: bool | None = None
    caching_permitted: bool | None = None
    display_permitted: bool | None = None
    audit_retention_permitted: bool | None = None
    redistribution_permitted: bool | None = None
    attribution_required: bool | None = None
    attribution_text: str | None = Field(default=None, min_length=1, max_length=4000)
    restriction_summary: str | None = Field(default=None, min_length=1, max_length=4000)

    @model_validator(mode="after")
    def validate_attribution(self) -> ProviderUseRestrictions:
        if self.attribution_required is True and self.attribution_text is None:
            raise ValueError("required attribution must include provider-supplied text")
        return self


class ProviderSourceAssertion(BaseModel):
    """One source-preserved provider assertion, without clinical interpretation."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    provider_name: str = Field(min_length=1, max_length=200)
    provider_namespace: str = Field(min_length=1, max_length=100)
    provider_version: str = Field(min_length=1, max_length=200)
    provider_release_identifier: str = Field(min_length=1, max_length=255)
    provider_interaction_identifier: str | None = Field(
        default=None, min_length=1, max_length=512
    )
    provider_ingredient_a_identifier: str = Field(min_length=1, max_length=255)
    provider_ingredient_b_identifier: str = Field(min_length=1, max_length=255)
    source_native_classification_code: str | None = Field(
        default=None, min_length=1, max_length=500
    )
    source_native_classification_label: str | None = Field(
        default=None, min_length=1, max_length=500
    )
    source_native_description: str | None = Field(default=None, min_length=1)
    source_native_effect: str | None = Field(default=None, min_length=1)
    source_native_management: str | None = Field(default=None, min_length=1)
    source_native_evidence_code: str | None = Field(
        default=None, min_length=1, max_length=500
    )
    source_native_evidence_label: str | None = Field(
        default=None, min_length=1, max_length=1000
    )
    provider_endpoint_order_significant: bool | None = None
    source_native_directionality_code: str | None = Field(
        default=None, min_length=1, max_length=500
    )
    source_native_directionality_label: str | None = Field(
        default=None, min_length=1, max_length=1000
    )
    source_contexts: tuple[ProviderSourceContext, ...] = ()
    group_expansion_provenance: tuple[ProviderGroupExpansionProvenance, ...] = ()
    evidence_references: tuple[ProviderEvidenceReference, ...] = ()
    retrieved_at: AwareDatetime
    ingredient_a_mapping: ProviderIngredientMapping
    ingredient_b_mapping: ProviderIngredientMapping
    use_restrictions: ProviderUseRestrictions

    @model_validator(mode="after")
    def validate_source_preservation(self) -> ProviderSourceAssertion:
        mapping_a = self.ingredient_a_mapping
        mapping_b = self.ingredient_b_mapping
        for mapping in (mapping_a, mapping_b):
            if mapping.status is not ProviderMappingStatus.MAPPED:
                raise ValueError("a source assertion requires resolved ingredient mappings")
            if (
                mapping.provider_name != self.provider_name
                or mapping.provider_namespace != self.provider_namespace
                or mapping.provider_version != self.provider_version
                or mapping.provider_release_identifier != self.provider_release_identifier
            ):
                raise ValueError("assertion and mapping provider provenance must match")
        if mapping_a.provider_concept_identifier != self.provider_ingredient_a_identifier:
            raise ValueError("ingredient A assertion identifier must match its mapping")
        if mapping_b.provider_concept_identifier != self.provider_ingredient_b_identifier:
            raise ValueError("ingredient B assertion identifier must match its mapping")
        if self.provider_ingredient_a_identifier == self.provider_ingredient_b_identifier:
            raise ValueError("an assertion requires two distinct provider concepts")
        expansion_keys: set[tuple[ProviderPairEndpoint, str, str]] = set()
        for expansion in self.group_expansion_provenance:
            if expansion.provider_release_identifier != self.provider_release_identifier:
                raise ValueError("group expansion must match the assertion provider release")
            expected_identifier = (
                self.provider_ingredient_a_identifier
                if expansion.endpoint is ProviderPairEndpoint.INGREDIENT_A
                else self.provider_ingredient_b_identifier
            )
            if expansion.expanded_provider_concept_identifier != expected_identifier:
                raise ValueError("group expansion endpoint must match the assertion concept")
            key = (
                expansion.endpoint,
                expansion.provider_group_identifier,
                expansion.expanded_provider_concept_identifier,
            )
            if key in expansion_keys:
                raise ValueError("duplicate group expansion provenance is not permitted")
            expansion_keys.add(key)
        if not any(
            (
                self.provider_interaction_identifier,
                self.source_native_classification_code,
                self.source_native_classification_label,
                self.source_native_description,
                self.source_native_effect,
                self.source_native_management,
                self.source_native_evidence_code,
                self.source_native_evidence_label,
                self.provider_endpoint_order_significant,
                self.source_native_directionality_code,
                self.source_native_directionality_label,
                self.source_contexts,
                self.group_expansion_provenance,
                self.evidence_references,
            )
        ):
            raise ValueError("a provider assertion must preserve at least one source field")
        return self


class ProviderPairLookupRequest(BaseModel):
    """Canonical ingredient pair request presented to a provider adapter."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    request_identifier: str = Field(min_length=1, max_length=255)
    ingredient_a: CanonicalIngredientReference
    ingredient_b: CanonicalIngredientReference
    required_provider_release_identifier: str | None = Field(
        default=None, min_length=1, max_length=255
    )

    @model_validator(mode="after")
    def validate_distinct_ingredients(self) -> ProviderPairLookupRequest:
        if (
            self.ingredient_a.medsense_ingredient_identifier
            == self.ingredient_b.medsense_ingredient_identifier
            or self.ingredient_a.rxnorm_rxcui == self.ingredient_b.rxnorm_rxcui
        ):
            raise ValueError("provider pair lookup requires two distinct ingredients")
        if (
            self.ingredient_a.rxnorm_release_identifier
            != self.ingredient_b.rxnorm_release_identifier
        ):
            raise ValueError("provider pair lookup requires one pinned RxNorm release")
        return self


class ProviderPairLookupResult(BaseModel):
    """Typed lookup result whose non-found states never imply safety."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    status: ProviderLookupStatus
    request: ProviderPairLookupRequest
    provider_metadata: ProviderMetadata
    mapping_a: ProviderIngredientMapping | None = None
    mapping_b: ProviderIngredientMapping | None = None
    coverage: ProviderCoverageAssessment | None = None
    assertions: tuple[ProviderSourceAssertion, ...] = ()
    failure: ProviderFailure | None = None
    completed_at: AwareDatetime

    @model_validator(mode="after")
    def validate_outcome_state(self) -> ProviderPairLookupResult:
        if (
            self.status
            not in {
                ProviderLookupStatus.PROVIDER_UNAVAILABLE,
                ProviderLookupStatus.PROVIDER_ERROR,
            }
            and not self.provider_metadata.capabilities.pair_lookup
        ):
            raise ValueError("pair lookup result conflicts with declared provider capability")
        self._validate_mapping_provenance()
        if self.status is ProviderLookupStatus.INTERACTION_ASSERTION_FOUND:
            self._require_resolved_mappings()
            self._require_coverage(ProviderCoverageStatus.IN_SCOPE)
            if not self.assertions or self.failure is not None:
                raise ValueError("found status requires assertions and no failure")
            self._validate_assertion_provenance()
            return self

        if self.assertions:
            raise ValueError("only a found status may contain provider assertions")

        if self.status is ProviderLookupStatus.NO_ASSERTION_RETURNED:
            self._require_resolved_mappings()
            self._require_coverage(ProviderCoverageStatus.IN_SCOPE)
            if self.failure is not None:
                raise ValueError("no-assertion status cannot include a provider failure")
        elif self.status is ProviderLookupStatus.INGREDIENT_A_UNMAPPED:
            self._require_mapping_statuses(
                ProviderMappingStatus.UNMAPPED, ProviderMappingStatus.MAPPED
            )
            self._require_no_failure()
        elif self.status is ProviderLookupStatus.INGREDIENT_B_UNMAPPED:
            self._require_mapping_statuses(
                ProviderMappingStatus.MAPPED, ProviderMappingStatus.UNMAPPED
            )
            self._require_no_failure()
        elif self.status is ProviderLookupStatus.BOTH_INGREDIENTS_UNMAPPED:
            self._require_mapping_statuses(
                ProviderMappingStatus.UNMAPPED, ProviderMappingStatus.UNMAPPED
            )
            self._require_no_failure()
        elif self.status is ProviderLookupStatus.AMBIGUOUS_MAPPING:
            if self.mapping_a is None or self.mapping_b is None:
                raise ValueError("ambiguous mapping status requires both mapping attempts")
            ambiguous_states = {
                ProviderMappingStatus.AMBIGUOUS,
                ProviderMappingStatus.REVIEW_REQUIRED,
            }
            if (
                self.mapping_a.status not in ambiguous_states
                and self.mapping_b.status not in ambiguous_states
            ):
                raise ValueError("ambiguous outcome requires an ambiguous mapping")
            self._require_no_failure()
        elif self.status is ProviderLookupStatus.INSUFFICIENT_PROVIDER_COVERAGE:
            self._require_resolved_mappings()
            if self.coverage is None or self.coverage.status not in {
                ProviderCoverageStatus.OUT_OF_SCOPE,
                ProviderCoverageStatus.UNKNOWN,
            }:
                raise ValueError("insufficient coverage requires out-of-scope or unknown evidence")
            self._require_no_failure()
        elif self.status is ProviderLookupStatus.PROVIDER_UNAVAILABLE:
            self._require_failure_categories(
                {
                    ProviderFailureCategory.TIMEOUT,
                    ProviderFailureCategory.RATE_LIMIT,
                    ProviderFailureCategory.PROVIDER_MAINTENANCE_OR_UNAVAILABLE,
                }
            )
        elif self.status is ProviderLookupStatus.PROVIDER_ERROR:
            if self.failure is None:
                raise ValueError("provider-error status requires failure detail")
            if self.failure.category in {
                ProviderFailureCategory.TIMEOUT,
                ProviderFailureCategory.RATE_LIMIT,
                ProviderFailureCategory.PROVIDER_MAINTENANCE_OR_UNAVAILABLE,
            }:
                raise ValueError("availability failures require provider-unavailable status")
        return self

    def _validate_mapping_provenance(self) -> None:
        metadata = self.provider_metadata
        if (
            self.coverage is not None
            and self.coverage.provider_release_identifier != metadata.release_identifier
        ):
            raise ValueError("coverage evidence must match the provider release")
        expected = (
            (self.mapping_a, self.request.ingredient_a),
            (self.mapping_b, self.request.ingredient_b),
        )
        for mapping, ingredient in expected:
            if mapping is None:
                continue
            if mapping.ingredient != ingredient:
                raise ValueError("mapping ingredient must match the requested ingredient")
            if (
                mapping.provider_name != metadata.provider_name
                or mapping.provider_namespace != metadata.provider_namespace
                or mapping.provider_version != metadata.provider_version
                or mapping.provider_release_identifier != metadata.release_identifier
            ):
                raise ValueError("mapping provider provenance must match lookup metadata")
        if (
            self.mapping_a is not None
            and self.mapping_b is not None
            and self.mapping_a.status is ProviderMappingStatus.MAPPED
            and self.mapping_b.status is ProviderMappingStatus.MAPPED
            and self.mapping_a.provider_concept_identifier
            == self.mapping_b.provider_concept_identifier
        ):
            raise ValueError("distinct ingredients cannot resolve to one provider concept")

    def _require_coverage(self, status: ProviderCoverageStatus) -> None:
        if self.coverage is None or self.coverage.status is not status:
            raise ValueError("lookup status requires explicit provider coverage evidence")

    def _require_resolved_mappings(self) -> None:
        self._require_mapping_statuses(ProviderMappingStatus.MAPPED, ProviderMappingStatus.MAPPED)

    def _require_mapping_statuses(
        self,
        status_a: ProviderMappingStatus,
        status_b: ProviderMappingStatus,
    ) -> None:
        if self.mapping_a is None or self.mapping_b is None:
            raise ValueError("lookup outcome requires both mapping attempts")
        if self.mapping_a.status is not status_a or self.mapping_b.status is not status_b:
            raise ValueError("lookup status does not match provider mapping statuses")

    def _require_no_failure(self) -> None:
        if self.failure is not None:
            raise ValueError("mapping and coverage outcomes cannot include provider failures")

    def _require_failure_categories(
        self, allowed_categories: set[ProviderFailureCategory]
    ) -> None:
        if self.failure is None or self.failure.category not in allowed_categories:
            raise ValueError("provider-unavailable status requires an availability failure")

    def _validate_assertion_provenance(self) -> None:
        if self.mapping_a is None or self.mapping_b is None:
            raise ValueError("assertion provenance requires both mappings")
        metadata = self.provider_metadata
        for assertion in self.assertions:
            capabilities = metadata.capabilities
            if (
                assertion.provider_name != metadata.provider_name
                or assertion.provider_namespace != metadata.provider_namespace
                or assertion.provider_version != metadata.provider_version
                or assertion.provider_release_identifier != metadata.release_identifier
            ):
                raise ValueError("assertion provider provenance must match lookup metadata")
            if (
                assertion.ingredient_a_mapping != self.mapping_a
                or assertion.ingredient_b_mapping != self.mapping_b
            ):
                raise ValueError("assertion mapping provenance must match lookup mappings")
            if (
                assertion.source_native_classification_code is not None
                or assertion.source_native_classification_label is not None
            ) and not capabilities.source_native_classification:
                raise ValueError("source classification conflicts with declared capability")
            if (
                assertion.source_native_description is not None
                and not capabilities.source_native_description
            ):
                raise ValueError("source description conflicts with declared capability")
            if assertion.source_native_effect is not None and not capabilities.source_native_effect:
                raise ValueError("source effect conflicts with declared capability")
            if (
                assertion.source_native_management is not None
                and not capabilities.source_native_management
            ):
                raise ValueError("source management conflicts with declared capability")
            if (
                assertion.source_native_evidence_code is not None
                or assertion.source_native_evidence_label is not None
            ) and not capabilities.source_native_evidence_classification:
                raise ValueError("source evidence classification conflicts with declared capability")
            if (
                assertion.provider_endpoint_order_significant is not None
                or assertion.source_native_directionality_code is not None
                or assertion.source_native_directionality_label is not None
            ) and not capabilities.source_native_directionality:
                raise ValueError("source directionality conflicts with declared capability")
            if assertion.source_contexts and not capabilities.source_native_context:
                raise ValueError("source context conflicts with declared capability")
            if (
                assertion.group_expansion_provenance
                and not capabilities.group_expansion_provenance
            ):
                raise ValueError("group expansion conflicts with declared capability")
            if assertion.evidence_references and not capabilities.evidence_references:
                raise ValueError("evidence references conflict with declared capability")


class ProviderBatchLookupRequest(BaseModel):
    """Batch of pair requests for providers that declare batch capability."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    requests: tuple[ProviderPairLookupRequest, ...] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_unique_request_identifiers(self) -> ProviderBatchLookupRequest:
        identifiers = [request.request_identifier for request in self.requests]
        if len(identifiers) != len(set(identifiers)):
            raise ValueError("batch request identifiers must be unique")
        return self


class ProviderBatchLookupResult(BaseModel):
    """Ordered typed results for a supported provider batch operation."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    provider_metadata: ProviderMetadata
    request: ProviderBatchLookupRequest
    results: tuple[ProviderPairLookupResult, ...] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_provider_and_order(self) -> ProviderBatchLookupResult:
        if not self.provider_metadata.capabilities.batch_lookup:
            raise ValueError("batch result conflicts with declared provider capability")
        if len(self.results) != len(self.request.requests):
            raise ValueError("batch result count must match the batch request count")
        for requested_pair, result in zip(self.request.requests, self.results, strict=True):
            if result.provider_metadata != self.provider_metadata:
                raise ValueError("all batch results must use the same provider metadata")
            if result.request != requested_pair:
                raise ValueError("batch results must preserve request order and identity")
        return self


class ProviderAdapterError(Exception):
    """Expected adapter exception translated into a typed fail-closed result."""

    def __init__(
        self,
        category: ProviderFailureCategory,
        message: str,
        *,
        retryable: bool,
        provider_status_code: str | None = None,
    ) -> None:
        super().__init__(message)
        self.failure = ProviderFailure(
            category=category,
            message=message,
            retryable=retryable,
            provider_status_code=provider_status_code,
        )


@runtime_checkable
class DDIProvider(Protocol):
    """Required contract for a future provider-specific DDI adapter."""

    @property
    def metadata(self) -> ProviderMetadata: ...

    def health(self) -> ProviderHealth: ...

    def map_ingredient(
        self, ingredient: CanonicalIngredientReference
    ) -> ProviderIngredientMapping: ...

    def lookup_pair(self, request: ProviderPairLookupRequest) -> ProviderPairLookupResult: ...


@runtime_checkable
class BatchDDIProvider(DDIProvider, Protocol):
    """Optional extension for providers that declare batch lookup support."""

    def lookup_pairs(self, request: ProviderBatchLookupRequest) -> ProviderBatchLookupResult: ...


_UNAVAILABLE_FAILURES = {
    ProviderFailureCategory.TIMEOUT,
    ProviderFailureCategory.RATE_LIMIT,
    ProviderFailureCategory.PROVIDER_MAINTENANCE_OR_UNAVAILABLE,
}


def lookup_pair_fail_closed(
    provider: DDIProvider,
    request: ProviderPairLookupRequest,
) -> ProviderPairLookupResult:
    """Call an adapter and translate all failures into explicit unsafe-to-infer states."""

    metadata = provider.metadata
    if not metadata.capabilities.pair_lookup:
        failure = ProviderFailure(
            category=ProviderFailureCategory.UNSUPPORTED_OPERATION,
            message="provider does not declare pair lookup capability",
            retryable=False,
        )
        logger.error(
            "DDI provider lacks pair lookup capability provider=%s request=%s",
            metadata.provider_namespace,
            request.request_identifier,
        )
        return _failure_result(metadata, request, failure)
    if (
        request.required_provider_release_identifier is not None
        and request.required_provider_release_identifier != metadata.release_identifier
    ):
        failure = ProviderFailure(
            category=ProviderFailureCategory.VERSION_MISMATCH,
            message="configured provider release does not match the required release",
            retryable=False,
        )
        logger.error(
            "DDI provider release mismatch provider=%s request=%s required_release=%s "
            "configured_release=%s",
            metadata.provider_namespace,
            request.request_identifier,
            request.required_provider_release_identifier,
            metadata.release_identifier,
        )
        return _failure_result(metadata, request, failure)

    try:
        result = provider.lookup_pair(request)
    except ProviderAdapterError as exc:
        logger.warning(
            "DDI provider adapter failure provider=%s request=%s category=%s",
            metadata.provider_namespace,
            request.request_identifier,
            exc.failure.category.value,
        )
        return _failure_result(metadata, request, exc.failure)
    except ValidationError:
        logger.error(
            "Malformed DDI provider response failed contract validation provider=%s request=%s",
            metadata.provider_namespace,
            request.request_identifier,
        )
        failure = ProviderFailure(
            category=ProviderFailureCategory.MALFORMED_PROVIDER_RESPONSE,
            message="provider response failed contract validation",
            retryable=False,
        )
        return _failure_result(metadata, request, failure)
    except Exception as exc:
        logger.error(
            "Unexpected DDI provider failure provider=%s request=%s exception_type=%s",
            metadata.provider_namespace,
            request.request_identifier,
            type(exc).__name__,
        )
        failure = ProviderFailure(
            category=ProviderFailureCategory.UNEXPECTED_PROVIDER_ERROR,
            message="unexpected provider adapter failure",
            retryable=False,
        )
        return _failure_result(metadata, request, failure)

    if not isinstance(result, ProviderPairLookupResult):
        failure = ProviderFailure(
            category=ProviderFailureCategory.MALFORMED_PROVIDER_RESPONSE,
            message="provider adapter returned an invalid result type",
            retryable=False,
        )
        logger.error(
            "Malformed DDI provider result provider=%s request=%s",
            metadata.provider_namespace,
            request.request_identifier,
        )
        return _failure_result(metadata, request, failure)

    if result.request != request or result.provider_metadata != metadata:
        failure = ProviderFailure(
            category=ProviderFailureCategory.MALFORMED_PROVIDER_RESPONSE,
            message="provider result provenance does not match the request and adapter metadata",
            retryable=False,
        )
        logger.error(
            "Mismatched DDI provider result provider=%s request=%s",
            metadata.provider_namespace,
            request.request_identifier,
        )
        return _failure_result(metadata, request, failure)

    return result


def _failure_result(
    metadata: ProviderMetadata,
    request: ProviderPairLookupRequest,
    failure: ProviderFailure,
) -> ProviderPairLookupResult:
    status = (
        ProviderLookupStatus.PROVIDER_UNAVAILABLE
        if failure.category in _UNAVAILABLE_FAILURES
        else ProviderLookupStatus.PROVIDER_ERROR
    )
    return ProviderPairLookupResult(
        status=status,
        request=request,
        provider_metadata=metadata,
        failure=failure,
        completed_at=datetime.now(timezone.utc),
    )
