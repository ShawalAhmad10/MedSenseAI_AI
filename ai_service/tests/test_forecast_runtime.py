"""Focused canonical forecast-runtime and fail-closed integration-contract tests."""

import ast
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from pydantic import ValidationError

from medsense_ai.forecasting import (
    ForecastIndex, ForecastRuntime, ForecastStatus, build_feature_snapshot,
)
from medsense_ai.forecasting.dataset import TimedQuantity
from medsense_ai.forecasting.model.bundle import LoadedBundle
from medsense_ai.forecasting.runtime_contracts import ForecastResult, STOCKOUT_LIMITATION
from medsense_ai.sales_data import (
    CommerceEvent, CoverageInterval, CoverageStream, InventoryMovement, Order, OrderItem,
    Product, SalesDataset, ValidationReport,
)
from tests.sales_data_fixtures import changed, manifest

T = datetime(2026, 6, 1, tzinfo=timezone.utc)
HISTORY = T - timedelta(weeks=8)


def record_base(key, available_at):
    return {"dataset_id": "dataset_001", "source_record_ref": key, "available_at": available_at}


def canonical_data(*, coverage_start=HISTORY, inventory=True):
    product = Product(**record_base("p1", HISTORY), product_id="product_001", selling_unit="unit")
    future_product = Product(**record_base("p2", T + timedelta(days=1)), product_id="product_002", selling_unit="pack")
    created, completed = T - timedelta(days=4), T - timedelta(days=3)
    order = Order(**record_base("o1", created), order_id="order_001", created_at=created)
    item = OrderItem(**record_base("i1", created), order_item_id="item_001", order_id="order_001",
                     product_id="product_001", quantity=4, line_subtotal_minor=100)
    event = CommerceEvent(**record_base("e1", completed), event_id="event_001",
                          event_name="purchase_completed", occurred_at=completed, order_id="order_001")
    streams = (
        CoverageStream.PRODUCTS, CoverageStream.ORDERS, CoverageStream.ORDER_ITEMS,
        CoverageStream.PURCHASE_COMPLETED, CoverageStream.ORDER_CANCELLED,
        CoverageStream.INVENTORY_MOVEMENTS,
    )
    coverage = tuple(CoverageInterval(
        dataset_id="dataset_001", stream=stream, interval_start=coverage_start,
        interval_end=T, known_at=T, coverage_status="complete",
    ) for stream in streams)
    movements = ()
    if inventory:
        movements = (InventoryMovement(
            **record_base("opening", HISTORY), movement_id="opening", product_id="product_001",
            occurred_at=HISTORY, movement_kind="opening_balance", on_hand_delta=20, reserved_delta=0,
        ),)
    return SalesDataset(
        manifest=changed(manifest(), extracted_at=T), coverage=coverage,
        products=(product, future_product), events=(event,), orders=(order,),
        order_items=(item,), inventory_movements=movements,
    )


def validated(**kwargs):
    return ValidationReport(validated_dataset=canonical_data(**kwargs))


def persistence_bundle():
    return LoadedBundle("persistence", None, {
        "model_version": "med-sales-forecast-1.0.0",
        "feature_version": "forecast_features_v1",
        "target_version": "observed_completed_units_next_7d_v1",
    }, "a" * 64)


def runtime(**kwargs):
    return ForecastRuntime(ForecastIndex(validated(**kwargs)), persistence_bundle())


def request(product="product_001", at=T, namespace="artificial_source"):
    return {"source_namespace": namespace, "product_id": product, "observation_time": at}


def test_valid_forecast_reuses_frozen_builder_and_persistence(monkeypatch):
    import medsense_ai.forecasting.runtime as runtime_module

    calls = []
    original = runtime_module.build_feature_snapshot

    def tracked(*args):
        calls.append(args[1:])
        return original(*args)

    monkeypatch.setattr(runtime_module, "build_feature_snapshot", tracked)
    service = runtime()
    snapshot, reason = build_feature_snapshot(service.index, "artificial_source", "product_001", T)
    result = service.forecast(request())
    assert reason is None and calls == [("artificial_source", "product_001", T)]
    assert result.status == ForecastStatus.FORECASTED
    assert result.predicted_completed_units_next_7d == snapshot.features.completed_units_lag_1w == 4
    assert result.horizon_start == T and result.horizon_end == T + timedelta(days=7)
    assert result.selling_unit == "unit" and result.stockout_limitation == STOCKOUT_LIMITATION


@pytest.mark.parametrize("at", [T + timedelta(days=1), T + timedelta(hours=1), T.replace(tzinfo=None)])
def test_observation_must_be_exact_monday_midnight_utc(at):
    result = runtime().forecast(request(at=at))
    assert result.status == ForecastStatus.INVALID_INPUT
    assert result.predicted_completed_units_next_7d is None


