"""Synthetic end-to-end tests for non-clinical DDI orchestration."""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from interaction_engine_fixtures import (
    CountingSyntheticDDIProvider,
    SyntheticMappingGateProvider,
    orchestration_request,
    synthetic_rxnorm_crosswalk,
)
from medsense_ai.ddi_providers import (
    ProviderAdapterError,
    ProviderBatchLookupRequest,
    ProviderCoverageStatus,
    ProviderFailureCategory,
    ProviderIngredientMapping,
    ProviderLookupStatus,
    ProviderMappingStatus,
    ProviderPairLookupResult,
    ProviderSourceAssertion,
)
from medsense_ai.interaction_engine import (
    DDIOrchestratedPairResult,
    DDIOrchestratedPairStatus,
    DDIOrchestrationCounts,
    DDIOrchestrationRequest,
    DDIOrchestrationResult,
    DDIOrchestrationStatus,
    EngineExecutionMetadata,
    PairSourceProvenance,
    ProviderMappingIssue,
    ProviderMappingIssueCode,
    orchestrate_ddi,
)
from medsense_ai.product_mapping import (
    ComponentMappingStatus,
    ComponentRole,
    ProductCompositionStatus,
    SourceProvenance,
)
from product_mapping_fixtures import (
    SYNTHETIC_INGREDIENT_IDENTIFIERS,
    SYNTHETIC_PRODUCT_IDENTIFIERS,
    synthetic_component,
    synthetic_ingredient,
    synthetic_product,
)
from synthetic_ddi_provider import SyntheticDDIProvider, SyntheticScenario


class _ControlledBatchProvider(SyntheticDDIProvider):
    """Synthetic adapter exposing adversarial batch response shapes."""

    def __init__(self, shape: str) -> None:
        self.shape = shape
        super().__init__(SyntheticScenario.FOUND)

    def _lookup_pairs(
        self, request: ProviderBatchLookupRequest
    ) -> tuple[ProviderPairLookupResult, ...]:
        first = SyntheticDDIProvider(SyntheticScenario.FOUND).lookup_pair(
            request.requests[0]
        )
        second = SyntheticDDIProvider(SyntheticScenario.NO_ASSERTION).lookup_pair(
            request.requests[1]
        )
        if self.shape == "ordered":
            return (first, second)
        if self.shape == "reordered":
            return (second, first)
        if self.shape == "duplicate_response":
            return (first, first)
        if self.shape == "extra_response":
            extra_request = request.requests[0].model_copy(
                update={"request_identifier": "synthetic_unexpected_batch_response"}
            )
            extra = SyntheticDDIProvider(SyntheticScenario.NO_ASSERTION).lookup_pair(
                extra_request
            )
            return (first, second, extra)
        if self.shape == "batch_failure":
            raise ProviderAdapterError(
                ProviderFailureCategory.TIMEOUT,
                "synthetic_batch_timeout",
                retryable=True,
            )
        raise AssertionError("unsupported synthetic batch shape")


class _UnexpectedMappingFailureProvider(SyntheticDDIProvider):
    def _map_ingredient(self, ingredient):
        raise RuntimeError("synthetic_sensitive_mapping_payload")


class _MismatchedProviderMappingProvider(SyntheticDDIProvider):
    def __init__(self, field_name: str, field_value: str) -> None:
        self.field_name = field_name
        self.field_value = field_value
        self.lookup_calls = 0
        super().__init__(SyntheticScenario.FOUND)

    def map_ingredient(self, ingredient):
        mapping = self._mapping(ingredient, ProviderMappingStatus.MAPPED)
        payload = mapping.model_dump()
        payload[self.field_name] = self.field_value
        return ProviderIngredientMapping.model_validate(payload)

    def lookup_pair(self, request):
        self.lookup_calls += 1
        return super().lookup_pair(request)

    def lookup_pairs(self, request):
        self.lookup_calls += 1
        return super().lookup_pairs(request)


class _CollapsedProviderConceptProvider(SyntheticDDIProvider):
    def __init__(self) -> None:
        self.lookup_calls = 0
        super().__init__(SyntheticScenario.FOUND)

    def _map_ingredient(self, ingredient):
        mapping = self._mapping(ingredient, ProviderMappingStatus.MAPPED)
        payload = mapping.model_dump()
        payload["provider_concept_identifier"] = "provider_concept_shared"
        return ProviderIngredientMapping.model_validate(payload)

    def lookup_pair(self, request):
        self.lookup_calls += 1
        return super().lookup_pair(request)

    def lookup_pairs(self, request):
        self.lookup_calls += 1
        return super().lookup_pairs(request)


def _single_products():
    return (
        synthetic_product(
            "pak_product_alpha",
            (
                synthetic_component(
                    "component_alpha", ingredient_identifier="ingredient_alpha"
                ),
            ),
        ),
        synthetic_product(
            "pak_product_beta",
            (
                synthetic_component(
                    "component_beta", ingredient_identifier="ingredient_beta"
                ),
            ),
        ),
    )


def _combination_and_single():
    return (
        synthetic_product(
            "pak_product_alpha",
            (
                synthetic_component(
                    "component_alpha", ingredient_identifier="ingredient_alpha"
                ),
                synthetic_component(
                    "component_beta", ingredient_identifier="ingredient_beta"
                ),
            ),
        ),
        synthetic_product(
            "pak_product_beta",
            (
                synthetic_component(
                    "component_gamma", ingredient_identifier="ingredient_gamma"
                ),
            ),
        ),
    )


def _two_combinations():
    return (
        synthetic_product(
            "pak_product_alpha",
            (
                synthetic_component(
                    "component_alpha", ingredient_identifier="ingredient_alpha"
                ),
                synthetic_component(
                    "component_beta_a", ingredient_identifier="ingredient_beta"
                ),
            ),
        ),
        synthetic_product(
            "pak_product_beta",
            (
                synthetic_component(
                    "component_beta_b", ingredient_identifier="ingredient_beta"
                ),
                synthetic_component(
                    "component_gamma", ingredient_identifier="ingredient_gamma"
                ),
            ),
        ),
    )


def _request_for(
    products,
    ingredient_identifiers,
    **kwargs,
):
    return orchestration_request(
        products[0],
        products[1],
        ingredient_identifiers=ingredient_identifiers,
        **kwargs,
    )


