from __future__ import annotations

from collections import Counter
from collections.abc import Callable
from statistics import mean
from typing import Any, Sequence

from medsense_ai.ocr.benchmark.aggregation import (
    aggregate_by_quality,
    aggregate_scores,
    score_sample,
)
from medsense_ai.ocr.benchmark.manifest import (
    BenchmarkManifestRecord,
    load_evaluation_stage,
)
from medsense_ai.ocr.benchmark.runner_contracts import (
    BenchmarkEvaluationStage,
    get_benchmark_configuration,
)
from medsense_ai.ocr.benchmark.safety_metrics import (
    aggregate_medication_evidence,
    score_medication_evidence,
)
from medsense_ai.ocr.contracts import OCREngine
from medsense_ai.ocr.engines.paddleocr import PaddleOCRAdapter
from medsense_ai.ocr.engines.tesseract import TesseractAdapter
from medsense_ai.ocr.preprocessing import preprocess_image_bytes


def _create_adapter(
    engine: OCREngine,
) -> TesseractAdapter | PaddleOCRAdapter:
    """
    Create exactly one OCR adapter for a benchmark batch.

    The caller reuses this adapter across all selected samples.
    """

    if engine is OCREngine.TESSERACT:
        return TesseractAdapter()

    if engine is OCREngine.PADDLEOCR:
        return PaddleOCRAdapter()

    raise ValueError(
        f"Unsupported OCR engine: {engine!r}"
    )


def _media_type(
    record: BenchmarkManifestRecord,
) -> str:
    """
    Resolve benchmark image MIME type from its frozen path.
    """

    suffix = record.image_path.suffix.lower()

    if suffix == ".png":
        return "image/png"

    if suffix in {
        ".jpg",
        ".jpeg",
    }:
        return "image/jpeg"

    raise ValueError(
        f"Unsupported image extension: {suffix!r}"
    )


def _confidence_values(
    *,
    engine: OCREngine,
    lines: Sequence[Any],
) -> tuple[float, ...]:
    """
    Convert engine-specific line confidence values to [0, 1].

    Tesseract exposes confidence approximately on [0, 100].
    PaddleOCR exposes confidence on [0, 1].
    """

    values: list[float] = []

    for line in lines:
        confidence = line.confidence

        if confidence is None:
            continue

        value = float(confidence)

        if engine is OCREngine.TESSERACT:
            if not 0.0 <= value <= 100.0:
                raise ValueError(
                    "Invalid Tesseract confidence: "
                    f"{value}"
                )

            value /= 100.0

        elif engine is OCREngine.PADDLEOCR:
            if not 0.0 <= value <= 1.0:
                raise ValueError(
                    "Invalid PaddleOCR confidence: "
                    f"{value}"
                )

        else:
            raise ValueError(
                f"Unsupported OCR engine: {engine!r}"
            )

        values.append(value)

    return tuple(values)


def _select_records(
    records: tuple[
        BenchmarkManifestRecord,
        ...,
    ],
    *,
    sample_ids: Sequence[str] | None,
    limit: int | None,
) -> tuple[
    BenchmarkManifestRecord,
    ...,
]:
    """
    Select benchmark samples deterministically.

    Explicit sample order is preserved.
    """

    selected = records

    if sample_ids is not None:
        requested = tuple(
            sample_ids
        )

        if len(requested) != len(set(requested)):
            raise ValueError(
                "Requested sample IDs must be unique."
            )

        by_id = {
            record.sample_id: record
            for record in records
        }

        missing = [
            sample_id
            for sample_id in requested
            if sample_id not in by_id
        ]

        if missing:
            raise KeyError(
                "Requested benchmark samples were "
                "not found in this stage: "
                f"{missing}"
            )

        selected = tuple(
            by_id[sample_id]
            for sample_id in requested
        )

    if limit is not None:
        if limit <= 0:
            raise ValueError(
                "Batch limit must be positive."
            )

        selected = selected[:limit]

    if not selected:
        raise RuntimeError(
            "No benchmark samples selected."
        )

    return selected


