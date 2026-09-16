"""Fit one Poisson candidate, compare with persistence, freeze, then open TEST once."""

from dataclasses import dataclass
from hashlib import sha256
import json
import logging
from pathlib import Path
from time import perf_counter
import warnings

import numpy as np
from sklearn.exceptions import ConvergenceWarning
from sklearn.linear_model import PoissonRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from threadpoolctl import threadpool_limits

from ..contracts import FEATURE_NAMES, stable_json
from .contracts import FrozenSelection, TrainingConfig
from .metrics import full_diagnostics, metrics, train_volume_policy

logger = logging.getLogger(__name__)
METHODS = ("persistence", "poisson_regressor")


def write_json(path: Path, value: dict):
    with Path(path).open("xb") as handle:
        handle.write(stable_json(value))


def persistence_predict(X: np.ndarray) -> np.ndarray:
    values = np.asarray(X, dtype=np.float64)
    if values.ndim != 2 or values.shape[1] != len(FEATURE_NAMES):
        raise ValueError("Persistence requires the exact forecast feature matrix")
    return values[:, FEATURE_NAMES.index("completed_units_lag_1w")].copy()


def make_poisson(config: TrainingConfig) -> Pipeline:
    return Pipeline([
        ("scaler", StandardScaler()),
        ("regressor", PoissonRegressor(
            alpha=config.poisson_alpha,
            fit_intercept=True,
            solver=config.poisson_solver,
            max_iter=config.poisson_max_iter,
            tol=config.poisson_tol,
            warm_start=False,
            verbose=0,
        )),
    ])


@dataclass(frozen=True)
class CandidateComparison:
    poisson: Pipeline
    predictions: dict[str, dict[str, np.ndarray]]
    fit_seconds: float
    convergence_warnings: tuple[str, ...]


def fit_candidates(train, validation, config: TrainingConfig) -> CandidateComparison:
    model = make_poisson(config)
    before = perf_counter()
    with warnings.catch_warnings(record=True) as caught, threadpool_limits(limits=config.thread_limit):
        warnings.simplefilter("always", ConvergenceWarning)
        model.fit(train.X, train.y)
    messages = tuple(str(item.message) for item in caught if issubclass(item.category, ConvergenceWarning))
    if messages:
        raise RuntimeError("Frozen Poisson configuration did not converge; adjustment requires an explicit new run")
    fit_seconds = perf_counter() - before
    predictions = {
        "persistence": {"train": persistence_predict(train.X), "validation": persistence_predict(validation.X)},
        "poisson_regressor": {
            "train": np.asarray(model.predict(train.X), dtype=np.float64),
            "validation": np.asarray(model.predict(validation.X), dtype=np.float64),
        },
    }
    for method in METHODS:
        for part in ("train", "validation"):
            values = predictions[method][part]
            if not np.isfinite(values).all() or np.any(values < 0):
                raise ValueError(f"{method} produced invalid {part} predictions")
    return CandidateComparison(model, predictions, fit_seconds, messages)


def select_method(validation_metrics: dict[str, dict]) -> tuple[str, str]:
    if set(validation_metrics) != set(METHODS):
        raise ValueError("Selection requires exactly persistence and Poisson validation metrics")
    persistence = validation_metrics["persistence"]["mae"]
    poisson = validation_metrics["poisson_regressor"]["mae"]
    if poisson < persistence:
        return "poisson_regressor", f"Poisson validation MAE {poisson:.12g} is lower than persistence {persistence:.12g}"
    return "persistence", f"Persistence validation MAE {persistence:.12g} is no higher than Poisson {poisson:.12g}"


def shortcut_diagnostics(validation, predictions: dict[str, np.ndarray]) -> dict:
    associations = []
    for name in ("completed_units_lag_1w", "completed_units_lag_2w", "completed_units_lag_4w", "completed_units_lag_8w"):
        values = validation.X[:, FEATURE_NAMES.index(name)]
        correlation = float(np.corrcoef(values, validation.y)[0, 1]) if np.std(values) and np.std(validation.y) else None
        associations.append({"feature": name, "pearson_correlation_with_target": correlation})
    associations.sort(key=lambda row: -(abs(row["pearson_correlation_with_target"]) if row["pearson_correlation_with_target"] is not None else -1))
    persistence = metrics(validation.y, predictions["persistence"])
    poisson = metrics(validation.y, predictions["poisson_regressor"])
    scale = float(np.mean(validation.y))
    return {
        "scope": "validation-only bounded diagnostic; never used to tune either candidate",
        "lag_target_associations": associations,
        "lag_1w_persistence": persistence,
        "poisson": poisson,
        "lag_1w_captures_most_signal_flag": associations[0]["feature"] == "completed_units_lag_1w",
        "suspiciously_easy_flag": min(persistence["mae"], poisson["mae"]) <= 0.1 * scale if scale else False,
        "periodicity_interpretation": "Strong lag association may reflect programmed synthetic periodicity; this diagnostic cannot establish real-world predictability.",
    }


