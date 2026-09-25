from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from medsense_ai.ocr.benchmark.manifest import (
    BenchmarkManifestRecord,
    load_evaluation_stage,
)
from medsense_ai.ocr.benchmark.metrics import (
    score_text,
)
from medsense_ai.ocr.benchmark.runner_contracts import (
    BenchmarkEvaluationStage,
    get_benchmark_configuration,
)
from medsense_ai.ocr.benchmark.safety_metrics import (
    score_medication_evidence,
)
from medsense_ai.ocr.contracts import (
    OCREngine,
)
from medsense_ai.ocr.engines.paddleocr import (
    PaddleOCRAdapter,
)
from medsense_ai.ocr.engines.tesseract import (
    TesseractAdapter,
)
from medsense_ai.ocr.preprocessing import (
    preprocess_image_bytes,
)


def _media_type_for_path(path: Path) -> str:
    suffix = path.suffix.lower()

    if suffix == ".png":
        return "image/png"

    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg"

    raise ValueError(
        f"Unsupported benchmark image extension: {suffix!r}"
    )


def _find_sample(
    *,
    records: tuple[BenchmarkManifestRecord, ...],
    sample_id: str,
) -> BenchmarkManifestRecord:
    matches = tuple(
        record
        for record in records
        if record.sample_id == sample_id
    )

    if not matches:
        raise KeyError(
            f"Calibration sample not found: {sample_id}"
        )

    if len(matches) != 1:
        raise RuntimeError(
            f"Duplicate benchmark sample: {sample_id}"
        )

    return matches[0]


def _create_adapter(
    engine: OCREngine,
) -> TesseractAdapter | PaddleOCRAdapter:
    if engine is OCREngine.TESSERACT:
        return TesseractAdapter()

    if engine is OCREngine.PADDLEOCR:
        return PaddleOCRAdapter()

    raise ValueError(
        f"Unsupported OCR engine: {engine!r}"
    )


def run_single_calibration_sample(
    *,
    config_id: str,
    sample_id: str,
) -> dict[str, Any]:
    """
    Run exactly one CALIBRATION sample.

    This function cannot run validation or sealed-test data.
    """

    config = get_benchmark_configuration(
        config_id
    )

    records = load_evaluation_stage(
        stage=BenchmarkEvaluationStage.CALIBRATION
    )

    sample = _find_sample(
        records=records,
        sample_id=sample_id,
    )

    if not sample.image_path.is_file():
        raise FileNotFoundError(
            f"Benchmark image missing: {sample.image_path}"
        )

    encoded_bytes = sample.image_path.read_bytes()

    preprocessed = preprocess_image_bytes(
        encoded_bytes,
        mode=config.preprocess,
        media_type=_media_type_for_path(
            sample.image_path
        ),
    )

    adapter = _create_adapter(
        config.engine
    )

    execution = adapter.recognize(
        preprocessed
    )

    result = execution.result
    metadata = execution.metadata

    text_metrics = score_text(
        sample.expected_text,
        result.raw_text,
    )

    calibration_vocabulary = tuple(
        sorted(
            {
                medication
                for record in records
                for medication
                in record.medication_spans
            }
        )
    )

    medication_metrics = (
        score_medication_evidence(
            expected_medications=(
                sample.medication_spans
            ),
            hypothesis=result.raw_text,
            known_medication_vocabulary=(
                calibration_vocabulary
            ),
        )
    )

    return {
        "stage": "calibration",
        "benchmark_version": (
            sample.benchmark_version
        ),
        "config_id": config.config_id,
        "engine": config.engine.value,
        "preprocess": config.preprocess.value,
        "sample": {
            "sample_id": sample.sample_id,
            "sample_type": (
                sample.sample_type.value
            ),
            "quality": (
                sample.quality.value
                if sample.quality is not None
                else None
            ),
            "expected_image_sha256": (
                sample.image_sha256
            ),
            "preprocessed_image_sha256": (
                preprocessed.sha256_hex
            ),
            "applied_preprocessing_steps": list(
                preprocessed.applied_steps
            ),
        },
        "ocr": {
            "status": result.status.value,
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
            "raw_text": result.raw_text,
            "line_count": len(
                result.lines
            ),
        },
        "text_metrics": {
            "character_errors": (
                text_metrics.character_errors
            ),
            "reference_characters": (
                text_metrics.reference_characters
            ),
            "cer": text_metrics.cer,
            "word_errors": (
                text_metrics.word_errors
            ),
            "reference_words": (
                text_metrics.reference_words
            ),
            "wer": text_metrics.wer,
            "exact_text_match": (
                text_metrics.exact_text_match
            ),
            "exact_line_matches": (
                text_metrics.exact_line_matches
            ),
            "reference_lines": (
                text_metrics.reference_lines
            ),
            "exact_line_match_rate": (
                text_metrics.exact_line_match_rate
            ),
        },
        "medication_evidence": {
            "expected_count": (
                medication_metrics.expected_count
            ),
            "matched_count": (
                medication_metrics.matched_count
            ),
            "missed_count": (
                medication_metrics.missed_count
            ),
            "recall": (
                medication_metrics.recall
            ),
            "precision": (
                medication_metrics.precision
            ),
            "benchmark_known_invention_count": (
                medication_metrics
                .benchmark_known_invention_count
            ),
            "missed_medications": list(
                medication_metrics
                .missed_medications
            ),
            "benchmark_known_inventions": list(
                medication_metrics
                .benchmark_known_inventions
            ),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Run exactly one OCR calibration "
            "benchmark sample."
        )
    )

    parser.add_argument(
        "--config-id",
        required=True,
    )

    parser.add_argument(
        "--sample-id",
        required=True,
    )

    args = parser.parse_args()

    payload = run_single_calibration_sample(
        config_id=args.config_id,
        sample_id=args.sample_id,
    )

    print(
        json.dumps(
            payload,
            indent=2,
            sort_keys=True,
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()