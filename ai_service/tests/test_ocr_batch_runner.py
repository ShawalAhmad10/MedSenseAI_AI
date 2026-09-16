from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

import medsense_ai.ocr.benchmark.batch_runner as batch_runner
from medsense_ai.ocr.benchmark.manifest import (
    BenchmarkManifestRecord,
)
from medsense_ai.ocr.benchmark.runner_contracts import (
    BenchmarkEvaluationStage,
)
from medsense_ai.ocr.contracts import (
    OCREngine,
    OCRStatus,
    PreprocessMode,
)
from medsense_ai.ocr.benchmark.contracts import (
    BenchmarkSampleType,
    BenchmarkSplit,
    PrintedQuality,
)


def _record(
    *,
    root: Path,
    sample_id: str,
    expected_text: str = "PRESCRIPTION\nParacetamol 500 mg",
) -> BenchmarkManifestRecord:
    image_path = root / f"{sample_id}.png"
    image_path.write_bytes(b"fake-image")

    return BenchmarkManifestRecord(
        benchmark_version="med-ocr-benchmark-1.0.0",
        sample_id=sample_id,
        base_document_id=sample_id,
        split=BenchmarkSplit.CALIBRATION,
        sample_type=BenchmarkSampleType.PRINTED,
        quality=PrintedQuality.CLEAN,
        image_path=image_path,
        image_sha256="0" * 64,
        width=1400,
        height=1800,
        expected_text=expected_text,
        medication_spans=(
            "Paracetamol 500 mg",
        ),
        simulation_notice=None,
    )


class FakeAdapter:
    def __init__(self) -> None:
        self.recognize_calls = 0

    def recognize(self, image):
        self.recognize_calls += 1

        result = SimpleNamespace(
            status=OCRStatus.SUCCESS,
            review_required=False,
            warnings=(),
            raw_text=(
                "PRESCRIPTION\n"
                "Paracetamol 500 mg"
            ),
            lines=(
                SimpleNamespace(
                    text="PRESCRIPTION",
                    confidence=95.0,
                ),
                SimpleNamespace(
                    text="Paracetamol 500 mg",
                    confidence=96.0,
                ),
            ),
        )

        metadata = SimpleNamespace(
            engine_version="fake-tesseract",
            elapsed_ms=10.0,
        )

        return SimpleNamespace(
            result=result,
            metadata=metadata,
        )


@pytest.fixture
def patched_runner(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
):
    records = tuple(
        _record(
            root=tmp_path,
            sample_id=f"sample_{number}",
        )
        for number in range(1, 5)
    )

    adapter = FakeAdapter()
    create_count = {"value": 0}

    def fake_create_adapter(engine):
        assert engine is OCREngine.TESSERACT
        create_count["value"] += 1
        return adapter

    def fake_load_evaluation_stage(*, stage):
        assert stage is BenchmarkEvaluationStage.CALIBRATION
        return records

    def fake_preprocess_image_bytes(
        data,
        *,
        mode,
        media_type,
    ):
        assert data == b"fake-image"
        assert media_type == "image/png"

        return SimpleNamespace(
            preprocess_mode=mode,
        )

    monkeypatch.setattr(
        batch_runner,
        "_create_adapter",
        fake_create_adapter,
    )

    monkeypatch.setattr(
        batch_runner,
        "load_evaluation_stage",
        fake_load_evaluation_stage,
    )

    monkeypatch.setattr(
        batch_runner,
        "preprocess_image_bytes",
        fake_preprocess_image_bytes,
    )

    return (
        records,
        adapter,
        create_count,
    )


def test_batch_runner_reuses_one_adapter(
    patched_runner,
) -> None:
    records, adapter, create_count = patched_runner

    result = batch_runner.run_benchmark_stage(
        config_id="tesseract__decode_only_v1",
        stage=BenchmarkEvaluationStage.CALIBRATION,
    )

    assert result["sample_count"] == 4

    assert create_count["value"] == 1
    assert adapter.recognize_calls == 4

    assert result["status_counts"] == {
        "SUCCESS": 4
    }

    assert result["summary"]["micro_cer"] == 0.0
    assert result["summary"]["micro_wer"] == 0.0

    assert (
        result["summary"][
            "medication_micro_recall"
        ]
        == 1.0
    )


def test_requested_sample_order_is_preserved(
    patched_runner,
) -> None:
    result = batch_runner.run_benchmark_stage(
        config_id="tesseract__decode_only_v1",
        stage=BenchmarkEvaluationStage.CALIBRATION,
        sample_ids=(
            "sample_3",
            "sample_1",
        ),
    )

    assert [
        row["sample_id"]
        for row in result["samples"]
    ] == [
        "sample_3",
        "sample_1",
    ]


def test_unknown_sample_fails_closed(
    patched_runner,
) -> None:
    with pytest.raises(
        KeyError,
        match="were not found",
    ):
        batch_runner.run_benchmark_stage(
            config_id="tesseract__decode_only_v1",
            stage=BenchmarkEvaluationStage.CALIBRATION,
            sample_ids=(
                "does_not_exist",
            ),
        )


def test_sealed_test_is_forbidden() -> None:
    with pytest.raises(
        PermissionError,
        match="does not permit sealed-test",
    ):
        batch_runner.run_benchmark_stage(
            config_id="tesseract__decode_only_v1",
            stage=BenchmarkEvaluationStage.SEALED_TEST,
        )