def test_unknown_product_product_not_known_and_namespace_mismatch_are_explicit():
    service = runtime()
    unknown = service.forecast(request(product="product_999"))
    not_known = service.forecast(request(product="product_002"))
    mismatch = service.forecast(request(namespace="another_source"))
    assert (unknown.status, unknown.reason_code) == (ForecastStatus.OUT_OF_SCOPE, "unknown_product")
    assert (not_known.status, not_known.reason_code) == (ForecastStatus.PRODUCT_NOT_KNOWN, "product_not_known_at_t")
    assert (mismatch.status, mismatch.reason_code) == (ForecastStatus.OUT_OF_SCOPE, "source_namespace_mismatch")


def test_insufficient_history_and_missing_inventory_fail_closed():
    history = runtime(coverage_start=HISTORY + timedelta(weeks=1)).forecast(request())
    inventory = runtime(inventory=False).forecast(request())
    assert (history.status, history.reason_code) == (ForecastStatus.INSUFFICIENT_HISTORY, "insufficient_historical_coverage")
    assert (inventory.status, inventory.reason_code) == (ForecastStatus.INSUFFICIENT_COVERAGE, "insufficient_pre_t_inventory")
    assert history.predicted_completed_units_next_7d is inventory.predicted_completed_units_next_7d is None


def test_future_target_facts_and_stockout_metadata_are_not_consumed():
    service = runtime()
    before = service.forecast(request())
    service.index.sales["product_001"].append(TimedQuantity(
        occurred_at=T + timedelta(days=1), available_at=T + timedelta(days=1), quantity=999,
        order_id="future_order", event_id="future_event",
    ))
    service.index.sales["product_001"].sort(key=lambda row: row.occurred_at)
    after = service.forecast(request())
    assert before == after
    runtime_source = (Path(__file__).resolve().parents[1] / "src/medsense_ai/forecasting/runtime.py").read_text(encoding="utf-8")
    assert "target_stockout" not in runtime_source and "target_end" not in runtime_source


def test_model_unavailable_and_all_nonforecasted_results_have_no_number():
    service = ForecastRuntime(ForecastIndex(validated()), None, "bundle_verification_failed")
    unavailable = service.forecast(request())
    failures = [
        unavailable,
        runtime().forecast(request(product="product_999")),
        runtime().forecast(request(product="product_002")),
        runtime().forecast(request(at=T + timedelta(days=1))),
    ]
    assert unavailable.status == ForecastStatus.MODEL_UNAVAILABLE
    assert all(row.status != ForecastStatus.FORECASTED and row.predicted_completed_units_next_7d is None for row in failures)
    with pytest.raises(ValidationError):
        ForecastResult(status=ForecastStatus.MODEL_UNAVAILABLE, reason_code="bad", predicted_completed_units_next_7d=1)


def test_corrupt_or_incompatible_bundle_is_reported_without_fallback(monkeypatch, tmp_path):
    import medsense_ai.forecasting.runtime as runtime_module

    for message in ("checksum mismatch", "feature/target/model version mismatch"):
        monkeypatch.setattr(runtime_module, "load_bundle", lambda *_args, text=message: (_ for _ in ()).throw(
            runtime_module.BundleError(text)))
        service = ForecastRuntime.from_validated(validated(), tmp_path, "b" * 64)
        result = service.forecast(request())
        assert result.status == ForecastStatus.MODEL_UNAVAILABLE
        assert result.reason_code == "bundle_verification_failed"


def test_repeated_and_batch_inference_are_deterministic_with_partial_failure_isolation():
    service = runtime()
    assert service.forecast(request()) == service.forecast(request())
    batch = service.forecast_batch("artificial_source", T, ["product_999", "product_001", "product_002"])
    assert [row.product_id for row in batch.results] == ["product_001", "product_002", "product_999"]
    assert [row.status for row in batch.results] == [
        ForecastStatus.FORECASTED, ForecastStatus.PRODUCT_NOT_KNOWN, ForecastStatus.OUT_OF_SCOPE,
    ]
    assert batch.results[0].predicted_completed_units_next_7d == 4
    assert all(row.predicted_completed_units_next_7d is None for row in batch.results[1:])
    assert batch == service.forecast_batch("artificial_source", T, ["product_002", "product_999", "product_001"])


def test_runtime_has_no_training_partner_api_frontend_or_network_dependency():
    root = Path(__file__).resolve().parents[1] / "src/medsense_ai/forecasting"
    for name in ("runtime.py", "runtime_contracts.py"):
        tree = ast.parse((root / name).read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            imports = ([item.name for item in node.names] if isinstance(node, ast.Import)
                       else [node.module or ""] if isinstance(node, ast.ImportFrom) else [])
            forbidden = ("training", "fastapi", "sqlalchemy", "requests", "httpx", "socket", "partner", "frontend")
            assert not any(token in value for value in imports for token in forbidden), name
            if isinstance(node, ast.Call):
                called = node.func.attr if isinstance(node.func, ast.Attribute) else node.func.id if isinstance(node.func, ast.Name) else ""
                assert called not in {"fit", "fit_transform", "run_training"}, name
    model_init = (root / "model/__init__.py").read_text(encoding="utf-8")
    assert "training" not in model_init and "run_training" not in model_init
