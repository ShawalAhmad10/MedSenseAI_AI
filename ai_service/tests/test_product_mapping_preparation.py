"""Fail-closed eligibility and deterministic combination expansion tests."""

from __future__ import annotations

from medsense_ai.product_mapping import (
    ComponentMappingStatus,
    ComponentRole,
    PairExpansionStatus,
    ProductCompositionStatus,
    ProductDDIEligibilityStatus,
    evaluate_product_ddi_eligibility,
    expand_candidate_ingredient_pairs,
)
from product_mapping_fixtures import synthetic_component, synthetic_product


def test_single_ingredient_product_is_ready_for_provider_lookup() -> None:
    product = synthetic_product(
        "pak_product_alpha",
        (synthetic_component("component_alpha", ingredient_identifier="ingredient_alpha"),),
    )

    result = evaluate_product_ddi_eligibility(product)

    assert result.status is ProductDDIEligibilityStatus.READY_FOR_PROVIDER_LOOKUP
    assert tuple(
        item.ingredient.ingredient_identifier for item in result.resolved_ingredients
    ) == ("ingredient_alpha",)
    assert result.issues == ()


def test_combination_product_resolves_all_active_components() -> None:
    product = synthetic_product(
        "pak_product_alpha",
        (
            synthetic_component("component_beta", ingredient_identifier="ingredient_beta"),
            synthetic_component("component_alpha", ingredient_identifier="ingredient_alpha"),
        ),
    )

    result = evaluate_product_ddi_eligibility(product)

    assert result.status is ProductDDIEligibilityStatus.READY_FOR_PROVIDER_LOOKUP
    assert tuple(
        item.ingredient.ingredient_identifier for item in result.resolved_ingredients
    ) == ("ingredient_alpha", "ingredient_beta")


def test_two_combination_products_expand_cartesian_pairs_and_overlap() -> None:
    product_a = synthetic_product(
        "pak_product_alpha",
        (
            synthetic_component("component_alpha", ingredient_identifier="ingredient_alpha"),
            synthetic_component("component_beta", ingredient_identifier="ingredient_beta"),
        ),
    )
    product_b = synthetic_product(
        "pak_product_beta",
        (
            synthetic_component("component_beta_b", ingredient_identifier="ingredient_beta"),
            synthetic_component("component_gamma", ingredient_identifier="ingredient_gamma"),
        ),
    )

    result = expand_candidate_ingredient_pairs(product_b, product_a)

    assert result.status is PairExpansionStatus.CANDIDATES_GENERATED
    assert tuple(pair.pair_identifier for pair in result.candidate_pairs) == (
        "candidate::ingredient_alpha::ingredient_beta",
        "candidate::ingredient_alpha::ingredient_gamma",
        "candidate::ingredient_beta::ingredient_gamma",
    )
    assert tuple(
        overlap.ingredient.ingredient_identifier
        for overlap in result.same_ingredient_overlaps
    ) == ("ingredient_beta",)


def test_duplicate_components_reconcile_to_one_canonical_identity() -> None:
    product_a = synthetic_product(
        "pak_product_alpha",
        (
            synthetic_component("component_alpha_1", ingredient_identifier="ingredient_alpha"),
            synthetic_component("component_alpha_2", ingredient_identifier="ingredient_alpha"),
        ),
    )
    product_b = synthetic_product(
        "pak_product_beta",
        (synthetic_component("component_gamma", ingredient_identifier="ingredient_gamma"),),
    )

    eligibility = evaluate_product_ddi_eligibility(product_a)
    expansion = expand_candidate_ingredient_pairs(product_a, product_b)

    assert len(eligibility.resolved_ingredients) == 1
    assert eligibility.resolved_ingredients[0].component_identifiers == (
        "component_alpha_1",
        "component_alpha_2",
    )
    assert tuple(pair.pair_identifier for pair in expansion.candidate_pairs) == (
        "candidate::ingredient_alpha::ingredient_gamma",
    )


def test_unresolved_component_fails_closed() -> None:
    product = synthetic_product(
        "pak_product_alpha",
        (
            synthetic_component(
                "component_alpha",
                mapping_status=ComponentMappingStatus.UNMAPPED,
            ),
        ),
    )

    result = evaluate_product_ddi_eligibility(product)

    assert result.status is ProductDDIEligibilityStatus.UNRESOLVED_COMPONENT
    assert result.resolved_ingredients == ()


def test_ambiguous_mapping_fails_closed() -> None:
    product = synthetic_product(
        "pak_product_alpha",
        (
            synthetic_component(
                "component_alpha",
                mapping_status=ComponentMappingStatus.AMBIGUOUS_SALT_RELATIONSHIP,
                candidate_ingredient_identifiers=("ingredient_beta", "ingredient_gamma"),
                human_review_required=True,
            ),
        ),
    )

    result = evaluate_product_ddi_eligibility(product)

    assert result.status is ProductDDIEligibilityStatus.AMBIGUOUS_MAPPING


def test_unsupported_component_fails_closed() -> None:
    product = synthetic_product(
        "pak_product_alpha",
        (
            synthetic_component(
                "component_alpha",
                mapping_status=ComponentMappingStatus.UNSUPPORTED_SUBSTANCE,
            ),
        ),
    )

    result = evaluate_product_ddi_eligibility(product)

    assert result.status is ProductDDIEligibilityStatus.UNSUPPORTED_COMPONENT


