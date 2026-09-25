"""Explicit salt/moiety relationship safety tests using synthetic identities."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from medsense_ai.product_mapping import (
    ComponentMappingStatus,
    RelationshipLifecycleStatus,
    ReviewStatus,
    SubstanceKind,
    SubstanceNormalizationRelationship,
    SubstanceReference,
    SubstanceRelationshipType,
    evaluate_product_ddi_eligibility,
)
from product_mapping_fixtures import (
    synthetic_component,
    synthetic_product,
    synthetic_provenance,
)


def synthetic_substance(identifier: str, kind: SubstanceKind) -> SubstanceReference:
    return SubstanceReference(
        substance_identifier=identifier,
        display_name=identifier,
        kind=kind,
        provenance=synthetic_provenance(f"synthetic_substance_record_{identifier}"),
    )


def validated_salt_relationship() -> SubstanceNormalizationRelationship:
    return SubstanceNormalizationRelationship(
        relationship_identifier="synthetic_salt_relationship_v1",
        relationship_version="synthetic_relationship_release_v1",
        precise_substance=synthetic_substance("salt_alpha", SubstanceKind.SALT),
        active_moiety_or_base=synthetic_substance(
            "moiety_alpha", SubstanceKind.ACTIVE_MOIETY
        ),
        relationship_type=SubstanceRelationshipType.SALT_TO_ACTIVE_MOIETY,
        mapping_status=(
            ComponentMappingStatus.VALIDATED_SALT_TO_MOIETY_RELATIONSHIP
        ),
        provenance=synthetic_provenance("synthetic_salt_relationship_record_v1"),
        review_status=ReviewStatus.COMPLETED,
        lifecycle_status=RelationshipLifecycleStatus.CURRENT,
    )


def test_exact_mapping_needs_no_string_derived_relationship() -> None:
    component = synthetic_component(
        "component_alpha", ingredient_identifier="ingredient_alpha"
    )

    assert component.mapping_status is ComponentMappingStatus.EXACT_INGREDIENT_MATCH
    assert component.normalization_relationship is None


def test_validated_salt_to_moiety_relationship_is_explicit_and_eligible() -> None:
    relationship = validated_salt_relationship()
    component = synthetic_component(
        "component_salt_alpha",
        ingredient_identifier="ingredient_alpha",
        mapping_status=(
            ComponentMappingStatus.VALIDATED_SALT_TO_MOIETY_RELATIONSHIP
        ),
        raw_salt_or_form="salt_alpha",
        normalization_relationship=relationship,
    )
    product = synthetic_product("pak_product_alpha", (component,))

    eligibility = evaluate_product_ddi_eligibility(product)

    assert relationship.precise_substance.substance_identifier == "salt_alpha"
    assert relationship.active_moiety_or_base is not None
    assert relationship.active_moiety_or_base.substance_identifier == "moiety_alpha"
    assert relationship.relationship_version == "synthetic_relationship_release_v1"
    assert eligibility.status.value == "ready_for_provider_lookup"


def test_salt_normalization_cannot_be_inferred_from_raw_text() -> None:
    with pytest.raises(
        ValidationError,
        match="requires an explicit versioned relationship",
    ):
        synthetic_component(
            "component_salt_alpha",
            ingredient_identifier="ingredient_alpha",
            mapping_status=(
                ComponentMappingStatus.VALIDATED_SALT_TO_MOIETY_RELATIONSHIP
            ),
            raw_salt_or_form="salt_alpha",
            normalization_relationship=None,
        )


def test_invalid_salt_relationship_kind_is_rejected() -> None:
    with pytest.raises(ValidationError, match="source salt substance"):
        SubstanceNormalizationRelationship(
            relationship_identifier="synthetic_salt_relationship_v1",
            relationship_version="synthetic_relationship_release_v1",
            precise_substance=synthetic_substance(
                "salt_alpha", SubstanceKind.PRECISE_SUBSTANCE
            ),
            active_moiety_or_base=synthetic_substance(
                "moiety_alpha", SubstanceKind.ACTIVE_MOIETY
            ),
            relationship_type=SubstanceRelationshipType.SALT_TO_ACTIVE_MOIETY,
            mapping_status=(
                ComponentMappingStatus.VALIDATED_SALT_TO_MOIETY_RELATIONSHIP
            ),
            provenance=synthetic_provenance(
                "synthetic_salt_relationship_record_v1"
            ),
            review_status=ReviewStatus.COMPLETED,
        )


def test_ambiguous_salt_relationship_requires_review_and_blocks_product() -> None:
    relationship = SubstanceNormalizationRelationship(
        relationship_identifier="synthetic_ambiguous_salt_relationship_v1",
        relationship_version="synthetic_relationship_release_v1",
        precise_substance=synthetic_substance("salt_alpha", SubstanceKind.SALT),
        active_moiety_or_base=None,
        relationship_type=SubstanceRelationshipType.UNKNOWN,
        mapping_status=ComponentMappingStatus.AMBIGUOUS_SALT_RELATIONSHIP,
        provenance=synthetic_provenance(
            "synthetic_ambiguous_salt_relationship_record_v1"
        ),
        review_status=ReviewStatus.REQUIRED,
    )
    component = synthetic_component(
        "component_salt_alpha",
        mapping_status=ComponentMappingStatus.AMBIGUOUS_SALT_RELATIONSHIP,
        candidate_ingredient_identifiers=("ingredient_beta", "ingredient_gamma"),
        human_review_required=True,
        raw_salt_or_form="salt_alpha",
        normalization_relationship=relationship,
    )

    result = evaluate_product_ddi_eligibility(
        synthetic_product("pak_product_alpha", (component,))
    )

    assert result.status.value == "ambiguous_mapping"


def test_unknown_relationship_remains_review_required_not_normalized() -> None:
    relationship = SubstanceNormalizationRelationship(
        relationship_identifier="synthetic_unknown_relationship_v1",
        relationship_version="synthetic_relationship_release_v1",
        precise_substance=synthetic_substance(
            "salt_alpha", SubstanceKind.UNKNOWN
        ),
        active_moiety_or_base=None,
        relationship_type=SubstanceRelationshipType.UNKNOWN,
        mapping_status=ComponentMappingStatus.REVIEW_REQUIRED,
        provenance=synthetic_provenance("synthetic_unknown_relationship_record_v1"),
        review_status=ReviewStatus.REQUIRED,
    )

    assert relationship.active_moiety_or_base is None
    assert relationship.mapping_status is ComponentMappingStatus.REVIEW_REQUIRED
