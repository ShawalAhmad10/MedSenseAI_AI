"""Unmistakably synthetic, non-clinical product-mapping test builders."""

from __future__ import annotations

from collections.abc import Iterable

from medsense_ai.product_mapping import (
    CanonicalIngredient,
    CanonicalIngredientStatus,
    ComponentMappingStatus,
    ComponentRole,
    PakistanMedicineProduct,
    ProductComponent,
    ProductCompositionStatus,
    ProductSourceType,
    ProductStatus,
    ReviewStatus,
    SourceProvenance,
    SubstanceNormalizationRelationship,
)


SYNTHETIC_SOURCE_NAME = "synthetic_non_clinical"
SYNTHETIC_SOURCE_RELEASE = "synthetic_release_v1"
SYNTHETIC_INGREDIENT_IDENTIFIERS = (
    "ingredient_alpha",
    "ingredient_beta",
    "ingredient_gamma",
)
SYNTHETIC_PRODUCT_IDENTIFIERS = (
    "pak_product_alpha",
    "pak_product_beta",
)


def synthetic_provenance(
    record_identifier: str,
    *,
    release_identifier: str = SYNTHETIC_SOURCE_RELEASE,
) -> SourceProvenance:
    return SourceProvenance(
        source_name=SYNTHETIC_SOURCE_NAME,
        source_release_identifier=release_identifier,
        source_record_identifier=record_identifier,
        source_record_checksum=f"synthetic_checksum_{record_identifier}",
        transformation_description="synthetic contract test fixture",
    )


def synthetic_ingredient(identifier: str) -> CanonicalIngredient:
    if identifier not in SYNTHETIC_INGREDIENT_IDENTIFIERS:
        raise ValueError("synthetic fixture ingredient is not allowlisted")
    return CanonicalIngredient(
        ingredient_identifier=identifier,
        preferred_display_name=identifier,
        status=CanonicalIngredientStatus.ACTIVE,
        creation_provenance=synthetic_provenance(
            f"synthetic_canonical_{identifier}"
        ),
        review_status=ReviewStatus.COMPLETED,
    )


def synthetic_component(
    component_identifier: str,
    *,
    ingredient_identifier: str | None = None,
    role: ComponentRole = ComponentRole.ACTIVE,
    mapping_status: ComponentMappingStatus = (
        ComponentMappingStatus.EXACT_INGREDIENT_MATCH
    ),
    candidate_ingredient_identifiers: tuple[str, ...] = (),
    human_review_required: bool = False,
    raw_salt_or_form: str | None = None,
    normalization_relationship: SubstanceNormalizationRelationship | None = None,
) -> ProductComponent:
    ingredient = (
        synthetic_ingredient(ingredient_identifier)
        if ingredient_identifier is not None
        else None
    )
    return ProductComponent(
        component_identifier=component_identifier,
        raw_component_name=ingredient_identifier or component_identifier,
        raw_salt_or_form=raw_salt_or_form,
        raw_strength_amount="synthetic_amount" if role is ComponentRole.ACTIVE else None,
        raw_unit="synthetic_unit" if role is ComponentRole.ACTIVE else None,
        role=role,
        provenance=synthetic_provenance(
            f"synthetic_component_record_{component_identifier}"
        ),
        normalized_candidate=ingredient,
        candidate_ingredient_identifiers=candidate_ingredient_identifiers,
        mapping_status=mapping_status,
        human_review_required=human_review_required,
        normalization_relationship=normalization_relationship,
    )


def synthetic_product(
    product_identifier: str,
    components: Iterable[ProductComponent],
    *,
    composition_status: ProductCompositionStatus = ProductCompositionStatus.COMPLETE,
    status: ProductStatus = ProductStatus.ACTIVE,
    review_required: bool = False,
) -> PakistanMedicineProduct:
    if product_identifier not in SYNTHETIC_PRODUCT_IDENTIFIERS:
        raise ValueError("synthetic fixture product is not allowlisted")
    return PakistanMedicineProduct(
        product_identifier=product_identifier,
        source_type=ProductSourceType.SYNTHETIC,
        source_product_identifier=f"synthetic_source_{product_identifier}",
        display_name=product_identifier,
        manufacturer=None,
        registration_number=None,
        dosage_form=None,
        strength_display=None,
        provenance=synthetic_provenance(
            f"synthetic_product_record_{product_identifier}"
        ),
        status=status,
        composition_status=composition_status,
        review_required=review_required,
        components=tuple(components),
    )
