from __future__ import annotations

from collections import Counter

from medsense_ai.ocr.benchmark.contracts import (
    BENCHMARK_SEED,
    BENCHMARK_VERSION,
    BenchmarkSplit,
    PrintedQuality,
)
from medsense_ai.ocr.benchmark.definitions import (
    PRINTED_BASE_DOCUMENTS,
    build_printed_base_documents,
)
from medsense_ai.ocr.benchmark.rendering import (
    render_clean_document,
)
from medsense_ai.ocr.benchmark.variants import (
    render_all_variants,
)


def test_benchmark_identity_is_frozen() -> None:
    assert BENCHMARK_VERSION == "med-ocr-benchmark-1.0.0"
    assert BENCHMARK_SEED == 260904


def test_exact_printed_base_document_count() -> None:
    assert len(PRINTED_BASE_DOCUMENTS) == 60


def test_printed_base_document_ids_are_unique() -> None:
    ids = [
        document.document_id
        for document in PRINTED_BASE_DOCUMENTS
    ]

    assert len(ids) == 60
    assert len(set(ids)) == 60


def test_base_document_split_counts_are_exact() -> None:
    counts = Counter(
        document.split
        for document in PRINTED_BASE_DOCUMENTS
    )

    assert counts == {
        BenchmarkSplit.CALIBRATION: 30,
        BenchmarkSplit.VALIDATION: 15,
        BenchmarkSplit.SEALED_TEST: 15,
    }


def test_base_documents_are_deterministic() -> None:
    first = build_printed_base_documents()
    second = build_printed_base_documents()

    assert first == second


def test_each_document_has_two_to_four_medications() -> None:
    for document in PRINTED_BASE_DOCUMENTS:
        assert 2 <= len(document.medication_lines) <= 4

        assert len(
            document.medication_lines
        ) == len(
            document.instruction_lines
        )


def test_all_base_document_content_is_unique() -> None:
    signatures = {
        (
            tuple(
                medication.text
                for medication
                in document.medication_lines
            ),
            document.instruction_lines,
        )
        for document in PRINTED_BASE_DOCUMENTS
    }

    assert len(signatures) == 60


def test_clean_render_is_deterministic() -> None:
    document = PRINTED_BASE_DOCUMENTS[0]

    first = render_clean_document(
        document
    )

    second = render_clean_document(
        document
    )

    assert first.png_bytes == second.png_bytes
    assert first.image_sha256 == second.image_sha256
    assert first.expected_text == second.expected_text
    assert first.medication_spans == second.medication_spans


def test_clean_render_preserves_literal_medication_evidence() -> None:
    document = PRINTED_BASE_DOCUMENTS[0]

    rendered = render_clean_document(
        document
    )

    expected_medications = tuple(
        medication.text
        for medication
        in document.medication_lines
    )

    assert (
        rendered.medication_spans
        == expected_medications
    )

    for medication in expected_medications:
        assert medication in rendered.expected_text


def test_exact_four_quality_variants_exist() -> None:
    clean = render_clean_document(
        PRINTED_BASE_DOCUMENTS[0]
    )

    variants = render_all_variants(
        clean
    )

    assert len(variants) == 4

    assert tuple(
        variant.quality
        for variant in variants
    ) == tuple(PrintedQuality)


def test_variant_ground_truth_never_changes() -> None:
    clean = render_clean_document(
        PRINTED_BASE_DOCUMENTS[0]
    )

    variants = render_all_variants(
        clean
    )

    assert len(
        {
            variant.expected_text
            for variant in variants
        }
    ) == 1

    assert len(
        {
            variant.medication_spans
            for variant in variants
        }
    ) == 1


def test_variant_hashes_are_unique() -> None:
    clean = render_clean_document(
        PRINTED_BASE_DOCUMENTS[0]
    )

    variants = render_all_variants(
        clean
    )

    hashes = {
        variant.image_sha256
        for variant in variants
    }

    assert len(hashes) == 4


def test_variant_generation_is_deterministic() -> None:
    clean = render_clean_document(
        PRINTED_BASE_DOCUMENTS[0]
    )

    first = render_all_variants(
        clean
    )

    second = render_all_variants(
        clean
    )

    assert [
        variant.image_sha256
        for variant in first
    ] == [
        variant.image_sha256
        for variant in second
    ]


def test_rotated_variant_has_swapped_dimensions() -> None:
    clean = render_clean_document(
        PRINTED_BASE_DOCUMENTS[0]
    )

    variants = {
        variant.quality: variant
        for variant in render_all_variants(
            clean
        )
    }

    rotated = variants[
        PrintedQuality.ROTATED_90
    ]

    assert rotated.width == clean.height
    assert rotated.height == clean.width


def test_base_document_cannot_cross_splits() -> None:
    split_by_id = {}

    for document in PRINTED_BASE_DOCUMENTS:
        existing = split_by_id.setdefault(
            document.document_id,
            document.split,
        )

        assert existing is document.split