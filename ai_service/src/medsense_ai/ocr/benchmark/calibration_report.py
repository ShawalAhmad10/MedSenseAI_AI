from __future__ import annotations

import argparse
import json
from collections import Counter
from hashlib import sha256
from pathlib import Path
from statistics import mean
from typing import Any, Iterable

from medsense_ai.ocr.benchmark.confidence_calibration import (
    MAX_UNSAFE_FALSE_ACCEPT_RATE,
    MIN_REVIEW_TRIGGER_RECALL,
    calibrate_confidence_threshold,
    threshold_triggers_review,
)
from medsense_ai.ocr.benchmark.manifest import (
    load_evaluation_stage,
)
from medsense_ai.ocr.benchmark.resumable_runner import (
    DEFAULT_RUN_ROOT,
)
from medsense_ai.ocr.benchmark.runner_contracts import (
    BenchmarkEvaluationStage,
    get_benchmark_configuration,
)


CLEAN_CER_GATE = 0.05
CLEAN_WER_GATE = 0.10
CLEAN_MEDICATION_RECALL_GATE = 0.95


def _file_sha256(
    path: Path,
) -> str:
    digest = sha256()

    with path.open("rb") as handle:
        for chunk in iter(
            lambda: handle.read(
                1024 * 1024
            ),
            b"",
        ):
            digest.update(chunk)

    return digest.hexdigest()


