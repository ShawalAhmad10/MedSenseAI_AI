"""Strict canonical input boundary and deterministic forecast-dataset artifacts."""

import csv
from datetime import datetime
import hashlib
import json
from pathlib import Path

from medsense_ai.sales_data import ValidationContext, validate_dataset

from .contracts import BUILDER_VERSION, FEATURE_NAMES, stable_json
from .qa import feature_manifest, split_manifest, target_manifest

COLLECTIONS = ("coverage", "customers", "products", "events", "orders", "order_items", "inventory_movements")
CANONICAL_FILES = ("manifest.json", *(name + ".jsonl" for name in COLLECTIONS))
DATA_FILES = ("example_index.csv", "feature_matrix.csv", "targets.csv", "train_ids.txt", "validation_ids.txt", "test_ids.txt")
ARTIFACT_FILES = ("feature_manifest.json", "target_manifest.json", "split_manifest.json", "coverage_audit.json", "stockout_censoring_audit.json", "leakage_audit.json", "dataset_report.json", "provenance_manifest.json")


def sha256(path):
    with Path(path).open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def load_canonical(source_dir: Path, hash_manifest: Path):
    source_dir, hash_manifest = Path(source_dir), Path(hash_manifest)
    declared = json.loads(hash_manifest.read_text(encoding="utf-8"))
    values, hashes, counts = {}, {}, {}
    for name in CANONICAL_FILES:
        key = "data/" + name
        if key not in declared["sha256"] or sha256(source_dir / name) != declared["sha256"][key]:
            raise ValueError(f"Canonical source hash mismatch or missing: {name}")
        hashes[name] = declared["sha256"][key]
        with (source_dir / name).open(encoding="utf-8") as handle:
            if name == "manifest.json":
                values["manifest"], counts[name] = json.load(handle), 1
            else:
                rows = [json.loads(line) for line in handle]
                values[name.removesuffix(".jsonl")], counts[name] = rows, len(rows)
    validated = validate_dataset(values, context=ValidationContext(replay_carts=False, require_order_items=True, require_inventory=True))
    if not validated.is_valid:
        raise ValueError("Forecast source failed canonical sales/inventory validation")
    manifest = validated.validated_dataset.manifest
    return validated, {
        "dataset_id": manifest.dataset_id, "source_namespace": manifest.source_namespace,
        "data_origin": manifest.data_origin.value, "source_extracted_at": manifest.extracted_at.isoformat(),
        "canonical_sha256": hashes, "canonical_row_counts": counts,
        "source_hash_manifest_sha256": sha256(hash_manifest),
        "generator_diagnostic_artifacts_read": False, "validation": "passed",
    }


def _cell(value):
    if value is None: return ""
    if isinstance(value, bool): return "true" if value else "false"
    if isinstance(value, datetime): return value.isoformat()
    return str(value)


def _csv(path, columns, rows):
    with Path(path).open("x", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="raise", lineterminator="\n")
        writer.writeheader()
        for row in rows: writer.writerow({key: _cell(value) for key, value in row.items()})


def _json(path, value):
    with Path(path).open("xb") as handle: handle.write(stable_json(value))


