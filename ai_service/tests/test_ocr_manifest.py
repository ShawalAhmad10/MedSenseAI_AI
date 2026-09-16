from __future__ import annotations

import json
from hashlib import sha256
from pathlib import Path

import pytest

from medsense_ai.ocr.benchmark.contracts import (
    BenchmarkSampleType,
    BenchmarkSplit,
    PrintedQuality,
)
from medsense_ai.ocr.benchmark.manifest import (
    load_benchmark_manifest,
    load_evaluation_stage,
)
from medsense_ai.ocr.benchmark.runner_contracts import (
    BenchmarkEvaluationStage,
)


def _write_jsonl(
    path: Path,
    rows: list[dict],
) -> None:
    path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    with path.open(
        "w",
        encoding="utf-8",
        newline="\n",
    ) as handle:
        for row in rows:
            handle.write(
                json.dumps(row)
            )
            handle.write("\n")


def _make_fixture(
    root: Path,
) -> None:
    printed_rows = []
    handwriting_rows = []

    for split in (
        "calibration",
        "validation",
        "sealed_test",
    ):
        printed_id = f"printed_{split}"

        printed_relative = (
            f"printed/{split}/{printed_id}.png"
        )

        printed_bytes = printed_id.encode()

        printed_path = (
            root / printed_relative
        )

        printed_path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        printed_path.write_bytes(
            printed_bytes
        )

        printed_rows.append(
            {
                "benchmark_version": (
                    "med-ocr-benchmark-1.0.0"
                ),
                "sample_id": printed_id,
                "base_document_id": printed_id,
                "split": split,
                "sample_type": "printed",
                "quality": "clean",
                "image_path": printed_relative,
                "image_sha256": sha256(
                    printed_bytes
                ).hexdigest(),
                "width": 1400,
                "height": 1800,
                "expected_text": (
                    "PRESCRIPTION\n"
                    "Paracetamol 500 mg"
                ),
                "medication_spans": [
                    "Paracetamol 500 mg"
                ],
            }
        )

        hand_id = f"handwriting_{split}"

        hand_relative = (
            f"handwriting_safety/"
            f"{split}/{hand_id}.png"
        )

        hand_bytes = hand_id.encode()

        hand_path = root / hand_relative

        hand_path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        hand_path.write_bytes(
            hand_bytes
        )

        handwriting_rows.append(
            {
                "benchmark_version": (
                    "med-ocr-benchmark-1.0.0"
                ),
                "sample_id": hand_id,
                "base_document_id": hand_id,
                "split": split,
                "sample_type": (
                    "handwriting_safety"
                ),
                "quality": None,
                "image_path": hand_relative,
                "image_sha256": sha256(
                    hand_bytes
                ).hexdigest(),
                "width": 1400,
                "height": 1800,
                "expected_text": (
                    "PRESCRIPTION\n"
                    "Cetirizine 10 mg"
                ),
                "medication_spans": [
                    "Cetirizine 10 mg"
                ],
                "simulation_notice": (
                    "Synthetic script-font safety probe; "
                    "this is not real human handwriting."
                ),
            }
        )

    _write_jsonl(
        root / "printed_manifest.jsonl",
        printed_rows,
    )

    _write_jsonl(
        root / "handwriting_manifest.jsonl",
        handwriting_rows,
    )


def test_manifest_parses_printed_and_handwriting(
    tmp_path: Path,
) -> None:
    _make_fixture(tmp_path)

    records = load_benchmark_manifest(
        output_root=tmp_path
    )

    assert len(records) == 6

    printed = next(
        record
        for record in records
        if record.sample_type
        is BenchmarkSampleType.PRINTED
    )

    handwriting = next(
        record
        for record in records
        if record.sample_type
        is BenchmarkSampleType.HANDWRITING_SAFETY
    )

    assert printed.quality is PrintedQuality.CLEAN
    assert handwriting.quality is None

    assert (
        printed.split
        is BenchmarkSplit.CALIBRATION
    )

    assert printed.medication_spans == (
        "Paracetamol 500 mg",
    )


def test_calibration_loader_returns_only_calibration(
    tmp_path: Path,
) -> None:
    _make_fixture(tmp_path)

    records = load_evaluation_stage(
        stage=BenchmarkEvaluationStage.CALIBRATION,
        output_root=tmp_path,
    )

    assert len(records) == 2

    assert all(
        record.split
        is BenchmarkSplit.CALIBRATION
        for record in records
    )


def test_validation_loader_returns_only_validation(
    tmp_path: Path,
) -> None:
    _make_fixture(tmp_path)

    records = load_evaluation_stage(
        stage=BenchmarkEvaluationStage.VALIDATION,
        output_root=tmp_path,
    )

    assert len(records) == 2

    assert all(
        record.split
        is BenchmarkSplit.VALIDATION
        for record in records
    )


def test_sealed_loader_is_locked_by_default(
    tmp_path: Path,
) -> None:
    _make_fixture(tmp_path)

    with pytest.raises(
        PermissionError,
        match="Sealed OCR benchmark evaluation is locked",
    ):
        load_evaluation_stage(
            stage=BenchmarkEvaluationStage.SEALED_TEST,
            output_root=tmp_path,
        )

    records = load_evaluation_stage(
        stage=BenchmarkEvaluationStage.SEALED_TEST,
        output_root=tmp_path,
        allow_sealed_test=True,
    )

    assert len(records) == 2

    assert all(
        record.split
        is BenchmarkSplit.SEALED_TEST
        for record in records
    )


def test_manifest_rejects_path_escape(
    tmp_path: Path,
) -> None:
    _make_fixture(tmp_path)

    path = (
        tmp_path / "printed_manifest.jsonl"
    )

    rows = [
        json.loads(line)
        for line in path.read_text(
            encoding="utf-8"
        ).splitlines()
    ]

    rows[0]["image_path"] = (
        "../outside.png"
    )

    _write_jsonl(
        path,
        rows,
    )

    with pytest.raises(
        ValueError,
        match="must not escape",
    ):
        load_benchmark_manifest(
            output_root=tmp_path
        )