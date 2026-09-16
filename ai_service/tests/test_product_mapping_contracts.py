"""Contract tests for synthetic Pakistan product and identity DTOs."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from medsense_ai.product_mapping import (
    CrosswalkMappingMethod,
    CrosswalkMappingStatus,
    DDIProviderIngredientCrosswalk,
    ProductSourceType,
    ReviewStatus,
    RxNormIngredientCrosswalk,
)
from product_mapping_fixtures import (
    SYNTHETIC_INGREDIENT_IDENTIFIERS,
    SYNTHETIC_PRODUCT_IDENTIFIERS,
    SYNTHETIC_SOURCE_NAME,
    synthetic_component,
    synthetic_ingredient,
    synthetic_product,
    synthetic_provenance,
)


def test_product_contract_preserves_provenance_and_optional_source_fields() -> None:
    component = synthetic_component(
        "component_alpha", ingredient_identifier="ingredient_alpha"
    )
    product = synthetic_product("pak_product_alpha", (component,))

    assert product.source_type is ProductSourceType.SYNTHETIC
    assert product.manufacturer is None
    assert product.registration_number is None
    assert product.dosage_form is None
    assert product.strength_display is None
    assert product.provenance.source_name == SYNTHETIC_SOURCE_NAME
    assert product.provenance.source_release_identifier == "synthetic_release_v1"
    assert product.components[0].provenance.source_record_identifier == (
        "synthetic_component_record_component_alpha"
    )
    assert product.components[0].raw_component_name == "ingredient_alpha"
    assert product.components[0].raw_strength_amount == "synthetic_amount"
    assert product.components[0].raw_unit == "synthetic_unit"


def test_canonical_ingredient_identity_is_independent_from_rxnorm() -> None:
    ingredient = synthetic_ingredient("ingredient_alpha")

    assert ingredient.ingredient_identifier == "ingredient_alpha"
    assert "rxnorm" not in ingredient.__class__.model_fields
    assert "rxcui" not in ingredient.__class__.model_fields


def test_versioned_rxnorm_crosswalk_preserves_release_and_lifecycle() -> None:
    first = RxNormIngredientCrosswalk(
        mapping_identifier="synthetic_rxnorm_mapping_v1",
        canonical_ingredient_identifier="ingredient_alpha",
        rxnorm_rxcui="synthetic_rxcui_alpha",
        rxnorm_release_identifier="synthetic_rxnorm_release_v1",
        rxnorm_concept_type="synthetic_concept_type",
        mapping_method=CrosswalkMappingMethod.AUTHORITATIVE_CROSSWALK,
        mapping_status=CrosswalkMappingStatus.MAPPED,
        mapping_provenance=synthetic_provenance(
            "synthetic_rxnorm_crosswalk_record_v1"
        ),
        review_status=ReviewStatus.COMPLETED,
    )
    second = RxNormIngredientCrosswalk(
        mapping_identifier="synthetic_rxnorm_mapping_v2",
        canonical_ingredient_identifier="ingredient_alpha",
        rxnorm_rxcui="synthetic_rxcui_alpha_v2",
        rxnorm_release_identifier="synthetic_rxnorm_release_v2",
        rxnorm_concept_type="synthetic_concept_type",
        mapping_method=CrosswalkMappingMethod.HUMAN_VERIFIED,
        mapping_status=CrosswalkMappingStatus.SUPERSEDED,
        mapping_provenance=synthetic_provenance(
            "synthetic_rxnorm_crosswalk_record_v2",
            release_identifier="synthetic_rxnorm_release_v2",
        ),
        review_status=ReviewStatus.COMPLETED,
        deprecated_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        superseded_by_mapping_identifier="synthetic_rxnorm_mapping_v3",
    )

    assert first.canonical_ingredient_identifier == second.canonical_ingredient_identifier
    assert first.rxnorm_release_identifier != second.rxnorm_release_identifier
    assert second.mapping_status is CrosswalkMappingStatus.SUPERSEDED
    assert second.superseded_by_mapping_identifier == "synthetic_rxnorm_mapping_v3"


def test_provider_crosswalk_is_versioned_and_provider_neutral() -> None:
    mapping = DDIProviderIngredientCrosswalk(
        mapping_identifier="synthetic_provider_mapping_v1",
        canonical_ingredient_identifier="ingredient_beta",
        provider_namespace="synthetic_provider",
        provider_concept_identifier="synthetic_provider_concept_beta",
        provider_release_identifier="synthetic_provider_release_v1",
        mapping_method=CrosswalkMappingMethod.AUTHORITATIVE_CROSSWALK,
        mapping_status=CrosswalkMappingStatus.MAPPED,
        mapping_provenance=synthetic_provenance(
            "synthetic_provider_crosswalk_record_v1"
        ),
        review_status=ReviewStatus.COMPLETED,
    )

    assert mapping.provider_namespace == "synthetic_provider"
    assert mapping.provider_release_identifier == "synthetic_provider_release_v1"


def test_validated_dtos_are_immutable_and_reject_extra_fields() -> None:
    product = synthetic_product(
        "pak_product_alpha",
        (synthetic_component("component_alpha", ingredient_identifier="ingredient_alpha"),),
    )

    with pytest.raises(ValidationError):
        product.display_name = "synthetic_changed_name"  # type: ignore[misc]

    with pytest.raises(ValidationError):
        product.components[0].mapping_status = "unmapped"  # type: ignore[misc]

    payload = product.model_dump()
    payload["synthetic_extra_field"] = "synthetic_value"
    with pytest.raises(ValidationError):
        product.__class__.model_validate(payload)


def test_fixtures_contain_only_allowlisted_synthetic_medical_identities() -> None:
    assert SYNTHETIC_INGREDIENT_IDENTIFIERS == (
        "ingredient_alpha",
        "ingredient_beta",
        "ingredient_gamma",
    )
    assert SYNTHETIC_PRODUCT_IDENTIFIERS == (
        "pak_product_alpha",
        "pak_product_beta",
    )
    for ingredient_identifier in SYNTHETIC_INGREDIENT_IDENTIFIERS:
        ingredient = synthetic_ingredient(ingredient_identifier)
        assert ingredient.preferred_display_name == ingredient_identifier
        assert ingredient.creation_provenance.source_name == SYNTHETIC_SOURCE_NAME

