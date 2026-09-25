"""Reproducible two-family training and evaluation for MED-DDI-TRAIN-02."""

from __future__ import annotations

import gc
import json
import logging
import os
import shutil
import time
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import sklearn
from sklearn.base import clone
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import SGDClassifier
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    confusion_matrix,
    f1_score,
    precision_recall_curve,
    precision_score,
    recall_score,
    roc_auc_score,
)

from medsense_ai.ddi_model.data import DrugCatalog, PairTable, sha256_file, validate_train01_artifacts
from medsense_ai.ddi_model.features import FeatureKind, PairFeatureSpec, build_pair_features, feature_names
from medsense_ai.ddi_model.inference import DDIInferenceModel

logger = logging.getLogger(__name__)

MODEL_VERSION = "med-ddi-binary-1.0.0"
DEFAULT_SEED = 20260902
THRESHOLD_BETA = 2.0


def _atomic_json(path: Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)


def select_recall_weighted_threshold(
    labels: np.ndarray, probabilities: np.ndarray, *, beta: float = THRESHOLD_BETA
) -> tuple[float, dict[str, object]]:
    """Select a validation-only threshold maximizing F-beta (beta=2 by default)."""
    if labels.shape != probabilities.shape or labels.ndim != 1:
        raise ValueError("labels and probabilities must be aligned one-dimensional arrays")
    precision, recall, thresholds = precision_recall_curve(labels, probabilities)
    if not len(thresholds):
        raise ValueError("Threshold selection requires both validation classes")
    beta_squared = beta**2
    denominator = beta_squared * precision[:-1] + recall[:-1]
    f_beta = np.divide(
        (1 + beta_squared) * precision[:-1] * recall[:-1],
        denominator,
        out=np.zeros_like(denominator),
        where=denominator != 0,
    )
    best_index = int(np.argmax(f_beta))
    f1_denominator = precision[:-1] + recall[:-1]
    f1_values = np.divide(
        2 * precision[:-1] * recall[:-1],
        f1_denominator,
        out=np.zeros_like(f1_denominator),
        where=f1_denominator != 0,
    )
    f1_index = int(np.argmax(f1_values))
    default_predictions = probabilities >= 0.5
    analysis: dict[str, object] = {
        "criterion": f"maximize_validation_f{beta:g}",
        "beta": beta,
        "selected": {
            "threshold": float(thresholds[best_index]),
            "precision": float(precision[best_index]),
            "recall": float(recall[best_index]),
            "f_beta": float(f_beta[best_index]),
        },
        "max_f1_operating_point": {
            "threshold": float(thresholds[f1_index]),
            "precision": float(precision[f1_index]),
            "recall": float(recall[f1_index]),
            "f1": float(f1_values[f1_index]),
        },
        "default_0_5_operating_point": {
            "precision": float(precision_score(labels, default_predictions, zero_division=0)),
            "recall": float(recall_score(labels, default_predictions, zero_division=0)),
            "f1": float(f1_score(labels, default_predictions, zero_division=0)),
        },
    }
    return float(thresholds[best_index]), analysis


def evaluate_probabilities(
    labels: np.ndarray, probabilities: np.ndarray, threshold: float
) -> dict[str, object]:
    predictions = probabilities >= threshold
    matrix = confusion_matrix(labels, predictions, labels=[0, 1])
    return {
        "precision": float(precision_score(labels, predictions, zero_division=0)),
        "recall": float(recall_score(labels, predictions, zero_division=0)),
        "f1": float(f1_score(labels, predictions, zero_division=0)),
        "roc_auc": float(roc_auc_score(labels, probabilities)),
        "pr_auc": float(average_precision_score(labels, probabilities)),
        "accuracy": float(accuracy_score(labels, predictions)),
        "confusion_matrix": {
            "tn": int(matrix[0, 0]),
            "fp": int(matrix[0, 1]),
            "fn": int(matrix[1, 0]),
            "tp": int(matrix[1, 1]),
        },
        "threshold": float(threshold),
        "example_count": int(len(labels)),
    }


