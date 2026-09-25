from __future__ import annotations

import json
from collections import Counter
from hashlib import sha256
from pathlib import Path

from medsense_ai.ocr.benchmark.build import DEFAULT_OUTPUT_ROOT


EXPECTED_PRINTED = 240
EXPECTED_HANDWRITING = 24
EXPECTED_TOTAL = 264

EXPECTED_SPLITS = {
    "calibration": 132,
    "validation": 66,
    "sealed_test": 66,
}

EXPECTED_HANDWRITING_NOTICE = (
    "Synthetic script-font safety probe; "
    "this is not real human handwriting."
)


def file_sha256(path: Path) -> str:
    digest = sha256()

    with path.open("rb") as handle:
        for chunk in iter(
            lambda: handle.read(1024 * 1024),
            b"",
        ):
            digest.update(chunk)

    return digest.hexdigest()


def load_jsonl(path: Path) -> list[dict]:
    rows = []

    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                raise RuntimeError(
                    f"Blank row in {path} at line {line_number}"
                )

            row = json.loads(line)

            if not isinstance(row, dict):
                raise RuntimeError(
                    f"Invalid row in {path} at line {line_number}"
                )

            rows.append(row)

    return rows


def validate_benchmark(
    output_root: Path = DEFAULT_OUTPUT_ROOT,
) -> dict:
    printed_manifest = (
        output_root / "printed_manifest.jsonl"
    )

    handwriting_manifest = (
        output_root / "handwriting_manifest.jsonl"
    )

    if not printed_manifest.is_file():
        raise RuntimeError(
            f"Missing printed manifest: {printed_manifest}"
        )

    if not handwriting_manifest.is_file():
        raise RuntimeError(
            f"Missing handwriting manifest: {handwriting_manifest}"
        )

    printed = load_jsonl(printed_manifest)
    handwriting = load_jsonl(handwriting_manifest)

    if len(printed) != EXPECTED_PRINTED:
        raise RuntimeError(
            f"Expected 240 printed samples, got {len(printed)}"
        )

    if len(handwriting) != EXPECTED_HANDWRITING:
        raise RuntimeError(
            f"Expected 24 handwriting samples, got {len(handwriting)}"
        )

    rows = printed + handwriting

    if len(rows) != EXPECTED_TOTAL:
        raise RuntimeError(
            f"Expected 264 total samples, got {len(rows)}"
        )

    sample_ids = [row["sample_id"] for row in rows]
    image_hashes = [row["image_sha256"] for row in rows]

    if len(set(sample_ids)) != EXPECTED_TOTAL:
        raise RuntimeError(
            "Sample IDs are not globally unique."
        )

    if len(set(image_hashes)) != EXPECTED_TOTAL:
        raise RuntimeError(
            "Image hashes are not globally unique."
        )

    split_counts = Counter(
        row["split"]
        for row in rows
    )

    if dict(split_counts) != EXPECTED_SPLITS:
        raise RuntimeError(
            f"Unexpected split counts: {dict(split_counts)}"
        )

    # Ensure one printed base document never crosses splits.
    base_splits: dict[str, set[str]] = {}

    for row in printed:
        base_id = row["base_document_id"]

        base_splits.setdefault(
            base_id,
            set(),
        ).add(row["split"])

    crossed = {
        base_id: splits
        for base_id, splits in base_splits.items()
        if len(splits) != 1
    }

    if crossed:
        raise RuntimeError(
            f"Printed base documents cross splits: {crossed}"
        )

    # Verify every actual image exists and matches manifest hash.
    for row in rows:
        image_path = (
            output_root / row["image_path"]
        )

        if not image_path.is_file():
            raise RuntimeError(
                f"Missing image: {image_path}"
            )

        actual_hash = file_sha256(image_path)

        if actual_hash != row["image_sha256"]:
            raise RuntimeError(
                f"Hash mismatch for {row['sample_id']}"
            )

    # Synthetic handwriting disclosure must remain explicit.
    notices = {
        row.get("simulation_notice")
        for row in handwriting
    }

    if notices != {EXPECTED_HANDWRITING_NOTICE}:
        raise RuntimeError(
            "Handwriting simulation notice is missing "
            "or inconsistent."
        )

    return {
        "status": "PASS",
        "printed_samples": len(printed),
        "handwriting_safety_samples": len(handwriting),
        "total_samples": len(rows),
        "split_counts": dict(sorted(split_counts.items())),
        "unique_sample_ids": len(set(sample_ids)),
        "unique_image_hashes": len(set(image_hashes)),
        "printed_base_documents": len(base_splits),
        "printed_manifest_sha256": file_sha256(
            printed_manifest
        ),
        "handwriting_manifest_sha256": file_sha256(
            handwriting_manifest
        ),
    }


if __name__ == "__main__":
    print(
        json.dumps(
            validate_benchmark(),
            indent=2,
            sort_keys=True,
        )
    )