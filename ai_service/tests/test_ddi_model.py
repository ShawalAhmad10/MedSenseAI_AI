"""Focused correctness tests for DDI training features and saved inference."""

from __future__ import annotations

import csv
import hashlib
import json
from pathlib import Path

import joblib
import numpy as np
import pytest
from sklearn.dummy import DummyClassifier

from medsense_ai.ddi_model.data import PairTable, validate_split_isolation
from medsense_ai.ddi_model.features import (
    FeatureKind,
    PairFeatureSpec,
    build_pair_features,
)
from medsense_ai.ddi_model.inference import (
    DDIInferenceModel,
    UnsupportedDrugError,
    apply_threshold,
)


def _fingerprints() -> np.ndarray:
    fingerprints = np.zeros((3, 2048), dtype=np.uint8)
    fingerprints[0, [1, 17, 100]] = 1
    fingerprints[1, [1, 33, 101]] = 1
    fingerprints[2, [3, 66, 999]] = 1
    return fingerprints


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _create_model_artifact(model_dir: Path) -> None:
    model_dir.mkdir()
    fingerprints = _fingerprints()
    drug_ids = np.asarray(("drug_alpha", "drug_beta", "drug_gamma"))
    feature_path = model_dir / "inference_drug_features.csv"
    with feature_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(
            (
                "drug_id",
                "original_name",
                "normalized_name",
                "pubchem_cid",
                "canonical_smiles",
                "isomeric_smiles",
                "fingerprint_index",
            )
        )
        writer.writerows(
            (
                ("drug_alpha", "Synthetic Alpha", "synthetic alpha", 1, "C", "C", 0),
                ("drug_beta", "Synthetic Beta", "synthetic beta", 2, "CC", "CC", 1),
                ("drug_gamma", "Synthetic Gamma", "synthetic gamma", 3, "CCC", "CCC", 2),
            )
        )
    fingerprint_path = model_dir / "inference_morgan_fingerprints.npz"
    np.savez_compressed(
        fingerprint_path,
        fingerprints=fingerprints,
        drug_ids=drug_ids,
        radius=np.asarray([2]),
        bit_count=np.asarray([2048]),
    )
    spec = PairFeatureSpec(FeatureKind.CHUNKED_AND_XOR)
    training_features = build_pair_features(fingerprints, [0, 0], [1, 2], spec)
    estimator = DummyClassifier(strategy="constant", constant=1).fit(
        training_features, np.asarray([0, 1])
    )
    artifact_path = model_dir / "selected_model.joblib"
    joblib.dump(
        {
            "model_version": "synthetic-model-v1",
            "model_name": "synthetic_dummy",
            "estimator": estimator,
            "feature_spec": {
                "kind": spec.kind.value,
                "fingerprint_bits": spec.fingerprint_bits,
                "chunk_size": spec.chunk_size,
            },
            "threshold": 0.75,
        },
        artifact_path,
    )
    metadata = {
        "model_version": "synthetic-model-v1",
        "artifact_sha256": {
            "selected_model.joblib": _sha256(artifact_path),
            "inference_drug_features.csv": _sha256(feature_path),
            "inference_morgan_fingerprints.npz": _sha256(fingerprint_path),
        },
    }
    (model_dir / "model_metadata.json").write_text(
        json.dumps(metadata), encoding="utf-8"
    )


@pytest.mark.parametrize(
    "kind", [FeatureKind.SPARSE_AND_XOR, FeatureKind.CHUNKED_AND_XOR]
)
def test_pair_features_are_deterministic_and_order_invariant(kind: FeatureKind) -> None:
    fingerprints = _fingerprints()
    spec = PairFeatureSpec(kind)
    forward = build_pair_features(fingerprints, [0], [1], spec)
    reverse = build_pair_features(fingerprints, [1], [0], spec)
    repeated = build_pair_features(fingerprints, [0], [1], spec)
    forward_array = forward.toarray() if hasattr(forward, "toarray") else forward
    reverse_array = reverse.toarray() if hasattr(reverse, "toarray") else reverse
    repeated_array = repeated.toarray() if hasattr(repeated, "toarray") else repeated
    np.testing.assert_array_equal(forward_array, reverse_array)
    np.testing.assert_array_equal(forward_array, repeated_array)


def test_threshold_behavior_is_explicit_at_boundary() -> None:
    assert apply_threshold(0.75, 0.75) is True
    assert apply_threshold(0.7499, 0.75) is False
    with pytest.raises(ValueError):
        apply_threshold(1.1, 0.75)


def test_saved_model_loads_and_predictions_are_symmetric_and_deterministic(
    tmp_path: Path,
) -> None:
    model_dir = tmp_path / "model"
    _create_model_artifact(model_dir)
    model = DDIInferenceModel(model_dir)

    forward = model.predict("Synthetic Alpha", "Synthetic Beta")
    reverse = model.predict("synthetic beta", "synthetic alpha")
    repeated = model.predict("Synthetic Alpha", "Synthetic Beta")

    assert forward.warning_score == reverse.warning_score == repeated.warning_score
    assert forward.warning_triggered is True
    assert forward.predicted_research_class == "known_positive_like"


def test_invalid_or_unresolved_drug_fails_closed(tmp_path: Path) -> None:
    model_dir = tmp_path / "model"
    _create_model_artifact(model_dir)
    model = DDIInferenceModel(model_dir)

    with pytest.raises(UnsupportedDrugError, match="Unsupported or unresolved"):
        model.predict("Synthetic Alpha", "Unresolved Ingredient")
    with pytest.raises(ValueError, match="distinct"):
        model.predict("Synthetic Alpha", "synthetic alpha")


def test_split_isolation_detects_pair_and_drug_leakage() -> None:
    isolated = PairTable(
        pair_ids=np.asarray(("pair_train", "pair_validation", "pair_test")),
        left_indices=np.asarray((0, 2, 4), dtype=np.int32),
        right_indices=np.asarray((1, 3, 5), dtype=np.int32),
        labels=np.asarray((1, 0, 1), dtype=np.uint8),
        splits=np.asarray(("train", "validation", "test")),
    )
    validate_split_isolation(isolated, drug_disjoint=True)

    leaked_pair = PairTable(
        pair_ids=np.asarray(("same_pair", "same_pair")),
        left_indices=np.asarray((0, 2), dtype=np.int32),
        right_indices=np.asarray((1, 3), dtype=np.int32),
        labels=np.asarray((1, 1), dtype=np.uint8),
        splits=np.asarray(("train", "test")),
    )
    with pytest.raises(ValueError, match="Pair leakage"):
        validate_split_isolation(leaked_pair, drug_disjoint=False)

    leaked_drug = PairTable(
        pair_ids=np.asarray(("pair_train", "pair_test")),
        left_indices=np.asarray((0, 0), dtype=np.int32),
        right_indices=np.asarray((1, 2), dtype=np.int32),
        labels=np.asarray((1, 0), dtype=np.uint8),
        splits=np.asarray(("train", "test")),
    )
    with pytest.raises(ValueError, match="Drug endpoint leakage"):
        validate_split_isolation(leaked_drug, drug_disjoint=True)