def _model_definitions(seed: int) -> tuple[tuple[str, Any, PairFeatureSpec, dict[str, object]], ...]:
    linear_config: dict[str, object] = {
        "loss": "log_loss",
        "penalty": "l2",
        "alpha": 1e-5,
        "max_iter": 50,
        "tol": 1e-3,
        "average": True,
        "random_state": seed,
        "n_jobs": -1,
    }
    nonlinear_config: dict[str, object] = {
        "learning_rate": 0.08,
        "max_iter": 160,
        "max_leaf_nodes": 31,
        "min_samples_leaf": 30,
        "l2_regularization": 1.0,
        "early_stopping": False,
        "random_state": seed,
    }
    return (
        (
            "linear_sgd_logistic",
            SGDClassifier(**linear_config),
            PairFeatureSpec(FeatureKind.SPARSE_AND_XOR),
            linear_config,
        ),
        (
            "hist_gradient_boosting",
            HistGradientBoostingClassifier(**nonlinear_config),
            PairFeatureSpec(FeatureKind.CHUNKED_AND_XOR),
            nonlinear_config,
        ),
    )


def _predict_with_latency(estimator: Any, features: Any) -> tuple[np.ndarray, dict[str, float]]:
    start = time.perf_counter()
    probabilities = estimator.predict_proba(features)[:, 1]
    elapsed = time.perf_counter() - start
    sample_count = len(probabilities)
    return probabilities, {
        "batch_seconds": elapsed,
        "milliseconds_per_pair": 1000 * elapsed / sample_count if sample_count else 0.0,
        "pairs_per_second": sample_count / elapsed if elapsed else 0.0,
    }


def _fit_candidate(
    estimator: Any,
    spec: PairFeatureSpec,
    catalog: DrugCatalog,
    train: PairTable,
    validation: PairTable,
) -> tuple[Any, np.ndarray, float]:
    train_features = build_pair_features(
        catalog.fingerprints, train.left_indices, train.right_indices, spec
    )
    validation_features = build_pair_features(
        catalog.fingerprints, validation.left_indices, validation.right_indices, spec
    )
    started = time.perf_counter()
    estimator.fit(train_features, train.labels)
    fit_seconds = time.perf_counter() - started
    validation_probabilities = estimator.predict_proba(validation_features)[:, 1]
    del train_features, validation_features
    gc.collect()
    return estimator, validation_probabilities, fit_seconds


def _evaluate_table(
    estimator: Any,
    spec: PairFeatureSpec,
    catalog: DrugCatalog,
    table: PairTable,
    threshold: float,
) -> dict[str, object]:
    features = build_pair_features(
        catalog.fingerprints, table.left_indices, table.right_indices, spec
    )
    probabilities, latency = _predict_with_latency(estimator, features)
    metrics = evaluate_probabilities(table.labels, probabilities, threshold)
    metrics["prediction_latency"] = latency
    del features, probabilities
    gc.collect()
    return metrics


def _save_bundle(
    path: Path,
    *,
    estimator: Any,
    model_name: str,
    feature_spec: PairFeatureSpec,
    threshold: float,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {
            "model_version": MODEL_VERSION,
            "model_name": model_name,
            "estimator": estimator,
            "feature_spec": {
                "kind": feature_spec.kind.value,
                "fingerprint_bits": feature_spec.fingerprint_bits,
                "chunk_size": feature_spec.chunk_size,
            },
            "threshold": threshold,
            "positive_class": "known_positive",
            "comparison_class": "sampled_unlabeled_negative",
        },
        path,
        compress=3,
    )


