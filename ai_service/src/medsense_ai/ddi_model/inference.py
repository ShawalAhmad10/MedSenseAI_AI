"""Load the saved research DDI model and run deterministic local inference."""

from __future__ import annotations

import csv
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib
import numpy as np

from medsense_ai.ddi_model.features import FeatureKind, PairFeatureSpec, build_pair_features
from medsense_ai.medical_data_ingestion.normalization import normalize_medical_name


class UnsupportedDrugError(ValueError):
    """A requested ingredient is absent from the resolved TRAIN-01 vocabulary."""


@dataclass(frozen=True, slots=True)
class PredictionResult:
    drug_a: str
    drug_b: str
    normalized_drug_a: str
    normalized_drug_b: str
    warning_score: float
    selected_threshold: float
    warning_triggered: bool
    predicted_research_class: str
    positive_class_meaning: str = "known interaction pair from the supplied DDI dataset"
    comparison_class_meaning: str = "sampled-unlabeled pair; not verified safe or non-interacting"

    def to_dict(self) -> dict[str, object]:
        return {
            "drug_a": self.drug_a,
            "drug_b": self.drug_b,
            "normalized_drug_a": self.normalized_drug_a,
            "normalized_drug_b": self.normalized_drug_b,
            "warning_score": self.warning_score,
            "selected_threshold": self.selected_threshold,
            "warning_triggered": self.warning_triggered,
            "predicted_research_class": self.predicted_research_class,
            "positive_class_meaning": self.positive_class_meaning,
            "comparison_class_meaning": self.comparison_class_meaning,
        }


def apply_threshold(score: float, threshold: float) -> bool:
    if not 0 <= score <= 1:
        raise ValueError("score must be in [0, 1]")
    if not 0 <= threshold <= 1:
        raise ValueError("threshold must be in [0, 1]")
    return score >= threshold


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


class DDIInferenceModel:
    """Self-contained loader for trusted local model artifacts."""

    def __init__(self, model_dir: Path) -> None:
        model_dir = model_dir.resolve()
        metadata_path = model_dir / "model_metadata.json"
        artifact_path = model_dir / "selected_model.joblib"
        feature_path = model_dir / "inference_drug_features.csv"
        fingerprint_path = model_dir / "inference_morgan_fingerprints.npz"
        for path in (metadata_path, artifact_path, feature_path, fingerprint_path):
            if not path.is_file():
                raise FileNotFoundError(f"Required model artifact is missing: {path}")
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        expected_hashes = metadata.get("artifact_sha256", {})
        for filename, path in (
            ("selected_model.joblib", artifact_path),
            ("inference_drug_features.csv", feature_path),
            ("inference_morgan_fingerprints.npz", fingerprint_path),
        ):
            if expected_hashes.get(filename) != _sha256(path):
                raise ValueError(f"Model inference artifact hash mismatch: {filename}")
        bundle: dict[str, Any] = joblib.load(artifact_path)
        if bundle.get("model_version") != metadata.get("model_version"):
            raise ValueError("Model version mismatch between metadata and serialized estimator")
        self.model_version = str(bundle["model_version"])
        self.estimator = bundle["estimator"]
        self.threshold = float(bundle["threshold"])
        raw_spec = bundle["feature_spec"]
        self.feature_spec = PairFeatureSpec(
            kind=FeatureKind(raw_spec["kind"]),
            fingerprint_bits=int(raw_spec["fingerprint_bits"]),
            chunk_size=int(raw_spec["chunk_size"]),
        )
        with feature_path.open("r", encoding="utf-8-sig", newline="") as handle:
            rows = list(csv.DictReader(handle))
        with np.load(fingerprint_path, allow_pickle=False) as payload:
            self.fingerprints = payload["fingerprints"].copy()
            stored_ids = tuple(str(value) for value in payload["drug_ids"])
        feature_ids = tuple(row["drug_id"] for row in rows)
        if stored_ids != feature_ids or self.fingerprints.shape != (
            len(rows),
            self.feature_spec.fingerprint_bits,
        ):
            raise ValueError("Inference drug table and fingerprints are not aligned")
        self._index_by_normalized_name = {
            row["normalized_name"]: index for index, row in enumerate(rows)
        }
        if len(self._index_by_normalized_name) != len(rows):
            raise ValueError("Duplicate normalized drug names in inference vocabulary")

    def predict(self, drug_a: str, drug_b: str) -> PredictionResult:
        normalized_a = normalize_medical_name(drug_a)
        normalized_b = normalize_medical_name(drug_b)
        if normalized_a == normalized_b:
            raise ValueError("A DDI prediction requires two distinct active ingredients")
        missing = [
            original
            for original, normalized in ((drug_a, normalized_a), (drug_b, normalized_b))
            if normalized not in self._index_by_normalized_name
        ]
        if missing:
            raise UnsupportedDrugError(
                "Unsupported or unresolved active ingredient(s): " + ", ".join(repr(item) for item in missing)
            )
        features = build_pair_features(
            self.fingerprints,
            [self._index_by_normalized_name[normalized_a]],
            [self._index_by_normalized_name[normalized_b]],
            self.feature_spec,
        )
        score = float(self.estimator.predict_proba(features)[0, 1])
        warning = apply_threshold(score, self.threshold)
        return PredictionResult(
            drug_a=drug_a,
            drug_b=drug_b,
            normalized_drug_a=normalized_a,
            normalized_drug_b=normalized_b,
            warning_score=score,
            selected_threshold=self.threshold,
            warning_triggered=warning,
            predicted_research_class=(
                "known_positive_like" if warning else "sampled_unlabeled_like"
            ),
        )