def test_review_required_mapping_fails_closed() -> None:
    product = synthetic_product(
        "pak_product_alpha",
        (
            synthetic_component(
                "component_alpha",
                mapping_status=ComponentMappingStatus.REVIEW_REQUIRED,
                human_review_required=True,
            ),
        ),
    )

    result = evaluate_product_ddi_eligibility(product)

    assert result.status is ProductDDIEligibilityStatus.REVIEW_REQUIRED


def test_unknown_component_role_fails_closed() -> None:
    product = synthetic_product(
        "pak_product_alpha",
        (
            synthetic_component(
                "component_alpha",
                role=ComponentRole.UNKNOWN,
                mapping_status=ComponentMappingStatus.UNMAPPED,
            ),
        ),
    )

    result = evaluate_product_ddi_eligibility(product)

    assert result.status is ProductDDIEligibilityStatus.UNKNOWN_COMPONENT_ROLE


def test_non_active_component_is_preserved_but_not_expanded() -> None:
    product = synthetic_product(
        "pak_product_alpha",
        (
            synthetic_component("component_alpha", ingredient_identifier="ingredient_alpha"),
            synthetic_component(
                "component_non_active",
                role=ComponentRole.NON_ACTIVE,
                mapping_status=ComponentMappingStatus.NOT_APPLICABLE,
            ),
        ),
    )

    result = evaluate_product_ddi_eligibility(product)

    assert result.status is ProductDDIEligibilityStatus.READY_FOR_PROVIDER_LOOKUP
    assert len(product.components) == 2
    assert len(result.resolved_ingredients) == 1


def test_partial_mapping_reports_resolved_subset_and_blocks_expansion() -> None:
    product_a = synthetic_product(
        "pak_product_alpha",
        (
            synthetic_component("component_alpha", ingredient_identifier="ingredient_alpha"),
            synthetic_component(
                "component_beta", mapping_status=ComponentMappingStatus.UNMAPPED
            ),
        ),
    )
    product_b = synthetic_product(
        "pak_product_beta",
        (synthetic_component("component_gamma", ingredient_identifier="ingredient_gamma"),),
    )

    eligibility = evaluate_product_ddi_eligibility(product_a)
    expansion = expand_candidate_ingredient_pairs(product_a, product_b)

    assert eligibility.status is ProductDDIEligibilityStatus.UNRESOLVED_COMPONENT
    assert tuple(
        item.ingredient.ingredient_identifier for item in eligibility.resolved_ingredients
    ) == ("ingredient_alpha",)
    assert expansion.status is PairExpansionStatus.BLOCKED_BY_ELIGIBILITY
    assert expansion.candidate_pairs == ()
    assert expansion.same_ingredient_overlaps == ()


def test_incomplete_composition_fails_closed() -> None:
    product = synthetic_product(
        "pak_product_alpha",
        (synthetic_component("component_alpha", ingredient_identifier="ingredient_alpha"),),
        composition_status=ProductCompositionStatus.INCOMPLETE,
    )

    result = evaluate_product_ddi_eligibility(product)

    assert result.status is ProductDDIEligibilityStatus.INCOMPLETE_PRODUCT_COMPOSITION


def test_same_ingredient_in_both_products_is_overlap_not_candidate_pair() -> None:
    product_a = synthetic_product(
        "pak_product_alpha",
        (synthetic_component("component_alpha_a", ingredient_identifier="ingredient_alpha"),),
    )
    product_b = synthetic_product(
        "pak_product_beta",
        (synthetic_component("component_alpha_b", ingredient_identifier="ingredient_alpha"),),
    )

    result = expand_candidate_ingredient_pairs(product_a, product_b)

    assert result.candidate_pairs == ()
    assert len(result.same_ingredient_overlaps) == 1
    assert result.same_ingredient_overlaps[0].ingredient.ingredient_identifier == (
        "ingredient_alpha"
    )


def test_candidate_pair_order_is_deterministic_for_input_and_component_order() -> None:
    product_a = synthetic_product(
        "pak_product_alpha",
        (
            synthetic_component("component_beta", ingredient_identifier="ingredient_beta"),
            synthetic_component("component_alpha", ingredient_identifier="ingredient_alpha"),
        ),
    )
    product_b = synthetic_product(
        "pak_product_beta",
        (synthetic_component("component_gamma", ingredient_identifier="ingredient_gamma"),),
    )

    forward = expand_candidate_ingredient_pairs(product_a, product_b)
    reverse = expand_candidate_ingredient_pairs(product_b, product_a)

    assert forward == reverse
    assert tuple(pair.pair_identifier for pair in forward.candidate_pairs) == (
        "candidate::ingredient_alpha::ingredient_gamma",
        "candidate::ingredient_beta::ingredient_gamma",
    )


def test_candidate_generation_has_no_clinical_conclusion_fields() -> None:
    product_a = synthetic_product(
        "pak_product_alpha",
        (synthetic_component("component_alpha", ingredient_identifier="ingredient_alpha"),),
    )
    product_b = synthetic_product(
        "pak_product_beta",
        (synthetic_component("component_gamma", ingredient_identifier="ingredient_gamma"),),
    )

    payload = expand_candidate_ingredient_pairs(product_a, product_b).model_dump()

    def collect_keys(value: object) -> set[str]:
        if isinstance(value, dict):
            return set(value).union(*(collect_keys(item) for item in value.values()))
        if isinstance(value, (list, tuple)):
            return set().union(*(collect_keys(item) for item in value))
        return set()

    keys = collect_keys(payload)
    assert keys.isdisjoint({"safe", "safety", "interaction", "severity", "conclusion"})
