"""Focused forecasting-dataset tests; no estimator or model training."""

import ast
import csv
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from pydantic import ValidationError

from medsense_ai.forecasting import (
    FEATURE_NAMES, BuildConfig, ForecastExample, ForecastFeatures,
    InventoryContextStatus, Partition, build_dataset, example_id,
    observation_times, partition_at,
)
from medsense_ai.forecasting.contracts import FeatureLineage
from medsense_ai.forecasting.dataset import BuiltForecastDataset, ForecastIndex, TimedQuantity, weekly_completed_units
from medsense_ai.forecasting.io import verify_artifacts, write_artifacts
from medsense_ai.forecasting.qa import audit_dataset, feature_manifest, split_manifest, target_manifest
from medsense_ai.sales_data import (
    CommerceEvent, DataOrigin, InventoryMovement, Order, OrderItem, Product,
    SalesDataset, ValidationReport,
)
from tests.sales_data_fixtures import START, changed, envelope, manifest

FIRST = datetime(2025, 10, 27, tzinfo=timezone.utc)


def features(**updates):
    values = {name: 0 for name in FEATURE_NAMES}
    return ForecastFeatures(**{**values, **updates})


def accepted(data):
    return ValidationReport(validated_dataset=data)


def product_data(*movements):
    product = Product(dataset_id="dataset_001", source_record_ref="p", available_at=FIRST - timedelta(weeks=8),
                      product_id="product_001", selling_unit="unit")
    return SalesDataset(manifest=changed(manifest(), extracted_at=datetime(2026, 8, 31, 23, 59, 59, 999999, tzinfo=timezone.utc)),
                        products=(product,), inventory_movements=movements)


def movement(key, kind, at, hand):
    return InventoryMovement(dataset_id="dataset_001", source_record_ref=key, available_at=at,
                             movement_id=key, product_id="product_001", occurred_at=at,
                             movement_kind=kind, on_hand_delta=hand, reserved_delta=0)


def fake_example():
    return ForecastExample(
        example_id=example_id("dataset_001", "artificial_source", "product_001", FIRST),
        dataset_id="dataset_001", source_namespace="artificial_source", product_id="product_001",
        selling_unit="unit", observation_time=FIRST, partition=Partition.TRAIN,
        data_origin=DataOrigin.SYNTHETIC_DEVELOPMENT, features=features(),
        target_completed_units=0, target_start=FIRST, target_end=FIRST + timedelta(days=7),
        target_stockout_observed=False, target_stockout_seconds=0,
        target_full_week_stockout=False, inventory_context_status=InventoryContextStatus.OBSERVED,
        lineage=FeatureLineage(),
    )


def test_monday_schedule_and_exact_temporal_splits():
    times = observation_times()
    assert len(times) == 44 and times[0] == FIRST and times[-1] == datetime(2026, 8, 24, tzinfo=timezone.utc)
    assert all(t.weekday() == 0 and t.hour == t.minute == t.second == 0 for t in times)
    assert {part: sum(partition_at(t) == part for t in times) for part in Partition} == {
        Partition.TRAIN: 24, Partition.VALIDATION: 9, Partition.TEST: 11,
    }
    assert times[23] + timedelta(days=7) == times[24]
    assert times[32] + timedelta(days=7) == times[33]
    assert split_manifest()["random_split"] is False


def test_exact_19_feature_allowlist_has_no_ids_future_or_hidden_state():
    expected = (
        "completed_units_lag_1w", "completed_units_lag_2w", "completed_units_lag_4w", "completed_units_lag_8w",
        "completed_units_sum_4w", "completed_units_mean_4w", "completed_units_sum_8w", "completed_units_mean_8w",
        "nonzero_sales_weeks_8w", "cancellation_count_1w", "cancellation_count_4w", "available_stock_at_t",
        "stockout_seconds_1w", "stockout_seconds_4w", "receipt_quantity_4w", "iso_week_sin", "iso_week_cos",
        "month_sin", "month_cos",
    )
    assert FEATURE_NAMES == expected == tuple(feature_manifest()["feature_allowlist"])
    prohibited = {"product_id", "customer_id", "example_id", "target_stockout_seconds", "generator_seed", "lead_score"}
    assert prohibited.isdisjoint(FEATURE_NAMES)


def test_nested_windows_and_full_week_stockout_contracts_fail_closed():
    with pytest.raises(ValidationError, match="Nested completed"):
        features(completed_units_sum_4w=2, completed_units_sum_8w=1)
    with pytest.raises(ValidationError, match="Nested stockout"):
        features(stockout_seconds_1w=2, stockout_seconds_4w=1)
    row = fake_example()
    with pytest.raises(ValidationError, match="Full-week"):
        ForecastExample(**{**row.model_dump(), "target_full_week_stockout": True})


def test_inventory_replay_exact_t_stockout_and_future_receipt_exclusion():
    opening = movement("open", "opening_balance", START - timedelta(days=1), 5)
    exact = movement("at_t", "receipt", START, 5)
    zero = movement("zero", "adjustment", START + timedelta(days=1), -10)
    replenish = movement("replenish", "receipt", START + timedelta(days=2), 4)
    future = movement("future", "receipt", START + timedelta(days=4), 99)
    index = ForecastIndex(accepted(product_data(opening, exact, zero, replenish, future)))
    state = index.inventory_metrics("product_001", START, START + timedelta(microseconds=1), START)
    assert state[0] == 10  # opening plus valid receipt exactly at T
    target = index.inventory_metrics("product_001", START, START + timedelta(days=3), START + timedelta(days=3))
    assert target[0] == 10 and target[1] == 86400
    assert index.receipt_quantity("product_001", START - timedelta(days=28), START, START) == 0
    assert "future" not in target[2]


