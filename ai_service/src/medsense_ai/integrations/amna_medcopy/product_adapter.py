"""Pure adaptation of an authoritative amnaMedcopy Product model record."""

from __future__ import annotations

from medsense_ai.integrations.amna_medcopy.contracts import (
    PartnerProductAdaptation,
    PartnerProductProvenance,
    PartnerProductRecord,
)
from medsense_ai.product_mapping import (
    ComponentMappingStatus,
    ComponentRole,
    PakistanMedicineProduct,
    ProductComponent,
    ProductCompositionStatus,
    ProductSourceType,
    ProductStatus,
    SourceProvenance,
)


PARTNER_PRODUCT_SOURCE_NAME = "amnaMedcopy commerce Product"
_PRODUCT_TRANSFORMATION = (
    "Authoritative partner Product row adapted structurally; no ingredient "
    "identity, composition completeness, or clinical verification inferred."
)
_SALT_TRANSFORMATION = (
    "Partner product_salt preserved verbatim as an unmapped source component; "
    "no canonical ingredient or active-moiety relationship inferred."
)


class PartnerProductAdaptationError(ValueError):
    """The valid source record cannot be represented without fabrication."""


def adapt_partner_product(
    record: PartnerProductRecord,
    provenance: PartnerProductProvenance,
) -> PartnerProductAdaptation:
    """Map one validated Product row without I/O, inference, or clock access."""

    if not isinstance(record, PartnerProductRecord):
        raise TypeError("record must be a validated PartnerProductRecord")
    if not isinstance(provenance, PartnerProductProvenance):
        raise TypeError("provenance must be validated PartnerProductProvenance")

    title = record.product_title
    if title is None or not title.strip():
        raise PartnerProductAdaptationError(
            "product_title is required to populate the nonblank product display name"
        )

    source_record_identifier = str(record.product_id)
    product_provenance = _source_provenance(
        source_record_identifier=source_record_identifier,
        context=provenance,
        transformation_description=_PRODUCT_TRANSFORMATION,
    )

    components: tuple[ProductComponent, ...] = ()
    if record.product_salt is not None and record.product_salt.strip():
        component_provenance = _source_provenance(
            source_record_identifier=source_record_identifier,
            context=provenance,
            transformation_description=_SALT_TRANSFORMATION,
        )
        components = (
            ProductComponent(
                component_identifier="product_salt",
                raw_component_name=record.product_salt,
                raw_salt_or_form=record.product_salt,
                role=ComponentRole.UNKNOWN,
                provenance=component_provenance,
                mapping_status=ComponentMappingStatus.UNMAPPED,
                human_review_required=True,
            ),
        )

    mapped_product = PakistanMedicineProduct(
        product_identifier=source_record_identifier,
        source_type=ProductSourceType.PHARMACY_MASTER,
        source_product_identifier=source_record_identifier,
        display_name=title,
        provenance=product_provenance,
        status=(
            ProductStatus.ACTIVE
            if record.product_status == 1
            else ProductStatus.INACTIVE
        ),
        composition_status=ProductCompositionStatus.UNKNOWN,
        review_required=True,
        components=components,
    )
    return PartnerProductAdaptation(
        source_record=record,
        mapped_product=mapped_product,
    )


def _source_provenance(
    *,
    source_record_identifier: str,
    context: PartnerProductProvenance,
    transformation_description: str,
) -> SourceProvenance:
    return SourceProvenance(
        source_name=PARTNER_PRODUCT_SOURCE_NAME,
        source_release_identifier=context.source_release_identifier,
        source_record_identifier=source_record_identifier,
        source_record_checksum=context.source_record_checksum,
        transformation_description=transformation_description,
    )
