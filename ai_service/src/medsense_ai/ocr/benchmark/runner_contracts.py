from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from medsense_ai.ocr.contracts import (
    OCREngine,
    PreprocessMode,
)


class BenchmarkEvaluationStage(str, Enum):
    CALIBRATION = "calibration"
    VALIDATION = "validation"
    SEALED_TEST = "sealed_test"


@dataclass(frozen=True)
class OCRBenchmarkConfiguration:
    config_id: str
    engine: OCREngine
    preprocess: PreprocessMode


FROZEN_BENCHMARK_CONFIGURATIONS: tuple[
    OCRBenchmarkConfiguration,
    ...,
] = (
    OCRBenchmarkConfiguration(
        config_id="tesseract__decode_only_v1",
        engine=OCREngine.TESSERACT,
        preprocess=PreprocessMode.DECODE_ONLY_V1,
    ),
    OCRBenchmarkConfiguration(
        config_id="tesseract__document_basic_v1",
        engine=OCREngine.TESSERACT,
        preprocess=PreprocessMode.DOCUMENT_BASIC_V1,
    ),
    OCRBenchmarkConfiguration(
        config_id="paddleocr__decode_only_v1",
        engine=OCREngine.PADDLEOCR,
        preprocess=PreprocessMode.DECODE_ONLY_V1,
    ),
    OCRBenchmarkConfiguration(
        config_id="paddleocr__document_basic_v1",
        engine=OCREngine.PADDLEOCR,
        preprocess=PreprocessMode.DOCUMENT_BASIC_V1,
    ),
)


def get_frozen_benchmark_configurations(
) -> tuple[OCRBenchmarkConfiguration, ...]:
    return FROZEN_BENCHMARK_CONFIGURATIONS


def get_benchmark_configuration(
    config_id: str,
) -> OCRBenchmarkConfiguration:
    matches = tuple(
        config
        for config in FROZEN_BENCHMARK_CONFIGURATIONS
        if config.config_id == config_id
    )

    if not matches:
        raise KeyError(
            f"Unknown OCR benchmark configuration: {config_id}"
        )

    if len(matches) != 1:
        raise RuntimeError(
            f"Duplicate OCR benchmark configuration: {config_id}"
        )

    return matches[0]


def assert_sealed_test_authorized(
    *,
    stage: BenchmarkEvaluationStage,
    allow_sealed_test: bool = False,
) -> None:
    if (
        stage is BenchmarkEvaluationStage.SEALED_TEST
        and not allow_sealed_test
    ):
        raise PermissionError(
            "Sealed OCR benchmark evaluation is locked. "
            "Calibration and validation must be completed, "
            "a configuration must be frozen, and sealed-test "
            "execution must then be explicitly authorized."
        )