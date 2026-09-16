"""INT-01 tests for the authoritative partner Product record adapter."""

from __future__ import annotations

import inspect
from uuid import uuid4

import pytest
from pydantic import ValidationError

from medsense_ai.integrations.amna_medcopy import (
    PartnerProductAdaptationError,
    PartnerProductProvenance,
    PartnerProductRecord,
    adapt_partner_product,
)
from medsense_ai.integrations.amna_medcopy import product_adapter
from medsense_ai.product_mapping import (
    ComponentMappingStatus,
    ComponentRole,
    ProductCompositionStatus,
    ProductDDIEligibilityStatus,
    ProductStatus,
    evaluate_product_ddi_eligibility,
)


def product_record(**changes: object) -> PartnerProductRecord:
    payload: dict[str, object] = {
        "product_id": 123,
        "product_title": "  Source Product Title  ",
        "product_generic_name": "Source Generic Name",
        "product_salt": "  Source Salt Text  ",
        "product_requires_rx": True,
        "product_status": 1,
    }
    payload.update(changes)
    return PartnerProductRecord.model_validate(payload)


def provenance() -> PartnerProductProvenance:
    return PartnerProductProvenance(
        source_release_identifier="test_partner_snapshot_1",
        source_record_checksum="test-record-checksum",
    )


def test_valid_product_record_maps_deterministically_with_integer_identity() -> None:
    record = product_record()

    first = adapt_partner_product(record, provenance())
    second = adapt_partner_product(record, provenance())

    assert first == second
    assert first.source_record.product_id == 123
    assert first.mapped_product.product_identifier == "123"
    assert first.mapped_product.source_product_identifier == "123"
    assert first.mapped_product.provenance.source_record_identifier == "123"


@pytest.mark.parametrize(
    "invalid_product_id",
    (0, -1, "123", "abc123", "123xyz", "prod-123", 123.0, True, None),
)
def test_raw_product_identity_rejects_nonpositive_and_noninteger_values(
    invalid_product_id: object,
) -> None:
    with pytest.raises(ValidationError):
        product_record(product_id=invalid_product_id)


def test_medicine_uuid_cannot_be_used_as_product_identity() -> None:
    with pytest.raises(ValidationError):
        product_record(product_id=str(uuid4()))


@pytest.mark.parametrize("title", (None, "", "   "))
def test_nullable_or_blank_product_title_fails_adaptation_without_fabrication(
    title: str | None,
) -> None:
    record = product_record(product_title=title)

    with pytest.raises(PartnerProductAdaptationError, match="product_title"):
        adapt_partner_product(record, provenance())


def test_source_title_generic_name_and_requires_rx_are_preserved() -> None:
    result = adapt_partner_product(product_record(), provenance())

    assert result.mapped_product.display_name == "  Source Product Title  "
    assert result.source_record.product_generic_name == "Source Generic Name"
    assert result.source_record.product_requires_rx is True


def test_salt_is_preserved_verbatim_but_never_canonicalized() -> None:
    result = adapt_partner_product(product_record(), provenance())
    component = result.mapped_product.components[0]

    assert result.source_record.product_salt == "  Source Salt Text  "
    assert component.raw_component_name == "  Source Salt Text  "
    assert component.raw_salt_or_form == "  Source Salt Text  "
    assert component.role is ComponentRole.UNKNOWN
    assert component.mapping_status is ComponentMappingStatus.UNMAPPED
    assert component.normalized_candidate is None
    assert component.candidate_ingredient_identifiers == ()
    assert component.human_review_required is True


@pytest.mark.parametrize("salt", (None, "", "   "))
def test_null_or_blank_salt_remains_unresolved_and_incomplete(
    salt: str | None,
) -> None:
    result = adapt_partner_product(product_record(product_salt=salt), provenance())
    eligibility = evaluate_product_ddi_eligibility(result.mapped_product)

    assert result.source_record.product_salt == salt
    assert result.mapped_product.components == ()
    assert result.mapped_product.composition_status is ProductCompositionStatus.UNKNOWN
    assert eligibility.status is ProductDDIEligibilityStatus.INCOMPLETE_PRODUCT_COMPOSITION
    assert eligibility.resolved_ingredients == ()