def test_single_ingredient_products_use_single_pair_lookup_when_requested() -> None:
    products = _single_products()
    request = _request_for(
        products,
        ("ingredient_alpha", "ingredient_beta"),
        use_batch_when_available=False,
    )
    provider = CountingSyntheticDDIProvider(SyntheticScenario.FOUND)

    result = orchestrate_ddi(request, provider)

    assert result.status is DDIOrchestrationStatus.LOOKUP_COMPLETED
    assert result.counts.candidate_pairs == 1
    assert result.counts.pairs_looked_up == 1
    assert provider.pair_lookup_calls == 1
    assert provider.batch_lookup_calls == 0


def test_combination_vs_single_expands_two_pairs() -> None:
    products = _combination_and_single()
    result = orchestrate_ddi(
        _request_for(
            products,
            ("ingredient_alpha", "ingredient_beta", "ingredient_gamma"),
        ),
        SyntheticDDIProvider(SyntheticScenario.NO_ASSERTION),
    )

    assert tuple(
        item.candidate_pair.pair_identifier for item in result.pair_results
    ) == (
        "candidate::ingredient_alpha::ingredient_gamma",
        "candidate::ingredient_beta::ingredient_gamma",
    )
    assert result.counts.candidate_pairs == 2
    assert result.counts.no_assertion_results == 2


def test_combination_vs_combination_preserves_overlap_and_three_pairs() -> None:
    products = _two_combinations()
    result = orchestrate_ddi(
        _request_for(
            products,
            ("ingredient_alpha", "ingredient_beta", "ingredient_gamma"),
        ),
        SyntheticDDIProvider(SyntheticScenario.NO_ASSERTION),
    )

    assert result.counts.candidate_pairs == 3
    assert result.counts.same_ingredient_overlaps == 1
    assert result.same_ingredient_overlaps[0].ingredient.ingredient_identifier == (
        "ingredient_beta"
    )


def test_candidate_and_result_order_is_deterministic() -> None:
    products = _combination_and_single()
    forward = orchestrate_ddi(
        _request_for(
            products,
            ("ingredient_alpha", "ingredient_beta", "ingredient_gamma"),
        ),
        SyntheticDDIProvider(SyntheticScenario.NO_ASSERTION),
    )
    reverse_request = orchestration_request(
        products[1],
        products[0],
        ingredient_identifiers=(
            "ingredient_gamma",
            "ingredient_beta",
            "ingredient_alpha",
        ),
    )
    reverse = orchestrate_ddi(
        reverse_request,
        SyntheticDDIProvider(SyntheticScenario.NO_ASSERTION),
    )

    assert tuple(
        item.candidate_pair.pair_identifier for item in forward.pair_results
    ) == tuple(item.candidate_pair.pair_identifier for item in reverse.pair_results)
    assert forward.counts == reverse.counts


def test_duplicate_ingredient_components_are_reconciled_before_lookup() -> None:
    product_a = synthetic_product(
        "pak_product_alpha",
        (
            synthetic_component(
                "component_alpha_1", ingredient_identifier="ingredient_alpha"
            ),
            synthetic_component(
                "component_alpha_2", ingredient_identifier="ingredient_alpha"
            ),
        ),
    )
    product_b = _single_products()[1]
    result = orchestrate_ddi(
        orchestration_request(
            product_a,
            product_b,
            ingredient_identifiers=("ingredient_alpha", "ingredient_beta"),
        ),
        SyntheticDDIProvider(SyntheticScenario.NO_ASSERTION),
    )

    assert result.counts.candidate_pairs == 1
    contribution = result.pair_results[0].candidate_pair.contributions[0]
    assert contribution.product_a_component_identifiers == (
        "component_alpha_1",
        "component_alpha_2",
    )


def test_same_ingredient_overlap_is_metadata_without_provider_lookup() -> None:
    products = (
        synthetic_product(
            "pak_product_alpha",
            (
                synthetic_component(
                    "component_alpha_a", ingredient_identifier="ingredient_alpha"
                ),
            ),
        ),
        synthetic_product(
            "pak_product_beta",
            (
                synthetic_component(
                    "component_alpha_b", ingredient_identifier="ingredient_alpha"
                ),
            ),
        ),
    )
    provider = CountingSyntheticDDIProvider(SyntheticScenario.FOUND)
    result = orchestrate_ddi(
        _request_for(products, ("ingredient_alpha",)),
        provider,
    )

    assert result.status is DDIOrchestrationStatus.NO_DISTINCT_CANDIDATE_PAIRS
    assert result.pair_results == ()
    assert result.counts.same_ingredient_overlaps == 1
    assert provider.health_calls == 0
    assert provider.mapping_calls == 0


def test_shared_canonical_identity_with_conflicting_metadata_is_rejected() -> None:
    product_a = synthetic_product(
        "pak_product_alpha",
        (
            synthetic_component(
                "component_alpha_a", ingredient_identifier="ingredient_alpha"
            ),
        ),
    )
    component_b = synthetic_component(
        "component_alpha_b", ingredient_identifier="ingredient_alpha"
    )
    component_payload = component_b.model_dump()
    component_payload["normalized_candidate"] = synthetic_ingredient(
        "ingredient_alpha"
    ).model_copy(update={"preferred_display_name": "ingredient_alpha_variant"})
    conflicting_component = type(component_b).model_validate(component_payload)
    product_b = synthetic_product("pak_product_beta", (conflicting_component,))

    with pytest.raises(ValidationError, match="identical metadata"):
        orchestration_request(
            product_a,
            product_b,
            ingredient_identifiers=("ingredient_alpha",),
        )


def test_distinct_ingredients_collapsing_to_one_provider_concept_never_lookup() -> None:
    products = _single_products()
    provider = _CollapsedProviderConceptProvider()

    result = orchestrate_ddi(
        _request_for(products, ("ingredient_alpha", "ingredient_beta")),
        provider,
    )

    pair = result.pair_results[0]
    assert result.status is DDIOrchestrationStatus.PROVIDER_ERROR
    assert pair.status is DDIOrchestratedPairStatus.PROVIDER_ERROR
    assert pair.provider_request_identifier is None
    assert pair.mapping_a is None and pair.mapping_b is None
    assert pair.failure is not None
    assert pair.failure.category is ProviderFailureCategory.MAPPING_FAILURE
    assert result.counts.no_assertion_results == 0
    assert provider.lookup_calls == 0


