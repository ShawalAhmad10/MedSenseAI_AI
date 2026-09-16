"""Canonical file boundary and isolated deterministic lead artifacts; no latent QA reads."""

import csv
from datetime import datetime, timezone
from decimal import Decimal
import hashlib
from importlib.metadata import version
import json
from pathlib import Path
import platform

from medsense_ai.sales_data import ValidationContext, validate_dataset
from .contracts import BUILDER_VERSION, FEATURE_NAMES, Features, stable_json
from .qa import feature_manifest, target_manifest
from .splits import SUPERVISED, split_manifest

COLLECTIONS = ("coverage", "customers", "products", "events", "orders", "order_items", "inventory_movements")
CANONICAL_FILES = ("manifest.json", *(name + ".jsonl" for name in COLLECTIONS))
INDEX_COLUMNS = ("example_id", "dataset_id", "source_namespace", "customer_id", "observation_time", "partition", "eligibility", "eligibility_reason", "label_status", "supervised", "data_origin")
LABEL_COLUMNS = ("example_id", "target_version", "horizon_end", "label_status", "label", "label_evidence_cutoff")
OUTPUT_DATA_FILES = ("example_index.csv", "feature_matrix.csv", "labels.csv", "train_ids.txt", "validation_ids.txt", "test_ids.txt")
OUTPUT_ARTIFACT_FILES = ("feature_manifest.json", "target_manifest.json", "split_manifest.json", "build_config.json", "build_report.json", "leakage_report.json", "provenance_manifest.json", "label_audit.jsonl", "feature_lineage.jsonl")


def sha256(path: Path) -> str:
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def load_canonical(source_dir: Path, hash_manifest: Path):
    """Read only canonical records and their declared hashes, not generator config/QA.

    The interchange layout is canonical, not a partner schema. The core builder
    itself accepts any validated SalesDataset supplied by a future adapter.
    """
    source_dir, hash_manifest = Path(source_dir), Path(hash_manifest)
    declared = json.loads(hash_manifest.read_text(encoding="utf-8"))
    hashes, values, raw_counts = {}, {}, {}
    for name in CANONICAL_FILES:
        key = "data/" + name
        if key not in declared["sha256"]:
            raise ValueError(f"Source hash missing: {name}")
        digest = sha256(source_dir / name)
        if digest != declared["sha256"][key]:
            raise ValueError(f"Canonical source hash mismatch: {name}")
        hashes[name] = digest
        with (source_dir / name).open(encoding="utf-8") as handle:
            if name == "manifest.json":
                values["manifest"], raw_counts[name] = json.load(handle), 1
            else:
                rows = [json.loads(line) for line in handle]
                values[name.removesuffix(".jsonl")], raw_counts[name] = rows, len(rows)
        if name in declared.get("row_counts", {}) and raw_counts[name] != declared["row_counts"][name]:
            raise ValueError("Source row-count manifest mismatch")
    validated = validate_dataset(values, context=ValidationContext(replay_carts=False))
    if not validated.is_valid:
        raise ValueError("Lead source failed canonical validation; no empty-success fallback")
    manifest = validated.validated_dataset.manifest
    if declared.get("config_sha256") is not None and declared["config_sha256"] != manifest.generation_config_hash:
        raise ValueError("Source config identity does not match the canonical manifest")
    return validated, dict(dataset_id=manifest.dataset_id, source_namespace=manifest.source_namespace, data_origin=manifest.data_origin.value, source_extracted_at=manifest.extracted_at.isoformat(), canonical_sha256=hashes, source_hash_manifest_sha256=sha256(hash_manifest), canonical_raw_row_counts=raw_counts, validation="passed", identical_retransmissions=validated.identical_duplicate_count, generator_diagnostic_artifacts_read=False)


def _json(path, value):
    with path.open("xb") as handle:
        handle.write(stable_json(value))


def _cell(value):
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _csv(path, columns, rows):
    with path.open("x", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, lineterminator="\n", extrasaction="raise")
        writer.writeheader()
        for row in rows:
            writer.writerow({key: _cell(value) for key, value in row.items()})