def _write_json(
    path: Path,
    payload: dict[str, Any],
) -> None:
    path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    path.write_text(
        json.dumps(
            payload,
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
        newline="\n",
    )


def _load_jsonl(
    path: Path,
) -> list[dict[str, Any]]:
    if not path.is_file():
        raise FileNotFoundError(
            f"Calibration results not found: {path}"
        )

    rows: list[dict[str, Any]] = []

    with path.open(
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
                    "Blank calibration result row "
                    f"at line {line_number}."
                )

            payload = json.loads(
                line
            )

            if not isinstance(
                payload,
                dict,
            ):
                raise RuntimeError(
                    "Calibration result row must "
                    "be a JSON object."
                )

            rows.append(
                payload
            )

    return rows


def _nonnegative_int(
    value: Any,
    *,
    field: str,
) -> int:
    if (
        isinstance(value, bool)
        or not isinstance(value, int)
        or value < 0
    ):
        raise ValueError(
            f"{field} must be a non-negative integer."
        )

    return value


def _float_value(
    value: Any,
    *,
    field: str,
) -> float:
    if isinstance(value, bool):
        raise ValueError(
            f"{field} must be numeric."
        )

    try:
        return float(value)

    except (
        TypeError,
        ValueError,
    ) as exc:
        raise ValueError(
            f"{field} must be numeric."
        ) from exc


def _micro_rate(
    *,
    numerator: int,
    denominator: int,
) -> float:
    if denominator == 0:
        return (
            0.0
            if numerator == 0
            else 1.0
        )

    return numerator / denominator


def _aggregate_rows(
    rows: Iterable[
        dict[str, Any]
    ],
) -> dict[str, Any]:
    items = tuple(
        rows
    )

    if not items:
        raise ValueError(
            "Cannot aggregate empty calibration rows."
        )

    character_errors = sum(
        _nonnegative_int(
            row.get(
                "character_errors"
            ),
            field="character_errors",
        )
        for row in items
    )

    reference_characters = sum(
        _nonnegative_int(
            row.get(
                "reference_characters"
            ),
            field="reference_characters",
        )
        for row in items
    )

    word_errors = sum(
        _nonnegative_int(
            row.get(
                "word_errors"
            ),
            field="word_errors",
        )
        for row in items
    )

    reference_words = sum(
        _nonnegative_int(
            row.get(
                "reference_words"
            ),
            field="reference_words",
        )
        for row in items
    )

    exact_text_matches = sum(
        int(
            row.get(
                "exact_text_match"
            )
            is True
        )
        for row in items
    )

    exact_line_matches = sum(
        _nonnegative_int(
            row.get(
                "exact_line_matches"
            ),
            field="exact_line_matches",
        )
        for row in items
    )

    reference_lines = sum(
        _nonnegative_int(
            row.get(
                "reference_lines"
            ),
            field="reference_lines",
        )
        for row in items
    )

    medication_expected = sum(
        _nonnegative_int(
            row.get(
                "medication_expected_count"
            ),
            field=(
                "medication_expected_count"
            ),
        )
        for row in items
    )

    medication_matched = sum(
        _nonnegative_int(
            row.get(
                "medication_matched_count"
            ),
            field=(
                "medication_matched_count"
            ),
        )
        for row in items
    )

    medication_missed = sum(
        _nonnegative_int(
            row.get(
                "medication_missed_count"
            ),
            field=(
                "medication_missed_count"
            ),
        )
        for row in items
    )

    invention_count = sum(
        _nonnegative_int(
            row.get(
                "benchmark_known_invention_count"
            ),
            field=(
                "benchmark_known_invention_count"
            ),
        )
        for row in items
    )

    complete_medication_recovery_count = sum(
        int(
            _nonnegative_int(
                row.get(
                    "medication_missed_count"
                ),
                field=(
                    "medication_missed_count"
                ),
            )
            == 0
        )
        for row in items
    )

    detected_benchmark_medications = (
        medication_matched
        + invention_count
    )

    if detected_benchmark_medications == 0:
        medication_micro_precision = (
            1.0
            if medication_expected == 0
            else 0.0
        )
    else:
        medication_micro_precision = (
            medication_matched
            / detected_benchmark_medications
        )

    elapsed_values = [
        _float_value(
            row.get(
                "elapsed_ms"
            ),
            field="elapsed_ms",
        )
        for row in items
    ]

    return {
        "sample_count": len(
            items
        ),
        "character_errors": (
            character_errors
        ),
        "reference_characters": (
            reference_characters
        ),
        "micro_cer": _micro_rate(
            numerator=character_errors,
            denominator=(
                reference_characters
            ),
        ),
        "word_errors": (
            word_errors
        ),
        "reference_words": (
            reference_words
        ),
        "micro_wer": _micro_rate(
            numerator=word_errors,
            denominator=(
                reference_words
            ),
        ),
        "exact_text_matches": (
            exact_text_matches
        ),
        "exact_text_match_rate": (
            exact_text_matches
            / len(items)
        ),
        "exact_line_matches": (
            exact_line_matches
        ),
        "reference_lines": (
            reference_lines
        ),
        "exact_line_match_rate": (
            _micro_rate(
                numerator=(
                    exact_line_matches
                ),
                denominator=(
                    reference_lines
                ),
            )
        ),
        "medication_expected_count": (
            medication_expected
        ),
        "medication_matched_count": (
            medication_matched
        ),
        "medication_missed_count": (
            medication_missed
        ),
        "medication_micro_recall": (
            _micro_rate(
                numerator=(
                    medication_matched
                ),
                denominator=(
                    medication_expected
                ),
            )
        ),
        "medication_micro_precision": (
            medication_micro_precision
        ),
        "samples_with_all_expected_recovered": (
            complete_medication_recovery_count
        ),
        "complete_medication_recovery_rate": (
            complete_medication_recovery_count
            / len(items)
        ),
        "benchmark_known_invention_count": (
            invention_count
        ),
        "total_elapsed_ms": sum(
            elapsed_values
        ),
        "mean_elapsed_ms": mean(
            elapsed_values
        ),
    }


def summarize_calibration_rows(
    rows: Iterable[
        dict[str, Any]
    ],
) -> dict[str, Any]:
    items = tuple(
        rows
    )

    if not items:
        raise ValueError(
            "Calibration rows must not be empty."
        )

    overall = _aggregate_rows(
        items
    )

    status_counts = Counter(
        str(
            row.get(
                "status"
            )
        )
        for row in items
    )

    sample_type_counts = Counter(
        str(
            row.get(
                "sample_type"
            )
        )
        for row in items
    )

    quality_groups: dict[
        str,
        list[dict[str, Any]],
    ] = {}

    for row in items:
        quality = row.get(
            "quality"
        )

        if quality is None:
            continue

        quality_name = str(
            quality
        )

        quality_groups.setdefault(
            quality_name,
            [],
        ).append(
            row
        )

    quality_metrics = {
        quality: _aggregate_rows(
            group
        )
        for quality, group
        in sorted(
            quality_groups.items()
        )
    }

    confidence = (
        calibrate_confidence_threshold(
            items
        )
    )

    selected_threshold = (
        confidence.selected_threshold
    )

    handwriting_rows = tuple(
        row
        for row in items
        if row.get(
            "sample_type"
        )
        == "handwriting_safety"
    )

    handwriting_trigger_count = sum(
        int(
            threshold_triggers_review(
                row,
                threshold=(
                    selected_threshold
                ),
            )
        )
        for row in handwriting_rows
    )

    if handwriting_rows:
        handwriting_review_recall = (
            handwriting_trigger_count
            / len(handwriting_rows)
        )

    else:
        handwriting_review_recall = 0.0

    clean_metrics = (
        quality_metrics.get(
            "clean"
        )
    )

    if clean_metrics is None:
        clean_cer_pass = False
        clean_wer_pass = False
        clean_medication_pass = False

    else:
        clean_cer_pass = (
            clean_metrics[
                "micro_cer"
            ]
            <= CLEAN_CER_GATE
        )

        clean_wer_pass = (
            clean_metrics[
                "micro_wer"
            ]
            <= CLEAN_WER_GATE
        )

        clean_medication_pass = (
            clean_metrics[
                "medication_micro_recall"
            ]
            >= CLEAN_MEDICATION_RECALL_GATE
        )

    invention_gate_pass = (
        overall[
            "benchmark_known_invention_count"
        ]
        == 0
    )

    review_recall_gate_pass = (
        confidence
        .selected
        .review_trigger_recall
        >= MIN_REVIEW_TRIGGER_RECALL
    )

    false_accept_gate_pass = (
        confidence
        .selected
        .unsafe_false_accept_rate
        <= MAX_UNSAFE_FALSE_ACCEPT_RATE
    )

    handwriting_gate_pass = (
        handwriting_review_recall
        >= MIN_REVIEW_TRIGGER_RECALL
    )

    all_gates_pass = all(
        (
            clean_cer_pass,
            clean_wer_pass,
            clean_medication_pass,
            invention_gate_pass,
            review_recall_gate_pass,
            false_accept_gate_pass,
            handwriting_gate_pass,
        )
    )

    return {
        "status_counts": dict(
            sorted(
                status_counts.items()
            )
        ),
        "sample_type_counts": dict(
            sorted(
                sample_type_counts.items()
            )
        ),
        "overall": overall,
        "quality_metrics": (
            quality_metrics
        ),
        "confidence_calibration": {
            "selected_threshold": (
                confidence
                .selected_threshold
            ),
            "candidate_count": (
                confidence
                .candidate_count
            ),
            "fallback_all_review": (
                confidence
                .fallback_all_review
            ),
            "review_trigger_count": (
                confidence
                .selected
                .review_trigger_count
            ),
            "unsafe_sample_count": (
                confidence
                .selected
                .unsafe_sample_count
            ),
            "safe_sample_count": (
                confidence
                .selected
                .safe_sample_count
            ),
            "review_trigger_recall": (
                confidence
                .selected
                .review_trigger_recall
            ),
            "unsafe_false_accept_count": (
                confidence
                .selected
                .unsafe_false_accept_count
            ),
            "unsafe_false_accept_rate": (
                confidence
                .selected
                .unsafe_false_accept_rate
            ),
            "safe_false_review_rate": (
                confidence
                .selected
                .safe_false_review_rate
            ),
            "meets_safety_gate": (
                confidence
                .selected
                .meets_safety_gate
            ),
        },
        "handwriting_safety": {
            "sample_count": len(
                handwriting_rows
            ),
            "review_trigger_count": (
                handwriting_trigger_count
            ),
            "review_trigger_recall": (
                handwriting_review_recall
            ),
        },
        "gates": {
            "clean_cer_max": (
                CLEAN_CER_GATE
            ),
            "clean_cer_pass": (
                clean_cer_pass
            ),
            "clean_wer_max": (
                CLEAN_WER_GATE
            ),
            "clean_wer_pass": (
                clean_wer_pass
            ),
            "clean_medication_recall_min": (
                CLEAN_MEDICATION_RECALL_GATE
            ),
            "clean_medication_recall_pass": (
                clean_medication_pass
            ),
            "benchmark_known_invention_zero_pass": (
                invention_gate_pass
            ),
            "review_trigger_recall_min": (
                MIN_REVIEW_TRIGGER_RECALL
            ),
            "review_trigger_recall_pass": (
                review_recall_gate_pass
            ),
            "unsafe_false_accept_rate_max": (
                MAX_UNSAFE_FALSE_ACCEPT_RATE
            ),
            "unsafe_false_accept_rate_pass": (
                false_accept_gate_pass
            ),
            "handwriting_review_trigger_recall_pass": (
                handwriting_gate_pass
            ),
            "all_calibration_gates_pass": (
                all_gates_pass
            ),
        },
    }


def build_calibration_report(
    *,
    config_id: str,
    run_root: Path = DEFAULT_RUN_ROOT,
) -> dict[str, Any]:
    stage = (
        BenchmarkEvaluationStage.CALIBRATION
    )

    config = (
        get_benchmark_configuration(
            config_id
        )
    )

    records = load_evaluation_stage(
        stage=stage
    )

    expected_ids = tuple(
        record.sample_id
        for record in records
    )

    expected_id_set = set(
        expected_ids
    )

    run_dir = (
        run_root
        / stage.value
        / config_id
    )

    metadata_path = (
        run_dir
        / "run_metadata.json"
    )

    results_path = (
        run_dir
        / "results.jsonl"
    )

    if not metadata_path.is_file():
        raise FileNotFoundError(
            "Calibration run metadata not found: "
            f"{metadata_path}"
        )

    metadata = json.loads(
        metadata_path.read_text(
            encoding="utf-8"
        )
    )

    expected_metadata = {
        "stage": (
            stage.value
        ),
        "config_id": (
            config.config_id
        ),
        "engine": (
            config.engine.value
        ),
        "preprocess": (
            config.preprocess.value
        ),
    }

    if metadata != expected_metadata:
        raise RuntimeError(
            "Calibration run metadata does not "
            "match requested configuration."
        )

    rows = _load_jsonl(
        results_path
    )

    rows_by_id: dict[
        str,
        dict[str, Any],
    ] = {}

    for row in rows:
        sample_id = row.get(
            "sample_id"
        )

        if (
            not isinstance(
                sample_id,
                str,
            )
            or not sample_id
        ):
            raise RuntimeError(
                "Calibration result has invalid "
                "sample_id."
            )

        if sample_id in rows_by_id:
            raise RuntimeError(
                "Duplicate calibration result: "
                f"{sample_id}"
            )

        rows_by_id[
            sample_id
        ] = row

    result_ids = set(
        rows_by_id
    )

    unknown_ids = (
        result_ids
        - expected_id_set
    )

    if unknown_ids:
        raise RuntimeError(
            "Calibration results contain unknown "
            "sample IDs: "
            f"{sorted(unknown_ids)}"
        )

    missing_ids = (
        expected_id_set
        - result_ids
    )

    if missing_ids:
        raise RuntimeError(
            "Calibration run is incomplete. "
            f"Completed {len(result_ids)}/"
            f"{len(expected_ids)} samples; "
            f"{len(missing_ids)} remain."
        )

    ordered_rows = tuple(
        rows_by_id[
            sample_id
        ]
        for sample_id in expected_ids
    )

    benchmark_versions = {
        record.benchmark_version
        for record in records
    }

    if len(
        benchmark_versions
    ) != 1:
        raise RuntimeError(
            "Calibration manifest contains "
            "multiple benchmark versions."
        )

    benchmark_version = next(
        iter(
            benchmark_versions
        )
    )

    summary = (
        summarize_calibration_rows(
            ordered_rows
        )
    )

    manifest_identity = (
        "\n".join(
            expected_ids
        ).encode(
            "utf-8"
        )
    )

    report = {
        "benchmark_version": (
            benchmark_version
        ),
        "stage": (
            stage.value
        ),
        "config_id": (
            config.config_id
        ),
        "engine": (
            config.engine.value
        ),
        "preprocess": (
            config.preprocess.value
        ),
        "expected_sample_count": (
            len(
                expected_ids
            )
        ),
        "completed_sample_count": (
            len(
                ordered_rows
            )
        ),
        "manifest_sample_ids_sha256": (
            sha256(
                manifest_identity
            ).hexdigest()
        ),
        "results_sha256": (
            _file_sha256(
                results_path
            )
        ),
        "summary": (
            summary
        ),
    }

    report_path = (
        run_dir
        / "calibration_report.json"
    )

    _write_json(
        report_path,
        report,
    )

    return {
        "report": (
            report
        ),
        "report_path": str(
            report_path
        ),
        "report_sha256": (
            _file_sha256(
                report_path
            )
        ),
    }


def main() -> None:
    parser = (
        argparse.ArgumentParser(
            description=(
                "Build a deterministic OCR "
                "calibration report from completed "
                "resumable benchmark results."
            )
        )
    )

    parser.add_argument(
        "--config-id",
        required=True,
    )

    args = (
        parser.parse_args()
    )

    result = (
        build_calibration_report(
            config_id=(
                args.config_id
            )
        )
    )

    payload = {
        "report_path": (
            result[
                "report_path"
            ]
        ),
        "report_sha256": (
            result[
                "report_sha256"
            ]
        ),
        "config_id": (
            result[
                "report"
            ][
                "config_id"
            ]
        ),
        "sample_count": (
            result[
                "report"
            ][
                "completed_sample_count"
            ]
        ),
        "micro_cer": (
            result[
                "report"
            ][
                "summary"
            ][
                "overall"
            ][
                "micro_cer"
            ]
        ),
        "micro_wer": (
            result[
                "report"
            ][
                "summary"
            ][
                "overall"
            ][
                "micro_wer"
            ]
        ),
        "selected_threshold": (
            result[
                "report"
            ][
                "summary"
            ][
                "confidence_calibration"
            ][
                "selected_threshold"
            ]
        ),
        "all_calibration_gates_pass": (
            result[
                "report"
            ][
                "summary"
            ][
                "gates"
            ][
                "all_calibration_gates_pass"
            ]
        ),
    }

    print(
        json.dumps(
            payload,
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
