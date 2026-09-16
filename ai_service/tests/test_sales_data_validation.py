"""Relationships and replay of small, hand-checkable artificial commerce batches."""

from datetime import timedelta

import pytest

from medsense_ai.sales_data import (
    CoverageStream, EventName, SalesDataset, ValidationCode, ValidationContext,
    validate_dataset,
)
from sales_data_fixtures import (
    START, FREEZE, changed, context, coverage, dataset, event, manifest,
    movement, replace_record,
)


def assert_issue(data, code, options=None):
    result = validate_dataset(data, context=options or context())
    assert not result.is_valid
    assert result.validated_dataset is None
    assert code in {issue.code for issue in result.issues}, result.issues
    assert result.invalidated_streams
    return result


@pytest.mark.parametrize("terminal", [EventName.PURCHASE_COMPLETED, EventName.ORDER_CANCELLED, None])
def test_valid_create_complete_cancel_or_pending_and_inventory(terminal):
    result = validate_dataset(dataset(terminal), context=context())
    assert result.is_valid, result.issues
    assert result.status == "valid"
    assert not result.invalidated_streams


@pytest.mark.parametrize(("collection", "field"), [
    ("events", "product_id"), ("events", "customer_id"),
    ("orders", "customer_id"), ("order_items", "order_id"),
    ("order_items", "product_id"), ("inventory_movements", "product_id"),
])
def test_orphan_foreign_keys(collection, field):
    assert_issue(replace_record(dataset(), collection, **{field: "missing_reference"}), ValidationCode.UNRESOLVED_REFERENCE)


def test_orphan_lifecycle_order_and_inventory_item_trigger():
    assert_issue(replace_record(dataset(), "events", 3, order_id="missing_order"), ValidationCode.UNRESOLVED_REFERENCE)
    assert_issue(replace_record(dataset(), "inventory_movements", 2, order_item_id="missing_item"), ValidationCode.UNRESOLVED_REFERENCE)
    assert_issue(replace_record(dataset(), "inventory_movements", 2, trigger_event_id="missing_event"), ValidationCode.UNRESOLVED_REFERENCE)


@pytest.mark.parametrize("collection", ["customers", "products", "events", "orders", "order_items", "inventory_movements", "coverage"])
def test_dataset_boundaries_are_enforced(collection):
    assert_issue(replace_record(dataset(), collection, dataset_id="other_dataset"), ValidationCode.DATASET_MISMATCH)


def test_identical_duplicates_are_removed_idempotently():
    data = dataset()
    doubled = changed(data, **{name: getattr(data, name) * 2 for name in ("customers", "products", "events", "orders", "order_items", "inventory_movements", "coverage")})
    first = validate_dataset(data, context=context())
    result = validate_dataset(doubled, context=context())
    assert result.is_valid, result.issues
    assert result.validated_dataset == first.validated_dataset
    assert result.identical_duplicate_count == 24


@pytest.mark.parametrize("collection", ["customers", "products", "events", "orders", "order_items", "inventory_movements"])
def test_conflicting_duplicate_facts_never_win_by_order(collection):
    data = dataset()
    existing = getattr(data, collection)
    conflicting = changed(existing[0], source_record_ref="conflicting_ref")
    for records in (existing + (conflicting,), (conflicting,) + existing):
        result = assert_issue(changed(data, **{collection: records}), ValidationCode.CONFLICTING_DUPLICATE)
        assert result.status == "invalid"


def test_missing_creation_with_lifecycle_profile_and_counts_only_feed():
    data = dataset()
    without = changed(data, inventory_movements=(), events=tuple(e for e in data.events if e.event_name != EventName.ORDER_CREATED))
    assert_issue(without, ValidationCode.LIFECYCLE_CONFLICT)
    counts_only = SalesDataset(manifest=manifest(), customers=data.customers, orders=(changed(data.orders[0], cart_id=None, session_id=None, currency=None, item_subtotal_minor=None),))
    result = validate_dataset(counts_only, context=ValidationContext(require_lifecycle=False))
    assert result.is_valid, result.issues
    # Structural validity does not manufacture telemetry coverage.
    assert result.validated_dataset.coverage == ()


