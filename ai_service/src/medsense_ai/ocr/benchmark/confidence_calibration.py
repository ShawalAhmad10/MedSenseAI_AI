from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
from typing import Any, Iterable


MIN_REVIEW_TRIGGER_RECALL = 0.95
MAX_UNSAFE_FALSE_ACCEPT_RATE = 0.05


@dataclass(frozen=True)
class ThresholdEvaluation:
    threshold: float

    sample_count: int
    unsafe_sample_count: int
    safe_sample_count: int

    review_trigger_count: int

    unsafe_review_trigger_count: int
    unsafe_false_accept_count: int

    safe_review_trigger_count: int

    review_trigger_recall: float
    unsafe_false_accept_rate: float
    safe_false_review_rate: float

    meets_safety_gate: bool


@dataclass(frozen=True)
class ConfidenceCalibrationResult:
    selected_threshold: float

    selected: ThresholdEvaluation

    candidate_count: int

    fallback_all_review: bool

    evaluations: tuple[
        ThresholdEvaluation,
        ...,
    ]


def _require_probability(
    value: Any,
    *,
    field: str,
) -> float:
    if isinstance(value, bool):
        raise ValueError(
            f"{field} must be numeric."
        )

    try:
        number = float(value)

    except (
        TypeError,
        ValueError,
    ) as exc:
        raise ValueError(
            f"{field} must be numeric."
        ) from exc

    if (
        not isfinite(number)
        or not 0.0 <= number <= 1.0
    ):
        raise ValueError(
            f"{field} must be between 0 and 1."
        )

    return number


def sample_requires_review(
    row: dict[str, Any],
) -> bool:
    """
    Ground-truth calibration definition for unsafe
    OCR auto-acceptance.

    Manual review is required if:

    - the sample is a handwriting-safety probe;
    - OCR status is not SUCCESS;
    - complete OCR text is not exact;
    - any expected medication was missed;
    - any benchmark-known unexpected medication
      appeared.

    This definition is intentionally conservative.
    """

    if (
        row.get("sample_type")
        == "handwriting_safety"
    ):
        return True

    if row.get("status") != "SUCCESS":
        return True

    if (
        row.get("exact_text_match")
        is not True
    ):
        return True

    medication_recall = (
        _require_probability(
            row.get(
                "medication_recall"
            ),
            field="medication_recall",
        )
    )

    if medication_recall < 1.0:
        return True

    inventions = row.get(
        "benchmark_known_inventions",
        [],
    )

    if not isinstance(
        inventions,
        list,
    ):
        raise ValueError(
            "benchmark_known_inventions "
            "must be a list."
        )

    if inventions:
        return True

    return False


def threshold_triggers_review(
    row: dict[str, Any],
    *,
    threshold: float,
) -> bool:
    """
    Apply one candidate confidence threshold.

    Lower-confidence results are sent to review.

    Existing fail-closed runtime signals always
    override confidence.
    """

    threshold = _require_probability(
        threshold,
        field="threshold",
    )

    if (
        row.get("review_required")
        is True
    ):
        return True

    if row.get("status") != "SUCCESS":
        return True

    confidence = row.get(
        "min_line_confidence_unit"
    )

    # Missing confidence cannot be safely
    # auto-accepted.
    if confidence is None:
        return True

    confidence = _require_probability(
        confidence,
        field=(
            "min_line_confidence_unit"
        ),
    )

    return confidence <= threshold