def write_artifacts(built, validated, report, coverage, stockout, leakage, provenance, data_dir, artifact_dir):
    data_dir, artifact_dir = Path(data_dir).resolve(), Path(artifact_dir).resolve()
    if data_dir == artifact_dir or data_dir in artifact_dir.parents or artifact_dir in data_dir.parents:
        raise ValueError("Forecast data and audit directories must be separate and non-nested")
    for directory in (data_dir, artifact_dir):
        if directory.exists() and any(directory.iterdir()):
            raise FileExistsError(f"Refusing to overwrite forecast output: {directory}")
    if not leakage["passed"] or report["config_sha256"] != built.config.sha256:
        raise ValueError("Forecast persistence requires matching passed audits")
    for directory in (data_dir, artifact_dir): directory.mkdir(parents=True, exist_ok=True)
    examples = sorted(built.examples, key=lambda row: row.example_id)
    _csv(data_dir / "example_index.csv", ("example_id", "dataset_id", "source_namespace", "product_id", "selling_unit", "observation_time", "partition", "data_origin"),
         (dict(example_id=e.example_id, dataset_id=e.dataset_id, source_namespace=e.source_namespace, product_id=e.product_id,
               selling_unit=e.selling_unit, observation_time=e.observation_time, partition=e.partition.value, data_origin=e.data_origin.value) for e in examples))
    _csv(data_dir / "feature_matrix.csv", ("example_id", *FEATURE_NAMES),
         (dict(example_id=e.example_id, **e.features.model_dump()) for e in examples))
    _csv(data_dir / "targets.csv", ("example_id", "target_version", "target_start", "target_end", "target_completed_units", "target_stockout_observed", "target_stockout_seconds", "target_full_week_stockout", "inventory_context_status"),
         (dict(example_id=e.example_id, target_version=built.config.target_version, target_start=e.target_start, target_end=e.target_end,
               target_completed_units=e.target_completed_units, target_stockout_observed=e.target_stockout_observed,
               target_stockout_seconds=e.target_stockout_seconds, target_full_week_stockout=e.target_full_week_stockout,
               inventory_context_status=e.inventory_context_status.value) for e in examples))
    for part in ("train", "validation", "test"):
        with (data_dir / f"{part}_ids.txt").open("x", encoding="utf-8", newline="\n") as handle:
            handle.writelines(e.example_id + "\n" for e in examples if e.partition.value == part)
    manifest = validated.validated_dataset.manifest
    expected = {"dataset_id": manifest.dataset_id, "source_namespace": manifest.source_namespace,
                "data_origin": manifest.data_origin.value, "source_extracted_at": manifest.extracted_at.isoformat()}
    if any(provenance.get(k) != v for k, v in expected.items()):
        raise ValueError("Forecast source provenance mismatch")
    deterministic = {
        "feature_manifest.json": feature_manifest(), "target_manifest.json": target_manifest(),
        "split_manifest.json": split_manifest(), "coverage_audit.json": coverage,
        "stockout_censoring_audit.json": stockout, "leakage_audit.json": leakage,
        "dataset_report.json": report,
        "provenance_manifest.json": {**provenance, "builder_version": BUILDER_VERSION,
                                     "feature_version": built.config.feature_version,
                                     "target_version": built.config.target_version,
                                     "split_version": built.config.split_version,
                                     "config_sha256": built.config.sha256,
                                     "builder_source_sha256": {
                                         name: sha256(Path(__file__).parent / name)
                                         for name in ("__init__.py", "contracts.py", "dataset.py", "io.py", "qa.py", "build.py")
                                     }},
    }
    for name, value in deterministic.items(): _json(artifact_dir / name, value)
    hashes = {"data/" + name: sha256(data_dir / name) for name in DATA_FILES}
    hashes.update({"artifacts/" + name: sha256(artifact_dir / name) for name in ARTIFACT_FILES})
    _json(artifact_dir / "file_hashes.json", {"algorithm": "sha256", "reproducible": True,
                                              "excluded_runtime_metadata": "run_metadata.json", "sha256": hashes})
    return hashes


def verify_artifacts(data_dir, artifact_dir):
    data_dir, artifact_dir = Path(data_dir), Path(artifact_dir)
    meta = json.loads((artifact_dir / "file_hashes.json").read_text(encoding="utf-8"))
    expected = {*("data/" + name for name in DATA_FILES), *("artifacts/" + name for name in ARTIFACT_FILES)}
    if set(meta["sha256"]) != expected:
        raise ValueError("Unexpected or missing forecast artifact hash path")
    for key, digest in meta["sha256"].items():
        kind, name = key.split("/")
        if sha256((data_dir if kind == "data" else artifact_dir) / name) != digest:
            raise ValueError(f"Forecast artifact hash mismatch: {key}")
    with (data_dir / "feature_matrix.csv").open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != ["example_id", *FEATURE_NAMES]:
            raise ValueError("Forecast feature matrix differs from exact allowlist")
        feature_ids = [row["example_id"] for row in reader]
    with (data_dir / "targets.csv").open(encoding="utf-8", newline="") as handle:
        target_ids = [row["example_id"] for row in csv.DictReader(handle)]
    if feature_ids != target_ids or len(feature_ids) != len(set(feature_ids)):
        raise ValueError("Forecast features/targets do not align uniquely")
    split_ids = sum(((data_dir / f"{part}_ids.txt").read_text(encoding="utf-8").splitlines() for part in ("train", "validation", "test")), [])
    if set(split_ids) != set(feature_ids) or len(split_ids) != len(set(split_ids)):
        raise ValueError("Forecast split IDs do not partition examples")
    return meta
