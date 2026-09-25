"""Stable canonical JSON/JSONL files, separate run metadata, strict hash verification."""

from datetime import datetime, timezone
import hashlib
from importlib.metadata import version
import json
from pathlib import Path
import platform
from time import perf_counter

from .. import SalesDataset, validate_dataset
from .config import SyntheticConfig, stable_json
from .generator import GenerationResult, validation_context
from .qa import WARNING

COLLECTIONS = ("coverage", "customers", "products", "events", "orders", "order_items", "inventory_movements")
FILENAMES = {name: f"{name}.jsonl" for name in COLLECTIONS}


def content_hash(path: Path) -> str:
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def dependencies() -> dict:
    return dict(python=platform.python_version(), python_implementation=platform.python_implementation(), pydantic=version("pydantic"))


def peak_memory_bytes() -> int | None:
    """Read the current process peak working set on Windows; no optional dependency."""
    if platform.system() != "Windows":
        return None
    import ctypes
    from ctypes import wintypes

    class Counters(ctypes.Structure):
        _fields_ = [("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD)] + [(name, ctypes.c_size_t) for name in ("PeakWorkingSetSize", "WorkingSetSize", "QuotaPeakPagedPoolUsage", "QuotaPagedPoolUsage", "QuotaPeakNonPagedPoolUsage", "QuotaNonPagedPoolUsage", "PagefileUsage", "PeakPagefileUsage")]

    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    psapi = ctypes.WinDLL("psapi", use_last_error=True)
    kernel.GetCurrentProcess.restype = wintypes.HANDLE
    psapi.GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.POINTER(Counters), wintypes.DWORD]
    psapi.GetProcessMemoryInfo.restype = wintypes.BOOL
    counters = Counters()
    counters.cb = ctypes.sizeof(counters)
    if not psapi.GetProcessMemoryInfo(kernel.GetCurrentProcess(), ctypes.byref(counters), counters.cb):
        raise ctypes.WinError(ctypes.get_last_error())
    return counters.PeakWorkingSetSize


def _json(path: Path, value) -> None:
    with path.open("xb") as handle:
        handle.write(stable_json(value))


def persist(result: GenerationResult, config: SyntheticConfig, qa: dict, timings: dict, output_dir: Path, artifacts_dir: Path) -> dict:
    output_dir, artifacts_dir = Path(output_dir).resolve(), Path(artifacts_dir).resolve()
    if output_dir == artifacts_dir or output_dir in artifacts_dir.parents or artifacts_dir in output_dir.parents:
        raise ValueError("Canonical data and QA artifacts need separate, non-nested directories")
    for directory in (output_dir, artifacts_dir):
        if directory.exists() and any(directory.iterdir()):
            raise FileExistsError(f"Refusing to overwrite nonempty output directory: {directory}")
    if result.dataset.manifest.generation_config_hash != config.sha256 or qa.get("config_sha256") != config.sha256 or not qa.get("qa_passed"):
        raise ValueError("Persistence requires matching config, accepted generation and QA")
    for directory in (output_dir, artifacts_dir):
        directory.mkdir(parents=True, exist_ok=True)
    begin = perf_counter()
    manifest = result.dataset.manifest.model_dump(mode="json")
    _json(output_dir / "manifest.json", manifest)
    row_counts = {"manifest.json": 1}
    for name in COLLECTIONS:
        records = getattr(result.dataset, name)
        # Validated collections have stable ID ordering. Coverage is explicitly
        # sorted across all fields to keep equal-start checkpoints deterministic.
        if name == "coverage":
            records = sorted(records, key=lambda r: (r.stream, r.interval_start, r.interval_end, r.known_at, r.coverage_status, r.reason_code or ""))
        with (output_dir / FILENAMES[name]).open("xb") as handle:
            for row in records:
                handle.write(stable_json(row.model_dump(mode="json")))
        row_counts[FILENAMES[name]] = len(records)
    _json(artifacts_dir / "dataset_manifest.json", manifest)
    _json(artifacts_dir / "generation_config.json", config.model_dump(mode="json"))
    _json(artifacts_dir / "qa_report.json", qa)
    hashes = {"data/" + name: content_hash(output_dir / name) for name in sorted(row_counts)}
    hashes.update({"artifacts/" + name: content_hash(artifacts_dir / name) for name in ("dataset_manifest.json", "generation_config.json", "qa_report.json")})
    provenance = dict(generator_version=config.generator_version, master_seed=config.master_seed, config_sha256=config.sha256, data_origin="synthetic_development", dependency_versions=dependencies(), row_counts=row_counts, sha256=hashes)
    _json(artifacts_dir / "file_hashes.json", provenance)
    run = dict(warning=WARNING, reproducible_content="file_hashes.json; run timestamp/timings are intentionally excluded", generated_at=datetime.now(timezone.utc).isoformat(), dependency_versions=dependencies(), generation_seconds=result.generation_seconds, generator_validation_seconds=result.validation_seconds, **timings, serialization_seconds=perf_counter()-begin, peak_process_working_set_bytes=peak_memory_bytes())
    run["total_measured_seconds"] = sum(run[key] for key in ("generation_seconds", "generator_validation_seconds", "qa_validation_seconds", "funnel_qa_seconds", "readiness_seconds", "serialization_seconds"))
    _json(artifacts_dir / "generation_report.json", run)
    return run


def verify_hashes(output_dir: Path, artifacts_dir: Path) -> dict:
    output_dir, artifacts_dir = Path(output_dir), Path(artifacts_dir)
    provenance = json.loads((artifacts_dir / "file_hashes.json").read_text(encoding="utf-8"))
    expected = {"data/manifest.json", *("data/" + name for name in FILENAMES.values()), "artifacts/dataset_manifest.json", "artifacts/generation_config.json", "artifacts/qa_report.json"}
    if set(provenance["sha256"]) != expected:
        raise ValueError("Unexpected or missing paths in file-hash manifest")
    for name, digest in provenance["sha256"].items():
        directory, filename = name.split("/")
        path = (output_dir if directory == "data" else artifacts_dir) / filename
        if content_hash(path) != digest:
            raise ValueError(f"Artifact hash mismatch: {name}")
    return provenance


def load_dataset(output_dir: Path, config: SyntheticConfig) -> SalesDataset:
    output_dir = Path(output_dir)
    values = {"manifest": json.loads((output_dir / "manifest.json").read_text(encoding="utf-8"))}
    for name, filename in FILENAMES.items():
        with (output_dir / filename).open(encoding="utf-8") as handle:
            values[name] = [json.loads(line) for line in handle]
    validation = validate_dataset(values, context=validation_context(config))
    if not validation.is_valid:
        raise ValueError("Serialized dataset failed canonical validation")
    data = validation.validated_dataset
    if data.manifest.generation_config_hash != config.sha256 or data.manifest.dataset_id != config.dataset_id:
        raise ValueError("Serialized dataset and config disagree")
    return data
