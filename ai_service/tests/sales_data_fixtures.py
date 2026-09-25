"""Tiny, explicitly artificial non-medical canonical fixtures. Not partner data."""

from datetime import datetime, timedelta, timezone

from medsense_ai.sales_data import (
    CommerceEvent, CoverageInterval, CoverageStream, Customer, DatasetManifest,
    EventName, InventoryMovement, Order, OrderItem, Product, SalesDataset,
    ValidationContext,
)

START = datetime(2026, 6, 1, tzinfo=timezone.utc)
FREEZE = START + timedelta(days=2)


def changed(model, **updates):
    """Produce a newly validated object, never bypass Pydantic via model_copy."""
    return type(model).model_validate({**model.model_dump(), **updates})


def envelope(key, when=START):
    return dict(dataset_id="dataset_001", source_record_ref=key, available_at=when)


def manifest(**updates):
    values = dict(
        dataset_id="dataset_001", contract_version="sales_contract_v1",
        source_namespace="artificial_source", data_origin="synthetic_development",
        producer_version="structural_fixture_v1", extracted_at=FREEZE,
        source_timezone="UTC", currency_minor_units={"PKR": 2},
        completion_policy_version="artificial_completion_v1",
        identity_policy_version="artificial_identity_v1",
        session_policy_version="artificial_session_v1",
        generation_seed=1, generation_config_hash="a" * 64,
    )
    return DatasetManifest(**{**values, **updates})


def coverage(stream=CoverageStream.PRODUCT_VIEWED, **updates):
    return CoverageInterval(**{
        "dataset_id": "dataset_001", "stream": stream,
        "interval_start": START, "interval_end": FREEZE,
        "coverage_status": "complete", "known_at": FREEZE, **updates,
    })


def event(name, at=START, **updates):
    values = dict(
        **envelope(name, at), event_id=name, event_name=name, occurred_at=at,
        customer_id="customer_001", session_id="session_001",
    )
    if name == EventName.PRODUCT_VIEWED:
        values.update(product_id="product_001")
    elif name in (EventName.CART_ITEM_ADDED, EventName.CART_ITEM_REMOVED):
        values.update(cart_id="cart_001", product_id="product_001", quantity=1)
    else:
        values.update(cart_id="cart_001", order_id="order_001")
    return CommerceEvent(**{**values, **updates})


def movement(kind, at, hand, reserved, **updates):
    values = dict(
        **envelope(kind, at), movement_id=kind, movement_kind=kind,
        product_id="product_001", occurred_at=at,
        on_hand_delta=hand, reserved_delta=reserved,
    )
    triggers = {"reserve": "order_created", "fulfill": "purchase_completed", "release": "order_cancelled"}
    if kind in triggers:
        values.update(order_item_id="item_001", trigger_event_id=triggers[kind])
    return InventoryMovement(**{**values, **updates})


def dataset(terminal=EventName.PURCHASE_COMPLETED):
    created, completed = START + timedelta(hours=4), START + timedelta(hours=5)
    events = [
        event("product_viewed", START + timedelta(hours=1)),
        event("cart_item_added", START + timedelta(hours=2), quantity=3),
        event("cart_item_removed", START + timedelta(hours=3)),
        event("order_created", created),
    ]
    movements = [
        movement("opening_balance", START, 6, 0),
        movement("receipt", START + timedelta(hours=1), 3, 0),
        movement("reserve", created, 0, 2),
    ]
    if terminal is not None:
        events.append(event(terminal, completed))
        movements.append(movement("fulfill" if terminal == EventName.PURCHASE_COMPLETED else "release", completed, -2 if terminal == EventName.PURCHASE_COMPLETED else 0, -2))
    return SalesDataset(
        manifest=manifest(), coverage=tuple(coverage(stream) for stream in CoverageStream),
        customers=(Customer(**envelope("customer_001"), customer_id="customer_001", first_seen_at=START),),
        products=(Product(**envelope("product_001"), product_id="product_001", selling_unit="unit", merchandising_group="group_A"),),
        events=tuple(events),
        orders=(Order(**envelope("order_001", created), order_id="order_001", customer_id="customer_001", created_at=created, session_id="session_001", cart_id="cart_001", currency="PKR", item_subtotal_minor=500),),
        order_items=(OrderItem(**envelope("item_001", created), order_item_id="item_001", order_id="order_001", product_id="product_001", quantity=2, line_subtotal_minor=500),),
        inventory_movements=tuple(movements),
    )


def context(**updates):
    return ValidationContext(**{"cart_history_start": START, "require_order_items": True, "require_inventory": True, **updates})


def replace_record(data, collection, index=0, **updates):
    records = list(getattr(data, collection))
    records[index] = changed(records[index], **updates)
    return changed(data, **{collection: records})
