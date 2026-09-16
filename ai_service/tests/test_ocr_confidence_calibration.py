from __future__ import annotations

import pytest

from medsense_ai.ocr.benchmark.confidence_calibration import (
    calibrate_confidence_threshold,
    evaluate_threshold,
    sample_requires_review,
    threshold_triggers_review,
)


def _row(
    *,
    sample_id: str,
    confidence: float | None,
    sample_type: str = "printed",
    status: str = "SUCCESS",
    exact: bool = True,
    medication_recall: float = 1.0,
    inventions: list[str] | None = None,
    review_required: bool = False,
) -> dict:
    return {
        "sample_id": (
            sample_id
        ),
        "sample_type": (
            sample_type
        ),
        "status": (
            status
        ),
        "exact_text_match": (
            exact
        ),
        "medication_recall": (
            medication_recall
        ),
        "benchmark_known_inventions": (
            inventions or []
        ),
        "review_required": (
            review_required
        ),
        "min_line_confidence_unit": (
            confidence
        ),
    }


def test_handwriting_is_always_unsafe_for_auto_accept() -> None:
    row = _row(
        sample_id="hand",
        confidence=0.99,
        sample_type=(
            "handwriting_safety"
        ),
    )

    assert (
        sample_requires_review(
            row
        )
        is True
    )


def test_printed_exact_success_can_be_safe() -> None:
    row = _row(
        sample_id="safe",
        confidence=0.98,
    )

    assert (
        sample_requires_review(
            row
        )
        is False
    )


def test_text_error_requires_review() -> None:
    row = _row(
        sample_id="bad",
        confidence=0.99,
        exact=False,
    )

    assert (
        sample_requires_review(
            row
        )
        is True
    )


def test_medication_miss_requires_review() -> None:
    row = _row(
        sample_id="bad-med",
        confidence=0.99,
        medication_recall=0.5,
    )

    assert (
        sample_requires_review(
            row
        )
        is True
    )


def test_known_invention_requires_review() -> None:
    row = _row(
        sample_id="invented",
        confidence=0.99,
        inventions=[
            "Unexpected Drug"
        ],
    )

    assert (
        sample_requires_review(
            row
        )
        is True
    )


def test_missing_confidence_triggers_review() -> None:
    row = _row(
        sample_id="missing",
        confidence=None,
    )

    assert (
        threshold_triggers_review(
            row,
            threshold=0.5,
        )
        is True
    )


def test_existing_review_flag_always_wins() -> None:
    row = _row(
        sample_id="flagged",
        confidence=0.99,
        review_required=True,
    )

    assert (
        threshold_triggers_review(
            row,
            threshold=0.1,
        )
        is True
    )


def test_threshold_evaluation_counts_false_accept() -> None:
    rows = [
        _row(
            sample_id="safe",
            confidence=0.95,
        ),
        _row(
            sample_id="unsafe",
            confidence=0.90,
            exact=False,
        ),
    ]

    result = evaluate_threshold(
        rows,
        threshold=0.50,
    )

    assert (
        result.unsafe_sample_count
        == 1
    )

    assert (
        result.unsafe_false_accept_count
        == 1
    )

    assert (
        result.review_trigger_recall
        == 0.0
    )

    assert (
        result.unsafe_false_accept_rate
        == 1.0
    )

    assert (
        result.meets_safety_gate
        is False
    )


def test_calibration_selects_safe_threshold() -> None:
    rows = [
        _row(
            sample_id="safe-high",
            confidence=0.98,
        ),
        _row(
            sample_id="safe-higher",
            confidence=0.99,
        ),
        _row(
            sample_id="unsafe-low",
            confidence=0.40,
            exact=False,
        ),
        _row(
            sample_id="handwriting",
            confidence=0.35,
            sample_type=(
                "handwriting_safety"
            ),
        ),
    ]

    result = (
        calibrate_confidence_threshold(
            rows
        )
    )

    assert (
        result.selected.meets_safety_gate
        is True
    )

    assert (
        result
        .selected
        .review_trigger_recall
        == 1.0
    )

    assert (
        result
        .selected
        .unsafe_false_accept_rate
        == 0.0
    )

    assert (
        result
        .selected
        .safe_false_review_rate
        == 0.0
    )

    assert (
        result.selected_threshold
        < 0.98
    )


def test_threshold_one_forces_review() -> None:
    rows = [
        _row(
            sample_id="a",
            confidence=0.99,
        ),
        _row(
            sample_id="b",
            confidence=0.20,
            exact=False,
        ),
    ]

    result = evaluate_threshold(
        rows,
        threshold=1.0,
    )

    assert (
        result.review_trigger_count
        == 2
    )

    assert (
        result.review_trigger_recall
        == 1.0
    )

    assert (
        result
        .unsafe_false_accept_rate
        == 0.0
    )


def test_invalid_confidence_fails_closed() -> None:
    row = _row(
        sample_id="bad-confidence",
        confidence=1.5,
    )

    with pytest.raises(
        ValueError,
        match="between 0 and 1",
    ):
        threshold_triggers_review(
            row,
            threshold=0.5,
        )