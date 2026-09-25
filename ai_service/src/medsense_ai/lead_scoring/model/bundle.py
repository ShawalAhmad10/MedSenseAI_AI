"""Trusted local joblib bundles: external checksum pin, all hashes checked before load."""

from dataclasses import dataclass
import hashlib
from importlib.metadata import version
import io
import json
from pathlib import Path
import platform
import re

import joblib
import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.pipeline import Pipeline
from sklearn.linear_model import LogisticRegression

from ..contracts import FEATURE_NAMES, FEATURE_VERSION, TARGET_VERSION
from .contracts import FrozenSelection, MODEL_VERSION, NOTICE

JSON_FILES = (
    "training_config.json", "selection_frozen.json", "candidate_metrics.json", "validation_diagnostics.json",
    "test_evaluation_started.json", "selected_model_metadata.json", "preprocessing_metadata.json",
    "feature_manifest.json", "target_manifest.json", "split_manifest.json", "source_provenance.json",
    "evaluation_metrics.json", "selected_threshold.json", "dependency_versions.json", "training_audit.json", "training_runtime.json",
)
BUNDLE_FILES = (*JSON_FILES,"selected_model.joblib")


class BundleError(ValueError):
    """Explicit incompatible, unavailable or untrusted bundle failure."""


def dependencies() -> dict:
    return dict(python=platform.python_version(), **{name:version(name) for name in ("scikit-learn","numpy","scipy","joblib","pydantic","threadpoolctl")})


def save_bundle(directory,model,source,config,decision,evaluation,preprocessing,audit,timings) -> str:
    from .training import write_json
    directory=Path(directory)
    metadata=dict(model_version=MODEL_VERSION,model_family=decision.family,feature_version=FEATURE_VERSION,
        target_version=TARGET_VERSION,sales_contract_version="sales_contract_v1",split_version="lead_temporal_split_v1",
        feature_order=list(FEATURE_NAMES),data_origin="synthetic_development",source_dataset_id=source.provenance["dataset_id"],
        source_namespace=source.provenance["source_namespace"],rows={name:evaluation[name]["rows"] for name in ("train","validation","test")},
        seed=config.seed,selection_metric="validation average_precision_score",selection_rule=config.policy["selection_rule"],
        technical_validation_threshold=decision.technical_validation_threshold,calibration_method="none",
        production_business_policy="unresolved; no High/Medium/Low bands",synthetic_development_notice=NOTICE,
        score_transformation="lead_score = 100 * model_probability; no rounding in the numeric contract",
        trust_policy="Load only trusted local joblib bundles with an independently pinned bundle_hashes.json SHA-256; integrity is not authentication")
    payloads={"selected_model_metadata.json":metadata,"preprocessing_metadata.json":preprocessing,
        "feature_manifest.json":source.feature_manifest,"target_manifest.json":source.target_manifest,
        "split_manifest.json":source._json("split_manifest.json"),
        "source_provenance.json":dict(**source.provenance,lead_dataset_hash_manifest_sha256=source.hash_manifest_sha256,lead_dataset_payload_sha256=source.hashes),
        "evaluation_metrics.json":evaluation,"dependency_versions.json":dependencies(),"training_audit.json":audit,
        "training_runtime.json":timings,"selected_threshold.json":dict(technical_validation_threshold=decision.technical_validation_threshold,
            rule=config.policy["technical_threshold_rule"],prediction_comparison=">=",selection_partition="validation",business_policy=False)}
    for name,payload in payloads.items():
        write_json(directory/name,payload)
    with (directory/"selected_model.joblib").open("xb") as handle:
        joblib.dump(model,handle,compress=3)
    hashes={name:hashlib.sha256((directory/name).read_bytes()).hexdigest() for name in BUNDLE_FILES}
    write_json(directory/"bundle_hashes.json",dict(complete=True,model_version=MODEL_VERSION,sha256=hashes,
                trust_anchor="Caller pins the SHA-256 of this manifest outside the bundle"))
    return hashlib.sha256((directory/"bundle_hashes.json").read_bytes()).hexdigest()


