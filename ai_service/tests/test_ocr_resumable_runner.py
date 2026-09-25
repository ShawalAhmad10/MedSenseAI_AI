from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pytest

import medsense_ai.ocr.benchmark.resumable_runner as resumable
from medsense_ai.ocr.benchmark.runner_contracts import (
    BenchmarkEvaluationStage,
)
from medsense_ai.ocr.contracts import (
    OCREngine,
    PreprocessMode,
)


def _records():
    return tuple(
        SimpleNamespace(
            sample_id=f"sample_{number}"
        )
        for number in range(1, 4)
    )


def _config():
    return SimpleNamespace(
        config_id="tesseract__decode_only_v1",
        engine=OCREngine.TESSERACT,
        preprocess=PreprocessMode.DECODE_ONLY_V1,
    )


def _patch_dependencies(
    monkeypatch: pytest.MonkeyPatch,
):
    calls: list[tuple[str, ...]] = []

    def fake_get_config(config_id: str):
        assert config_id == "tesseract__decode_only_v1"
        return _config()

    def fake_load_stage(*, stage):
        assert stage is BenchmarkEvaluationStage.CALIBRATION
        return _records()

    def fake_run_stage(
        *,
        config_id,
        stage,
        sample_ids,
        progress_callback,
        **kwargs,
    ):
        assert config_id == "tesseract__decode_only_v1"
        assert stage is BenchmarkEvaluationStage.CALIBRATION

        ids = tuple(sample_ids)
        calls.append(ids)

        for sample_id in ids:
            progress_callback(
                {
                    "sample_id": sample_id,
                    "status": "SUCCESS",
                    "cer": 0.0,
                    "wer": 0.0,
                }
            )

        return {
            "sample_count": len(ids)
        }

    monkeypatch.setattr(
        resumable,
        "get_benchmark_configuration",
        fake_get_config,
    )

    monkeypatch.setattr(
        resumable,
        "load_evaluation_stage",
        fake_load_stage,
    )

    monkeypatch.setattr(
        resumable,
        "run_benchmark_stage",
        fake_run_stage,
    )

    return calls


def test_first_partial_run_persists_results(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    calls = _patch_dependencies(
        monkeypatch
    )

    result = resumable.run_resumable_calibration(
        config_id="tesseract__decode_only_v1",
        run_root=tmp_path,
        limit=2,
    )

    assert result["status"] == "PARTIAL"
    assert result["already_completed"] == 0
    assert result["processed_this_run"] == 2
    assert result["completed_total"] == 2
    assert result["remaining_after_run"] == 1

    assert calls == [
        (
            "sample_1",
            "sample_2",
        )
    ]

    results_path = Path(
        result["results_path"]
    )

    rows = [
        json.loads(line)
        for line in results_path.read_text(
            encoding="utf-8"
        ).splitlines()
    ]

    assert [
        row["sample_id"]
        for row in rows
    ] == [
        "sample_1",
        "sample_2",
    ]


def test_second_run_resumes_only_remaining_sample(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    calls = _patch_dependencies(
        monkeypatch
    )

    first = resumable.run_resumable_calibration(
        config_id="tesseract__decode_only_v1",
        run_root=tmp_path,
        limit=2,
    )

    assert first["status"] == "PARTIAL"

    second = resumable.run_resumable_calibration(
        config_id="tesseract__decode_only_v1",
        run_root=tmp_path,
    )

    assert second["status"] == "COMPLETE"
    assert second["already_completed"] == 2
    assert second["processed_this_run"] == 1
    assert second["completed_total"] == 3
    assert second["remaining_after_run"] == 0

    assert calls == [
        (
            "sample_1",
            "sample_2",
        ),
        (
            "sample_3",
        ),
    ]


def test_complete_run_does_not_rerun_samples(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    calls = _patch_dependencies(
        monkeypatch
    )

    resumable.run_resumable_calibration(
        config_id="tesseract__decode_only_v1",
        run_root=tmp_path,
    )

    calls.clear()

    result = resumable.run_resumable_calibration(
        config_id="tesseract__decode_only_v1",
        run_root=tmp_path,
    )

    assert result["status"] == "COMPLETE"
    assert result["processed_this_run"] == 0
    assert result["remaining_after_run"] == 0

    assert calls == []


def test_duplicate_saved_sample_fails_closed(
    tmp_path: Path,
) -> None:
    results_path = (
        tmp_path
        / "calibration"
        / "tesseract__decode_only_v1"
        / "results.jsonl"
    )

    results_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    row = {
        "sample_id": "sample_1"
    }

    results_path.write_text(
        json.dumps(row)
        + "\n"
        + json.dumps(row)
        + "\n",
        encoding="utf-8",
    )

    with pytest.raises(
        RuntimeError,
        match="Duplicate saved benchmark result",
    ):
        resumable._load_completed_ids(
            results_path
        )