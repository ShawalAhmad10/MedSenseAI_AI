from __future__ import annotations

import pytest

from medsense_ai.ocr.benchmark.safety_metrics import (
    aggregate_medication_evidence,
    score_handwriting_review_safety,
    score_medication_evidence,
)


VOCABULARY = (
    "Paracetamol 500 mg",
    "Amoxicillin 250 mg",
    "Cetirizine 10 mg",
)


def test_all_expected_medications_are_recovered() -> None:
    result = score_medication_evidence(
        expected_medications=(
            "Paracetamol 500 mg",
            "Cetirizine 10 mg",
        ),
        hypothesis=(
            "PRESCRIPTION\n"
            "Paracetamol 500 mg\n"
            "Take after food\n"
            "Cetirizine 10 mg\n"
            "Once daily"
        ),
        known_medication_vocabulary=VOCABULARY,
    )

    assert result.expected_count == 2
    assert result.matched_count == 2
    assert result.missed_count == 0
    assert result.recall == 1.0
    assert result.precision == 1.0

    assert (
        result.all_expected_medications_recovered
        is True
    )


def test_missing_medication_reduces_recall() -> None:
    result = score_medication_evidence(
        expected_medications=(
            "Paracetamol 500 mg",
            "Cetirizine 10 mg",
        ),
        hypothesis="Paracetamol 500 mg",
        known_medication_vocabulary=VOCABULARY,
    )

    assert result.matched_count == 1
    assert result.missed_count == 1

    assert result.recall == pytest.approx(
        0.5
    )

    assert result.missed_medications == (
        "Cetirizine 10 mg",
    )


def test_case_error_is_not_treated_as_exact_medication_match() -> None:
    result = score_medication_evidence(
        expected_medications=(
            "Paracetamol 500 mg",
        ),
        hypothesis="paracetamol 500 mg",
        known_medication_vocabulary=VOCABULARY,
    )

    assert result.matched_count == 0
    assert result.missed_count == 1
    assert result.recall == 0.0


def test_known_unexpected_medication_is_counted_as_invention() -> None:
    result = score_medication_evidence(
        expected_medications=(
            "Paracetamol 500 mg",
        ),
        hypothesis=(
            "Paracetamol 500 mg\n"
            "Amoxicillin 250 mg"
        ),
        known_medication_vocabulary=VOCABULARY,
    )

    assert result.matched_count == 1

    assert (
        result.benchmark_known_invention_count
        == 1
    )

    assert result.benchmark_known_inventions == (
        "Amoxicillin 250 mg",
    )

    assert result.precision == pytest.approx(
        0.5
    )


def test_medication_substring_inside_instruction_is_not_exact_match() -> None:
    result = score_medication_evidence(
        expected_medications=(
            "Paracetamol 500 mg",
        ),
        hypothesis=(
            "Take Paracetamol 500 mg after food"
        ),
        known_medication_vocabulary=VOCABULARY,
    )

    assert result.matched_count == 0
    assert result.recall == 0.0


def test_trailing_whitespace_does_not_break_medication_match() -> None:
    result = score_medication_evidence(
        expected_medications=(
            "Paracetamol 500 mg",
        ),
        hypothesis="Paracetamol 500 mg   \n",
        known_medication_vocabulary=VOCABULARY,
    )

    assert result.matched_count == 1
    assert result.recall == 1.0


def test_medication_evidence_aggregate_is_micro_scored() -> None:
    first = score_medication_evidence(
        expected_medications=(
            "Paracetamol 500 mg",
            "Cetirizine 10 mg",
        ),
        hypothesis="Paracetamol 500 mg",
        known_medication_vocabulary=VOCABULARY,
    )

    second = score_medication_evidence(
        expected_medications=(
            "Amoxicillin 250 mg",
        ),
        hypothesis="Amoxicillin 250 mg",
        known_medication_vocabulary=VOCABULARY,
    )

    aggregate = aggregate_medication_evidence(
        (first, second)
    )

    assert aggregate.sample_count == 2
    assert aggregate.expected_count == 3
    assert aggregate.matched_count == 2
    assert aggregate.missed_count == 1

    assert aggregate.micro_recall == pytest.approx(
        2 / 3
    )

    assert (
        aggregate.complete_recovery_rate
        == pytest.approx(0.5)
    )


def test_all_handwriting_samples_trigger_review() -> None:
    result = score_handwriting_review_safety(
        [True] * 24
    )

    assert result.sample_count == 24
    assert result.review_trigger_count == 24
    assert result.review_trigger_recall == 1.0

    assert result.unsafe_false_accept_count == 0
    assert result.unsafe_false_accept_rate == 0.0


def test_missing_review_trigger_is_unsafe_false_accept() -> None:
    result = score_handwriting_review_safety(
        [
            True,
            True,
            False,
            True,
        ]
    )

    assert result.sample_count == 4
    assert result.review_trigger_count == 3

    assert result.review_trigger_recall == pytest.approx(
        0.75
    )

    assert result.unsafe_false_accept_count == 1

    assert result.unsafe_false_accept_rate == pytest.approx(
        0.25
    )


def test_empty_handwriting_safety_aggregate_is_explicit() -> None:
    result = score_handwriting_review_safety([])

    assert result.sample_count == 0
    assert result.review_trigger_recall == 0.0
    assert result.unsafe_false_accept_rate == 0.0