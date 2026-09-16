from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from medsense_ai.ocr.benchmark.metrics import (
    normalize_for_scoring,
)


@dataclass(frozen=True)
class MedicationEvidenceMetrics:
    expected_count: int
    matched_count: int
    missed_count: int

    benchmark_known_invention_count: int

    recall: float
    precision: float

    all_expected_medications_recovered: bool

    matched_medications: tuple[str, ...]
    missed_medications: tuple[str, ...]
    benchmark_known_inventions: tuple[str, ...]


@dataclass(frozen=True)
class AggregateMedicationEvidenceMetrics:
    sample_count: int

    expected_count: int
    matched_count: int
    missed_count: int

    benchmark_known_invention_count: int

    micro_recall: float
    micro_precision: float

    samples_with_all_expected_recovered: int
    complete_recovery_rate: float


@dataclass(frozen=True)
class SafetyReviewMetrics:
    sample_count: int

    review_trigger_count: int
    review_trigger_recall: float

    unsafe_false_accept_count: int
    unsafe_false_accept_rate: float


def _unique_normalized_values(
    values: Iterable[str],
) -> tuple[str, ...]:
    unique: list[str] = []
    seen: set[str] = set()

    for value in values:
        normalized = normalize_for_scoring(value)

        if "\n" in normalized:
            raise ValueError(
                "Medication evidence must be a single line."
            )

        if not normalized:
            raise ValueError(
                "Medication evidence must not be empty."
            )

        if normalized not in seen:
            seen.add(normalized)
            unique.append(normalized)

    return tuple(unique)


def _normalized_nonempty_lines(
    text: str,
) -> tuple[str, ...]:
    normalized = normalize_for_scoring(text)

    if not normalized:
        return ()

    return tuple(
        line
        for line in normalized.split("\n")
        if line
    )


def score_medication_evidence(
    *,
    expected_medications: Iterable[str],
    hypothesis: str,
    known_medication_vocabulary: Iterable[str] = (),
) -> MedicationEvidenceMetrics:
    expected = _unique_normalized_values(
        expected_medications
    )

    vocabulary = _unique_normalized_values(
        known_medication_vocabulary
    )

    hypothesis_lines = set(
        _normalized_nonempty_lines(hypothesis)
    )

    expected_set = set(expected)

    matched = tuple(
        medication
        for medication in expected
        if medication in hypothesis_lines
    )

    missed = tuple(
        medication
        for medication in expected
        if medication not in hypothesis_lines
    )

    inventions = tuple(
        medication
        for medication in vocabulary
        if medication in hypothesis_lines
        and medication not in expected_set
    )

    matched_count = len(matched)
    missed_count = len(missed)
    expected_count = len(expected)

    invention_count = len(inventions)

    if expected_count == 0:
        recall = 1.0
    else:
        recall = matched_count / expected_count

    detected_benchmark_medications = (
        matched_count + invention_count
    )

    if detected_benchmark_medications == 0:
        precision = (
            1.0
            if expected_count == 0
            else 0.0
        )
    else:
        precision = (
            matched_count
            / detected_benchmark_medications
        )

    return MedicationEvidenceMetrics(
        expected_count=expected_count,
        matched_count=matched_count,
        missed_count=missed_count,
        benchmark_known_invention_count=(
            invention_count
        ),
        recall=recall,
        precision=precision,
        all_expected_medications_recovered=(
            missed_count == 0
        ),
        matched_medications=matched,
        missed_medications=missed,
        benchmark_known_inventions=inventions,
    )


def aggregate_medication_evidence(
    scores: Iterable[MedicationEvidenceMetrics],
) -> AggregateMedicationEvidenceMetrics:
    items = tuple(scores)

    sample_count = len(items)

    expected_count = sum(
        item.expected_count
        for item in items
    )

    matched_count = sum(
        item.matched_count
        for item in items
    )

    missed_count = sum(
        item.missed_count
        for item in items
    )

    invention_count = sum(
        item.benchmark_known_invention_count
        for item in items
    )

    complete_count = sum(
        int(
            item.all_expected_medications_recovered
        )
        for item in items
    )

    if expected_count == 0:
        micro_recall = 1.0
    else:
        micro_recall = (
            matched_count / expected_count
        )

    detected = (
        matched_count + invention_count
    )

    if detected == 0:
        micro_precision = (
            1.0
            if expected_count == 0
            else 0.0
        )
    else:
        micro_precision = (
            matched_count / detected
        )

    if sample_count == 0:
        complete_recovery_rate = 0.0
    else:
        complete_recovery_rate = (
            complete_count / sample_count
        )

    return AggregateMedicationEvidenceMetrics(
        sample_count=sample_count,
        expected_count=expected_count,
        matched_count=matched_count,
        missed_count=missed_count,
        benchmark_known_invention_count=(
            invention_count
        ),
        micro_recall=micro_recall,
        micro_precision=micro_precision,
        samples_with_all_expected_recovered=(
            complete_count
        ),
        complete_recovery_rate=(
            complete_recovery_rate
        ),
    )


def score_handwriting_review_safety(
    review_triggers: Iterable[bool],
) -> SafetyReviewMetrics:
    triggers = tuple(review_triggers)

    sample_count = len(triggers)

    review_trigger_count = sum(
        int(trigger)
        for trigger in triggers
    )

    unsafe_false_accept_count = (
        sample_count - review_trigger_count
    )

    if sample_count == 0:
        review_trigger_recall = 0.0
        unsafe_false_accept_rate = 0.0
    else:
        review_trigger_recall = (
            review_trigger_count
            / sample_count
        )

        unsafe_false_accept_rate = (
            unsafe_false_accept_count
            / sample_count
        )

    return SafetyReviewMetrics(
        sample_count=sample_count,
        review_trigger_count=review_trigger_count,
        review_trigger_recall=(
            review_trigger_recall
        ),
        unsafe_false_accept_count=(
            unsafe_false_accept_count
        ),
        unsafe_false_accept_rate=(
            unsafe_false_accept_rate
        ),
    )