def test_distinct_ingredients_collapsing_to_one_rxcui_never_lookup() -> None:
    products = _single_products()
    alpha_crosswalk = synthetic_rxnorm_crosswalk("ingredient_alpha")
    beta_payload = synthetic_rxnorm_crosswalk("ingredient_beta").model_dump()
    beta_payload["rxnorm_rxcui"] = alpha_crosswalk.rxnorm_rxcui
    beta_crosswalk = type(alpha_crosswalk).model_validate(beta_payload)
    provider = CountingSyntheticDDIProvider(SyntheticScenario.FOUND)

    result = orchestrate_ddi(
        _request_for(
            products,
            (),
            crosswalks=(alpha_crosswalk, beta_crosswalk),
        ),
        provider,
    )

    pair = result.pair_results[0]
    assert result.status is DDIOrchestrationStatus.PROVIDER_ERROR
    assert pair.status is DDIOrchestratedPairStatus.PROVIDER_ERROR
    assert pair.provider_request_identifier is None
    assert pair.failure is not None
    assert pair.failure.category is ProviderFailureCategory.MAPPING_FAILURE
    assert result.counts.no_assertion_results == 0
    assert provider.pair_lookup_calls == provider.batch_lookup_calls == 0


def test_ineligible_product_a_blocks_without_calling_provider() -> None:
    product_a, product_b = _single_products()
    product_a = synthetic_product(
        "pak_product_alpha",
        product_a.components,
        composition_status=ProductCompositionStatus.INCOMPLETE,
    )
    provider = CountingSyntheticDDIProvider(SyntheticScenario.FOUND)

    result = orchestrate_ddi(
        orchestration_request(
            product_a,
            product_b,
            ingredient_identifiers=("ingredient_alpha", "ingredient_beta"),
        ),
        provider,
    )

    assert result.status is DDIOrchestrationStatus.BLOCKED_BY_PRODUCT_MAPPING
    assert result.counts.candidate_pairs == 0
    assert provider.health_calls == 0
    assert provider.mapping_calls == 0


def test_ineligible_product_b_blocks_without_calling_provider() -> None:
    product_a, _ = _single_products()
    product_b = synthetic_product(
        "pak_product_beta",
        (
            synthetic_component(
                "component_beta",
                mapping_status=ComponentMappingStatus.UNMAPPED,
            ),
        ),
    )
    provider = CountingSyntheticDDIProvider(SyntheticScenario.FOUND)

    result = orchestrate_ddi(
        orchestration_request(
            product_a,
            product_b,
            ingredient_identifiers=("ingredient_alpha",),
        ),
        provider,
    )

    assert result.status is DDIOrchestrationStatus.BLOCKED_BY_PRODUCT_MAPPING
    assert provider.health_calls == 0


def test_unresolved_component_remains_explicit_product_blocker() -> None:
    product_a = synthetic_product(
        "pak_product_alpha",
        (
            synthetic_component(
                "component_alpha", mapping_status=ComponentMappingStatus.UNMAPPED
            ),
        ),
    )
    product_b = _single_products()[1]
    result = orchestrate_ddi(
        orchestration_request(
            product_a,
            product_b,
            ingredient_identifiers=("ingredient_beta",),
        ),
        SyntheticDDIProvider(SyntheticScenario.FOUND),
    )

    assert result.status is DDIOrchestrationStatus.BLOCKED_BY_PRODUCT_MAPPING
    assert result.pair_expansion.product_a_eligibility.status.value == (
        "unresolved_component"
    )


def test_unknown_component_role_remains_explicit_product_blocker() -> None:
    product_a = synthetic_product(
        "pak_product_alpha",
        (
            synthetic_component(
                "component_alpha",
                role=ComponentRole.UNKNOWN,
                mapping_status=ComponentMappingStatus.UNMAPPED,
            ),
        ),
    )
    product_b = _single_products()[1]
    result = orchestrate_ddi(
        orchestration_request(
            product_a,
            product_b,
            ingredient_identifiers=("ingredient_beta",),
        ),
        SyntheticDDIProvider(SyntheticScenario.FOUND),
    )

    assert result.status is DDIOrchestrationStatus.BLOCKED_BY_PRODUCT_MAPPING
    assert result.pair_expansion.product_a_eligibility.status.value == (
        "unknown_component_role"
    )


def test_ambiguous_provider_mapping_blocks_affected_pair() -> None:
    products = _single_products()
    provider = SyntheticMappingGateProvider(
        SyntheticScenario.FOUND,
        target_ingredient_identifier="ingredient_alpha",
        mapping_status=ProviderMappingStatus.AMBIGUOUS,
    )
    result = orchestrate_ddi(
        _request_for(products, ("ingredient_alpha", "ingredient_beta")),
        provider,
    )

    assert result.status is DDIOrchestrationStatus.BLOCKED_BY_PROVIDER_MAPPING
    assert result.pair_results[0].status is (
        DDIOrchestratedPairStatus.PROVIDER_MAPPING_UNRESOLVED
    )
    assert result.pair_results[0].mapping_issues[0].code is (
        ProviderMappingIssueCode.PROVIDER_MAPPING_AMBIGUOUS
    )
    assert result.counts.review_required_pairs == 1


def test_unmapped_provider_concept_blocks_affected_pair() -> None:
    products = _single_products()
    provider = SyntheticMappingGateProvider(
        SyntheticScenario.FOUND,
        target_ingredient_identifier="ingredient_beta",
        mapping_status=ProviderMappingStatus.UNMAPPED,
    )
    result = orchestrate_ddi(
        _request_for(products, ("ingredient_alpha", "ingredient_beta")),
        provider,
    )

    assert result.status is DDIOrchestrationStatus.BLOCKED_BY_PROVIDER_MAPPING
    assert result.counts.unmapped_pairs == 1
    assert result.counts.pairs_looked_up == 0


def test_partial_provider_mapping_blocks_only_affected_pair() -> None:
    products = _combination_and_single()
    provider = SyntheticMappingGateProvider(
        SyntheticScenario.NO_ASSERTION,
        target_ingredient_identifier="ingredient_alpha",
        mapping_status=ProviderMappingStatus.UNMAPPED,
    )
    result = orchestrate_ddi(
        _request_for(
            products,
            ("ingredient_alpha", "ingredient_beta", "ingredient_gamma"),
        ),
        provider,
    )

    assert result.status is (
        DDIOrchestrationStatus.COMPLETED_WITH_PROVIDER_UNCERTAINTY
    )
    assert tuple(item.status for item in result.pair_results) == (
        DDIOrchestratedPairStatus.PROVIDER_MAPPING_UNRESOLVED,
        DDIOrchestratedPairStatus.NO_ASSERTION_RETURNED,
    )
    assert result.counts.pairs_looked_up == 1
    assert result.counts.unmapped_pairs == 1


