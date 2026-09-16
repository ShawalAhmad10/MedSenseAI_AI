"""Clearly synthetic DDI provider used only for contract conformance tests."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum

from medsense_ai.ddi_providers import (
    BaseDDIProviderAdapter,
    CanonicalIngredientReference,
    ConformanceScenario,
    MappingProvenance,
    ProviderAdapterError,
    ProviderAdapterConfig,
    ProviderBatchLookupRequest,
    ProviderCapabilityDescriptor,
    ProviderCoverageAssessment,
    ProviderCoverageStatus,
    ProviderEvidenceReference,
    ProviderEnvironment,
    ProviderFailureCategory,
    ProviderGroupExpansionProvenance,
    ProviderHealth,
    ProviderIngredientMapping,
    ProviderLookupStatus,
    ProviderMappingConfidence,
    ProviderMappingMethod,
    ProviderMappingStatus,
    ProviderMetadata,
    ProviderPairLookupRequest,
    ProviderPairLookupResult,
    ProviderPairEndpoint,
    ProviderReadinessStatus,
    ProviderSourceAssertion,
    ProviderSourceContext,
    ProviderUseRestrictions,
    lookup_pair_fail_closed,
)

SYNTHETIC_TIME = datetime(2000, 1, 1, tzinfo=timezone.utc)


class SyntheticScenario(str, Enum):
    FOUND = "found"
    NO_ASSERTION = "no_assertion"
    INGREDIENT_A_UNMAPPED = "ingredient_a_unmapped"
    INGREDIENT_B_UNMAPPED = "ingredient_b_unmapped"
    BOTH_UNMAPPED = "both_unmapped"
    AMBIGUOUS = "ambiguous"
    INSUFFICIENT_COVERAGE = "insufficient_coverage"
    PROVIDER_MAINTENANCE = "provider_maintenance"
    AUTHENTICATION_FAILURE = "authentication_failure"
    TIMEOUT = "timeout"
    RATE_LIMIT = "rate_limit"
    AUTHORIZATION_FAILURE = "authorization_failure"
    UNEXPECTED_EXCEPTION = "unexpected_exception"
    MALFORMED_RESULT = "malformed_result"
    MALFORMED_VALIDATION_ERROR = "malformed_validation_error"
    MAPPING_PROVENANCE_MISMATCH = "mapping_provenance_mismatch"
    BATCH_PARTIAL_FAILURE = "batch_partial_failure"
    BATCH_MISSING_RESULT = "batch_missing_result"
    BATCH_DUPLICATE_PAIR = "batch_duplicate_pair"


SYNTHETIC_CAPABILITIES = ProviderCapabilityDescriptor(
    pair_lookup=True,
    batch_lookup=True,
    source_native_classification=True,
    source_native_description=True,
    source_native_effect=True,
    source_native_management=True,
    source_native_evidence_classification=True,
    source_native_directionality=True,
    source_native_context=True,
    group_expansion_provenance=True,
    evidence_references=True,
    stable_concept_identifiers=True,
    stable_interaction_identifiers=True,
    versioned_releases=True,
    synchronous_api=True,
    offline_database=False,
    coverage_reporting=True,
)

SYNTHETIC_METADATA = ProviderMetadata(
    provider_name="synthetic_ddi_provider",
    provider_namespace="synthetic_provider_namespace",
    adapter_version="synthetic_adapter_version_alpha",
    provider_version="synthetic_provider_version_alpha",
    release_identifier="synthetic_provider_release_alpha",
    capabilities=SYNTHETIC_CAPABILITIES,
)

SYNTHETIC_CONFIG = ProviderAdapterConfig(
    provider_name=SYNTHETIC_METADATA.provider_name,
    provider_namespace=SYNTHETIC_METADATA.provider_namespace,
    enabled=True,
    environment=ProviderEnvironment.TEST,
    expected_provider_version=SYNTHETIC_METADATA.provider_version,
    expected_release_identifier=SYNTHETIC_METADATA.release_identifier,
    timeout_seconds=1.0,
)


def synthetic_ingredient(suffix: str) -> CanonicalIngredientReference:
    return CanonicalIngredientReference(
        medsense_ingredient_identifier=f"ingredient_{suffix}",
        rxnorm_rxcui=f"synthetic_rxcui_{suffix}",
        rxnorm_release_identifier="synthetic_rxnorm_release_alpha",
    )


def synthetic_request(
    *, required_release: str | None = SYNTHETIC_METADATA.release_identifier
) -> ProviderPairLookupRequest:
    return ProviderPairLookupRequest(
        request_identifier="synthetic_lookup_request_alpha",
        ingredient_a=synthetic_ingredient("alpha"),
        ingredient_b=synthetic_ingredient("beta"),
        required_provider_release_identifier=required_release,
    )


class SyntheticDDIProvider(BaseDDIProviderAdapter):
    """Test-only adapter with no external calls and no medical content."""

    def __init__(
        self,
        scenario: SyntheticScenario,
        *,
        config: ProviderAdapterConfig = SYNTHETIC_CONFIG,
    ) -> None:
        self.scenario = scenario
        super().__init__(config, SYNTHETIC_METADATA)

    def _health(self) -> ProviderHealth:
        if self.scenario is SyntheticScenario.PROVIDER_MAINTENANCE:
            raise ProviderAdapterError(
                ProviderFailureCategory.PROVIDER_MAINTENANCE_OR_UNAVAILABLE,
                "synthetic_provider_maintenance",
                retryable=True,
            )
        return ProviderHealth(
            metadata=self.metadata,
            readiness=ProviderReadinessStatus.READY,
            checked_at=SYNTHETIC_TIME,
            detail="synthetic_health_ready",
        )

    def _map_ingredient(
        self, ingredient: CanonicalIngredientReference
    ) -> ProviderIngredientMapping:
        return self._mapping(ingredient, ProviderMappingStatus.MAPPED)

    def _lookup_pair(self, request: ProviderPairLookupRequest) -> ProviderPairLookupResult:
        if self.scenario is SyntheticScenario.PROVIDER_MAINTENANCE:
            raise ProviderAdapterError(
                ProviderFailureCategory.PROVIDER_MAINTENANCE_OR_UNAVAILABLE,
                "synthetic_provider_maintenance",
                retryable=True,
            )
        if self.scenario is SyntheticScenario.AUTHENTICATION_FAILURE:
            raise ProviderAdapterError(
                ProviderFailureCategory.AUTHENTICATION_FAILURE,
                "synthetic_authentication_failure",
                retryable=False,
            )
        if self.scenario is SyntheticScenario.TIMEOUT:
            raise ProviderAdapterError(
                ProviderFailureCategory.TIMEOUT,
                "synthetic_timeout",
                retryable=True,
            )
        if self.scenario is SyntheticScenario.RATE_LIMIT:
            raise ProviderAdapterError(
                ProviderFailureCategory.RATE_LIMIT,
                "synthetic_rate_limit",
                retryable=True,
                provider_status_code="synthetic_status_rate_limit",
            )
        if self.scenario is SyntheticScenario.AUTHORIZATION_FAILURE:
            raise ProviderAdapterError(
                ProviderFailureCategory.AUTHORIZATION_OR_LICENSE_FAILURE,
                "synthetic_authorization_failure",
                retryable=False,
            )
        if self.scenario is SyntheticScenario.UNEXPECTED_EXCEPTION:
            raise RuntimeError("synthetic_unexpected_failure")
        if self.scenario is SyntheticScenario.MALFORMED_RESULT:
            return "synthetic_invalid_result"  # type: ignore[return-value]
        if self.scenario is SyntheticScenario.MALFORMED_VALIDATION_ERROR:
            return ProviderPairLookupResult.model_validate(
                {"synthetic_invalid_result": "synthetic_invalid_value"}
            )

        mapping_a, mapping_b = self._mappings_for_scenario(request)
        status = self._status_for_scenario()
        coverage: ProviderCoverageAssessment | None = None
        if status in {
            ProviderLookupStatus.INTERACTION_ASSERTION_FOUND,
            ProviderLookupStatus.NO_ASSERTION_RETURNED,
        }:
            coverage = self._coverage(ProviderCoverageStatus.IN_SCOPE)
        elif status is ProviderLookupStatus.INSUFFICIENT_PROVIDER_COVERAGE:
            coverage = self._coverage(ProviderCoverageStatus.OUT_OF_SCOPE)
        assertions: tuple[ProviderSourceAssertion, ...] = ()
        if status is ProviderLookupStatus.INTERACTION_ASSERTION_FOUND:
            assertions = (self._assertion(mapping_a, mapping_b),)

        result = ProviderPairLookupResult(
            status=status,
            request=request,
            provider_metadata=self.metadata,
            mapping_a=mapping_a,
            mapping_b=mapping_b,
            coverage=coverage,
            assertions=assertions,
            completed_at=SYNTHETIC_TIME,
        )
        if self.scenario is SyntheticScenario.MAPPING_PROVENANCE_MISMATCH:
            payload = result.model_dump()
            payload["assertions"][0]["ingredient_a_mapping"]["provenance"][
                "source_version"
            ] = "synthetic_mismatched_source_version"
            return ProviderPairLookupResult.model_validate(payload)
        return result

    def _lookup_pairs(
        self, request: ProviderBatchLookupRequest
    ) -> tuple[ProviderPairLookupResult, ...]:
        if self.scenario is SyntheticScenario.BATCH_PARTIAL_FAILURE:
            first, second = request.requests
            return (
                lookup_pair_fail_closed(
                    SyntheticDDIProvider(SyntheticScenario.TIMEOUT), second
                ),
                SyntheticDDIProvider(SyntheticScenario.NO_ASSERTION).lookup_pair(first),
            )
        if self.scenario is SyntheticScenario.BATCH_MISSING_RESULT:
            return (
                SyntheticDDIProvider(SyntheticScenario.NO_ASSERTION).lookup_pair(
                    request.requests[0]
                ),
            )
        batch_scenario = (
            SyntheticScenario.NO_ASSERTION
            if self.scenario is SyntheticScenario.BATCH_DUPLICATE_PAIR
            else self.scenario
        )
        provider = SyntheticDDIProvider(batch_scenario)
        return tuple(provider.lookup_pair(item) for item in request.requests)

    def _mappings_for_scenario(
        self, request: ProviderPairLookupRequest
    ) -> tuple[ProviderIngredientMapping, ProviderIngredientMapping]:
        status_a = ProviderMappingStatus.MAPPED
        status_b = ProviderMappingStatus.MAPPED
        if self.scenario is SyntheticScenario.INGREDIENT_A_UNMAPPED:
            status_a = ProviderMappingStatus.UNMAPPED
        elif self.scenario is SyntheticScenario.INGREDIENT_B_UNMAPPED:
            status_b = ProviderMappingStatus.UNMAPPED
        elif self.scenario is SyntheticScenario.BOTH_UNMAPPED:
            status_a = ProviderMappingStatus.UNMAPPED
            status_b = ProviderMappingStatus.UNMAPPED
        elif self.scenario is SyntheticScenario.AMBIGUOUS:
            status_a = ProviderMappingStatus.AMBIGUOUS
        return self._mapping(request.ingredient_a, status_a), self._mapping(
            request.ingredient_b, status_b
        )

    def _mapping(
        self,
        ingredient: CanonicalIngredientReference,
        status: ProviderMappingStatus,
    ) -> ProviderIngredientMapping:
        suffix = ingredient.medsense_ingredient_identifier.removeprefix("ingredient_")
        common = {
            "mapping_identifier": f"synthetic_mapping_{suffix}_{status.value}",
            "provider_name": self.metadata.provider_name,
            "provider_namespace": self.metadata.provider_namespace,
            "provider_version": self.metadata.provider_version,
            "provider_release_identifier": self.metadata.release_identifier,
            "ingredient": ingredient,
            "provenance": MappingProvenance(
                source_name="synthetic_mapping_source",
                source_version="synthetic_mapping_source_version_alpha",
                source_record_identifier=f"synthetic_mapping_record_{suffix}",
                source_record_checksum=f"synthetic_mapping_checksum_{suffix}",
                transformation_description="synthetic_exact_mapping_transformation",
            ),
            "mapped_at": SYNTHETIC_TIME,
        }
        if status is ProviderMappingStatus.MAPPED:
            return ProviderIngredientMapping(
                **common,
                provider_concept_identifier=f"provider_concept_{suffix}",
                mapping_method=ProviderMappingMethod.PROVIDER_CROSSWALK,
                mapping_confidence=ProviderMappingConfidence.PROVIDER_ASSERTED,
                status=status,
                human_review_required=False,
            )
        if status is ProviderMappingStatus.AMBIGUOUS:
            return ProviderIngredientMapping(
                **common,
                candidate_provider_concept_identifiers=(
                    f"provider_concept_{suffix}_candidate_alpha",
                    f"provider_concept_{suffix}_candidate_beta",
                ),
                mapping_method=ProviderMappingMethod.PROVIDER_CROSSWALK,
                mapping_confidence=ProviderMappingConfidence.AMBIGUOUS,
                status=status,
                human_review_required=True,
            )
        return ProviderIngredientMapping(
            **common,
            mapping_method=ProviderMappingMethod.NO_MATCH,
            mapping_confidence=ProviderMappingConfidence.NONE,
            status=status,
            human_review_required=True,
        )

    def _status_for_scenario(self) -> ProviderLookupStatus:
        return {
            SyntheticScenario.FOUND: ProviderLookupStatus.INTERACTION_ASSERTION_FOUND,
            SyntheticScenario.NO_ASSERTION: ProviderLookupStatus.NO_ASSERTION_RETURNED,
            SyntheticScenario.INGREDIENT_A_UNMAPPED: (
                ProviderLookupStatus.INGREDIENT_A_UNMAPPED
            ),
            SyntheticScenario.INGREDIENT_B_UNMAPPED: (
                ProviderLookupStatus.INGREDIENT_B_UNMAPPED
            ),
            SyntheticScenario.BOTH_UNMAPPED: ProviderLookupStatus.BOTH_INGREDIENTS_UNMAPPED,
            SyntheticScenario.AMBIGUOUS: ProviderLookupStatus.AMBIGUOUS_MAPPING,
            SyntheticScenario.INSUFFICIENT_COVERAGE: (
                ProviderLookupStatus.INSUFFICIENT_PROVIDER_COVERAGE
            ),
            SyntheticScenario.MAPPING_PROVENANCE_MISMATCH: (
                ProviderLookupStatus.INTERACTION_ASSERTION_FOUND
            ),
        }[self.scenario]

    def _coverage(
        self, status: ProviderCoverageStatus
    ) -> ProviderCoverageAssessment:
        return ProviderCoverageAssessment(
            status=status,
            provider_release_identifier=self.metadata.release_identifier,
            coverage_basis_identifier="synthetic_coverage_basis_alpha",
            detail="synthetic_coverage_detail_alpha",
            checked_at=SYNTHETIC_TIME,
        )

    def _assertion(
        self,
        mapping_a: ProviderIngredientMapping,
        mapping_b: ProviderIngredientMapping,
    ) -> ProviderSourceAssertion:
        assert mapping_a.provider_concept_identifier is not None
        assert mapping_b.provider_concept_identifier is not None
        return ProviderSourceAssertion(
            provider_name=self.metadata.provider_name,
            provider_namespace=self.metadata.provider_namespace,
            provider_version=self.metadata.provider_version,
            provider_release_identifier=self.metadata.release_identifier,
            provider_interaction_identifier="synthetic_interaction_assertion_alpha",
            provider_ingredient_a_identifier=mapping_a.provider_concept_identifier,
            provider_ingredient_b_identifier=mapping_b.provider_concept_identifier,
            source_native_classification_code="synthetic_classification_code_alpha",
            source_native_classification_label="synthetic_classification_label_alpha",
            source_native_description="synthetic_description_alpha",
            source_native_effect="synthetic_effect_alpha",
            source_native_management="synthetic_management_alpha",
            source_native_evidence_code="synthetic_evidence_code_alpha",
            source_native_evidence_label="synthetic_evidence_label_alpha",
            provider_endpoint_order_significant=True,
            source_native_directionality_code="synthetic_directionality_code_alpha",
            source_native_directionality_label="synthetic_directionality_label_alpha",
            source_contexts=(
                ProviderSourceContext(
                    provider_context_type="synthetic_context_type_alpha",
                    source_native_code="synthetic_context_code_alpha",
                    source_native_label="synthetic_context_label_alpha",
                    source_native_description="synthetic_context_description_alpha",
                ),
            ),
            group_expansion_provenance=(
                ProviderGroupExpansionProvenance(
                    endpoint=ProviderPairEndpoint.INGREDIENT_A,
                    provider_group_identifier="synthetic_group_identifier_alpha",
                    provider_group_label="synthetic_group_label_alpha",
                    expanded_provider_concept_identifier=(
                        mapping_a.provider_concept_identifier
                    ),
                    provider_release_identifier=self.metadata.release_identifier,
                    expansion_release_identifier="synthetic_group_expansion_release_alpha",
                    source_record_identifier="synthetic_group_record_alpha",
                    source_record_checksum="synthetic_group_checksum_alpha",
                ),
            ),
            evidence_references=(
                ProviderEvidenceReference(
                    identifier="synthetic_evidence_reference_alpha",
                    namespace="synthetic_reference_namespace",
                    uri="https://synthetic.invalid/reference_alpha",
                    citation_text="synthetic_citation_text_alpha",
                ),
            ),
            retrieved_at=SYNTHETIC_TIME,
            ingredient_a_mapping=mapping_a,
            ingredient_b_mapping=mapping_b,
            use_restrictions=ProviderUseRestrictions(
                restriction_summary="synthetic_restriction_summary_alpha"
            ),
        )


class SyntheticConformanceProbe:
    """Scenario factory proving the reusable harness without clinical data."""

    @property
    def adapter_name(self) -> str:
        return "SyntheticDDIProvider"

    @property
    def metadata(self) -> ProviderMetadata:
        return SYNTHETIC_METADATA

    @property
    def environment_label(self) -> str:
        return "synthetic_test_environment"

    @property
    def tested_at(self) -> datetime:
        return SYNTHETIC_TIME

    @property
    def mapping_ingredient(self) -> CanonicalIngredientReference:
        return synthetic_ingredient("alpha")

    @property
    def expected_classification_code(self) -> str:
        return "synthetic_classification_code_alpha"

    @property
    def expected_classification_label(self) -> str:
        return "synthetic_classification_label_alpha"

    def provider_for(self, scenario: ConformanceScenario) -> SyntheticDDIProvider:
        scenario_map = {
            ConformanceScenario.ASSERTION_FOUND: SyntheticScenario.FOUND,
            ConformanceScenario.NO_ASSERTION: SyntheticScenario.NO_ASSERTION,
            ConformanceScenario.INGREDIENT_A_UNMAPPED: (
                SyntheticScenario.INGREDIENT_A_UNMAPPED
            ),
            ConformanceScenario.INGREDIENT_B_UNMAPPED: (
                SyntheticScenario.INGREDIENT_B_UNMAPPED
            ),
            ConformanceScenario.BOTH_INGREDIENTS_UNMAPPED: SyntheticScenario.BOTH_UNMAPPED,
            ConformanceScenario.AMBIGUOUS_MAPPING: SyntheticScenario.AMBIGUOUS,
            ConformanceScenario.INSUFFICIENT_COVERAGE: (
                SyntheticScenario.INSUFFICIENT_COVERAGE
            ),
            ConformanceScenario.PROVIDER_UNAVAILABLE: (
                SyntheticScenario.PROVIDER_MAINTENANCE
            ),
            ConformanceScenario.PROVIDER_ERROR: SyntheticScenario.AUTHENTICATION_FAILURE,
            ConformanceScenario.MALFORMED_RESPONSE: SyntheticScenario.MALFORMED_RESULT,
            ConformanceScenario.VERSION_MISMATCH: SyntheticScenario.FOUND,
            ConformanceScenario.MAPPING_PROVENANCE_MISMATCH: (
                SyntheticScenario.MAPPING_PROVENANCE_MISMATCH
            ),
            ConformanceScenario.TIMEOUT: SyntheticScenario.TIMEOUT,
            ConformanceScenario.RATE_LIMIT: SyntheticScenario.RATE_LIMIT,
            ConformanceScenario.AUTHORIZATION_FAILURE: (
                SyntheticScenario.AUTHORIZATION_FAILURE
            ),
            ConformanceScenario.UNEXPECTED_EXCEPTION: (
                SyntheticScenario.UNEXPECTED_EXCEPTION
            ),
            ConformanceScenario.BATCH_PARTIAL_FAILURE: (
                SyntheticScenario.BATCH_PARTIAL_FAILURE
            ),
            ConformanceScenario.BATCH_MISSING_RESULT: (
                SyntheticScenario.BATCH_MISSING_RESULT
            ),
            ConformanceScenario.BATCH_DUPLICATE_PAIR: (
                SyntheticScenario.BATCH_DUPLICATE_PAIR
            ),
        }
        return SyntheticDDIProvider(scenario_map[scenario])

    def pair_request_for(
        self, scenario: ConformanceScenario
    ) -> ProviderPairLookupRequest:
        required_release = (
            "synthetic_provider_release_mismatch"
            if scenario is ConformanceScenario.VERSION_MISMATCH
            else SYNTHETIC_METADATA.release_identifier
        )
        request = synthetic_request(required_release=required_release)
        return request.model_copy(
            update={"request_identifier": f"synthetic_request_{scenario.value}"}
        )

    def batch_request_for(
        self, scenario: ConformanceScenario
    ) -> ProviderBatchLookupRequest:
        first = synthetic_request().model_copy(
            update={"request_identifier": f"synthetic_batch_{scenario.value}_alpha"}
        )
        if scenario is ConformanceScenario.BATCH_DUPLICATE_PAIR:
            second = first.model_copy(
                update={"request_identifier": f"synthetic_batch_{scenario.value}_beta"}
            )
        else:
            second = ProviderPairLookupRequest(
                request_identifier=f"synthetic_batch_{scenario.value}_beta",
                ingredient_a=synthetic_ingredient("gamma"),
                ingredient_b=synthetic_ingredient("delta"),
                required_provider_release_identifier=(
                    SYNTHETIC_METADATA.release_identifier
                ),
            )
        return ProviderBatchLookupRequest(requests=(first, second))
