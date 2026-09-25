"""Build the frozen default forecast dataset once; no model imports or fitting."""

from datetime import datetime, timezone
import json
from pathlib import Path
from time import perf_counter

from medsense_ai.sales_data.synthetic.serialization import peak_memory_bytes

from .contracts import stable_json
from .dataset import build_dataset
from .io import load_canonical, verify_artifacts, write_artifacts
from .qa import audit_dataset


def build_default(root: Path):
    root = Path(root).resolve()
    source = root / "data/synthetic/sales/v1/default_260903"
    source_hashes = root / "artifacts/sales/synthetic/v1/default_260903/file_hashes.json"
    data_dir = root / "data/processed/sales/forecast/v1/default_260903"
    artifact_dir = root / "artifacts/sales/forecast/v1/default_260903"
    begin = perf_counter(); validated, provenance = load_canonical(source, source_hashes); load_seconds = perf_counter() - begin
    built = build_dataset(validated)
    report, coverage, stockout, leakage = audit_dataset(built, validated)
    begin = perf_counter(); hashes = write_artifacts(built, validated, report, coverage, stockout, leakage, provenance, data_dir, artifact_dir); write_seconds = perf_counter() - begin
    verify_artifacts(data_dir, artifact_dir)
    with (artifact_dir / "run_metadata.json").open("xb") as handle:
        handle.write(stable_json({"generated_at": datetime.now(timezone.utc).isoformat(),
                                  "source_load_validation_seconds": load_seconds, **built.timings,
                                  "write_verify_seconds": write_seconds,
                                  "peak_process_working_set_bytes": peak_memory_bytes(),
                                  "deterministic_payload_count": len(hashes)}))
    return data_dir, artifact_dir, report


def main():
    data_dir, artifact_dir, report = build_default(Path(__file__).resolve().parents[3])
    print(json.dumps({"data_dir": str(data_dir), "artifact_dir": str(artifact_dir), "counts": report["counts"]}, sort_keys=True))


if __name__ == "__main__":
    main()