def test_missing_salt_field_is_rejected_as_an_incomplete_source_record() -> None:
    payload = product_record().model_dump()
    del payload["product_salt"]

    with pytest.raises(ValidationError):
        PartnerProductRecord.model_validate(payload)


def test_nonblank_salt_does_not_make_product_ddi_eligible() -> None:
    result = adapt_partner_product(product_record(), provenance())
    eligibility = evaluate_product_ddi_eligibility(result.mapped_product)

    assert result.mapped_product.composition_status is ProductCompositionStatus.UNKNOWN
    assert result.mapped_product.review_required is True
    assert eligibility.status is ProductDDIEligibilityStatus.INCOMPLETE_PRODUCT_COMPOSITION
    assert eligibility.resolved_ingredients == ()


@pytest.mark.parametrize(
    ("source_status", "expected_status"),
    ((1, ProductStatus.ACTIVE), (0, ProductStatus.INACTIVE)),
)
def test_only_verified_partner_status_values_are_mapped(
    source_status: int,
    expected_status: ProductStatus,
) -> None:
    result = adapt_partner_product(
        product_record(product_status=source_status),
        provenance(),
    )

    assert result.mapped_product.status is expected_status


@pytest.mark.parametrize("invalid_status", (-1, 2, "1", None, True))
def test_unknown_or_malformed_partner_status_is_rejected(
    invalid_status: object,
) -> None:
    with pytest.raises(ValidationError):
        product_record(product_status=invalid_status)


def test_requires_rx_does_not_change_mapping_or_ddi_eligibility() -> None:
    required = adapt_partner_product(
        product_record(product_requires_rx=True),
        provenance(),
    )
    not_required = adapt_partner_product(
        product_record(product_requires_rx=False),
        provenance(),
    )
    unknown = adapt_partner_product(
        product_record(product_requires_rx=None),
        provenance(),
    )

    assert required.mapped_product == not_required.mapped_product == unknown.mapped_product
    assert {
        evaluate_product_ddi_eligibility(item.mapped_product).status
        for item in (required, not_required, unknown)
    } == {ProductDDIEligibilityStatus.INCOMPLETE_PRODUCT_COMPOSITION}


def test_generic_name_never_fills_missing_salt_or_creates_component() -> None:
    result = adapt_partner_product(
        product_record(
            product_generic_name="Generic Source Metadata",
            product_salt=None,
        ),
        provenance(),
    )

    assert result.source_record.product_generic_name == "Generic Source Metadata"
    assert result.mapped_product.components == ()


def test_partner_record_and_provenance_contracts_reject_unexpected_fields() -> None:
    record_payload = product_record().model_dump()
    record_payload["id"] = "transport-only-id"
    with pytest.raises(ValidationError):
        PartnerProductRecord.model_validate(record_payload)

    provenance_payload = provenance().model_dump()
    provenance_payload["extracted_at"] = "fabricated-time"
    with pytest.raises(ValidationError):
        PartnerProductProvenance.model_validate(provenance_payload)


def test_provenance_is_explicit_and_cannot_be_blank() -> None:
    with pytest.raises(ValidationError):
        PartnerProductProvenance(source_release_identifier="")

    result = adapt_partner_product(product_record(), provenance())
    assert result.mapped_product.provenance.source_release_identifier == (
        "test_partner_snapshot_1"
    )
    assert result.mapped_product.provenance.source_record_checksum == (
        "test-record-checksum"
    )


def test_authoritative_adapter_contains_no_storefront_prefix_logic() -> None:
    source = inspect.getsource(product_adapter)

    assert "prod-" not in source
    assert ".replace(" not in source
    result = adapt_partner_product(product_record(), provenance())
    assert result.mapped_product.product_identifier == "123"
