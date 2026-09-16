from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from medsense_ai.ocr.benchmark.build import DEFAULT_OUTPUT_ROOT
from medsense_ai.ocr.benchmark.contracts import (
    BENCHMARK_VERSION,
    BenchmarkSampleType,
    BenchmarkSplit,
    PrintedQuality,
)
from medsense_ai.ocr.benchmark.runner_contracts import (
    BenchmarkEvaluationStage,
    assert_sealed_test_authorized,
)


@dataclass(frozen=True)
class BenchmarkManifestRecord:
    benchmark_version: str
    sample_id: str
    base_document_id: str

    split: BenchmarkSplit
    sample_type: BenchmarkSampleType
    quality: PrintedQuality | None

    image_path: Path
    image_sha256: str

    width: int
    height: int

    expected_text: str
    medication_spans: tuple[str, ...]

    simulation_notice: str | None = None


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        raise FileNotFoundError(
            f"OCR benchmark manifest not found: {path}"
        )

    rows: list[dict[str, Any]] = []

    with path.open(
        "r",
        encoding="utf-8",
    ) as handle:
        for line_number, raw_line in enumerate(
            handle,
            start=1,
        ):
            line = raw_line.strip()

            if not line:
                raise ValueError(
                    f"Blank row in {path} at line {line_number}."
                )

            payload = json.loads(line)

            if not isinstance(payload, dict):
                raise ValueError(
                    f"Expected JSON object in {path} "
                    f"at line {line_number}."
                )

            rows.append(payload)

    return rows


def _resolve_image_path(
    *,
    output_root: Path,
    relative_path: str,
) -> Path:
    manifest_path = Path(relative_path)

    if manifest_path.is_absolute():
        raise ValueError(
            "Benchmark image_path must be relative."
        )

    if ".." in manifest_path.parts:
        raise ValueError(
            "Benchmark image_path must not escape "
            "the benchmark directory."
        )

    root = output_root.resolve()
    resolved = (root / manifest_path).resolve()

    try:
        resolved.relative_to(root)
    except ValueError as exc:
        raise ValueError(
            "Benchmark image_path escaped the benchmark directory."
        ) from exc

    return resolved


def _parse_record(
    *,
    row: dict[str, Any],
    output_root: Path,
) -> BenchmarkManifestRecord:
    benchmark_version = row.get("benchmark_version")

    if benchmark_version != BENCHMARK_VERSION:
        raise ValueError(
            "Unexpected OCR benchmark version: "
            f"{benchmark_version!r}"
        )

    sample_id = row.get("sample_id")
    base_document_id = row.get("base_document_id")

    if not isinstance(sample_id, str) or not sample_id:
        raise ValueError(
            "Benchmark sample_id must be a non-empty string."
        )

    if (
        not isinstance(base_document_id, str)
        or not base_document_id
    ):
        raise ValueError(
            "Benchmark base_document_id must be "
            "a non-empty string."
        )

    split = BenchmarkSplit(row["split"])

    sample_type = BenchmarkSampleType(
        row["sample_type"]
    )

    raw_quality = row.get("quality")

    if raw_quality in (None, ""):
        quality = None
    else:
        quality = PrintedQuality(raw_quality)

    if (
        sample_type is BenchmarkSampleType.PRINTED
        and quality is None
    ):
        raise ValueError(
            "Printed benchmark sample must have quality."
        )

    if (
        sample_type
        is BenchmarkSampleType.HANDWRITING_SAFETY
        and quality is not None
    ):
        raise ValueError(
            "Handwriting-safety sample must not have "
            "printed quality."
        )

    raw_image_path = row.get("image_path")

    if (
        not isinstance(raw_image_path, str)
        or not raw_image_path
    ):
        raise ValueError(
            "Benchmark image_path must be a "
            "non-empty string."
        )

    image_path = _resolve_image_path(
        output_root=output_root,
        relative_path=raw_image_path,
    )

    image_sha256 = row.get("image_sha256")

    if (
        not isinstance(image_sha256, str)
        or len(image_sha256) != 64
    ):
        raise ValueError(
            "Benchmark image_sha256 must be a "
            "64-character SHA256 hex string."
        )

    try:
        int(image_sha256, 16)
    except ValueError as exc:
        raise ValueError(
            "Benchmark image_sha256 is not hexadecimal."
        ) from exc

    width = row.get("width")
    height = row.get("height")

    if (
        not isinstance(width, int)
        or width <= 0
        or not isinstance(height, int)
        or height <= 0
    ):
        raise ValueError(
            "Benchmark width and height must be "
            "positive integers."
        )

    expected_text = row.get("expected_text")

    if not isinstance(expected_text, str):
        raise ValueError(
            "Benchmark expected_text must be a string."
        )

    raw_medications = row.get(
        "medication_spans",
        [],
    )

    if not isinstance(raw_medications, list):
        raise ValueError(
            "Benchmark medication_spans must be a list."
        )

    medications: list[str] = []

    for medication in raw_medications:
        if (
            not isinstance(medication, str)
            or not medication
        ):
            raise ValueError(
                "Benchmark medication span must be "
                "a non-empty string."
            )

        medications.append(medication)

    simulation_notice = row.get(
        "simulation_notice"
    )

    if simulation_notice is not None and not isinstance(
        simulation_notice,
        str,
    ):
        raise ValueError(
            "simulation_notice must be a string or null."
        )

    return BenchmarkManifestRecord(
        benchmark_version=benchmark_version,
        sample_id=sample_id,
        base_document_id=base_document_id,
        split=split,
        sample_type=sample_type,
        quality=quality,
        image_path=image_path,
        image_sha256=image_sha256,
        width=width,
        height=height,
        expected_text=expected_text,
        medication_spans=tuple(medications),
        simulation_notice=simulation_notice,
    )


def load_benchmark_manifest(
    *,
    output_root: Path = DEFAULT_OUTPUT_ROOT,
) -> tuple[BenchmarkManifestRecord, ...]:
    printed_path = (
        output_root / "printed_manifest.jsonl"
    )

    handwriting_path = (
        output_root / "handwriting_manifest.jsonl"
    )

    rows = (
        _read_jsonl(printed_path)
        + _read_jsonl(handwriting_path)
    )

    records = tuple(
        _parse_record(
            row=row,
            output_root=output_root,
        )
        for row in rows
    )

    sample_ids = [
        record.sample_id
        for record in records
    ]

    if len(sample_ids) != len(set(sample_ids)):
        raise ValueError(
            "Duplicate OCR benchmark sample_id detected."
        )

    return records


def load_evaluation_stage(
    *,
    stage: BenchmarkEvaluationStage,
    output_root: Path = DEFAULT_OUTPUT_ROOT,
    allow_sealed_test: bool = False,
) -> tuple[BenchmarkManifestRecord, ...]:
    assert_sealed_test_authorized(
        stage=stage,
        allow_sealed_test=allow_sealed_test,
    )

    records = load_benchmark_manifest(
        output_root=output_root
    )

    selected = tuple(
        record
        for record in records
        if record.split.value == stage.value
    )

    if not selected:
        raise RuntimeError(
            f"No OCR benchmark samples found for "
            f"stage {stage.value!r}."
        )

    return selected