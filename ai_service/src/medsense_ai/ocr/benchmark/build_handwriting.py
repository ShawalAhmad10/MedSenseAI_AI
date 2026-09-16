from __future__ import annotations

import json
from collections import Counter
from hashlib import sha256
from pathlib import Path

from medsense_ai.ocr.benchmark.build import DEFAULT_OUTPUT_ROOT
from medsense_ai.ocr.benchmark.contracts import BENCHMARK_VERSION
from medsense_ai.ocr.benchmark.handwriting import (
    HANDWRITING_STYLE_NOTICE,
    build_handwriting_safety_samples,
)


def _write_json(
    path: Path,
    payload: dict,
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
                    ensure_ascii=False,
                    sort_keys=True,
                    separators=(",", ":"),
                )
            )
            handle.write("\n")


def _file_sha256(
    path: Path,
) -> str:
    digest = sha256()

    with path.open("rb") as handle:
        for chunk in iter(
            lambda: handle.read(1024 * 1024),
            b"",
        ):
            digest.update(chunk)

    return digest.hexdigest()


def build_handwriting_benchmark(
    *,
    output_root: Path = DEFAULT_OUTPUT_ROOT,
) -> dict:
    """
    Build the deterministic handwriting-style OCR safety benchmark.

    Important:
    These are synthetic script-font safety probes.
    They are NOT real human handwriting samples.
    """

    samples = build_handwriting_safety_samples()

    handwriting_root = (
        output_root / "handwriting_safety"
    )

    rows: list[dict] = []

    sample_ids: set[str] = set()
    image_hashes: set[str] = set()

    for rendered in samples:
        sample = rendered.sample

        if sample.sample_id in sample_ids:
            raise RuntimeError(
                "Duplicate handwriting sample ID: "
                f"{sample.sample_id}"
            )

        if sample.image_sha256 in image_hashes:
            raise RuntimeError(
                "Duplicate handwriting image hash: "
                f"{sample.image_sha256}"
            )

        sample_ids.add(
            sample.sample_id
        )

        image_hashes.add(
            sample.image_sha256
        )

        split_dir = (
            handwriting_root
            / sample.split.value
        )

        split_dir.mkdir(
            parents=True,
            exist_ok=True,
        )

        image_path = (
            split_dir
            / f"{sample.sample_id}.png"
        )

        if image_path.exists():
            existing_bytes = (
                image_path.read_bytes()
            )

            if (
                existing_bytes
                != rendered.png_bytes
            ):
                raise RuntimeError(
                    "Existing handwriting benchmark "
                    "image differs from deterministic "
                    f"build output: {image_path}"
                )
        else:
            image_path.write_bytes(
                rendered.png_bytes
            )

        actual_hash = _file_sha256(
            image_path
        )

        if (
            actual_hash
            != sample.image_sha256
        ):
            raise RuntimeError(
                "Image hash mismatch for "
                f"{sample.sample_id}: "
                f"{actual_hash} != "
                f"{sample.image_sha256}"
            )

        relative_image_path = (
            image_path
            .relative_to(output_root)
            .as_posix()
        )

        rows.append(
            {
                "benchmark_version": (
                    BENCHMARK_VERSION
                ),
                "sample_id": (
                    sample.sample_id
                ),
                "base_document_id": (
                    sample.base_document_id
                ),
                "split": (
                    sample.split.value
                ),
                "sample_type": (
                    sample.sample_type.value
                ),
                "quality": None,
                "image_path": (
                    relative_image_path
                ),
                "image_sha256": (
                    sample.image_sha256
                ),
                "width": (
                    rendered.width
                ),
                "height": (
                    rendered.height
                ),
                "expected_text": (
                    sample.expected_text
                ),
                "medication_spans": [
                    evidence.text
                    for evidence
                    in sample.medication_spans
                ],
                "regular_font_sha256": (
                    rendered.regular_font_sha256
                ),
                "bold_font_sha256": (
                    rendered.bold_font_sha256
                ),
                "simulation_notice": (
                    rendered.simulation_notice
                ),
            }
        )

    rows.sort(
        key=lambda row: row["sample_id"]
    )

    if len(rows) != 24:
        raise RuntimeError(
            "Expected 24 handwriting rows, "
            f"got {len(rows)}."
        )

    if len(sample_ids) != 24:
        raise RuntimeError(
            "Expected 24 unique handwriting "
            "sample IDs."
        )

    if len(image_hashes) != 24:
        raise RuntimeError(
            "Expected 24 unique handwriting "
            "image hashes."
        )

    split_counts = Counter(
        row["split"]
        for row in rows
    )

    expected_split_counts = {
        "calibration": 12,
        "validation": 6,
        "sealed_test": 6,
    }

    if dict(split_counts) != expected_split_counts:
        raise RuntimeError(
            "Unexpected handwriting split counts: "
            f"{dict(split_counts)}"
        )

    notices = {
        row["simulation_notice"]
        for row in rows
    }

    if notices != {
        HANDWRITING_STYLE_NOTICE
    }:
        raise RuntimeError(
            "Handwriting simulation notice is "
            "missing or inconsistent."
        )

    manifest_path = (
        output_root
        / "handwriting_manifest.jsonl"
    )

    _write_jsonl(
        manifest_path,
        rows,
    )

    summary = {
        "benchmark_version": (
            BENCHMARK_VERSION
        ),
        "sample_type": (
            "handwriting_safety"
        ),
        "handwriting_sample_count": (
            len(rows)
        ),
        "split_counts": dict(
            sorted(
                split_counts.items()
            )
        ),
        "unique_sample_ids": (
            len(sample_ids)
        ),
        "unique_image_hashes": (
            len(image_hashes)
        ),
        "manifest": (
            manifest_path
            .relative_to(output_root)
            .as_posix()
        ),
        "manifest_sha256": (
            _file_sha256(
                manifest_path
            )
        ),
        "simulation_notice": (
            HANDWRITING_STYLE_NOTICE
        ),
    }

    _write_json(
        output_root
        / "handwriting_summary.json",
        summary,
    )

    return summary


if __name__ == "__main__":
    print(
        json.dumps(
            build_handwriting_benchmark(),
            indent=2,
            sort_keys=True,
        )
    )