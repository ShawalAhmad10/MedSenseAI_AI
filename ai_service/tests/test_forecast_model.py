"""Focused bounded forecast-model, bundle, and local inference tests."""

import ast
from hashlib import sha256
import json
from pathlib import Path

import numpy as np
import pytest
from pydantic import ValidationError

from medsense_ai.forecasting import FEATURE_NAMES, ForecastFeatures
from medsense_ai.forecasting.model.bundle import BundleError, load_bundle, save_bundle
from medsense_ai.forecasting.model.contracts import ForecastInput, FrozenSelection, TrainingConfig
from medsense_ai.forecasting.model.data import SplitData
from medsense_ai.forecasting.model.inference import score_features
from medsense_ai.forecasting.model.metrics import full_diagnostics, metrics, per_product, train_volume_policy
from medsense_ai.forecasting.model.training import (
    fit_candidates, persistence_predict, preprocessing_metadata, run_training, select_method, write_json,
)


def feature_rows(n=12):
    values = np.zeros((n, len(FEATURE_NAMES)), dtype=np.float64)
    lag = FEATURE_NAMES.index("completed_units_lag_1w")
    values[:, lag] = np.arange(n) % 4
    values[:, FEATURE_NAMES.index("completed_units_sum_4w")] = values[:, lag] + 2
    values[:, FEATURE_NAMES.index("completed_units_sum_8w")] = values[:, lag] + 4
    values[:, FEATURE_NAMES.index("available_stock_at_t")] = np.arange(n) + 10
    return values


def split(name, X=None, y=None):
    X = feature_rows() if X is None else np.asarray(X, dtype=np.float64)
    y = X[:, 0].copy() if y is None else np.asarray(y, dtype=np.float64)
    n = len(y)
    return SplitData(
        name, tuple(f"{name}-{i}" for i in range(n)), X, y,
        tuple(f"product_{i % 3}" for i in range(n)),
        tuple(f"2026-01-{1 + (i % 3) * 7:02d}T00:00:00+00:00" for i in range(n)),
        tuple(("no_stockout", "partial_stockout", "full_week_stockout")[i % 3] for i in range(n)),
    )


def input_payload(**changes):
    values = {name: 0 for name in FEATURE_NAMES}
    values.update(changes)
    return {"feature_version": "forecast_features_v1", "features": values}


class FakeSource:
    hash_manifest_sha256 = "a" * 64
    hashes = {"data/feature_matrix.csv": "b" * 64}
    feature_manifest = {"feature_version": "forecast_features_v1", "feature_count": 19,
                        "feature_allowlist": list(FEATURE_NAMES), "target_censoring_metadata_is_feature": False}
    target_manifest = {"target_version": "observed_completed_units_next_7d_v1"}
    split_manifest = {"split_version": "forecast_temporal_split_v1", "random_split": False}
    provenance = {"dataset_id": "dataset_001", "source_namespace": "synthetic_sales",
                  "data_origin": "synthetic_development"}


def test_exact_feature_order_excludes_ids_and_target_stockout_metadata():
    assert len(FEATURE_NAMES) == 19
    prohibited = {"product_id", "example_id", "customer_id", "target_stockout_seconds", "target_full_week_stockout"}
    assert prohibited.isdisjoint(FEATURE_NAMES)
    assert tuple(ForecastInput.model_fields["feature_order"].default) == FEATURE_NAMES


def test_persistence_is_exact_lag_one_and_selection_uses_lower_validation_mae():
    X = feature_rows(4)
    assert np.array_equal(persistence_predict(X), X[:, FEATURE_NAMES.index("completed_units_lag_1w")])
    method, _ = select_method({"persistence": {"mae": 1.0}, "poisson_regressor": {"mae": .9}})
    assert method == "poisson_regressor"
    method, _ = select_method({"persistence": {"mae": 1.0}, "poisson_regressor": {"mae": 1.0}})
    assert method == "persistence"


def test_poisson_scaler_is_train_only_and_fit_is_deterministic():
    config, train = TrainingConfig(), split("train")
    validation_X = feature_rows()
    validation_X[:, FEATURE_NAMES.index("available_stock_at_t")] += 10000
    validation = split("validation", validation_X)
    first, second = fit_candidates(train, validation, config), fit_candidates(train, validation, config)
    scaler = first.poisson.named_steps["scaler"]
    assert scaler.n_samples_seen_ == len(train.y)
    assert np.allclose(scaler.mean_, train.X.mean(axis=0))
    assert not np.allclose(scaler.mean_, validation.X.mean(axis=0))
    assert np.allclose(first.predictions["poisson_regressor"]["validation"],
                       second.predictions["poisson_regressor"]["validation"])
    assert np.all(first.predictions["poisson_regressor"]["validation"] >= 0)


