"""One-shot deterministic development artifact build for sales_analytics_v1."""

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from time import perf_counter

from medsense_ai.sales_data.synthetic.config import SyntheticConfig, stable_json
from medsense_ai.sales_data.synthetic.serialization import load_dataset, peak_memory_bytes, verify_hashes

from .contracts import FunnelRequest
from .engine import analyze_sales
from .v1_contracts import SalesAnalyticsRequest


def _write(path: Path, value) -> None:
    with path.open("xb") as handle:
        handle.write(stable_json(value))


def build_default(root: Path) -> Path:
    root = Path(root).resolve()
    data_dir = root / "data/synthetic/sales/v1/default_260903"
    source_artifacts = root / "artifacts/sales/synthetic/v1/default_260903"
    output = root / "artifacts/sales/analytics/v1/default_260903"
    if output.exists() and any(output.iterdir()):
        raise FileExistsError(f"Refusing to overwrite nonempty analytics artifact directory: {output}")
    config = SyntheticConfig.model_validate_json((source_artifacts / "generation_config.json").read_text(encoding="utf-8"))
    source_hashes = verify_hashes(data_dir, source_artifacts)
    start_load = perf_counter()
    data = load_dataset(data_dir, config)
    load_seconds = perf_counter() - start_load
    request = SalesAnalyticsRequest(
        source_namespace=data.manifest.source_namespace, dataset_id=data.manifest.dataset_id,
        report_start=datetime(2026, 7, 1, tzinfo=timezone.utc),
        report_end=datetime(2026, 8, 1, tzinfo=timezone.utc),
        knowledge_cutoff=data.manifest.extracted_at, bucket_granularity="week",
        customer_history_start=config.start, session_history_start=config.start,
        ranking_limit_n=10,
    )
    funnel_request = FunnelRequest(
        report_start=request.report_start, report_end=request.report_end,
        knowledge_cutoff=request.knowledge_cutoff, session_history_start=request.session_history_start,
    )
    begin = perf_counter()
    report = analyze_sales(data, request, funnel_request=funnel_request)
    analytics_seconds = perf_counter() - begin
    output.mkdir(parents=True, exist_ok=True)
    report_value = report.model_dump(mode="json")
    provenance = {
        "analytics_version": report.analytics_version,
        "sales_contract_version": report.sales_contract_version,
        "source_dataset_id": data.manifest.dataset_id,
        "source_namespace": data.manifest.source_namespace,
        "data_origin": data.manifest.data_origin,
        "source_generation_config_sha256": config.sha256,
        "source_file_hash_manifest_sha256": hashlib.sha256((source_artifacts / "file_hashes.json").read_bytes()).hexdigest(),
        "source_files_verified": True,
        "source_hash_count": len(source_hashes["sha256"]),
        "request": request.model_dump(mode="json"),
        "funnel_version": "funnel_v1",
        "lead_cohort_input": "none_supplied",
        "timezone_policy": "UTC",
        "money_policy": "integer minor units separated by currency; completed merchandise subtotal, not net revenue/profit",
    }
    _write(output / "analytics_report.json", report_value)
    _write(output / "provenance_manifest.json", provenance)
    hashes = {
        name: hashlib.sha256((output / name).read_bytes()).hexdigest()
        for name in ("analytics_report.json", "provenance_manifest.json")
    }
    _write(output / "file_hashes.json", {"sha256": hashes})
    _write(output / "run_metadata.json", {
        "source_load_validation_seconds": load_seconds,
        "analytics_seconds": analytics_seconds,
        "peak_process_working_set_bytes": peak_memory_bytes(),
        "deterministic_files": tuple(sorted((*hashes, "file_hashes.json"))),
    })
    return output


def main() -> None:
    print(build_default(Path(__file__).resolve().parents[3]))


if __name__ == "__main__":
    main()
