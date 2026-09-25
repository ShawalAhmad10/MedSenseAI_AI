from __future__ import annotations

import json
from dataclasses import asdict
from hashlib import sha256
from pathlib import Path

from medsense_ai.ocr.benchmark.contracts import (
    BENCHMARK_SEED,
    BENCHMARK_VERSION,
    BenchmarkSampleType,
)
from medsense_ai.ocr.benchmark.definitions import (
    PRINTED_BASE_DOCUMENTS,
)
from medsense_ai.ocr.benchmark.rendering import (
    render_clean_document,
)
from medsense_ai.ocr.benchmark.variants import (
    render_all_variants,
)


DEFAULT_OUTPUT_ROOT = (
    Path("data")
    / "processed"
    / "ocr"
    / "benchmark"
    / BENCHMARK_VERSION
)


def _write_json(
    path: Path,
    payload: object,
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
    rows: list[dict[str, object]],
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
            lambda: handle.read(
                1024 * 1024
            ),
            b"",
        ):
            digest.update(chunk)

    return digest.hexdigest()


def build_printed_benchmark(
    *,
    output_root: Path = DEFAULT_OUTPUT_ROOT,
) -> dict[str, object]:
    """
    Materialize the frozen 240-sample printed OCR benchmark.

    60 base documents x 4 quality variants.

    Existing files with matching deterministic bytes are allowed.
    Existing files with conflicting bytes fail closed.
    """

    printed_root = (
        output_root / "printed"
    )

    rows: list[
        dict[str, object]
    ] = []

    sample_ids: set[str] = set()
    image_hashes: set[str] = set()

    for document in PRINTED_BASE_DOCUMENTS:
        clean = render_clean_document(
            document
        )

        variants = render_all_variants(
            clean
        )

        for variant in variants:
            sample_id = (
                f"{document.document_id}"
                f"__{variant.quality.value}"
            )

            if sample_id in sample_ids:
                raise RuntimeError(
                    f"Duplicate sample ID: {sample_id}"
                )

            sample_ids.add(
                sample_id
            )

            split_dir = (
                printed_root
                / document.split.value
                / variant.quality.value
            )

            image_path = (
                split_dir
                / f"{sample_id}.png"
            )

            image_path.parent.mkdir(
                parents=True,
                exist_ok=True,
            )

            if image_path.exists():
                existing = (
                    image_path.read_bytes()
                )

                if existing != variant.png_bytes:
                    raise RuntimeError(
                        "Existing benchmark image "
                        f"does not match deterministic "
                        f"content: {image_path}"
                    )

            else:
                image_path.write_bytes(
                    variant.png_bytes
                )

            actual_hash = _file_sha256(
                image_path
            )

            if (
                actual_hash
                != variant.image_sha256
            ):
                raise RuntimeError(
                    "Written image SHA-256 "
                    f"mismatch: {image_path}"
                )

            if actual_hash in image_hashes:
                raise RuntimeError(
                    "Unexpected duplicate benchmark "
                    f"image hash: {actual_hash}"
                )

            image_hashes.add(
                actual_hash
            )

            relative_path = (
                image_path.relative_to(
                    output_root
                )
                .as_posix()
            )

            rows.append(
                {
                    "benchmark_version": (
                        BENCHMARK_VERSION
                    ),
                    "benchmark_seed": (
                        BENCHMARK_SEED
                    ),
                    "sample_id": sample_id,
                    "base_document_id": (
                        document.document_id
                    ),
                    "split": (
                        document.split.value
                    ),
                    "sample_type": (
                        BenchmarkSampleType.PRINTED.value
                    ),
                    "quality": (
                        variant.quality.value
                    ),
                    "image_path": (
                        relative_path
                    ),
                    "image_sha256": (
                        actual_hash
                    ),
                    "source_clean_sha256": (
                        variant.source_clean_sha256
                    ),
                    "width": (
                        variant.width
                    ),
                    "height": (
                        variant.height
                    ),
                    "expected_text": (
                        variant.expected_text
                    ),
                    "medication_spans": list(
                        variant.medication_spans
                    ),
                    "font_sha256": (
                        clean.font_sha256
                    ),
                }
            )

    rows.sort(
        key=lambda row: str(
            row["sample_id"]
        )
    )

    if len(rows) != 240:
        raise RuntimeError(
            "Printed benchmark must contain "
            f"exactly 240 samples, got {len(rows)}."
        )

    if len(sample_ids) != 240:
        raise RuntimeError(
            "Printed sample IDs must be unique."
        )

    if len(image_hashes) != 240:
        raise RuntimeError(
            "Printed image hashes must be unique."
        )

    manifest_path = (
        output_root
        / "printed_manifest.jsonl"
    )

    _write_jsonl(
        manifest_path,
        rows,
    )

    split_counts: dict[
        str,
        int,
    ] = {}

    quality_counts: dict[
        str,
        int,
    ] = {}

    for row in rows:
        split = str(
            row["split"]
        )

        quality = str(
            row["quality"]
        )

        split_counts[split] = (
            split_counts.get(
                split,
                0,
            )
            + 1
        )

        quality_counts[quality] = (
            quality_counts.get(
                quality,
                0,
            )
            + 1
        )

    manifest_sha256 = (
        _file_sha256(
            manifest_path
        )
    )

    summary: dict[
        str,
        object,
    ] = {
        "benchmark_version": (
            BENCHMARK_VERSION
        ),
        "benchmark_seed": (
            BENCHMARK_SEED
        ),
        "base_document_count": 60,
        "printed_sample_count": (
            len(rows)
        ),
        "split_counts": (
            split_counts
        ),
        "quality_counts": (
            quality_counts
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
            manifest_sha256
        ),
    }

    _write_json(
        output_root
        / "printed_summary.json",
        summary,
    )

    return summary


if __name__ == "__main__":
    result = build_printed_benchmark()

    print(
        json.dumps(
            result,
            indent=2,
            sort_keys=True,
        )
    )