def test_creation_timestamp_and_terminal_chronology():
    assert_issue(replace_record(dataset(), "events", 3, occurred_at=START + timedelta(hours=3)), ValidationCode.LIFECYCLE_CONFLICT)
    assert_issue(replace_record(dataset(), "events", 4, occurred_at=START + timedelta(hours=1)), ValidationCode.LIFECYCLE_CONFLICT)


def test_two_distinct_terminal_events_are_not_idempotent():
    data = dataset()
    for extra in (event("order_cancelled", START + timedelta(hours=6)), changed(data.events[-1], event_id="another_completion")):
        assert_issue(changed(data, events=data.events + (extra,)), ValidationCode.LIFECYCLE_CONFLICT)


def test_two_creation_events_are_invalid_even_if_times_match():
    data = dataset()
    extra = changed(data.events[3], event_id="another_creation")
    assert_issue(changed(data, events=data.events + (extra,)), ValidationCode.LIFECYCLE_CONFLICT)


@pytest.mark.parametrize(("field", "value"), [("customer_id", None), ("cart_id", None), ("session_id", "different_session")])
def test_lifecycle_references_match_immutable_order(field, value):
    assert_issue(replace_record(dataset(), "events", 4, **{field: value}), ValidationCode.REFERENCE_MISMATCH)


def test_completed_event_requires_declared_policy():
    data = dataset()
    assert_issue(changed(data, manifest=changed(data.manifest, completion_policy_version=None)), ValidationCode.MISSING_POLICY)


def test_unknown_source_lifecycle_state_is_not_completed():
    raw = dataset().model_dump()
    raw["events"][-1]["event_name"] = "paid_maybe"
    assert_issue(raw, ValidationCode.INVALID_RECORD)


def test_customer_reference_cannot_predate_customer_existence():
    assert_issue(replace_record(dataset(), "customers", first_seen_at=START + timedelta(hours=2), available_at=START + timedelta(hours=2)), ValidationCode.INVALID_TIMESTAMP)


def test_customer_is_not_fabricated_for_anonymous_cart_profile():
    data = SalesDataset(manifest=manifest(), products=dataset().products, events=(event("cart_item_added", customer_id=None),), coverage=tuple(coverage(stream) for stream in CoverageStream))
    assert_issue(data, ValidationCode.MISSING_REQUIRED_FIELD, ValidationContext(cart_history_start=START))
    result = validate_dataset(data, context=ValidationContext(cart_history_start=START, require_authenticated_carts=False))
    assert result.is_valid, result.issues
    assert result.validated_dataset.events[0].customer_id is None


def test_valid_cart_removals_and_remove_too_many():
    assert validate_dataset(dataset(), context=context()).is_valid
    assert_issue(replace_record(dataset(), "events", 2, quantity=4), ValidationCode.CART_CONFLICT)


def test_same_time_cart_add_remove_is_explicitly_ambiguous():
    assert_issue(replace_record(dataset(), "events", 2, occurred_at=START + timedelta(hours=2)), ValidationCode.AMBIGUOUS_REPLAY)


def test_cart_tie_cannot_hide_intermediate_quantity_overflow():
    data = dataset()
    at = START + timedelta(hours=1)
    data = SalesDataset(
        manifest=data.manifest, coverage=data.coverage, products=data.products, customers=data.customers,
        events=(
            event("cart_item_added", START, event_id="initial_add", quantity=2**63 - 1),
            event("cart_item_added", at, event_id="extra_add"),
            event("cart_item_removed", at),
        ),
    )
    assert_issue(data, ValidationCode.AMBIGUOUS_REPLAY, ValidationContext(cart_history_start=START))


def test_cart_missing_history_or_telemetry_does_not_start_at_zero():
    result = assert_issue(dataset(), ValidationCode.INSUFFICIENT_COVERAGE, context(cart_history_start=None))
    assert result.status == "incomplete"
    data = dataset()
    rows = tuple(row for row in data.coverage if row.stream != CoverageStream.CART_ITEM_ADDED)
    result = assert_issue(changed(data, coverage=rows), ValidationCode.INSUFFICIENT_COVERAGE)
    assert result.status == "incomplete"


