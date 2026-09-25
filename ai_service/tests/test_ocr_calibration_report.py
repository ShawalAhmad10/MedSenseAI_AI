from __future__ import annotations

from pathlib import Path

import pytest

from medsense_ai.ocr.benchmark.calibration_report import (
    summarize_calibration_rows,
)


def _row(
    *,
    sample_id: str,
    sample_type: str = "printed",
    quality: str | None = "clean",
    char_errors: int = 0,
    ref_chars: int = 100,
    word_errors: int = 0,
    ref_words: int = 20,
    exact: bool = True,
    exact_lines: int = 5,
    ref_lines: int = 5,
    med_expected: int = 2,
    med_matched: int = 2,
    med_missed: int = 0,
    inventions: int = 0,
    confidence: float | None = 0.99,
    review_required: bool = False,
    status: str = "SUCCESS",
) -> dict:
    return {
        "sample_id": sample_id,
        "sample_type": sample_type,
        "quality": quality,
        "status": status,
        "review_required": review_required,
        "elapsed_ms": 10.0,
        "character_errors": char_errors,
        "reference_characters": ref_chars,
        "word_errors": word_errors,
        "reference_words": ref_words,
        "exact_text_match": exact,
        "exact_line_matches": exact_lines,
        "reference_lines": ref_lines,
        "medication_expected_count": med_expected,
        "medication_matched_count": med_matched,
        "medication_missed_count": med_missed,
        "medication_recall": (
            med_matched / med_expected
            if med_expected
            else 1.0
        ),
        "medication_precision": 1.0,
        "benchmark_known_invention_count": inventions,
        "benchmark_known_inventions": (
            []
            if inventions == 0
            else ["Unexpected Drug"]
        ),
        "min_line_confidence_unit": confidence,
    }


def test_report_uses_true_micro_cer() -> None:
    rows = [
        _row(
            sample_id="a",
            char_errors=1,
            ref_chars=10,
        ),
        _row(
            sample_id="b",
            char_errors=0,
            ref_chars=90,
        ),
    ]

    result = summarize_calibration_rows(
        rows
    )

    assert (
        result["overall"]["micro_cer"]
        == pytest.approx(0.01)
    )


def test_report_uses_count_based_medication_metrics() -> None:
    rows = [
        _row(
            sample_id="complete",
            med_expected=3,
            med_matched=3,
            med_missed=0,
        ),
        _row(
            sample_id="partial-with-invention",
            med_expected=1,
            med_matched=0,
            med_missed=1,
            inventions=1,
        ),
    ]

    result = summarize_calibration_rows(
        rows
    )

    overall = result["overall"]

    assert (
        overall["medication_micro_recall"]
        == pytest.approx(3 / 4)
    )
    assert (
        overall["medication_micro_precision"]
        == pytest.approx(3 / 4)
    )
    assert (
        overall[
            "samples_with_all_expected_recovered"
        ]
        == 1
    )
    assert (
        overall[
            "complete_medication_recovery_rate"
        ]
        == pytest.approx(1 / 2)
    )


def test_clean_quality_gate_passes_for_good_rows() -> None:
    rows = [
        _row(
            sample_id="clean",
            confidence=0.99,
        ),
        _row(
            sample_id="hand",
            sample_type="handwriting_safety",
            quality=None,
            exact=False,
            confidence=0.10,
        ),
    ]

    result = summarize_calibration_rows(
        rows
    )

    gates = result["gates"]

    assert gates["clean_cer_pass"] is True
    assert gates["clean_wer_pass"] is True

    assert (
        gates[
            "clean_medication_recall_pass"
        ]
        is True
    )


def test_handwriting_is_in_review_safety_metrics() -> None:
    rows = [
        _row(
            sample_id="clean",
            confidence=0.99,
        ),
        _row(
            sample_id="hand",
            sample_type="handwriting_safety",
            quality=None,
            exact=False,
            confidence=0.10,
        ),
    ]

    result = summarize_calibration_rows(
        rows
    )

    assert (
        result[
            "handwriting_safety"
        ][
            "sample_count"
        ]
        == 1
    )

    assert (
        result[
            "handwriting_safety"
        ][
            "review_trigger_recall"
        ]
        == 1.0
    )


def test_known_invention_fails_gate() -> None:
    rows = [
        _row(
            sample_id="clean",
            inventions=1,
            confidence=0.10,
        )
    ]

    result = summarize_calibration_rows(
        rows
    )

    assert (
        result[
            "gates"
        ][
            "benchmark_known_invention_zero_pass"
        ]
        is False
    )


def test_empty_report_rows_fail_closed() -> None:
    with pytest.raises(
        ValueError,
        match="must not be empty",
    ):
        summarize_calibration_rows(
            []
        )