def preprocessing_metadata(model: Pipeline, train_rows: int) -> dict:
    scaler = model.named_steps["scaler"]
    return {
        "method": "StandardScaler",
        "fit_partition": "train",
        "fit_rows": train_rows,
        "feature_order": list(FEATURE_NAMES),
        "mean": scaler.mean_.tolist(),
        "scale": scaler.scale_.tolist(),
        "samples_seen": int(scaler.n_samples_seen_),
        "imputation": False,
    }


def run_training(source, output_dir: Path, config: TrainingConfig | None = None) -> dict:
    from .bundle import save_bundle

    config, output_dir = config or TrainingConfig(), Path(output_dir)
    if output_dir.exists() and any(output_dir.iterdir()):
        raise FileExistsError("Refusing existing/partial forecast model directory; no silent TEST rerun")
    output_dir.mkdir(parents=True, exist_ok=True)
    write_json(output_dir / "training_config.json", config.policy)
    started = perf_counter()
    train, validation = source.read("train"), source.read("validation")
    comparison = fit_candidates(train, validation, config)
    candidate_metrics = {
        method: {
            "train": metrics(train.y, comparison.predictions[method]["train"]),
            "validation": metrics(validation.y, comparison.predictions[method]["validation"]),
        }
        for method in METHODS
    }
    method, reason = select_method({name: values["validation"] for name, values in candidate_metrics.items()})
    decision = FrozenSelection(
        method=method,
        source_hash_manifest_sha256=source.hash_manifest_sha256,
        training_config_sha256=config.sha256,
        validation_mae=candidate_metrics[method]["validation"]["mae"],
    )
    write_json(output_dir / "selection_frozen.json", {**decision.model_dump(), "reason": reason})
    write_json(output_dir / "validation_comparison.json", {
        "candidates": candidate_metrics,
        "selected_method": method,
        "selection_reason": reason,
        "selection_partition": "validation",
        "test_consulted": False,
    })
    shortcuts = shortcut_diagnostics(validation, {name: comparison.predictions[name]["validation"] for name in METHODS})
    volume_policy = train_volume_policy(train)
    test = source.open_test(decision)
    before_test = perf_counter()
    if method == "poisson_regressor":
        with threadpool_limits(limits=config.thread_limit):
            test_prediction = np.asarray(comparison.poisson.predict(test.X), dtype=np.float64)
    else:
        test_prediction = persistence_predict(test.X)
    if not np.isfinite(test_prediction).all() or np.any(test_prediction < 0):
        raise ValueError("Selected method produced invalid TEST predictions")
    selected_predictions = {
        "train": comparison.predictions[method]["train"],
        "validation": comparison.predictions[method]["validation"],
        "test": test_prediction,
    }
    diagnostics = {
        split.partition: full_diagnostics(split, selected_predictions[split.partition], volume_policy)
        for split in (train, validation, test)
    }
    test_metrics = diagnostics["test"]
    timings = {
        "poisson_fit_seconds": comparison.fit_seconds,
        "test_prediction_and_diagnostics_seconds": perf_counter() - before_test,
        "total_training_evaluation_seconds": perf_counter() - started,
    }
    training_audit = {
        "candidate_methods": list(METHODS),
        "poisson_fit_calls": 1,
        "persistence_fit_calls": 0,
        "preprocessing_fit_partition": "train",
        "selection_partition": "validation",
        "selection_frozen_before_test": True,
        "selected_test_prediction_calls": 1,
        "unselected_test_prediction_calls": 0,
        "post_test_adjustments": 0,
        "candidate_adjustments": config.candidate_adjustments,
        "product_id_feature": False,
        "target_stockout_feature": False,
    }
    anchor = save_bundle(
        output_dir, comparison.poisson if method == "poisson_regressor" else None,
        source, config, decision, candidate_metrics, test_metrics, diagnostics,
        shortcuts, volume_policy, preprocessing_metadata(comparison.poisson, len(train.y)),
        training_audit, timings,
    )
    logger.info("Saved forecast bundle with %s selected before one TEST evaluation", method)
    return {
        "status": "passed", "selected_method": method, "selection_reason": reason,
        "bundle_manifest_sha256": anchor, "validation": candidate_metrics,
        "test": test_metrics, "shortcuts": shortcuts, "timings": timings,
    }