def test_missing_rxnorm_crosswalk_blocks_provider_mapping() -> None:
    products = _single_products()
    result = orchestrate_ddi(
        _request_for(
            products,
            ("ingredient_alpha", "ingredient_beta"),
            crosswalks=(synthetic_rxnorm_crosswalk("ingredient_alpha"),),
        ),
        SyntheticDDIProvider(SyntheticScenario.FOUND),
    )

    assert result.status is DDIOrchestrationStatus.BLOCKED_BY_PROVIDER_MAPPING
    assert result.pair_results[0].mapping_issues[0].ingredient_identifier == (
        "ingredient_beta"
    )
    assert result.pair_results[0].mapping_issues[0].code is (
        ProviderMappingIssueCode.RXNORM_MAPPING_MISSING
    )


def test_rxnorm_release_mismatch_blocks_provider_mapping() -> None:
    products = _single_products()
    crosswalks = (
        synthetic_rxnorm_crosswalk(
            "ingredient_alpha", release_identifier="synthetic_rxnorm_release_old"
        ),
        synthetic_rxnorm_crosswalk(
            "ingredient_beta", release_identifier="synthetic_rxnorm_release_old"
        ),
    )
    result = orchestrate_ddi(
        _request_for(
            products,
            ("ingredient_alpha", "ingredient_beta"),
            crosswalks=crosswalks,
        ),
        SyntheticDDIProvider(SyntheticScenario.FOUND),
    )

    assert result.status is DDIOrchestrationStatus.BLOCKED_BY_PROVIDER_MAPPING
    assert {
        issue.code for issue in result.pair_results[0].mapping_issues
    } == {ProviderMappingIssueCode.RXNORM_RELEASE_MISMATCH}


@pytest.mark.parametrize(
    "mapping_status, expected_code",
    [
        (
            ProviderMappingStatus.REVIEW_REQUIRED,
            ProviderMappingIssueCode.PROVIDER_MAPPING_REVIEW_REQUIRED,
        ),
        (
            ProviderMappingStatus.DEPRECATED,
            ProviderMappingIssueCode.PROVIDER_MAPPING_DEPRECATED,
        ),
        (
            ProviderMappingStatus.SUPERSEDED,
            ProviderMappingIssueCode.PROVIDER_MAPPING_SUPERSEDED,
        ),
    ],
)
def test_unacceptable_provider_mapping_lifecycle_blocks_lookup(
    mapping_status: ProviderMappingStatus,
    expected_code: ProviderMappingIssueCode,
) -> None:
    products = _single_products()
    provider = SyntheticMappingGateProvider(
        SyntheticScenario.FOUND,
        target_ingredient_identifier="ingredient_alpha",
        mapping_status=mapping_status,
    )

    result = orchestrate_ddi(
        _request_for(products, ("ingredient_alpha", "ingredient_beta")),
        provider,
    )

    assert result.status is DDIOrchestrationStatus.BLOCKED_BY_PROVIDER_MAPPING
    assert result.pair_results[0].mapping_issues[0].code is expected_code
    assert result.counts.review_required_pairs == 1


def test_provider_release_mismatch_fails_before_provider_calls() -> None:
    products = _single_products()
    provider = CountingSyntheticDDIProvider(SyntheticScenario.FOUND)
    result = orchestrate_ddi(
        _request_for(
            products,
            ("ingredient_alpha", "ingredient_beta"),
            provider_release_identifier="synthetic_provider_release_mismatch",
        ),
        provider,
    )

    assert result.status is DDIOrchestrationStatus.PROVIDER_ERROR
    assert result.counts.pairs_looked_up == 0
    assert result.pair_results[0].failure is not None
    assert result.pair_results[0].failure.category is (
        ProviderFailureCategory.VERSION_MISMATCH
    )
    assert provider.health_calls == 0
    assert provider.mapping_calls == 0


@pytest.mark.parametrize(
    "field_name, field_value, expected_issue, expected_failure",
    [
        (
            "provider_namespace",
            "synthetic_provider_namespace_mismatch",
            ProviderMappingIssueCode.PROVIDER_IDENTITY_MISMATCH,
            ProviderFailureCategory.MAPPING_FAILURE,
        ),
        (
            "provider_release_identifier",
            "synthetic_provider_release_mismatch",
            ProviderMappingIssueCode.PROVIDER_RELEASE_MISMATCH,
            ProviderFailureCategory.VERSION_MISMATCH,
        ),
    ],
)
def test_rejected_provider_mapping_provenance_returns_typed_failure(
    field_name: str,
    field_value: str,
    expected_issue: ProviderMappingIssueCode,
    expected_failure: ProviderFailureCategory,
) -> None:
    products = _single_products()
    provider = _MismatchedProviderMappingProvider(field_name, field_value)

    result = orchestrate_ddi(
        _request_for(products, ("ingredient_alpha", "ingredient_beta")),
        provider,
    )

    pair = result.pair_results[0]
    assert result.status is DDIOrchestrationStatus.PROVIDER_ERROR
    assert pair.status is DDIOrchestratedPairStatus.PROVIDER_ERROR
    assert {issue.code for issue in pair.mapping_issues} == {expected_issue}
    assert pair.mapping_a is None and pair.mapping_b is None
    assert pair.failure is not None and pair.failure.category is expected_failure
    assert result.counts.no_assertion_results == 0
    assert provider.lookup_calls == 0


def test_assertion_returned_is_preserved_without_interpretation() -> None:
    products = _single_products()
    result = orchestrate_ddi(
        _request_for(products, ("ingredient_alpha", "ingredient_beta")),
        SyntheticDDIProvider(SyntheticScenario.FOUND),
    )

    pair = result.pair_results[0]
    assert pair.status is DDIOrchestratedPairStatus.ASSERTION_RETURNED
    assert pair.provider_lookup_status is (
        ProviderLookupStatus.INTERACTION_ASSERTION_FOUND
    )
    assert len(pair.assertions) == 1
    assert pair.provider_concept_a_identifier == "provider_concept_alpha"
    assert pair.provider_concept_b_identifier == "provider_concept_beta"
    assert result.counts.assertions_returned == 1