def evaluate_threshold(
    rows: Iterable[
        dict[str, Any]
    ],
    *,
    threshold: float,
) -> ThresholdEvaluation:
    items = tuple(rows)

    if not items:
        raise ValueError(
            "Calibration rows must not be empty."
        )

    unsafe_flags = tuple(
        sample_requires_review(
            row
        )
        for row in items
    )

    triggered_flags = tuple(
        threshold_triggers_review(
            row,
            threshold=threshold,
        )
        for row in items
    )

    unsafe_count = sum(
        int(flag)
        for flag in unsafe_flags
    )

    safe_count = (
        len(items)
        - unsafe_count
    )

    unsafe_review_count = sum(
        int(
            unsafe
            and triggered
        )
        for unsafe, triggered
        in zip(
            unsafe_flags,
            triggered_flags,
            strict=True,
        )
    )

    unsafe_false_accept_count = (
        unsafe_count
        - unsafe_review_count
    )

    safe_review_count = sum(
        int(
            (not unsafe)
            and triggered
        )
        for unsafe, triggered
        in zip(
            unsafe_flags,
            triggered_flags,
            strict=True,
        )
    )

    total_review_count = sum(
        int(flag)
        for flag in triggered_flags
    )

    if unsafe_count == 0:
        review_recall = 1.0
        false_accept_rate = 0.0

    else:
        review_recall = (
            unsafe_review_count
            / unsafe_count
        )

        false_accept_rate = (
            unsafe_false_accept_count
            / unsafe_count
        )

    if safe_count == 0:
        safe_false_review_rate = 0.0

    else:
        safe_false_review_rate = (
            safe_review_count
            / safe_count
        )

    meets_gate = (
        review_recall
        >= MIN_REVIEW_TRIGGER_RECALL
        and false_accept_rate
        <= MAX_UNSAFE_FALSE_ACCEPT_RATE
    )

    return ThresholdEvaluation(
        threshold=threshold,
        sample_count=len(items),
        unsafe_sample_count=(
            unsafe_count
        ),
        safe_sample_count=(
            safe_count
        ),
        review_trigger_count=(
            total_review_count
        ),
        unsafe_review_trigger_count=(
            unsafe_review_count
        ),
        unsafe_false_accept_count=(
            unsafe_false_accept_count
        ),
        safe_review_trigger_count=(
            safe_review_count
        ),
        review_trigger_recall=(
            review_recall
        ),
        unsafe_false_accept_rate=(
            false_accept_rate
        ),
        safe_false_review_rate=(
            safe_false_review_rate
        ),
        meets_safety_gate=(
            meets_gate
        ),
    )


def _candidate_thresholds(
    rows: Iterable[
        dict[str, Any]
    ],
) -> tuple[float, ...]:
    values: set[float] = {
        0.0,
        1.0,
    }

    for row in rows:
        confidence = row.get(
            "min_line_confidence_unit"
        )

        if confidence is None:
            continue

        values.add(
            _require_probability(
                confidence,
                field=(
                    "min_line_confidence_unit"
                ),
            )
        )

    return tuple(
        sorted(values)
    )


def calibrate_confidence_threshold(
    rows: Iterable[
        dict[str, Any]
    ],
) -> ConfidenceCalibrationResult:
    items = tuple(rows)

    if not items:
        raise ValueError(
            "Calibration rows must not be empty."
        )

    thresholds = (
        _candidate_thresholds(
            items
        )
    )

    evaluations = tuple(
        evaluate_threshold(
            items,
            threshold=threshold,
        )
        for threshold in thresholds
    )

    eligible = tuple(
        evaluation
        for evaluation in evaluations
        if evaluation.meets_safety_gate
    )

    if eligible:
        # Prefer the safe threshold that creates
        # the fewest unnecessary reviews.
        #
        # Threshold is the secondary deterministic
        # tie-breaker.
        selected = min(
            eligible,
            key=lambda item: (
                item.safe_false_review_rate,
                item.threshold,
            ),
        )

        fallback_all_review = (
            selected.threshold >= 1.0
        )

    else:
        # Fail closed:
        # if no threshold satisfies the safety gates,
        # force all OCR results into manual review.
        selected = evaluate_threshold(
            items,
            threshold=1.0,
        )

        fallback_all_review = True

    return ConfidenceCalibrationResult(
        selected_threshold=(
            selected.threshold
        ),
        selected=selected,
        candidate_count=len(
            evaluations
        ),
        fallback_all_review=(
            fallback_all_review
        ),
        evaluations=evaluations,
    )