def write_artifacts(built, validated, report, leakage, source_provenance, output_dir: Path, artifacts_dir: Path):
    output_dir, artifacts_dir = Path(output_dir).resolve(), Path(artifacts_dir).resolve()
    if output_dir == artifacts_dir or output_dir in artifacts_dir.parents or artifacts_dir in output_dir.parents:
        raise ValueError("Lead data and audit artifacts require separate non-nested directories")
    for directory in (output_dir, artifacts_dir):
        if directory.exists() and any(directory.iterdir()):
            raise FileExistsError(f"Refusing to overwrite existing lead artifacts: {directory}")
    if not leakage["passed"] or report["config_sha256"] != built.config.sha256:
        raise ValueError("Persistence requires matching accepted QA")
    manifest = validated.validated_dataset.manifest
    if any(source_provenance.get(key) != value for key, value in {
        "dataset_id": manifest.dataset_id,
        "source_namespace": manifest.source_namespace,
        "data_origin": manifest.data_origin.value,
        "source_extracted_at": manifest.extracted_at.isoformat(),
    }.items()):
        raise ValueError("Persistence source provenance does not match canonical input")
    for directory in (output_dir, artifacts_dir):
        directory.mkdir(parents=True, exist_ok=True)
    examples = sorted(built.examples, key=lambda e: e.example_id)
    supervised = [e for e in examples if e.supervised]
    _csv(output_dir / "example_index.csv", INDEX_COLUMNS, (dict(example_id=e.example_id, dataset_id=e.dataset_id, source_namespace=e.source_namespace, customer_id=e.customer_id, observation_time=e.observation_time, partition=e.partition.value, eligibility=e.feature_result.eligibility.value, eligibility_reason=e.feature_result.reason, label_status=e.label_result.status.value, supervised=e.supervised, data_origin=e.data_origin.value) for e in examples))
    _csv(output_dir / "feature_matrix.csv", ("example_id", *FEATURE_NAMES), (dict(example_id=e.example_id, **e.feature_result.features.model_dump()) for e in supervised))
    _csv(output_dir / "labels.csv", LABEL_COLUMNS, (dict(example_id=e.example_id, target_version="repeat_purchase_30d_v1", horizon_end=e.label_result.horizon_end, label_status=e.label_result.status.value, label=e.label_result.label, label_evidence_cutoff=e.label_result.evidence_cutoff) for e in supervised))
    for part in SUPERVISED:
        with (output_dir / f"{part.value}_ids.txt").open("x", encoding="utf-8", newline="\n") as handle:
            for example in supervised:
                if example.partition == part:
                    handle.write(example.example_id + "\n")
    with (artifacts_dir / "label_audit.jsonl").open("xb") as handle:
        for e in examples:
            row = dict(example_id=e.example_id, dataset_id=e.dataset_id, source_namespace=e.source_namespace, customer_id=e.customer_id, observation_time=e.observation_time.isoformat(), target_version="repeat_purchase_30d_v1", data_origin=e.data_origin.value, partition=e.partition.value, eligibility=e.feature_result.eligibility.value, exclusion_reason=e.feature_result.reason, historical_coverage_failures=[f.model_dump(mode="json") for f in e.feature_result.failed_coverage], **e.label_result.model_dump(mode="json"))
            handle.write(stable_json(row))
    with (artifacts_dir / "feature_lineage.jsonl").open("xb") as handle:
        for e in examples:
            if e.feature_result.evidence:
                handle.write(stable_json(dict(example_id=e.example_id, **e.feature_result.evidence.model_dump(mode="json"))))
    provenance = dict(**source_provenance, builder_version=BUILDER_VERSION, feature_version=built.config.feature_version, target_version=built.config.target_version, config_sha256=built.config.sha256, dependency_versions=dict(python=platform.python_version(), pydantic=version("pydantic")), data_files_scope="feature_matrix and labels contain only mature supervised rows; example_index/audits retain excluded candidates")
    payloads = {"feature_manifest.json": feature_manifest(), "target_manifest.json": target_manifest(manifest.extracted_at), "split_manifest.json": split_manifest(), "build_config.json": built.config.model_dump(mode="json"), "build_report.json": report, "leakage_report.json": leakage, "provenance_manifest.json": provenance}
    for name, value in payloads.items():
        _json(artifacts_dir / name, value)
    hashes = {"data/"+name: sha256(output_dir/name) for name in OUTPUT_DATA_FILES}
    hashes.update({"artifacts/"+name: sha256(artifacts_dir/name) for name in OUTPUT_ARTIFACT_FILES})
    _json(artifacts_dir / "file_hashes.json", dict(algorithm="sha256", reproducible=True, data_origin=manifest.data_origin.value, sha256=hashes, excluded_run_metadata="run_metadata.json"))
    return hashes