def test_future_cart_state_cannot_change_placement_and_cart_is_closed():
    data = dataset()
    extra = event("cart_item_added", START + timedelta(hours=6), event_id="late_add", quantity=10)
    assert_issue(changed(data, events=data.events + (extra,)), ValidationCode.CART_CONFLICT)
    assert_issue(replace_record(data, "order_items", quantity=1), ValidationCode.CART_CONFLICT)


def test_duplicate_cart_placement_is_invalid():
    data = dataset()
    second = changed(data.orders[0], order_id="order_002", source_record_ref="order_002")
    second_create = changed(data.events[3], order_id="order_002", event_id="create_002")
    assert_issue(changed(data, orders=data.orders + (second,), events=data.events + (second_create,)), ValidationCode.CART_CONFLICT)


def test_order_amounts_are_checked_only_with_complete_item_coverage():
    assert_issue(replace_record(dataset(), "orders", item_subtotal_minor=499), ValidationCode.AMOUNT_MISMATCH)
    data = dataset()
    without_items = changed(data, order_items=(), inventory_movements=(), coverage=tuple(row for row in data.coverage if row.stream != CoverageStream.ORDER_ITEMS))
    result = assert_issue(without_items, ValidationCode.INSUFFICIENT_COVERAGE, context(require_inventory=False))
    assert result.status == "incomplete"
    assert all(issue.code != ValidationCode.AMOUNT_MISMATCH for issue in result.issues)


def test_order_items_require_currency_and_declared_currency_map():
    assert_issue(replace_record(dataset(), "orders", currency=None, item_subtotal_minor=None), ValidationCode.MISSING_REQUIRED_FIELD)
    assert_issue(replace_record(dataset(), "orders", currency="USD"), ValidationCode.REFERENCE_MISMATCH)


def test_item_fact_time_and_export_availability_are_validated():
    assert_issue(replace_record(dataset(), "order_items", available_at=START), ValidationCode.INVALID_TIMESTAMP)
    assert_issue(replace_record(dataset(), "products", available_at=FREEZE + timedelta(seconds=1)), ValidationCode.INVALID_TIMESTAMP)
    assert_issue(replace_record(dataset(), "coverage", known_at=FREEZE + timedelta(seconds=1)), ValidationCode.INVALID_TIMESTAMP)


def test_conflicting_batch_coverage_invalidates_downstream_use():
    data = dataset()
    conflict = coverage(coverage_status="partial", reason_code="source_outage")
    result = assert_issue(changed(data, coverage=data.coverage + (conflict,)), ValidationCode.COVERAGE_CONFLICT)
    assert CoverageStream.PRODUCT_VIEWED in result.invalidated_streams


def test_inventory_opening_receipt_adjustment_and_release_are_conserved():
    data = dataset(EventName.ORDER_CANCELLED)
    extra = movement("adjustment", START + timedelta(hours=7), -2, 0)
    result = validate_dataset(changed(data, inventory_movements=data.inventory_movements + (extra,)), context=context())
    assert result.is_valid, result.issues


def test_missing_or_duplicate_opening_balance():
    data = dataset()
    assert_issue(changed(data, inventory_movements=data.inventory_movements[1:]), ValidationCode.INVENTORY_CONSERVATION_FAILURE)
    duplicate = changed(data.inventory_movements[0], movement_id="opening_002")
    assert_issue(changed(data, inventory_movements=data.inventory_movements + (duplicate,)), ValidationCode.INVENTORY_CONSERVATION_FAILURE)


def test_stockout_and_adjustment_below_reservations_fail():
    data = dataset()
    data = changed(data, inventory_movements=tuple(m for m in data.inventory_movements if m.movement_kind != "receipt"))
    assert_issue(replace_record(data, "inventory_movements", on_hand_delta=1), ValidationCode.INVENTORY_CONSERVATION_FAILURE)
    data = dataset(None)
    extra = movement("adjustment", START + timedelta(hours=5), -8, 0)
    assert_issue(changed(data, inventory_movements=data.inventory_movements + (extra,)), ValidationCode.INVENTORY_CONSERVATION_FAILURE)