@dataclass(frozen=True)
class LoadedBundle:
    model: object
    metadata: dict
    threshold: float
    manifest_sha256: str


def load_bundle(directory: Path, expected_manifest_sha256: str) -> LoadedBundle:
    """The expected digest is trusted caller configuration, never read from the same bundle."""
    directory=Path(directory)
    try:
        if not re.fullmatch(r"[0-9a-f]{64}",expected_manifest_sha256):
            raise BundleError("A trusted external bundle manifest checksum is required")
        manifest_bytes=(directory/"bundle_hashes.json").read_bytes()
        if hashlib.sha256(manifest_bytes).hexdigest() != expected_manifest_sha256:
            raise BundleError("Bundle manifest checksum mismatch")
        manifest=json.loads(manifest_bytes)
        if not manifest.get("complete") or manifest.get("model_version") != MODEL_VERSION or set(manifest.get("sha256",{})) != set(BUNDLE_FILES):
            raise BundleError("Incomplete/incompatible bundle file manifest")
        buffers={}
        for name in BUNDLE_FILES:
            path=directory/name
            if path.is_symlink() or path.resolve().parent != directory.resolve():
                raise BundleError("Bundle file leaves the trusted directory")
            buffers[name]=path.read_bytes()
            if hashlib.sha256(buffers[name]).hexdigest() != manifest["sha256"][name]:
                raise BundleError(f"Bundle artifact checksum mismatch: {name}")
        values={name:json.loads(buffers[name]) for name in JSON_FILES}
        meta, features=values["selected_model_metadata.json"],values["feature_manifest.json"]
        if (meta["model_version"] != MODEL_VERSION or meta["feature_version"] != FEATURE_VERSION
                or meta["target_version"] != TARGET_VERSION or meta["feature_order"] != list(FEATURE_NAMES)
                or features["feature_allowlist"] != list(FEATURE_NAMES) or features["feature_version"] != FEATURE_VERSION
                or values["target_manifest.json"]["target_version"] != TARGET_VERSION
                or meta["data_origin"] != "synthetic_development" or meta["calibration_method"] != "none"
                or values["dependency_versions.json"] != dependencies()):
            raise BundleError("Incompatible bundle contracts or resolved dependency versions")
        selection_values={k:v for k,v in values["selection_frozen.json"].items() if k in FrozenSelection.model_fields}
        decision=FrozenSelection(**selection_values)
        threshold=values["selected_threshold.json"]["technical_validation_threshold"]
        if (threshold != decision.technical_validation_threshold or threshold != meta["technical_validation_threshold"]
                or meta["model_family"] != decision.family
                or hashlib.sha256(buffers["training_config.json"]).hexdigest() != decision.training_config_sha256
                or values["source_provenance.json"]["lead_dataset_hash_manifest_sha256"] != decision.source_hash_manifest_sha256):
            raise BundleError("Bundle selection/threshold/provenance mismatch")
        # Deserialize the exact verified bytes, avoiding a second mutable-path read.
        model=joblib.load(io.BytesIO(buffers["selected_model.joblib"]))
        valid_type=(isinstance(model,Pipeline) and isinstance(model.named_steps.get("classifier"),LogisticRegression)) if decision.family=="logistic_regression" else isinstance(model,HistGradientBoostingClassifier)
        if not valid_type or model.n_features_in_ != len(FEATURE_NAMES) or not np.array_equal(model.classes_,[0,1]):
            raise BundleError("Saved estimator does not match its family/feature/class contract")
        return LoadedBundle(model,meta,float(threshold),expected_manifest_sha256)
    except BundleError:
        raise
    except Exception as exc:
        # Deserialization has multiple library-specific failure types; never return a fallback model.
        raise BundleError(f"Unable to load verified local model bundle: {type(exc).__name__}: {exc}") from exc
