"""Small hand-authored non-medical canonical histories for independent calculations."""

from datetime import datetime, timedelta, timezone

from medsense_ai.sales_data import CommerceEvent, CoverageInterval, CoverageStream, Customer, DatasetManifest, Order, Product, SalesDataset, ValidationContext, validate_dataset
from medsense_ai.lead_scoring.splits import mondays

T = datetime(2026, 6, 1, tzinfo=timezone.utc)
START = datetime(2025, 9, 1, tzinfo=timezone.utc)
FREEZE = datetime(2026, 9, 1, tzinfo=timezone.utc) - timedelta(microseconds=1)
DAY = timedelta(days=1)
TICK = timedelta(microseconds=1)


def changed(row, **updates):
    return type(row).model_validate({**row.model_dump(), **updates})


def envelope(key, at):
    return dict(dataset_id="lead_fixture", source_record_ref=key, available_at=at)


def behavior(name, at, key, **updates):
    values = dict(**envelope(key, at), event_id=key, event_name=name, occurred_at=at, customer_id="customer_1", session_id="session_1", product_id="product_1")
    if name != "product_viewed":
        values.update(cart_id="cart_1", quantity=1)
    return CommerceEvent(**{**values, **updates})


def dataset(order_times=None, events=()):
    # Each tuple is (creation, terminal occurrence, terminal kind).
    if order_times is None:
        order_times = [(T-DAY*21, T-DAY*20, "purchase_completed"), (T+DAY*10, T+DAY*12, "purchase_completed")]
    orders, rows = [], list(events)
    for i, (created, terminal, kind) in enumerate(order_times):
        key = f"order_{i}"
        orders.append(Order(**envelope(key, created), order_id=key, customer_id="customer_1", created_at=created))
        for event_name, at in [("order_created", created), *(([(kind, terminal)]) if terminal else [])]:
            event_key = key + "_" + event_name
            rows.append(CommerceEvent(**envelope(event_key, at), event_id=event_key, event_name=event_name, occurred_at=at, customer_id="customer_1", order_id=key))
    manifest = DatasetManifest(dataset_id="lead_fixture", contract_version="sales_contract_v1", source_namespace="abstract_fixture", data_origin="synthetic_development", producer_version="hand_fixture", extracted_at=FREEZE, source_timezone="UTC", currency_minor_units={}, generation_seed=1, generation_config_hash="a"*64, completion_policy_version="fixture_complete", session_policy_version="fixture_sessions", identity_policy_version="fixture_identity")
    checkpoints = sorted(set((*mondays(START, FREEZE), datetime(2026,4,1,tzinfo=timezone.utc), T+DAY*30, FREEZE)))
    coverage = tuple(CoverageInterval(dataset_id="lead_fixture", stream=stream, interval_start=START, interval_end=at, known_at=at, coverage_status="complete") for stream in CoverageStream for at in checkpoints)
    return SalesDataset(manifest=manifest, coverage=coverage, customers=(Customer(**envelope("customer_1", START), customer_id="customer_1", first_seen_at=START),), products=tuple(Product(**envelope(key, START), product_id=key, selling_unit="unit") for key in ("product_1", "product_2")), events=tuple(rows), orders=tuple(orders))


def accepted(data):
    result = validate_dataset(data, context=ValidationContext(replay_carts=False))
    assert result.is_valid, result.issues
    return result