def test_negative_reserved_and_repeated_release_cannot_be_hidden():
    data = dataset(EventName.ORDER_CANCELLED)
    extra = changed(data.inventory_movements[-1], movement_id="release_again")
    assert_issue(changed(data, inventory_movements=data.inventory_movements + (extra,)), ValidationCode.INVENTORY_CONSERVATION_FAILURE)
    assert_issue(changed(data, inventory_movements=tuple(m for m in data.inventory_movements if m.movement_kind != "reserve")), ValidationCode.INVENTORY_CONSERVATION_FAILURE)


@pytest.mark.parametrize("updates", [
    {"reserved_delta": 1}, {"trigger_event_id": "purchase_completed"},
    {"occurred_at": START + timedelta(hours=3)},
])
def test_movement_quantity_and_lifecycle_correlation(updates):
    assert_issue(replace_record(dataset(), "inventory_movements", 2, **updates), ValidationCode.INVENTORY_CONSERVATION_FAILURE)


def test_transactional_product_must_match_item():
    data = dataset()
    second_product = changed(data.products[0], product_id="product_002", source_record_ref="product_002")
    data = changed(data, products=data.products + (second_product,))
    data = replace_record(data, "inventory_movements", 2, product_id="product_002")
    assert_issue(data, ValidationCode.INVENTORY_CONSERVATION_FAILURE)


def test_inventory_missing_coverage_is_not_validated_as_zero_demand():
    data = dataset()
    result = assert_issue(changed(data, coverage=tuple(row for row in data.coverage if row.stream != CoverageStream.INVENTORY_MOVEMENTS)), ValidationCode.INSUFFICIENT_COVERAGE)
    assert result.status == "incomplete"


def test_receipt_reservation_tie_fails_when_stock_order_is_unknown():
    data = dataset()
    data = replace_record(data, "inventory_movements", 0, on_hand_delta=0)
    reserve_time = data.orders[0].created_at
    data = replace_record(data, "inventory_movements", 1, occurred_at=reserve_time, available_at=reserve_time)
    assert_issue(data, ValidationCode.AMBIGUOUS_REPLAY)


def test_harmless_simultaneous_inventory_transactions_are_order_independent():
    data = dataset()
    reserve_time = data.orders[0].created_at
    data = replace_record(data, "inventory_movements", 1, occurred_at=reserve_time, available_at=reserve_time)
    forward = validate_dataset(data, context=context())
    reverse = validate_dataset(changed(data, inventory_movements=tuple(reversed(data.inventory_movements))), context=context())
    assert forward.is_valid and reverse.is_valid
    assert forward.validated_dataset == reverse.validated_dataset


def test_same_time_reserve_then_fulfill_uses_causal_links():
    data = dataset()
    when = data.orders[0].created_at
    data = replace_record(data, "events", 4, occurred_at=when)
    data = replace_record(data, "inventory_movements", 3, occurred_at=when)
    result = validate_dataset(data, context=context())
    assert result.is_valid, result.issues


def test_opening_after_movements_fails_instead_of_reordering_history():
    assert_issue(replace_record(dataset(), "inventory_movements", 0, occurred_at=START + timedelta(hours=2), available_at=START + timedelta(hours=2)), ValidationCode.INVENTORY_CONSERVATION_FAILURE)


def test_atomic_multi_item_order_reservations_are_not_individually_accepted():
    data = dataset(None)
    extra_item = changed(data.order_items[0], order_item_id="item_002", source_record_ref="item_002")
    extra_reserve = changed(data.inventory_movements[-1], movement_id="reserve_002", order_item_id="item_002")
    data = changed(data, order_items=data.order_items + (extra_item,), inventory_movements=(changed(data.inventory_movements[0], on_hand_delta=3), data.inventory_movements[-1], extra_reserve))
    data = replace_record(data, "orders", item_subtotal_minor=1000)
    data = replace_record(data, "events", 1, quantity=5)  # 5 - 1 = 4 units at placement.
    assert_issue(data, ValidationCode.INVENTORY_CONSERVATION_FAILURE)


def test_profile_precision_error_is_a_structured_failure():
    data = dataset()
    odd = START + timedelta(microseconds=1)
    data = replace_record(data, "coverage", interval_start=odd)
    assert_issue(data, ValidationCode.INVALID_TIMESTAMP, context(coverage_resolution=timedelta(seconds=1)))
