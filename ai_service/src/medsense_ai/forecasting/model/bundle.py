"""Integrity-checked local forecast bundles with an external SHA-256 trust anchor."""

from dataclasses import dataclass
from hashlib import sha256
from importlib.metadata import version
import io
import json
from pathlib import Path
import platform
import re

import joblib
from sklearn.linear_model import PoissonRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from ..contracts import FEATURE_NAMES, FEATURE_VERSION, TARGET_VERSION
from .contracts import FrozenSelection, MODEL_VERSION, SPLIT_VERSION

JSON_FILES = (
    "training_config.json",
    "selection_frozen.json",
    "validation_comparison.json",
    "selected_method.json",
    "preprocessing_metadata.json",
    "model_metadata.json",
    "feature_manifest.json",
    "target_manifest.json",
    "split_manifest.json",
    "source_provenance.json",
    "test_metrics.json",
    "stockout_metrics.json",
    "diagnostics.json",
    "synthetic_shortcut_diagnostics.json",
    "dependency_versions.json",
    "training_audit.json",
    "training_runtime.json",
)


class BundleError(ValueError):
    """The saved forecast bundle is missing, corrupt, or incompatible."""


def dependencies() -> dict:
    return {
        "python": platform.python_version(),
        **{name: version(name) for name in ("scikit-learn", "numpy", "scipy", "joblib", "pydantic", "threadpoolctl")},
    }


def _write_json(path: Path, value: dict):
    from ..contracts import stable_json

    with path.open("xb") as handle:
        handle.write(stable_json(value))


def save_bundle(
    directory, model, source, config, decision, candidate_metrics, test_metrics,
    diagnostics, shortcuts, volume_policy, preprocessing, audit, timings,
) -> str:
    directory = Path(directory)
    metadata = {
        "model_version": MODEL_VERSION,
        "selected_method": decision.method,
        "feature_version": FEATURE_VERSION,
        "target_version": TARGET_VERSION,
        "split_version": SPLIT_VERSION,
        "feature_order": list(FEATURE_NAMES),
        "target_interpretation": "predicted observed completed units over the next 7 days",
        "data_origin": "synthetic_development",
        "source_dataset_id": source.provenance["dataset_id"],
        "source_namespace": source.provenance["source_namespace"],
        "selection_metric": "validation pooled product-week MAE",
        "selection_rule": config.policy["selection_rule"],
        "test_evaluations": 1,
        "synthetic_development_notice": (
            "Synthetic performance is not evidence of real pharmacy performance; output is not true demand, "
            "required inventory, a reorder quantity, or procurement advice."
        ),
        "trust_policy": "Load only with an independently pinned bundle_hashes.json SHA-256",
    }
    source_provenance = {
        **source.provenance,
        "forecast_dataset_hash_manifest_sha256": source.hash_manifest_sha256,
        "forecast_dataset_payload_sha256": source.hashes,
    }
    payloads = {
        "selected_method.json": {
            "selected_method": decision.method,
            "fitted_estimator_present": decision.method == "poisson_regressor",
            "persistence_rule": "completed_units_lag_1w" if decision.method == "persistence" else None,
        },
        "preprocessing_metadata.json": preprocessing if decision.method == "poisson_regressor" else {
            "method": "none", "fit_partition": None, "fitted": False,
        },
        "model_metadata.json": metadata,
        "feature_manifest.json": source.feature_manifest,
        "target_manifest.json": source.target_manifest,
        "split_manifest.json": source.split_manifest,
        "source_provenance.json": source_provenance,
        "test_metrics.json": test_metrics,
        "stockout_metrics.json": {part: report["stockout"] for part, report in diagnostics.items()},
        "diagnostics.json": {
            "selected_method": decision.method,
            "splits": diagnostics,
            "train_derived_product_volume_policy": volume_policy,
            "candidate_train_validation_metrics": candidate_metrics,
        },
        "synthetic_shortcut_diagnostics.json": shortcuts,
        "dependency_versions.json": dependencies(),
        "training_audit.json": audit,
        "training_runtime.json": timings,
    }
    for name, payload in payloads.items():
        _write_json(directory / name, payload)
    if decision.method == "poisson_regressor":
        with (directory / "model.joblib").open("xb") as handle:
            joblib.dump(model, handle, compress=3)
    files = (*JSON_FILES, *(("model.joblib",) if decision.method == "poisson_regressor" else ()))
    hashes = {name: sha256((directory / name).read_bytes()).hexdigest() for name in files}
    _write_json(directory / "bundle_hashes.json", {
        "complete": True,
        "model_version": MODEL_VERSION,
        "selected_method": decision.method,
        "sha256": hashes,
        "trust_anchor": "Caller pins the SHA-256 of this manifest outside the bundle",
    })
    return sha256((directory / "bundle_hashes.json").read_bytes()).hexdigest()