def test_no_assertion_returned_is_preserved_as_unknown_provider_state() -> None:
    products = _single_products()
    result = orchestrate_ddi(
        _request_for(products, ("ingredient_alpha", "ingredient_beta")),
        SyntheticDDIProvider(SyntheticScenario.NO_ASSERTION),
    )

    pair = result.pair_results[0]
    assert pair.status is DDIOrchestratedPairStatus.NO_ASSERTION_RETURNED
    assert pair.assertions == ()
    assert result.counts.no_assertion_results == 1


def test_no_assertion_output_never_contains_a_safety_conclusion() -> None:
    products = _single_products()
    payload = orchestrate_ddi(
        _request_for(products, ("ingredient_alpha", "ingredient_beta")),
        SyntheticDDIProvider(SyntheticScenario.NO_ASSERTION),
    ).model_dump()

    keys = _collect_keys(payload)
    assert keys.isdisjoint(
        {
            "safe",
            "safety",
            "unsafe",
            "major",
            "minor",
            "contraindicated",
            "recommended_alternative",
        }
    )


def test_provider_unavailable_health_fails_closed() -> None:
    products = _single_products()
    result = orchestrate_ddi(
        _request_for(products, ("ingredient_alpha", "ingredient_beta")),
        SyntheticDDIProvider(SyntheticScenario.PROVIDER_MAINTENANCE),
    )

    assert result.status is DDIOrchestrationStatus.PROVIDER_UNAVAILABLE
    assert result.counts.pairs_looked_up == 0
    assert result.counts.provider_failure_pairs == 1


def test_insufficient_provider_coverage_is_completed_with_uncertainty() -> None:
    products = _single_products()
    result = orchestrate_ddi(
        _request_for(products, ("ingredient_alpha", "ingredient_beta")),
        SyntheticDDIProvider(SyntheticScenario.INSUFFICIENT_COVERAGE),
    )

    assert result.status is (
        DDIOrchestrationStatus.COMPLETED_WITH_PROVIDER_UNCERTAINTY
    )
    assert result.pair_results[0].status is (
        DDIOrchestratedPairStatus.INSUFFICIENT_PROVIDER_COVERAGE
    )
    assert result.pair_results[0].coverage is not None


@pytest.mark.parametrize(
    "scenario, category",
    [
        (SyntheticScenario.TIMEOUT, ProviderFailureCategory.TIMEOUT),
        (SyntheticScenario.RATE_LIMIT, ProviderFailureCategory.RATE_LIMIT),
    ],
)
def test_transient_provider_failures_remain_unavailable(
    scenario: SyntheticScenario,
    category: ProviderFailureCategory,
) -> None:
    products = _single_products()
    result = orchestrate_ddi(
        _request_for(
            products,
            ("ingredient_alpha", "ingredient_beta"),
            use_batch_when_available=False,
        ),
        SyntheticDDIProvider(scenario),
    )

    pair = result.pair_results[0]
    assert result.status is DDIOrchestrationStatus.PROVIDER_UNAVAILABLE
    assert pair.failure is not None
    assert pair.failure.category is category
    assert pair.assertions == ()


def test_authorization_failure_remains_provider_error() -> None:
    products = _single_products()
    result = orchestrate_ddi(
        _request_for(
            products,
            ("ingredient_alpha", "ingredient_beta"),
            use_batch_when_available=False,
        ),
        SyntheticDDIProvider(SyntheticScenario.AUTHORIZATION_FAILURE),
    )

    assert result.status is DDIOrchestrationStatus.PROVIDER_ERROR
    assert result.pair_results[0].failure is not None
    assert result.pair_results[0].failure.category is (
        ProviderFailureCategory.AUTHORIZATION_OR_LICENSE_FAILURE
    )


def test_malformed_provider_response_remains_provider_error() -> None:
    products = _single_products()
    result = orchestrate_ddi(
        _request_for(
            products,
            ("ingredient_alpha", "ingredient_beta"),
            use_batch_when_available=False,
        ),
        SyntheticDDIProvider(SyntheticScenario.MALFORMED_RESULT),
    )

    assert result.status is DDIOrchestrationStatus.PROVIDER_ERROR
    assert result.pair_results[0].failure is not None
    assert result.pair_results[0].failure.category is (
        ProviderFailureCategory.MALFORMED_PROVIDER_RESPONSE
    )


def test_partial_batch_preserves_independent_pair_outcomes() -> None:
    products = _combination_and_single()
    result = orchestrate_ddi(
        _request_for(
            products,
            ("ingredient_alpha", "ingredient_beta", "ingredient_gamma"),
        ),
        SyntheticDDIProvider(SyntheticScenario.BATCH_PARTIAL_FAILURE),
    )

    assert result.status is (
        DDIOrchestrationStatus.COMPLETED_WITH_PROVIDER_UNCERTAINTY
    )
    assert tuple(item.status for item in result.pair_results) == (
        DDIOrchestratedPairStatus.NO_ASSERTION_RETURNED,
        DDIOrchestratedPairStatus.PROVIDER_UNAVAILABLE,
    )
    assert result.counts.no_assertion_results == 1
    assert result.counts.provider_failure_pairs == 1


def test_missing_batch_result_fails_missing_pair_closed() -> None:
    products = _combination_and_single()
    result = orchestrate_ddi(
        _request_for(
            products,
            ("ingredient_alpha", "ingredient_beta", "ingredient_gamma"),
        ),
        SyntheticDDIProvider(SyntheticScenario.BATCH_MISSING_RESULT),
    )

    assert result.status is (
        DDIOrchestrationStatus.COMPLETED_WITH_PROVIDER_UNCERTAINTY
    )
    missing = result.pair_results[1]
    assert missing.status is DDIOrchestratedPairStatus.PROVIDER_ERROR
    assert missing.failure is not None
    assert missing.failure.category is (
        ProviderFailureCategory.MALFORMED_PROVIDER_RESPONSE
    )
    assert missing.assertions == ()


def test_unexpected_provider_exception_is_sanitized_provider_error() -> None:
    products = _single_products()
    result = orchestrate_ddi(
        _request_for(
            products,
            ("ingredient_alpha", "ingredient_beta"),
            use_batch_when_available=False,
        ),
        SyntheticDDIProvider(SyntheticScenario.UNEXPECTED_EXCEPTION),
    )

    assert result.status is DDIOrchestrationStatus.PROVIDER_ERROR
    assert result.pair_results[0].failure is not None
    assert result.pair_results[0].failure.category is (
        ProviderFailureCategory.UNEXPECTED_PROVIDER_ERROR
    )
    assert result.pair_results[0].failure.message == (
        "unexpected provider adapter failure"
    )


