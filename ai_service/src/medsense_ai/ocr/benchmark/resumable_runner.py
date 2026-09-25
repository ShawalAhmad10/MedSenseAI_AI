from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from medsense_ai.ocr.benchmark.batch_runner import (
    run_benchmark_stage,
)
from medsense_ai.ocr.benchmark.manifest import (
    load_evaluation_stage,
)
from medsense_ai.ocr.benchmark.runner_contracts import (
    BenchmarkEvaluationStage,
    get_benchmark_configuration,
)


DEFAULT_RUN_ROOT = Path(
    "data/processed/ocr/benchmark_runs"
)


def _run_directory(
    *,
    config_id: str,
    stage: BenchmarkEvaluationStage,
    run_root: Path,
) -> Path:
    return (
        run_root
        / stage.value
        / config_id
    )


def _load_completed_ids(
    results_path: Path,
) -> set[str]:
    if not results_path.exists():
        return set()

    completed: set[str] = set()

    with results_path.open(
        "r",
        encoding="utf-8",
    ) as handle:
        for line_number, line in enumerate(
            handle,
            start=1,
        ):
            line = line.strip()

            if not line:
                raise RuntimeError(
                    f"Blank result row at line "
                    f"{line_number}."
                )

            payload = json.loads(line)

            sample_id = payload.get(
                "sample_id"
            )

            if (
                not isinstance(sample_id, str)
                or not sample_id
            ):
                raise RuntimeError(
                    "Saved benchmark row has invalid "
                    "sample_id."
                )

            if sample_id in completed:
                raise RuntimeError(
                    "Duplicate saved benchmark result: "
                    f"{sample_id}"
                )

            completed.add(sample_id)

    return completed


def run_resumable_calibration(
    *,
    config_id: str,
    run_root: Path = DEFAULT_RUN_ROOT,
    limit: int | None = None,
) -> dict[str, Any]:
    stage = BenchmarkEvaluationStage.CALIBRATION

    config = get_benchmark_configuration(
        config_id
    )

    records = load_evaluation_stage(
        stage=stage
    )

    run_dir = _run_directory(
        config_id=config_id,
        stage=stage,
        run_root=run_root,
    )

    run_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    metadata_path = (
        run_dir / "run_metadata.json"
    )

    results_path = (
        run_dir / "results.jsonl"
    )

    expected_metadata = {
        "stage": stage.value,
        "config_id": config.config_id,
        "engine": config.engine.value,
        "preprocess": config.preprocess.value,
    }

    if metadata_path.exists():
        existing_metadata = json.loads(
            metadata_path.read_text(
                encoding="utf-8"
            )
        )

        if existing_metadata != expected_metadata:
            raise RuntimeError(
                "Existing resumable run metadata "
                "does not match requested run."
            )

    else:
        metadata_path.write_text(
            json.dumps(
                expected_metadata,
                indent=2,
                sort_keys=True,
            )
            + "\n",
            encoding="utf-8",
        )

    completed_ids = _load_completed_ids(
        results_path
    )

    available_ids = [
        record.sample_id
        for record in records
    ]

    unknown_completed = (
        completed_ids
        - set(available_ids)
    )

    if unknown_completed:
        raise RuntimeError(
            "Saved results contain sample IDs "
            "outside calibration manifest: "
            f"{sorted(unknown_completed)}"
        )

    remaining_ids = [
        sample_id
        for sample_id in available_ids
        if sample_id not in completed_ids
    ]

    if limit is not None:
        if limit <= 0:
            raise ValueError(
                "limit must be positive."
            )

        remaining_ids = (
            remaining_ids[:limit]
        )

    if not remaining_ids:
        return {
            "status": "COMPLETE",
            "config_id": config_id,
            "stage": stage.value,
            "already_completed": len(
                completed_ids
            ),
            "processed_this_run": 0,
            "remaining_after_run": 0,
            "results_path": str(
                results_path
            ),
        }

    processed_this_run = 0

    def persist_row(
        row: dict[str, Any],
    ) -> None:
        nonlocal processed_this_run

        with results_path.open(
            "a",
            encoding="utf-8",
            newline="\n",
        ) as handle:
            handle.write(
                json.dumps(
                    row,
                    sort_keys=True,
                    ensure_ascii=False,
                )
            )
            handle.write("\n")
            handle.flush()

        processed_this_run += 1

        print(
            f"[{len(completed_ids) + processed_this_run}"
            f"/{len(available_ids)}] "
            f"{row['sample_id']} "
            f"status={row['status']} "
            f"cer={row['cer']:.6f} "
            f"wer={row['wer']:.6f}",
            flush=True,
        )

    run_benchmark_stage(
        config_id=config_id,
        stage=stage,
        sample_ids=tuple(
            remaining_ids
        ),
        progress_callback=persist_row,
    )

    final_completed = _load_completed_ids(
        results_path
    )

    remaining_after_run = (
        len(available_ids)
        - len(final_completed)
    )

    return {
        "status": (
            "COMPLETE"
            if remaining_after_run == 0
            else "PARTIAL"
        ),
        "config_id": config_id,
        "stage": stage.value,
        "already_completed": len(
            completed_ids
        ),
        "processed_this_run": (
            processed_this_run
        ),
        "completed_total": len(
            final_completed
        ),
        "remaining_after_run": (
            remaining_after_run
        ),
        "results_path": str(
            results_path
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--config-id",
        required=True,
    )

    parser.add_argument(
        "--limit",
        type=int,
        default=None,
    )

    args = parser.parse_args()

    result = run_resumable_calibration(
        config_id=args.config_id,
        limit=args.limit,
    )

    print(
        json.dumps(
            result,
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()