def train_evaluate_select(
    *,
    data_dir: Path,
    provenance_dir: Path,
    model_dir: Path,
    seed: int = DEFAULT_SEED,
) -> dict[str, object]:
    validated = validate_train01_artifacts(data_dir, provenance_dir)
    catalog: DrugCatalog = validated["catalog"]  # type: ignore[assignment]
    pair_table: PairTable = validated["pair_table"]  # type: ignore[assignment]
    cold_table: PairTable = validated["cold_table"]  # type: ignore[assignment]
    train = pair_table.subset("train")
    validation = pair_table.subset("validation")
    test = pair_table.subset("test")
    candidate_results: dict[str, dict[str, object]] = {}
    trained: dict[str, tuple[Any, PairFeatureSpec, float]] = {}
    model_dir.mkdir(parents=True, exist_ok=True)

    definitions = _model_definitions(seed)
    for model_name, estimator, spec, config in definitions:
        logger.info("Training %s with %s features", model_name, spec.kind.value)
        fitted, validation_probabilities, fit_seconds = _fit_candidate(
            estimator, spec, catalog, train, validation
        )
        threshold, threshold_analysis = select_recall_weighted_threshold(
            validation.labels, validation_probabilities
        )
        validation_metrics = evaluate_probabilities(
            validation.labels, validation_probabilities, threshold
        )
        candidate_results[model_name] = {
            "feature_kind": spec.kind.value,
            "feature_count": spec.feature_count,
            "hyperparameters": config,
            "fit_seconds": fit_seconds,
            "validation_metrics": validation_metrics,
            "threshold_analysis": threshold_analysis,
        }
        trained[model_name] = (fitted, spec, threshold)
        _save_bundle(
            model_dir / f"candidate_{model_name}.joblib",
            estimator=fitted,
            model_name=model_name,
            feature_spec=spec,
            threshold=threshold,
        )

    selected_name = max(
        candidate_results,
        key=lambda name: (
            candidate_results[name]["validation_metrics"]["pr_auc"],  # type: ignore[index]
            candidate_results[name]["validation_metrics"]["f1"],  # type: ignore[index]
        ),
    )
    selected_estimator, selected_spec, selected_threshold = trained[selected_name]
    logger.info("Selected %s using validation PR-AUC", selected_name)
    pair_test_metrics = _evaluate_table(
        selected_estimator, selected_spec, catalog, test, selected_threshold
    )

    cold_train = cold_table.subset("train")
    cold_validation = cold_table.subset("validation")
    cold_test = cold_table.subset("test")
    cold_estimator = clone(selected_estimator)
    cold_train_features = build_pair_features(
        catalog.fingerprints,
        cold_train.left_indices,
        cold_train.right_indices,
        selected_spec,
    )
    cold_estimator.fit(cold_train_features, cold_train.labels)
    del cold_train_features
    gc.collect()
    cold_validation_features = build_pair_features(
        catalog.fingerprints,
        cold_validation.left_indices,
        cold_validation.right_indices,
        selected_spec,
    )
    cold_validation_probabilities = cold_estimator.predict_proba(
        cold_validation_features
    )[:, 1]
    cold_threshold, cold_threshold_analysis = select_recall_weighted_threshold(
        cold_validation.labels, cold_validation_probabilities
    )
    del cold_validation_features, cold_validation_probabilities
    gc.collect()
    cold_test_metrics = _evaluate_table(
        cold_estimator, selected_spec, catalog, cold_test, cold_threshold
    )
    del cold_estimator
    gc.collect()

    _save_bundle(
        model_dir / "selected_model.joblib",
        estimator=selected_estimator,
        model_name=selected_name,
        feature_spec=selected_spec,
        threshold=selected_threshold,
    )
    shutil.copy2(data_dir / "drug_features.csv", model_dir / "inference_drug_features.csv")
    shutil.copy2(
        data_dir / "morgan_fingerprints.npz",
        model_dir / "inference_morgan_fingerprints.npz",
    )
    artifact_hashes = {
        name: sha256_file(model_dir / name)
        for name in (
            "selected_model.joblib",
            "inference_drug_features.csv",
            "inference_morgan_fingerprints.npz",
        )
    }
    metadata: dict[str, object] = {
        "model_version": MODEL_VERSION,
        "selected_model": selected_name,
        "selected_threshold": selected_threshold,
        "selection_rule": "highest validation PR-AUC; validation F1 tie-break",
        "threshold_rule": "maximize validation F2 to weight recall more heavily for warning triage",
        "trained_at_utc": datetime.now(timezone.utc).isoformat(),
        "python_implementation": "CPython",
        "scikit_learn_version": sklearn.__version__,
        "artifact_sha256": artifact_hashes,
        "warning": (
            "Research discrimination model only. The comparison class is sampled-unlabeled, "
            "not clinically verified safe or non-interacting."
        ),
    }
    _atomic_json(model_dir / "model_metadata.json", metadata)
    _atomic_json(
        model_dir / "feature_metadata.json",
        {
            "selected_feature_spec": {
                "kind": selected_spec.kind.value,
                "fingerprint_bits": selected_spec.fingerprint_bits,
                "chunk_size": selected_spec.chunk_size,
                "feature_count": selected_spec.feature_count,
                "feature_names": list(feature_names(selected_spec)),
                "order_invariance": "bitwise intersection/XOR and symmetric counts are unchanged by endpoint swap",
            },
            "candidate_feature_specs": {
                name: {
                    "kind": spec.kind.value,
                    "feature_count": spec.feature_count,
                }
                for name, _, spec, _ in definitions
            },
        },
    )
    _atomic_json(
        model_dir / "selected_threshold.json",
        {
            "threshold": selected_threshold,
            "selected_on": "pair_split.validation",
            "criterion": "maximum F2",
            "test_data_used_for_selection": False,
        },
    )
    _atomic_json(
        model_dir / "training_config.json",
        {
            "model_version": MODEL_VERSION,
            "seed": seed,
            "models": {
                name: {
                    "feature_kind": spec.kind.value,
                    "hyperparameters": config,
                }
                for name, _, spec, config in definitions
            },
            "model_family_count": 2,
            "parameter_search": "none; one fixed practical configuration per family",
        },
    )
    evaluation = {
        "candidate_validation": candidate_results,
        "selected_model": selected_name,
        "selected_threshold": selected_threshold,
        "pair_test": pair_test_metrics,
        "cold_drug_test": {
            **cold_test_metrics,
            "threshold_analysis": cold_threshold_analysis,
            "protocol": (
                "fresh clone of selected family fit only on drug_disjoint_splits.train; "
                "threshold selected only on drug_disjoint_splits.validation; evaluated once "
                "on drug_disjoint_splits.test"
            ),
        },
        "metric_scope": (
            "Metrics measure discrimination of known-positive pairs from sampled-unlabeled pairs "
            "in the constructed research dataset; they do not establish clinical safety."
        ),
    }
    _atomic_json(model_dir / "evaluation_metrics.json", evaluation)
    _atomic_json(
        model_dir / "dataset_provenance.json",
        {
            "train01_input_sha256": validated["input_sha256"],
            "train01_report": validated["train01_report"],
            "pair_split_sizes": validated["pair_split_sizes"],
            "drug_disjoint_split_sizes": validated["drug_disjoint_split_sizes"],
            "input_artifacts_regenerated": False,
        },
    )

    smoke_model = DDIInferenceModel(model_dir)
    smoke_drug_a = catalog.original_names[test.left_indices[0]]
    smoke_drug_b = catalog.original_names[test.right_indices[0]]
    smoke_started = time.perf_counter()
    smoke_result = smoke_model.predict(smoke_drug_a, smoke_drug_b)
    smoke_latency_ms = 1000 * (time.perf_counter() - smoke_started)
    summary: dict[str, object] = {
        "model_version": MODEL_VERSION,
        "selected_model": selected_name,
        "selected_threshold": selected_threshold,
        "pair_split_sizes": validated["pair_split_sizes"],
        "drug_disjoint_split_sizes": validated["drug_disjoint_split_sizes"],
        "candidate_validation": candidate_results,
        "pair_test": pair_test_metrics,
        "cold_drug_test": {
            **cold_test_metrics,
            "threshold_analysis": cold_threshold_analysis,
        },
        "smoke_inference": {**smoke_result.to_dict(), "end_to_end_latency_ms": smoke_latency_ms},
    }
    _atomic_json(model_dir / "training_summary.json", summary)
    return summary
