from __future__ import annotations

import pytest

from medsense_ai.ocr.benchmark.aggregation import (
    aggregate_by_quality,
    aggregate_by_split,
    aggregate_scores,
    score_sample,
)
from medsense_ai.ocr.benchmark.metrics import (
    normalize_for_scoring,
    score_text,
)


def test_scoring_normalization_is_frozen() -> None:
    text = "Paracetamol 500 mg  \r\nOnce daily\t\r"

    assert normalize_for_scoring(text) == (
        "Paracetamol 500 mg\n"
        "Once daily"
    )


def test_scoring_preserves_case_digits_units_and_punctuation() -> None:
    assert normalize_for_scoring(
        "Paracetamol 500 mg, OD."
    ) == "Paracetamol 500 mg, OD."

    assert score_text(
        "Paracetamol",
        "paracetamol",
    ).exact_text_match is False


def test_nfkc_normalization_is_applied() -> None:
    assert normalize_for_scoring(
        "Ａｍｏｘｉｃｉｌｌｉｎ"
    ) == "Amoxicillin"


def test_exact_text_has_zero_error() -> None:
    result = score_text(
        "Paracetamol 500 mg",
        "Paracetamol 500 mg",
    )

    assert result.character_errors == 0
    assert result.word_errors == 0
    assert result.cer == 0.0
    assert result.wer == 0.0
    assert result.exact_text_match is True
    assert result.exact_line_match_rate == 1.0


def test_dosage_digit_error_is_penalized() -> None:
    result = score_text(
        "Paracetamol 500 mg",
        "Paracetamol 50 mg",
    )

    assert result.character_errors == 1
    assert result.cer > 0.0

    assert result.word_errors == 1
    assert result.wer == pytest.approx(
        1 / 3
    )

    assert result.exact_text_match is False


def test_extra_word_is_counted_by_wer() -> None:
    result = score_text(
        "Take daily",
        "Take twice daily",
    )

    assert result.word_errors == 1
    assert result.wer == pytest.approx(
        1 / 2
    )


def test_exact_line_score_requires_same_position() -> None:
    result = score_text(
        "Drug A\nDrug B",
        "Drug B\nDrug A",
    )

    assert result.exact_line_matches == 0
    assert result.reference_lines == 2
    assert result.exact_line_match_rate == 0.0


def test_micro_aggregation_uses_total_error_counts() -> None:
    scores = [
        score_sample(
            sample_id="a",
            split="calibration",
            sample_type="printed",
            quality="clean",
            reference="abc",
            hypothesis="abc",
        ),
        score_sample(
            sample_id="b",
            split="calibration",
            sample_type="printed",
            quality="clean",
            reference="abcdefghij",
            hypothesis="abcdefghiX",
        ),
    ]

    aggregate = aggregate_scores(scores)

    assert aggregate.sample_count == 2

    assert aggregate.character_errors == 1
    assert aggregate.reference_characters == 13

    assert aggregate.micro_cer == pytest.approx(
        1 / 13
    )

    assert aggregate.exact_text_matches == 1
    assert aggregate.exact_text_match_rate == 0.5


def test_quality_aggregation_excludes_unscoped_handwriting() -> None:
    scores = [
        score_sample(
            sample_id="clean",
            split="validation",
            sample_type="printed",
            quality="clean",
            reference="Drug A",
            hypothesis="Drug A",
        ),
        score_sample(
            sample_id="noise",
            split="validation",
            sample_type="printed",
            quality="noisy_blurred",
            reference="Drug B",
            hypothesis="Drug X",
        ),
        score_sample(
            sample_id="hand",
            split="validation",
            sample_type="handwriting_safety",
            quality=None,
            reference="Drug C",
            hypothesis="Drug C",
        ),
    ]

    grouped = aggregate_by_quality(scores)

    assert set(grouped) == {
        "clean",
        "noisy_blurred",
    }

    assert grouped["clean"].sample_count == 1

    assert (
        grouped["clean"].exact_text_match_rate
        == 1.0
    )

    assert (
        grouped[
            "noisy_blurred"
        ].exact_text_match_rate
        == 0.0
    )


def test_split_aggregation_includes_all_sample_types() -> None:
    scores = [
        score_sample(
            sample_id="a",
            split="calibration",
            sample_type="printed",
            quality="clean",
            reference="A",
            hypothesis="A",
        ),
        score_sample(
            sample_id="b",
            split="validation",
            sample_type="handwriting_safety",
            quality=None,
            reference="B",
            hypothesis="B",
        ),
    ]

    grouped = aggregate_by_split(scores)

    assert set(grouped) == {
        "calibration",
        "validation",
    }

    assert (
        grouped["calibration"].sample_count
        == 1
    )

    assert (
        grouped["validation"].sample_count
        == 1
    )


def test_empty_aggregate_is_explicit_zero() -> None:
    result = aggregate_scores([])

    assert result.sample_count == 0
    assert result.micro_cer == 0.0
    assert result.micro_wer == 0.0
    assert result.exact_text_match_rate == 0.0
    assert result.exact_line_match_rate == 0.0


def test_score_sample_requires_identity_metadata() -> None:
    with pytest.raises(
        ValueError,
        match="sample_id",
    ):
        score_sample(
            sample_id="",
            split="validation",
            sample_type="printed",
            quality="clean",
            reference="A",
            hypothesis="A",
        )