def test_lag_and_target_windows_are_half_open_and_enforce_available_at():
    rows = [
        TimedQuantity(FIRST - timedelta(days=7), FIRST - timedelta(days=7), 2, "o1", "e1"),
        TimedQuantity(FIRST - timedelta(days=14), FIRST - timedelta(days=14), 3, "o2", "e2"),
        TimedQuantity(FIRST, FIRST, 5, "o3", "e3"),
        TimedQuantity(FIRST - timedelta(days=1), FIRST + timedelta(seconds=1), 7, "late", "late"),
    ]
    weekly = weekly_completed_units(rows, FIRST, FIRST)
    assert weekly[:3] == (2, 3, 0)
    assert ForecastIndex._window(rows, FIRST, FIRST + timedelta(days=7), FIRST + timedelta(days=7))[0].event_id == "e3"
    assert ForecastIndex._blocked(rows, FIRST - timedelta(days=7), FIRST, FIRST)


def test_index_attributes_quantity_by_product_at_completion_not_order_creation():
    created, completed = FIRST - timedelta(days=2), FIRST + timedelta(days=1)
    product = Product(dataset_id="dataset_001", source_record_ref="p", available_at=created,
                      product_id="product_001", selling_unit="unit")
    order = Order(dataset_id="dataset_001", source_record_ref="o", available_at=created,
                  order_id="order_001", created_at=created)
    item = OrderItem(dataset_id="dataset_001", source_record_ref="i", available_at=created,
                     order_item_id="item_001", order_id="order_001", product_id="product_001",
                     quantity=4, line_subtotal_minor=10)
    event = CommerceEvent(dataset_id="dataset_001", source_record_ref="e", available_at=completed,
                          event_id="event_001", event_name="purchase_completed", occurred_at=completed,
                          order_id="order_001")
    data = SalesDataset(manifest=product_data().manifest, products=(product,), orders=(order,),
                        order_items=(item,), events=(event,))
    fact = ForecastIndex(accepted(data)).sales["product_001"][0]
    assert fact.occurred_at == completed and fact.quantity == 4 and fact.order_id == "order_001"


def test_missing_coverage_excludes_instead_of_fabricating_zero_history():
    data = product_data(movement("open", "opening_balance", FIRST - timedelta(weeks=8), 5))
    built = build_dataset(accepted(data), BuildConfig(product_limit=1))
    assert not built.examples and len(built.exclusions) == 44
    assert {row.reason for row in built.exclusions} == {"insufficient_historical_coverage"}


def test_zero_target_is_retained_and_audit_checks_identity_and_leakage():
    data = product_data()
    built = BuiltForecastDataset((fake_example(),), (), BuildConfig(product_limit=1), {})
    report, coverage, stockout, leakage = audit_dataset(built, accepted(data))
    assert report["target"]["zero_count"] == 1
    assert leakage["passed"] and leakage["target_uses_completion_time"]
    assert not stockout["target_stockout_fields_in_feature_allowlist"]
    assert coverage["passed"]


def test_serialization_is_reproducible_and_separates_features_from_censoring(tmp_path):
    data, built = product_data(), BuiltForecastDataset((fake_example(),), (), BuildConfig(product_limit=1), {})
    validated = accepted(data)
    report, coverage, stockout, leakage = audit_dataset(built, validated)
    provenance = dict(dataset_id=data.manifest.dataset_id, source_namespace=data.manifest.source_namespace,
                      data_origin=data.manifest.data_origin.value, source_extracted_at=data.manifest.extracted_at.isoformat())
    results = []
    for name in ("a", "b"):
        paths = tmp_path/name/"data", tmp_path/name/"artifacts"
        hashes = write_artifacts(built, validated, report, coverage, stockout, leakage, provenance, *paths)
        assert verify_artifacts(*paths)["sha256"] == hashes
        results.append(hashes)
    assert results[0] == results[1]
    with (tmp_path/"a/data/feature_matrix.csv").open(encoding="utf-8", newline="") as handle:
        assert csv.DictReader(handle).fieldnames == ["example_id", *FEATURE_NAMES]
    text = (tmp_path/"a/data/feature_matrix.csv").read_text(encoding="utf-8")
    assert "target_stockout" not in text and "product_id" not in text
    assert "target_stockout_seconds" in (tmp_path/"a/data/targets.csv").read_text(encoding="utf-8")


def test_target_manifest_never_claims_true_demand_or_reorder_quantity():
    target = target_manifest()
    assert target["target_version"] == "observed_completed_units_next_7d_v1"
    assert "observed completed-unit sales" in target["interpretation"]
    assert target["stockout_fields_are_evaluation_only"] is True


def test_forecasting_package_has_no_model_generator_partner_or_network_dependency():
    package = Path(__file__).resolve().parents[1]/"src/medsense_ai/forecasting"
    forbidden = {"sklearn", "sqlalchemy", "fastapi", "ddi", "requests", "httpx", "socket"}
    for path in package.glob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            names = [x.name for x in node.names] if isinstance(node, ast.Import) else [node.module or ""] if isinstance(node, ast.ImportFrom) else []
            assert not any(token in name for name in names for token in forbidden), path.name
            if isinstance(node, ast.Call):
                called = node.func.attr if isinstance(node.func, ast.Attribute) else node.func.id if isinstance(node.func, ast.Name) else ""
                assert called not in {"fit", "fit_transform", "train_test_split", "predict", "predict_proba"}, path.name