def test_product_component_and_provider_provenance_are_preserved() -> None:
    products = _single_products()
    result = orchestrate_ddi(
        _request_for(products, ("ingredient_alpha", "ingredient_beta")),
        SyntheticDDIProvider(SyntheticScenario.FOUND),
    )

    pair = result.pair_results[0]
    assert tuple(
        (item.product_identifier, item.component_identifier)
        for item in pair.source_provenance
    ) == (
        ("pak_product_alpha", "component_alpha"),
        ("pak_product_beta", "component_beta"),
    )
    assert pair.source_provenance[0].product_provenance.source_name == (
        "synthetic_non_clinical"
    )
    assert pair.assertions[0].provider_release_identifier == (
        result.provider_metadata.release_identifier
    )


def test_source_native_classification_is_preserved_exactly() -> None:
    products = _single_products()
    pair = orchestrate_ddi(
        _request_for(products, ("ingredient_alpha", "ingredient_beta")),
        SyntheticDDIProvider(SyntheticScenario.FOUND),
    ).pair_results[0]

    assertion = pair.assertions[0]
    assert assertion.source_native_classification_code == (
        "synthetic_classification_code_alpha"
    )
    assert assertion.source_native_classification_label == (
        "synthetic_classification_label_alpha"
    )
    assert "severity" not in type(pair).model_fields


def test_engine_outputs_are_immutable() -> None:
    products = _single_products()
    result = orchestrate_ddi(
        _request_for(products, ("ingredient_alpha", "ingredient_beta")),
        SyntheticDDIProvider(SyntheticScenario.NO_ASSERTION),
    )

    with pytest.raises(ValidationError):
        result.status = DDIOrchestrationStatus.PROVIDER_ERROR  # type: ignore[misc]
    with pytest.raises(ValidationError):
        result.pair_results[0].review_required = True  # type: ignore[misc]
    assert isinstance(result.pair_results, tuple)


@pytest.mark.parametrize(
    "dto_type",
    [
        EngineExecutionMetadata,
        DDIOrchestrationRequest,
        PairSourceProvenance,
        ProviderMappingIssue,
        DDIOrchestratedPairResult,
        DDIOrchestrationCounts,
        DDIOrchestrationResult,
    ],
)
def test_every_public_engine_dto_is_frozen_and_forbids_extra_fields(
    dto_type,
) -> None:
    assert dto_type.model_config["frozen"] is True
    assert dto_type.model_config["extra"] == "forbid"


def test_aggregate_counts_are_deterministic_and_exact() -> None:
    products = _combination_and_single()
    result = orchestrate_ddi(
        _request_for(
            products,
            ("ingredient_alpha", "ingredient_beta", "ingredient_gamma"),
        ),
        SyntheticDDIProvider(SyntheticScenario.FOUND),
    )

    assert result.counts.model_dump() == {
        "candidate_pairs": 2,
        "pairs_looked_up": 2,
        "assertions_returned": 2,
        "no_assertion_results": 0,
        "unmapped_pairs": 0,
        "provider_failure_pairs": 0,
        "review_required_pairs": 0,
        "same_ingredient_overlaps": 0,
    }


def test_engine_contract_has_no_clinical_recommendation_fields() -> None:
    products = _single_products()
    result = orchestrate_ddi(
        _request_for(products, ("ingredient_alpha", "ingredient_beta")),
        SyntheticDDIProvider(SyntheticScenario.FOUND),
    )

    prohibited = {
        "severity",
        "recommendation",
        "recommended_alternative",
        "contraindication",
        "dose_advice",
        "substitution",
        "patient_specific_decision",
    }
    assert _collect_keys(result.model_dump()).isdisjoint(prohibited)


def test_engine_fixtures_use_only_synthetic_medical_identities() -> None:
    assert SYNTHETIC_INGREDIENT_IDENTIFIERS == (
        "ingredient_alpha",
        "ingredient_beta",
        "ingredient_gamma",
    )
    assert SYNTHETIC_PRODUCT_IDENTIFIERS == (
        "pak_product_alpha",
        "pak_product_beta",
    )
    fixture_source = Path(__file__).with_name("interaction_engine_fixtures.py").read_text(
        encoding="utf-8"
    )
    assert "synthetic_" in fixture_source
    assert "provider_concept_" in fixture_source
    assert "http://" not in fixture_source
    assert "https://" not in fixture_source


@pytest.mark.parametrize(
    "scenario",
    [
        SyntheticScenario.FOUND,
        SyntheticScenario.NO_ASSERTION,
        SyntheticScenario.INSUFFICIENT_COVERAGE,
    ],
)
def test_single_and_batch_modes_have_semantically_identical_pair_results(
    scenario: SyntheticScenario,
) -> None:
    products = _combination_and_single()
    ingredients = ("ingredient_alpha", "ingredient_beta", "ingredient_gamma")
    single = orchestrate_ddi(
        _request_for(
            products,
            ingredients,
            use_batch_when_available=False,
        ),
        SyntheticDDIProvider(scenario),
    )
    batch = orchestrate_ddi(
        _request_for(products, ingredients),
        SyntheticDDIProvider(scenario),
    )

    assert single.status is batch.status
    assert single.pair_expansion == batch.pair_expansion
    assert single.pair_results == batch.pair_results
    assert single.counts == batch.counts


def test_reordered_batch_responses_preserve_deterministic_pair_identity() -> None:
    products = _combination_and_single()
    request = _request_for(
        products,
        ("ingredient_alpha", "ingredient_beta", "ingredient_gamma"),
    )

    ordered = orchestrate_ddi(request, _ControlledBatchProvider("ordered"))
    reordered = orchestrate_ddi(request, _ControlledBatchProvider("reordered"))

    assert ordered.pair_results == reordered.pair_results
    assert tuple(item.status for item in reordered.pair_results) == (
        DDIOrchestratedPairStatus.ASSERTION_RETURNED,
        DDIOrchestratedPairStatus.NO_ASSERTION_RETURNED,
    )


