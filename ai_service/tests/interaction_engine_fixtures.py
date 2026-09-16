"""Synthetic-only builders for deterministic DDI orchestration tests."""

from __future__ import annotations

from datetime import datetime, timezone

from medsense_ai.ddi_providers import (
    CanonicalIngredientReference,
    ProviderIngredientMapping,
    ProviderMappingConfidence,
    ProviderMappingMethod,
    ProviderMappingStatus,
)
from medsense_ai.interaction_engine import (
    DDIOrchestrationRequest,
    EngineExecutionMetadata,
)
from medsense_ai.product_mapping import (
    CrosswalkMappingMethod,
    CrosswalkMappingStatus,
    PakistanMedicineProduct,
    ReviewStatus,
    RxNormIngredientCrosswalk,
)
from product_mapping_fixtures import synthetic_provenance
from synthetic_ddi_provider import (
    SYNTHETIC_METADATA,
    SYNTHETIC_TIME,
    SyntheticDDIProvider,
    SyntheticScenario,
)

SYNTHETIC_RXNORM_RELEASE = "synthetic_rxnorm_release_alpha"


def synthetic_rxnorm_crosswalk(
    ingredient_identifier: str,
    *,
    release_identifier: str = SYNTHETIC_RXNORM_RELEASE,
) -> RxNormIngredientCrosswalk:
    suffix = ingredient_identifier.removeprefix("ingredient_")
    return RxNormIngredientCrosswalk(
        mapping_identifier=f"synthetic_rxnorm_mapping_{suffix}_{release_identifier}",
        canonical_ingredient_identifier=ingredient_identifier,
        rxnorm_rxcui=f"synthetic_rxcui_{suffix}",
        rxnorm_release_identifier=release_identifier,
        rxnorm_concept_type="synthetic_concept_type",
        mapping_method=CrosswalkMappingMethod.AUTHORITATIVE_CROSSWALK,
        mapping_status=CrosswalkMappingStatus.MAPPED,
        mapping_provenance=synthetic_provenance(
            f"synthetic_rxnorm_record_{suffix}_{release_identifier}",
            release_identifier=release_identifier,
        ),
        review_status=ReviewStatus.COMPLETED,
    )


def orchestration_request(
    product_a: PakistanMedicineProduct,
    product_b: PakistanMedicineProduct,
    *,
    ingredient_identifiers: tuple[str, ...],
    provider_release_identifier: str = SYNTHETIC_METADATA.release_identifier,
    rxnorm_release_identifier: str = SYNTHETIC_RXNORM_RELEASE,
    crosswalks: tuple[RxNormIngredientCrosswalk, ...] | None = None,
    use_batch_when_available: bool = True,
) -> DDIOrchestrationRequest:
    selected_crosswalks = (
        tuple(
            synthetic_rxnorm_crosswalk(
                identifier,
                release_identifier=rxnorm_release_identifier,
            )
            for identifier in ingredient_identifiers
        )
        if crosswalks is None
        else crosswalks
    )
    return DDIOrchestrationRequest(
        correlation_identifier="synthetic_orchestration_alpha",
        product_a=product_a,
        product_b=product_b,
        provider_namespace=SYNTHETIC_METADATA.provider_namespace,
        required_provider_release_identifier=provider_release_identifier,
        required_rxnorm_release_identifier=rxnorm_release_identifier,
        rxnorm_crosswalks=selected_crosswalks,
        execution_metadata=EngineExecutionMetadata(
            requested_at=datetime(2000, 1, 1, tzinfo=timezone.utc),
            execution_label="synthetic_engine_test",
            use_batch_when_available=use_batch_when_available,
        ),
    )


class SyntheticMappingGateProvider(SyntheticDDIProvider):
    """Existing synthetic adapter with one controlled mapping-gate state."""

    def __init__(
        self,
        scenario: SyntheticScenario,
        *,
        target_ingredient_identifier: str,
        mapping_status: ProviderMappingStatus,
    ) -> None:
        self.target_ingredient_identifier = target_ingredient_identifier
        self.mapping_status = mapping_status
        super().__init__(scenario)

    def _map_ingredient(
        self, ingredient: CanonicalIngredientReference
    ) -> ProviderIngredientMapping:
        if (
            ingredient.medsense_ingredient_identifier
            != self.target_ingredient_identifier
        ):
            return super()._map_ingredient(ingredient)
        if self.mapping_status in {
            ProviderMappingStatus.UNMAPPED,
            ProviderMappingStatus.AMBIGUOUS,
        }:
            return self._mapping(ingredient, self.mapping_status)
        mapped = self._mapping(ingredient, ProviderMappingStatus.MAPPED)
        payload = mapped.model_dump()
        suffix = ingredient.medsense_ingredient_identifier.removeprefix("ingredient_")
        if self.mapping_status is ProviderMappingStatus.REVIEW_REQUIRED:
            payload.update(
                provider_concept_identifier=None,
                candidate_provider_concept_identifiers=(
                    f"provider_concept_{suffix}_candidate_alpha",
                ),
                mapping_method=ProviderMappingMethod.PROVIDER_CROSSWALK,
                mapping_confidence=ProviderMappingConfidence.REVIEW_REQUIRED,
                status=ProviderMappingStatus.REVIEW_REQUIRED,
                human_review_required=True,
            )
        elif self.mapping_status in {
            ProviderMappingStatus.DEPRECATED,
            ProviderMappingStatus.SUPERSEDED,
        }:
            payload.update(
                status=self.mapping_status,
                deprecated_at=SYNTHETIC_TIME,
            )
            if self.mapping_status is ProviderMappingStatus.SUPERSEDED:
                payload["superseded_by_mapping_identifier"] = (
                    f"synthetic_mapping_{suffix}_replacement"
                )
        else:
            raise ValueError("unsupported synthetic mapping-gate status")
        return ProviderIngredientMapping.model_validate(payload)


class CountingSyntheticDDIProvider(SyntheticDDIProvider):
    """Synthetic adapter counters proving product gates avoid provider calls."""

    def __init__(self, scenario: SyntheticScenario) -> None:
        self.health_calls = 0
        self.mapping_calls = 0
        self.pair_lookup_calls = 0
        self.batch_lookup_calls = 0
        super().__init__(scenario)

    def health(self):
        self.health_calls += 1
        return super().health()

    def map_ingredient(self, ingredient):
        self.mapping_calls += 1
        return super().map_ingredient(ingredient)

    def lookup_pair(self, request):
        self.pair_lookup_calls += 1
        return super().lookup_pair(request)

    def lookup_pairs(self, request):
        self.batch_lookup_calls += 1
        return super().lookup_pairs(request)
