"""Field/variant rules on artificial commerce records; no medical facts."""

from datetime import timedelta
import json

import pytest
from pydantic import ValidationError

from medsense_ai.sales_data import (
    CommerceEvent, DatasetManifest, EventName,
    Order, OrderItem, Product, SalesDataset, ValidationCode, validate_dataset,
)
from sales_data_fixtures import START, changed, coverage, dataset, envelope, event, manifest, movement


def test_manifest_roundtrip_and_immutable_currency_metadata():
    source = manifest()
    assert DatasetManifest.model_validate_json(source.model_dump_json()) == source
    assert source.extracted_at.isoformat().endswith("+00:00")
    assert json.loads(source.model_dump_json())["extracted_at"].endswith("Z")
    with pytest.raises(TypeError):
        source.currency_minor_units["PKR"] = -1
    with pytest.raises(ValidationError):
        source.dataset_id = "changed"


@pytest.mark.parametrize("updates", [
    {"contract_version": "future_contract"}, {"generation_seed": None},
    {"generation_config_hash": None}, {"generation_config_hash": "not-a-hash"},
    {"generation_seed": True}, {"generation_seed": 2**63},
    {"data_origin": "partner_real"}, {"data_origin": "public_external"},
    {"currency_minor_units": {"pkr": 2}}, {"currency_minor_units": {"PKR": -1}},
    {"currency_minor_units": {"PKR": 2.0}}, {"source_timezone": "../invalid"},
])
def test_invalid_manifest_provenance_and_metadata(updates):
    with pytest.raises(ValidationError):
        manifest(**updates)


@pytest.mark.parametrize("origin", ["partner_real", "public_external"])
def test_non_synthetic_manifests_have_no_generator_metadata(origin):
    assert manifest(data_origin=origin, generation_seed=None, generation_config_hash=None).data_origin == origin


@pytest.mark.parametrize("identifier", ["", " \t", "x" * 129, 12, True, "\ud800"])
def test_opaque_ids_reject_invalid_values(identifier):
    with pytest.raises(ValidationError):
        Product(**envelope("product_ref"), product_id=identifier, selling_unit="unit")


def test_ids_are_opaque_not_coerced_or_assumed_to_be_partner_keys():
    product = Product(**envelope("product_ref"), product_id="opaque:α/001", selling_unit="unit")
    assert product.product_id == "opaque:α/001"


@pytest.mark.parametrize("bad", [START.replace(tzinfo=None), "2026-06-01T00:00:00", "2026-06-01", 1780272000, "2026-06-01T00:00:00.1234567Z"])
def test_naive_numeric_and_excess_precision_timestamps_rejected(bad):
    with pytest.raises(ValidationError):
        event("product_viewed", bad)


def test_explicit_offset_normalizes_to_utc_without_source_zone_conversion():
    record = event("product_viewed", "2026-06-01T05:00:00+05:00")
    assert record.occurred_at == START
    assert record.model_dump(mode="json")["occurred_at"] == "2026-06-01T00:00:00Z"


@pytest.mark.parametrize("value", [-1, 1.0, "100", True, 2**63])
def test_money_is_nonnegative_strict_int64(value):
    with pytest.raises(ValidationError):
        OrderItem(**envelope("item_001"), order_item_id="item_001", order_id="order_001", product_id="product_001", quantity=1, line_subtotal_minor=value)


@pytest.mark.parametrize("value", [0, -1, 1.0, "2", True, 2**63])
def test_cart_quantity_is_positive_strict_int64(value):
    with pytest.raises(ValidationError):
        event("cart_item_added", quantity=value)


@pytest.mark.parametrize("name", list(EventName))
def test_each_event_variant_roundtrips(name):
    record = event(name)
    assert CommerceEvent.model_validate_json(record.model_dump_json()) == record


@pytest.mark.parametrize(("name", "field"), [
    ("product_viewed", "session_id"), ("product_viewed", "product_id"),
    ("cart_item_added", "session_id"), ("cart_item_added", "cart_id"),
    ("cart_item_added", "product_id"), ("cart_item_added", "quantity"),
    ("cart_item_removed", "session_id"), ("cart_item_removed", "cart_id"),
    ("cart_item_removed", "product_id"), ("cart_item_removed", "quantity"),
    ("order_created", "order_id"), ("purchase_completed", "order_id"), ("order_cancelled", "order_id"),
])
def test_event_required_fields(name, field):
    with pytest.raises(ValidationError):
        event(name, **{field: None})


@pytest.mark.parametrize(("name", "field", "value"), [
    ("product_viewed", "cart_id", "cart_001"), ("product_viewed", "quantity", 1),
    ("product_viewed", "order_id", "order_001"), ("cart_item_added", "order_id", "order_001"),
    ("cart_item_removed", "order_id", "order_001"),
    *[(name, field, value) for name in ("order_created", "purchase_completed", "order_cancelled") for field, value in (("product_id", "product_001"), ("quantity", 1))],
])
def test_event_incompatible_fields(name, field, value):
    with pytest.raises(ValidationError):
        event(name, **{field: value})


def test_anonymous_view_is_valid_and_no_identity_is_fabricated():
    assert event("product_viewed", customer_id=None).customer_id is None


@pytest.mark.parametrize("model", [manifest(), coverage(), dataset().customers[0], dataset().products[0], event("product_viewed"), dataset().orders[0], dataset().order_items[0], dataset().inventory_movements[0]])
def test_unexpected_fields_are_rejected_for_all_entities(model):
    with pytest.raises(ValidationError):
        changed(model, invented_field="forbidden")


def test_order_money_fields_must_be_jointly_present():
    with pytest.raises(ValidationError):
        Order(**envelope("order_001"), order_id="order_001", created_at=START, currency="PKR")
    assert Order(**envelope("order_001"), order_id="order_001", created_at=START).currency is None


@pytest.mark.parametrize(("kind", "hand", "reserved"), [
    ("opening_balance", -1, 0), ("receipt", 0, 0), ("reserve", 1, 2),
    ("release", 0, 2), ("fulfill", -1, -2), ("adjustment", 0, 0),
])
def test_inventory_variant_delta_rules(kind, hand, reserved):
    with pytest.raises(ValidationError):
        movement(kind, START, hand, reserved)


def test_inventory_conditional_links_and_time():
    with pytest.raises(ValidationError):
        movement("reserve", START, 0, 1, order_item_id=None)
    with pytest.raises(ValidationError):
        movement("receipt", START, 1, 0, trigger_event_id="order_created")
    with pytest.raises(ValidationError):
        movement("receipt", START, 1, 0, available_at=START - timedelta(seconds=1))


def test_structural_batch_failures_are_sanitized_and_machine_readable(caplog):
    raw = dataset().model_dump()
    raw["events"][0]["occurred_at"] = "private-payload-do-not-log"
    result = validate_dataset(raw)
    assert result.status == "invalid"
    assert result.issues[0].code == ValidationCode.INVALID_TIMESTAMP
    assert result.validated_dataset is None
    assert "private-payload" not in caplog.text
    assert "private-payload" not in result.model_dump_json()


def test_revalidation_catches_model_copy_bypasses():
    unsafe = event("cart_item_added").model_copy(update={"quantity": -10})
    raw = {"manifest": manifest(), "events": [unsafe]}
    result = validate_dataset(raw)
    assert not result.is_valid
    assert result.issues[0].code == ValidationCode.INVALID_RECORD


def test_pydantic_json_schemas_are_available_without_partner_types():
    schema = SalesDataset.model_json_schema()
    assert schema["additionalProperties"] is False
    assert "InventoryMovement" in schema["$defs"]