@pytest.mark.parametrize("shape", ["duplicate_response", "extra_response"])
def test_structurally_untrustworthy_batch_fails_every_pair_closed(
    shape: str,
) -> None:
    products = _combination_and_single()
    result = orchestrate_ddi(
        _request_for(
            products,
            ("ingredient_alpha", "ingredient_beta", "ingredient_gamma"),
        ),
        _ControlledBatchProvider(shape),
    )

    assert result.status is DDIOrchestrationStatus.PROVIDER_ERROR
    assert result.counts.candidate_pairs == 2
    assert result.counts.pairs_looked_up == 2
    assert result.counts.no_assertion_results == 0
    assert result.counts.provider_failure_pairs == 2
    assert all(
        item.status is DDIOrchestratedPairStatus.PROVIDER_ERROR
        and item.failure is not None
        and item.failure.category
        is ProviderFailureCategory.MALFORMED_PROVIDER_RESPONSE
        for item in result.pair_results
    )


def test_batch_level_failure_never_becomes_pair_level_no_assertion() -> None:
    products = _combination_and_single()
    result = orchestrate_ddi(
        _request_for(
            products,
            ("ingredient_alpha", "ingredient_beta", "ingredient_gamma"),
        ),
        _ControlledBatchProvider("batch_failure"),
    )

    assert result.status is DDIOrchestrationStatus.PROVIDER_UNAVAILABLE
    assert result.counts.no_assertion_results == 0
    assert result.counts.provider_failure_pairs == result.counts.candidate_pairs == 2
    assert all(
        item.status is DDIOrchestratedPairStatus.PROVIDER_UNAVAILABLE
        for item in result.pair_results
    )


def test_public_no_assertion_contract_rejects_non_in_scope_coverage() -> None:
    products = _single_products()
    pair = orchestrate_ddi(
        _request_for(products, ("ingredient_alpha", "ingredient_beta")),
        SyntheticDDIProvider(SyntheticScenario.NO_ASSERTION),
    ).pair_results[0]
    payload = pair.model_dump()
    payload["coverage"]["status"] = ProviderCoverageStatus.OUT_OF_SCOPE

    with pytest.raises(ValidationError):
        DDIOrchestratedPairResult.model_validate(payload)


def test_public_pair_contract_rejects_mismatched_coverage_release() -> None:
    products = _single_products()
    pair = orchestrate_ddi(
        _request_for(products, ("ingredient_alpha", "ingredient_beta")),
        SyntheticDDIProvider(SyntheticScenario.NO_ASSERTION),
    ).pair_results[0]
    payload = pair.model_dump()
    payload["coverage"]["provider_release_identifier"] = (
        "synthetic_provider_release_mismatch"
    )

    with pytest.raises(ValidationError):
        DDIOrchestratedPairResult.model_validate(payload)


def test_public_pair_contract_rejects_assertion_from_different_mapping() -> None:
    products = _single_products()
    pair = orchestrate_ddi(
        _request_for(products, ("ingredient_alpha", "ingredient_beta")),
        SyntheticDDIProvider(SyntheticScenario.FOUND),
    ).pair_results[0]
    assertion_payload = pair.assertions[0].model_dump()
    assertion_payload["provider_release_identifier"] = (
        "synthetic_provider_release_mismatch"
    )
    for field_name in ("ingredient_a_mapping", "ingredient_b_mapping"):
        assertion_payload[field_name]["provider_release_identifier"] = (
            "synthetic_provider_release_mismatch"
        )
    for expansion in assertion_payload["group_expansion_provenance"]:
        expansion["provider_release_identifier"] = (
            "synthetic_provider_release_mismatch"
        )
    mismatched_assertion = ProviderSourceAssertion.model_validate(assertion_payload)
    payload = pair.model_dump()
    payload["assertions"] = (mismatched_assertion,)

    with pytest.raises(ValidationError):
        DDIOrchestratedPairResult.model_validate(payload)


def test_aggregate_rejects_non_deterministic_pair_request_identifier() -> None:
    products = _single_products()
    result = orchestrate_ddi(
        _request_for(products, ("ingredient_alpha", "ingredient_beta")),
        SyntheticDDIProvider(SyntheticScenario.NO_ASSERTION),
    )
    payload = result.model_dump()
    payload["pair_results"][0]["provider_request_identifier"] = (
        f"{result.correlation_identifier}::pair::9999"
    )

    with pytest.raises(ValidationError):
        DDIOrchestrationResult.model_validate(payload)


def test_aggregate_rejects_tampered_counts_and_impossible_status() -> None:
    products = _single_products()
    result = orchestrate_ddi(
        _request_for(products, ("ingredient_alpha", "ingredient_beta")),
        SyntheticDDIProvider(SyntheticScenario.NO_ASSERTION),
    )
    count_payload = result.model_dump()
    count_payload["counts"]["candidate_pairs"] = 0
    with pytest.raises(ValidationError):
        DDIOrchestrationResult.model_validate(count_payload)

    status_payload = result.model_dump()
    status_payload["status"] = DDIOrchestrationStatus.PROVIDER_ERROR
    with pytest.raises(ValidationError):
        DDIOrchestrationResult.model_validate(status_payload)


def test_pair_contract_rejects_missing_insufficient_coverage_evidence() -> None:
    products = _single_products()
    pair = orchestrate_ddi(
        _request_for(products, ("ingredient_alpha", "ingredient_beta")),
        SyntheticDDIProvider(SyntheticScenario.INSUFFICIENT_COVERAGE),
    ).pair_results[0]
    payload = pair.model_dump()
    payload["coverage"] = None

    with pytest.raises(ValidationError):
        DDIOrchestratedPairResult.model_validate(payload)


def test_assertion_provenance_mismatch_is_provider_error_not_no_assertion() -> None:
    products = _single_products()
    result = orchestrate_ddi(
        _request_for(
            products,
            ("ingredient_alpha", "ingredient_beta"),
            use_batch_when_available=False,
        ),
        SyntheticDDIProvider(SyntheticScenario.MAPPING_PROVENANCE_MISMATCH),
    )

    assert result.status is DDIOrchestrationStatus.PROVIDER_ERROR
    assert result.counts.no_assertion_results == 0
    assert result.pair_results[0].failure is not None
    assert result.pair_results[0].failure.category is (
        ProviderFailureCategory.MALFORMED_PROVIDER_RESPONSE
    )