def read_features(path: Path) -> dict[str, Features]:
    """Strict allowlist consumer: example_id is returned separately as an audit key."""
    types = {row["name"]: row["type"] for row in feature_manifest()["features"]}
    result = {}
    with Path(path).open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != ["example_id", *FEATURE_NAMES]:
            raise ValueError("Feature CSV does not match the exact ordered positive allowlist")
        for row in reader:
            key = row.pop("example_id")
            if not key or key in result or set(row) != set(FEATURE_NAMES) or any(v is None for v in row.values()):
                raise ValueError("Duplicate/malformed feature row")
            converted = {}
            for name in FEATURE_NAMES:
                value = row[name]
                if value == "":
                    converted[name] = None
                elif types[name] == "integer":
                    converted[name] = int(value)
                elif types[name] == "boolean":
                    if value not in ("true", "false"):
                        raise ValueError("Boolean CSV value must be true/false")
                    converted[name] = value == "true"
                else:
                    converted[name] = Decimal(value)
            result[key] = Features(**converted)
    return result


def verify_artifacts(output_dir: Path, artifacts_dir: Path) -> dict:
    output_dir, artifacts_dir = Path(output_dir), Path(artifacts_dir)
    metadata = json.loads((artifacts_dir / "file_hashes.json").read_text(encoding="utf-8"))
    expected = {*("data/"+n for n in OUTPUT_DATA_FILES), *("artifacts/"+n for n in OUTPUT_ARTIFACT_FILES)}
    if set(metadata["sha256"]) != expected:
        raise ValueError("Unexpected/missing lead artifact hash paths")
    for name, digest in metadata["sha256"].items():
        kind, filename = name.split("/")
        if sha256((output_dir if kind == "data" else artifacts_dir) / filename) != digest:
            raise ValueError(f"Lead artifact hash mismatch: {name}")
    features = read_features(output_dir / "feature_matrix.csv")
    with (output_dir / "labels.csv").open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != list(LABEL_COLUMNS):
            raise ValueError("Label columns changed")
        labels = list(reader)
    ids = [r["example_id"] for r in labels]
    if len(ids) != len(set(ids)) or set(ids) != set(features) or any(r["label"] not in ("0", "1") or r["label_status"] != "labeled" for r in labels):
        raise ValueError("Supervised features and labels do not align")
    split_ids = []
    for part in SUPERVISED:
        split_ids.extend((output_dir / f"{part.value}_ids.txt").read_text(encoding="utf-8").splitlines())
    if len(set(split_ids)) != len(split_ids) or set(split_ids) != set(features):
        raise ValueError("Split ID files must partition supervised rows exactly once")
    return metadata


def peak_memory_bytes():
    if platform.system() != "Windows":
        return None
    import ctypes
    from ctypes import wintypes
    class Counters(ctypes.Structure):
        _fields_ = [("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD)] + [(name, ctypes.c_size_t) for name in ("PeakWorkingSetSize", "WorkingSetSize", "QuotaPeakPagedPoolUsage", "QuotaPagedPoolUsage", "QuotaPeakNonPagedPoolUsage", "QuotaNonPagedPoolUsage", "PagefileUsage", "PeakPagefileUsage")]
    kernel, psapi = ctypes.WinDLL("kernel32", use_last_error=True), ctypes.WinDLL("psapi", use_last_error=True)
    kernel.GetCurrentProcess.restype = wintypes.HANDLE
    psapi.GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.POINTER(Counters), wintypes.DWORD]
    psapi.GetProcessMemoryInfo.restype = wintypes.BOOL
    counters = Counters()
    counters.cb = ctypes.sizeof(counters)
    if not psapi.GetProcessMemoryInfo(kernel.GetCurrentProcess(), ctypes.byref(counters), counters.cb):
        raise ctypes.WinError(ctypes.get_last_error())
    return counters.PeakWorkingSetSize


def write_run_metadata(artifacts_dir: Path, values: dict):
    _json(Path(artifacts_dir) / "run_metadata.json", dict(generated_at=datetime.now(timezone.utc).isoformat(), peak_process_working_set_bytes=peak_memory_bytes(), **values))
