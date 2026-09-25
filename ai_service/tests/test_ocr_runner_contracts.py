from __future__ import annotations

import pytest

from medsense_ai.ocr.benchmark.runner_contracts import (
    BenchmarkEvaluationStage,
    get_benchmark_configuration,
    get_frozen_benchmark_configurations,
    assert_sealed_test_authorized,
)
from medsense_ai.ocr.contracts import (
    OCREngine,
    PreprocessMode,
)


def test_exactly_four_frozen_ocr_configurations() -> None:
    configs = get_frozen_benchmark_configurations()

    assert len(configs) == 4

    assert {
        (
            config.engine,
            config.preprocess,
        )
        for config in configs
    } == {
        (
            OCREngine.TESSERACT,
            PreprocessMode.DECODE_ONLY_V1,
        ),
        (
            OCREngine.TESSERACT,
            PreprocessMode.DOCUMENT_BASIC_V1,
        ),
        (
            OCREngine.PADDLEOCR,
            PreprocessMode.DECODE_ONLY_V1,
        ),
        (
            OCREngine.PADDLEOCR,
            PreprocessMode.DOCUMENT_BASIC_V1,
        ),
    }


def test_frozen_configuration_ids_are_unique() -> None:
    configs = get_frozen_benchmark_configurations()

    ids = [
        config.config_id
        for config in configs
    ]

    assert len(ids) == len(set(ids))


def test_configuration_lookup_is_fail_closed() -> None:
    config = get_benchmark_configuration(
        "tesseract__decode_only_v1"
    )

    assert config.engine is OCREngine.TESSERACT

    assert (
        config.preprocess
        is PreprocessMode.DECODE_ONLY_V1
    )

    with pytest.raises(
        KeyError,
        match="Unknown OCR benchmark configuration",
    ):
        get_benchmark_configuration(
            "unknown"
        )


def test_sealed_test_is_locked_by_default() -> None:
    assert_sealed_test_authorized(
        stage=BenchmarkEvaluationStage.CALIBRATION
    )

    assert_sealed_test_authorized(
        stage=BenchmarkEvaluationStage.VALIDATION
    )

    with pytest.raises(
        PermissionError,
        match="Sealed OCR benchmark evaluation is locked",
    ):
        assert_sealed_test_authorized(
            stage=BenchmarkEvaluationStage.SEALED_TEST
        )

    assert_sealed_test_authorized(
        stage=BenchmarkEvaluationStage.SEALED_TEST,
        allow_sealed_test=True,
    )