def test_combination_pair_traceability_covers_every_contributing_component() -> None:
    products = _two_combinations()
    result = orchestrate_ddi(
        _request_for(
            products,
            ("ingredient_alpha", "ingredient_beta", "ingredient_gamma"),
        ),
        SyntheticDDIProvider(SyntheticScenario.NO_ASSERTION),
    )

    for pair in result.pair_results:
        expected = {
            (product_identifier, component_identifier)
            for contribution in pair.candidate_pair.contributions
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
        actual = {
            (item.product_identifier, item.component_identifier)
            for item in pair.source_provenance
        }
        assert actual == expected
        assert {item.product_identifier for item in pair.source_provenance} == {
            "pak_product_alpha",
            "pak_product_beta",
        }
        assert pair.mapping_a is not None and pair.mapping_b is not None


def test_component_crosswalk_and_batch_ordering_are_logically_deterministic() -> None:
    products = _two_combinations()
    reversed_products = (
        synthetic_product("pak_product_alpha", reversed(products[0].components)),
        synthetic_product("pak_product_beta", reversed(products[1].components)),
    )
    crosswalks = tuple(
        synthetic_rxnorm_crosswalk(identifier)
        for identifier in ("ingredient_alpha", "ingredient_beta", "ingredient_gamma")
    )
    forward = orchestrate_ddi(
        _request_for(
            products,
            (),
            crosswalks=crosswalks,
        ),
        SyntheticDDIProvider(SyntheticScenario.NO_ASSERTION),
    )
    reordered = orchestrate_ddi(
        _request_for(
            reversed_products,
            (),
            crosswalks=tuple(reversed(crosswalks)),
        ),
        SyntheticDDIProvider(SyntheticScenario.NO_ASSERTION),
    )

    assert forward.pair_expansion == reordered.pair_expansion
    assert forward.pair_results == reordered.pair_results
    assert forward.counts == reordered.counts


@pytest.mark.parametrize(
    "blocking_component, product_kwargs, expected_status",
    [
        (
            synthetic_component(
                "component_alpha",
                mapping_status=ComponentMappingStatus.AMBIGUOUS_SALT_RELATIONSHIP,
                candidate_ingredient_identifiers=(
                    "ingredient_alpha",
                    "ingredient_beta",
                ),
                human_review_required=True,
            ),
            {},
            "ambiguous_mapping",
        ),
        (
            synthetic_component(
                "component_alpha",
                mapping_status=ComponentMappingStatus.UNSUPPORTED_SUBSTANCE,
            ),
            {},
            "unsupported_component",
        ),
        (
            synthetic_component(
                "component_alpha",
                ingredient_identifier="ingredient_alpha",
            ),
            {"review_required": True},
            "review_required",
        ),
    ],
)
def test_remaining_product_eligibility_gates_cannot_reach_provider(
    blocking_component,
    product_kwargs,
    expected_status: str,
) -> None:
    product_a = synthetic_product(
        "pak_product_alpha", (blocking_component,), **product_kwargs
    )
    product_b = _single_products()[1]
    provider = CountingSyntheticDDIProvider(SyntheticScenario.FOUND)
    result = orchestrate_ddi(
        orchestration_request(
            product_a,
            product_b,
            ingredient_identifiers=("ingredient_alpha", "ingredient_beta"),
        ),
        provider,
    )

    assert result.status is DDIOrchestrationStatus.BLOCKED_BY_PRODUCT_MAPPING
    assert result.pair_expansion.product_a_eligibility.status.value == expected_status
    assert provider.health_calls == provider.mapping_calls == 0
    assert provider.pair_lookup_calls == provider.batch_lookup_calls == 0


def test_missing_required_provenance_and_release_are_rejected_before_engine() -> None:
    provenance = _single_products()[0].provenance.model_dump()
    provenance.pop("source_release_identifier")
    with pytest.raises(ValidationError):
        SourceProvenance.model_validate(provenance)

    request = _request_for(
        _single_products(), ("ingredient_alpha", "ingredient_beta")
    ).model_dump()
    request["required_provider_release_identifier"] = ""
    with pytest.raises(ValidationError):
        DDIOrchestrationRequest.model_validate(request)


@pytest.mark.parametrize(
    "scenario, expected_candidate, expected_looked_up, expected_no_assertion, "
    "expected_failures, expected_unmapped",
    [
        (SyntheticScenario.NO_ASSERTION, 2, 2, 2, 0, 0),
        (SyntheticScenario.BATCH_PARTIAL_FAILURE, 2, 2, 1, 1, 0),
        (SyntheticScenario.BATCH_MISSING_RESULT, 2, 2, 1, 1, 0),
    ],
)
def test_aggregate_count_conservation_for_lookup_outcomes(
    scenario: SyntheticScenario,
    expected_candidate: int,
    expected_looked_up: int,
    expected_no_assertion: int,
    expected_failures: int,
    expected_unmapped: int,
) -> None:
    products = _combination_and_single()
    result = orchestrate_ddi(
        _request_for(
            products,
            ("ingredient_alpha", "ingredient_beta", "ingredient_gamma"),
        ),
        SyntheticDDIProvider(scenario),
    )

    status_total = sum(
        sum(item.status is status for item in result.pair_results)
        for status in DDIOrchestratedPairStatus
    )
    assert status_total == len(result.pair_results) == result.counts.candidate_pairs
    assert result.counts.candidate_pairs == expected_candidate
    assert result.counts.pairs_looked_up == expected_looked_up
    assert result.counts.no_assertion_results == expected_no_assertion
    assert result.counts.provider_failure_pairs == expected_failures
    assert result.counts.unmapped_pairs == expected_unmapped


def test_unexpected_mapping_exception_is_sanitized_and_diagnosable(
    caplog: pytest.LogCaptureFixture,
) -> None:
    products = _single_products()
    with caplog.at_level("ERROR"):
        result = orchestrate_ddi(
            _request_for(products, ("ingredient_alpha", "ingredient_beta")),
            _UnexpectedMappingFailureProvider(SyntheticScenario.FOUND),
        )

    assert result.status is DDIOrchestrationStatus.PROVIDER_ERROR
    assert result.counts.no_assertion_results == 0
    assert all(
        item.failure is not None
        and item.failure.category is ProviderFailureCategory.UNEXPECTED_PROVIDER_ERROR
        and item.failure.message == "unexpected provider mapping failure"
        for item in result.pair_results
    )
    assert "synthetic_sensitive_mapping_payload" not in caplog.text
    assert "RuntimeError" in caplog.text


def _collect_keys(value: object) -> set[str]:
    if isinstance(value, dict):
        return set(value).union(*(_collect_keys(item) for item in value.values()))
    if isinstance(value, (list, tuple)):
        return set().union(*(_collect_keys(item) for item in value))
    return set()