def test_metrics_handle_zero_denominator_and_product_stockout_sparsity_diagnostics():
    assert metrics([0, 0], [1, 0])["wape"] is None
    actual, predicted = np.asarray([0, 2, 0, 4.]), np.asarray([1, 2, 0, 3.])
    products = ("a", "a", "b", "b")
    product = per_product(actual, predicted, products)
    assert product["products"] == 2 and product["per_product_wape_defined"] == 2
    train = split("train", feature_rows(4), actual)
    report = full_diagnostics(train, predicted, train_volume_policy(train))
    assert report["sparsity"]["zero_target"]["rows"] == 2
    assert set(report["stockout"]) == {"full_week_stockout", "no_stockout", "partial_stockout"}


def make_poisson_bundle(tmp_path):
    source, config = FakeSource(), TrainingConfig()
    train, validation = split("train"), split("validation")
    comparison = fit_candidates(train, validation, config)
    decision = FrozenSelection(method="poisson_regressor", source_hash_manifest_sha256=source.hash_manifest_sha256,
                               training_config_sha256=config.sha256, validation_mae=1.0)
    write_json(tmp_path / "training_config.json", config.policy)
    write_json(tmp_path / "selection_frozen.json", decision.model_dump())
    write_json(tmp_path / "validation_comparison.json", {"test_consulted": False})
    empty = {"overall": metrics(validation.y, comparison.predictions["poisson_regressor"]["validation"]),
             "stockout": {}, "per_product": {}, "weekly": {}, "sparsity": {},
             "train_derived_product_volume_bands": {}}
    anchor = save_bundle(
        tmp_path, comparison.poisson, source, config, decision, {}, empty,
        {"train": empty, "validation": empty, "test": empty}, {}, {},
        preprocessing_metadata(comparison.poisson, len(train.y)),
        {"selection_frozen_before_test": True}, {"seconds": 0},
    )
    return anchor


def test_save_load_prediction_equality_and_corruption_rejection(tmp_path):
    anchor = make_poisson_bundle(tmp_path)
    loaded = load_bundle(tmp_path, anchor)
    request = ForecastInput.model_validate(input_payload(completed_units_lag_1w=2, completed_units_sum_4w=2,
                                                          completed_units_sum_8w=4, available_stock_at_t=15))
    first, second = score_features(loaded, request), score_features(loaded, request)
    assert first == second and first.predicted_completed_units_next_7d >= 0
    (tmp_path / "selected_method.json").write_text("{}", encoding="utf-8")
    with pytest.raises(BundleError, match="checksum mismatch"):
        load_bundle(tmp_path, anchor)


def test_inference_rejects_wrong_version_missing_and_extra_features():
    wrong = input_payload()
    wrong["feature_version"] = "forecast_features_v2"
    with pytest.raises(ValidationError):
        ForecastInput.model_validate(wrong)
    missing = input_payload()
    del missing["features"][FEATURE_NAMES[0]]
    with pytest.raises(ValidationError):
        ForecastInput.model_validate(missing)
    extra = input_payload()
    extra["features"]["product_id"] = "product_1"
    with pytest.raises(ValidationError):
        ForecastInput.model_validate(extra)


def test_run_freezes_selection_before_opening_test_and_never_predicts_unselected_test(tmp_path):
    class GatedSource(FakeSource):
        def __init__(self):
            self.parts = {name: split(name) for name in ("train", "validation", "test")}
            self.open_calls = 0

        def read(self, name):
            assert name in ("train", "validation")
            return self.parts[name]

        def open_test(self, decision):
            assert (tmp_path / "selection_frozen.json").exists()
            assert decision.selection_scope == "validation_only"
            self.open_calls += 1
            return self.parts["test"]

    source = GatedSource()
    result = run_training(source, tmp_path)
    audit = json.loads((tmp_path / "training_audit.json").read_text())
    comparison = json.loads((tmp_path / "validation_comparison.json").read_text())
    assert source.open_calls == 1 and comparison["test_consulted"] is False
    assert audit["selected_test_prediction_calls"] == 1 and audit["unselected_test_prediction_calls"] == 0
    assert result["selected_method"] in ("persistence", "poisson_regressor")


def test_model_package_has_no_generator_import_and_inference_has_no_training_call():
    package = Path(__file__).resolve().parents[1] / "src/medsense_ai/forecasting/model"
    for path in package.glob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            names = ([item.name for item in node.names] if isinstance(node, ast.Import)
                     else [node.module or ""] if isinstance(node, ast.ImportFrom) else [])
            assert not any("synthetic" in name or "generator" in name for name in names), path.name
    inference_tree = ast.parse((package / "inference.py").read_text(encoding="utf-8"))
    calls = [node.func.attr if isinstance(node.func, ast.Attribute) else node.func.id
             for node in ast.walk(inference_tree) if isinstance(node, ast.Call)
             and isinstance(node.func, (ast.Attribute, ast.Name))]
    assert not {"fit", "fit_transform", "run_training"}.intersection(calls)