def run_benchmark_stage(
    *,
    config_id: str,
    stage: BenchmarkEvaluationStage,
    sample_ids: Sequence[str] | None = None,
    limit: int | None = None,
    progress_callback: (
        Callable[
            [dict[str, Any]],
            None,
        ]
        | None
    ) = None,
) -> dict[str, Any]:
    """
    Run one frozen OCR benchmark configuration.

    Important guarantees:
    - one adapter instance is reused for the whole batch;
    - calibration/validation stage data stays isolated;
    - sealed-test execution is forbidden here;
    - raw OCR output is scored without medicine correction;
    - progress can be persisted after every completed sample.
    """

    if stage is BenchmarkEvaluationStage.SEALED_TEST:
        raise PermissionError(
            "The reusable OCR batch runner does not "
            "permit sealed-test execution."
        )

    config = get_benchmark_configuration(
        config_id
    )

    stage_records = load_evaluation_stage(
        stage=stage
    )

    selected = _select_records(
        stage_records,
        sample_ids=sample_ids,
        limit=limit,
    )

    # Stage-scoped known medication vocabulary.
    #
    # This deliberately does not inspect sealed-test
    # samples while running calibration/validation.
    medication_vocabulary = tuple(
        sorted(
            {
                medication
                for record in stage_records
                for medication
                in record.medication_spans
            }
        )
    )

    # CRITICAL:
    # Create one adapter and reuse it across the whole
    # batch. This prevents Paddle model reload per image.
    adapter = _create_adapter(
        config.engine
    )

    rows: list[
        dict[str, Any]
    ] = []

    text_scores = []
    medication_scores = []

    for record in selected:
        if not record.image_path.is_file():
            raise FileNotFoundError(
                "Benchmark image missing: "
                f"{record.image_path}"
            )

        encoded_bytes = (
            record.image_path.read_bytes()
        )

        preprocessed = preprocess_image_bytes(
            encoded_bytes,
            mode=config.preprocess,
            media_type=_media_type(
                record
            ),
        )

        execution = adapter.recognize(
            preprocessed
        )

        result = execution.result
        metadata = execution.metadata

        text_score = score_sample(
            sample_id=record.sample_id,
            split=record.split.value,
            sample_type=(
                record.sample_type.value
            ),
            quality=(
                record.quality.value
                if record.quality is not None
                else None
            ),
            reference=record.expected_text,
            hypothesis=result.raw_text,
        )

        medication_score = (
            score_medication_evidence(
                expected_medications=(
                    record.medication_spans
                ),
                hypothesis=result.raw_text,
                known_medication_vocabulary=(
                    medication_vocabulary
                ),
            )
        )

        confidences = _confidence_values(
            engine=config.engine,
            lines=result.lines,
        )

        row: dict[str, Any] = {
            "sample_id": (
                record.sample_id
            ),
            "sample_type": (
                record.sample_type.value
            ),
            "quality": (
                record.quality.value
                if record.quality is not None
                else None
            ),
            "status": (
                result.status.value
            ),
            "review_required": (
                result.review_required
            ),
            "warnings": list(
                result.warnings
            ),
            "engine_version": (
                metadata.engine_version
            ),
            "elapsed_ms": (
                metadata.elapsed_ms
            ),
            "line_count": len(
                result.lines
            ),
            "line_confidences_unit": list(
                confidences
            ),
            "mean_line_confidence_unit": (
                mean(confidences)
                if confidences
                else None
            ),
            "min_line_confidence_unit": (
                min(confidences)
                if confidences
                else None
            ),

            # Exact count-based text metrics.
            #
            # These fields are persisted so later reports
            # can compute true micro CER/WER from totals
            # without having to rerun OCR.
            "character_errors": (
                text_score
                .metrics
                .character_errors
            ),
            "reference_characters": (
                text_score
                .metrics
                .reference_characters
            ),
            "cer": (
                text_score.metrics.cer
            ),
            "word_errors": (
                text_score
                .metrics
                .word_errors
            ),
            "reference_words": (
                text_score
                .metrics
                .reference_words
            ),
            "wer": (
                text_score.metrics.wer
            ),
            "exact_text_match": (
                text_score
                .metrics
                .exact_text_match
            ),
            "exact_line_matches": (
                text_score
                .metrics
                .exact_line_matches
            ),
            "reference_lines": (
                text_score
                .metrics
                .reference_lines
            ),
            "exact_line_match_rate": (
                text_score
                .metrics
                .exact_line_match_rate
            ),

            # Medication evidence metrics.
            "medication_expected_count": (
                medication_score
                .expected_count
            ),
            "medication_matched_count": (
                medication_score
                .matched_count
            ),
            "medication_missed_count": (
                medication_score
                .missed_count
            ),
            "medication_recall": (
                medication_score.recall
            ),
            "medication_precision": (
                medication_score.precision
            ),
            "missed_medications": list(
                medication_score
                .missed_medications
            ),
            "benchmark_known_invention_count": (
                medication_score
                .benchmark_known_invention_count
            ),
            "benchmark_known_inventions": list(
                medication_score
                .benchmark_known_inventions
            ),
        }

        rows.append(
            row
        )

        text_scores.append(
            text_score
        )

        medication_scores.append(
            medication_score
        )

        # The resumable calibration runner uses this
        # callback to append each completed sample to disk
        # immediately.
        if progress_callback is not None:
            progress_callback(
                dict(row)
            )

    aggregate = aggregate_scores(
        text_scores
    )

    medication_aggregate = (
        aggregate_medication_evidence(
            medication_scores
        )
    )

    quality_metrics = (
        aggregate_by_quality(
            text_scores
        )
    )

    elapsed_values = [
        float(
            row["elapsed_ms"]
        )
        for row in rows
    ]

    status_counts = Counter(
        row["status"]
        for row in rows
    )

    return {
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
        "sample_count": (
            len(rows)
        ),
        "status_counts": dict(
            sorted(
                status_counts.items()
            )
        ),
        "summary": {
            "character_errors": (
                aggregate
                .character_errors
            ),
            "reference_characters": (
                aggregate
                .reference_characters
            ),
            "micro_cer": (
                aggregate.micro_cer
            ),
            "word_errors": (
                aggregate.word_errors
            ),
            "reference_words": (
                aggregate.reference_words
            ),
            "micro_wer": (
                aggregate.micro_wer
            ),
            "exact_text_matches": (
                aggregate
                .exact_text_matches
            ),
            "exact_text_match_rate": (
                aggregate
                .exact_text_match_rate
            ),
            "exact_line_matches": (
                aggregate
                .exact_line_matches
            ),
            "reference_lines": (
                aggregate
                .reference_lines
            ),
            "exact_line_match_rate": (
                aggregate
                .exact_line_match_rate
            ),
            "medication_expected_count": (
                medication_aggregate
                .expected_count
            ),
            "medication_matched_count": (
                medication_aggregate
                .matched_count
            ),
            "medication_missed_count": (
                medication_aggregate
                .missed_count
            ),
            "medication_micro_recall": (
                medication_aggregate
                .micro_recall
            ),
            "medication_micro_precision": (
                medication_aggregate
                .micro_precision
            ),
            "benchmark_known_invention_count": (
                medication_aggregate
                .benchmark_known_invention_count
            ),
            "samples_with_all_expected_recovered": (
                medication_aggregate
                .samples_with_all_expected_recovered
            ),
            "complete_medication_recovery_rate": (
                medication_aggregate
                .complete_recovery_rate
            ),
            "total_elapsed_ms": sum(
                elapsed_values
            ),
            "mean_elapsed_ms": (
                mean(
                    elapsed_values
                )
                if elapsed_values
                else 0.0
            ),
        },
        "quality_metrics": {
            quality: {
                "sample_count": (
                    metrics.sample_count
                ),
                "character_errors": (
                    metrics
                    .character_errors
                ),
                "reference_characters": (
                    metrics
                    .reference_characters
                ),
                "micro_cer": (
                    metrics.micro_cer
                ),
                "word_errors": (
                    metrics
                    .word_errors
                ),
                "reference_words": (
                    metrics
                    .reference_words
                ),
                "micro_wer": (
                    metrics.micro_wer
                ),
                "exact_text_matches": (
                    metrics
                    .exact_text_matches
                ),
                "exact_text_match_rate": (
                    metrics
                    .exact_text_match_rate
                ),
                "exact_line_matches": (
                    metrics
                    .exact_line_matches
                ),
                "reference_lines": (
                    metrics
                    .reference_lines
                ),
                "exact_line_match_rate": (
                    metrics
                    .exact_line_match_rate
                ),
            }
            for quality, metrics
            in quality_metrics.items()
        },
        "samples": rows,
    }