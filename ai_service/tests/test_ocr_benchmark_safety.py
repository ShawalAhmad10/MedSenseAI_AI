from __future__ import annotations

import json
from collections import Counter
from hashlib import sha256
from pathlib import Path

import pytest

from medsense_ai.ocr.benchmark.contracts import (
    BenchmarkSampleType,
    BenchmarkSplit,
)
from medsense_ai.ocr.benchmark.handwriting import (
    HANDWRITING_SAFETY_DEFINITIONS,
    HANDWRITING_STYLE_NOTICE,
    render_handwriting_safety_sample,
)
from medsense_ai.ocr.benchmark.qa import validate_benchmark


@pytest.fixture(scope="module")
def rendered_probe_pair():
    definition = HANDWRITING_SAFETY_DEFINITIONS[0]

    first = render_handwriting_safety_sample(definition)
    second = render_handwriting_safety_sample(definition)

    return first, second


def test_handwriting_definitions_are_frozen() -> None:
    assert len(HANDWRITING_SAFETY_DEFINITIONS) == 24

    ids = {
        definition.sample_id
        for definition in HANDWRITING_SAFETY_DEFINITIONS
    }

    assert len(ids) == 24

    counts = Counter(
        definition.split
        for definition in HANDWRITING_SAFETY_DEFINITIONS
    )

    assert counts == {
        BenchmarkSplit.CALIBRATION: 12,
        BenchmarkSplit.VALIDATION: 6,
        BenchmarkSplit.SEALED_TEST: 6,
    }


def test_handwriting_definitions_have_medication_evidence() -> None:
    assert all(
        definition.medication_lines
        for definition in HANDWRITING_SAFETY_DEFINITIONS
    )

    assert all(
        len(definition.medication_lines) >= 1
        for definition in HANDWRITING_SAFETY_DEFINITIONS
    )


def test_single_handwriting_render_is_deterministic(
    rendered_probe_pair,
) -> None:
    first, second = rendered_probe_pair

    assert first.png_bytes == second.png_bytes

    assert (
        first.sample.image_sha256
        == second.sample.image_sha256
    )


def test_handwriting_render_is_safety_only_and_disclosed(
    rendered_probe_pair,
) -> None:
    first, _ = rendered_probe_pair

    assert (
        first.sample.sample_type
        is BenchmarkSampleType.HANDWRITING_SAFETY
    )

    assert first.sample.quality is None

    assert first.simulation_notice == HANDWRITING_STYLE_NOTICE

    assert HANDWRITING_STYLE_NOTICE == (
        "Synthetic script-font safety probe; "
        "this is not real human handwriting."
    )


def _hash_bytes(data: bytes) -> str:
    return sha256(data).hexdigest()


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
                json.dumps(
                    row,
                    sort_keys=True,
                    separators=(",", ":"),
                )
            )
            handle.write("\n")


def _write_minimal_valid_benchmark(
    output_root: Path,
) -> None:
    printed_rows: list[dict] = []
    handwriting_rows: list[dict] = []

    qualities = (
        "clean",
        "rotated_90",
        "noisy_blurred",
        "low_contrast",
    )

    for number in range(1, 61):
        if number <= 30:
            split = "calibration"
        elif number <= 45:
            split = "validation"
        else:
            split = "sealed_test"

        base_id = f"printed_{number:03d}"

        for quality in qualities:
            sample_id = f"{base_id}__{quality}"

            relative = (
                f"printed/{sample_id}.bin"
            )

            payload = sample_id.encode("utf-8")

            image_path = output_root / relative

            image_path.parent.mkdir(
                parents=True,
                exist_ok=True,
            )

            image_path.write_bytes(payload)

            printed_rows.append(
                {
                    "sample_id": sample_id,
                    "base_document_id": base_id,
                    "split": split,
                    "image_path": relative,
                    "image_sha256": _hash_bytes(
                        payload
                    ),
                }
            )

    for number in range(1, 25):
        if number <= 12:
            split = "calibration"
        elif number <= 18:
            split = "validation"
        else:
            split = "sealed_test"

        sample_id = f"handwriting_{number:03d}"

        relative = (
            f"handwriting/{sample_id}.bin"
        )

        payload = sample_id.encode("utf-8")

        image_path = output_root / relative

        image_path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        image_path.write_bytes(payload)

        handwriting_rows.append(
            {
                "sample_id": sample_id,
                "base_document_id": sample_id,
                "split": split,
                "image_path": relative,
                "image_sha256": _hash_bytes(
                    payload
                ),
                "simulation_notice": (
                    HANDWRITING_STYLE_NOTICE
                ),
            }
        )

    _write_jsonl(
        output_root / "printed_manifest.jsonl",
        printed_rows,
    )

    _write_jsonl(
        output_root / "handwriting_manifest.jsonl",
        handwriting_rows,
    )


def test_combined_qa_accepts_valid_benchmark(
    tmp_path: Path,
) -> None:
    output_root = tmp_path / "benchmark"

    _write_minimal_valid_benchmark(
        output_root
    )

    result = validate_benchmark(
        output_root=output_root
    )

    assert result["status"] == "PASS"

    assert result["printed_samples"] == 240

    assert (
        result["handwriting_safety_samples"]
        == 24
    )

    assert result["total_samples"] == 264

    assert result["split_counts"] == {
        "calibration": 132,
        "sealed_test": 66,
        "validation": 66,
    }

    assert result["unique_sample_ids"] == 264

    assert result["unique_image_hashes"] == 264

    assert result["printed_base_documents"] == 60


def test_combined_qa_rejects_tampering(
    tmp_path: Path,
) -> None:
    output_root = tmp_path / "benchmark"

    _write_minimal_valid_benchmark(
        output_root
    )

    tampered = (
        output_root
        / "printed"
        / "printed_001__clean.bin"
    )

    tampered.write_bytes(
        b"tampered"
    )

    with pytest.raises(
        RuntimeError,
        match="Hash mismatch",
    ):
        validate_benchmark(
            output_root=output_root
        )