@dataclass(frozen=True)
class LoadedBundle:
    selected_method: str
    model: object | None
    metadata: dict
    manifest_sha256: str


def load_bundle(directory: Path, expected_manifest_sha256: str) -> LoadedBundle:
    """Verify every byte before deserializing the optional trusted local estimator."""
    directory = Path(directory)
    try:
        if not re.fullmatch(r"[0-9a-f]{64}", expected_manifest_sha256):
            raise BundleError("A trusted external bundle manifest checksum is required")
        manifest_bytes = (directory / "bundle_hashes.json").read_bytes()
        if sha256(manifest_bytes).hexdigest() != expected_manifest_sha256:
            raise BundleError("Forecast bundle manifest checksum mismatch")
        manifest = json.loads(manifest_bytes)
        method = manifest.get("selected_method")
        expected_files = set(JSON_FILES) | ({"model.joblib"} if method == "poisson_regressor" else set())
        if (
            not manifest.get("complete") or manifest.get("model_version") != MODEL_VERSION
            or method not in ("persistence", "poisson_regressor")
            or set(manifest.get("sha256", {})) != expected_files
        ):
            raise BundleError("Incomplete or incompatible forecast bundle manifest")
        buffers = {}
        for name in expected_files:
            path = directory / name
            if path.is_symlink() or path.resolve().parent != directory.resolve():
                raise BundleError("Forecast bundle file leaves the trusted directory")
            buffers[name] = path.read_bytes()
            if sha256(buffers[name]).hexdigest() != manifest["sha256"][name]:
                raise BundleError(f"Forecast bundle checksum mismatch: {name}")
        values = {name: json.loads(buffers[name]) for name in JSON_FILES}
        metadata, features = values["model_metadata.json"], values["feature_manifest.json"]
        if (
            metadata.get("model_version") != MODEL_VERSION
            or metadata.get("selected_method") != method
            or metadata.get("feature_version") != FEATURE_VERSION
            or metadata.get("target_version") != TARGET_VERSION
            or metadata.get("split_version") != SPLIT_VERSION
            or metadata.get("feature_order") != list(FEATURE_NAMES)
            or metadata.get("data_origin") != "synthetic_development"
            or features.get("feature_allowlist") != list(FEATURE_NAMES)
            or features.get("feature_version") != FEATURE_VERSION
            or values["target_manifest.json"].get("target_version") != TARGET_VERSION
            or values["split_manifest.json"].get("split_version") != SPLIT_VERSION
            or values["dependency_versions.json"] != dependencies()
        ):
            raise BundleError("Forecast bundle contract or dependency drift")
        selection = FrozenSelection(**{
            key: value for key, value in values["selection_frozen.json"].items()
            if key in FrozenSelection.model_fields
        })
        provenance = values["source_provenance.json"]
        if (
            selection.method != method
            or sha256(buffers["training_config.json"]).hexdigest() != selection.training_config_sha256
            or provenance.get("forecast_dataset_hash_manifest_sha256") != selection.source_hash_manifest_sha256
            or values["selected_method.json"].get("selected_method") != method
        ):
            raise BundleError("Forecast bundle selection or provenance mismatch")
        model = None
        if method == "poisson_regressor":
            model = joblib.load(io.BytesIO(buffers["model.joblib"]))
            if (
                not isinstance(model, Pipeline)
                or not isinstance(model.named_steps.get("scaler"), StandardScaler)
                or not isinstance(model.named_steps.get("regressor"), PoissonRegressor)
                or model.n_features_in_ != len(FEATURE_NAMES)
            ):
                raise BundleError("Saved Poisson estimator differs from its frozen contract")
        return LoadedBundle(method, model, metadata, expected_manifest_sha256)
    except BundleError:
        raise
    except Exception as exc:
        raise BundleError(f"Unable to load verified forecast bundle: {type(exc).__name__}: {exc}") from exc

