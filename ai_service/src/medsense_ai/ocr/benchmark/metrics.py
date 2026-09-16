from __future__ import annotations

import unicodedata
from dataclasses import dataclass


@dataclass(frozen=True)
class TextMetrics:
    reference: str
    hypothesis: str

    character_errors: int
    reference_characters: int
    cer: float

    word_errors: int
    reference_words: int
    wer: float

    exact_text_match: bool
    exact_line_matches: int
    reference_lines: int
    exact_line_match_rate: float


def normalize_for_scoring(text: str) -> str:
    """
    Frozen OCR benchmark scoring normalization.

    Rules:
    - Unicode NFKC
    - CRLF / CR -> LF
    - remove trailing whitespace from every line
    - preserve case
    - preserve punctuation
    - preserve digits
    - preserve units
    - preserve internal whitespace
    """
    if not isinstance(text, str):
        raise TypeError("OCR scoring input must be a string.")

    normalized = unicodedata.normalize("NFKC", text)

    normalized = normalized.replace("\r\n", "\n")
    normalized = normalized.replace("\r", "\n")

    lines = [
        line.rstrip()
        for line in normalized.split("\n")
    ]

    # OCR engines commonly append terminal newlines.
    # Ignore trailing empty lines for scoring while preserving
    # meaningful internal line breaks.
    while lines and lines[-1] == "":
        lines.pop()

    return "\n".join(lines)


def _levenshtein_distance(
    reference: list[str] | str,
    hypothesis: list[str] | str,
) -> int:
    """
    Memory-bounded Levenshtein edit distance.
    """

    if len(reference) < len(hypothesis):
        reference, hypothesis = hypothesis, reference

    previous = list(
        range(len(hypothesis) + 1)
    )

    for ref_index, ref_item in enumerate(
        reference,
        start=1,
    ):
        current = [ref_index]

        for hyp_index, hyp_item in enumerate(
            hypothesis,
            start=1,
        ):
            insertion = current[hyp_index - 1] + 1
            deletion = previous[hyp_index] + 1

            substitution = (
                previous[hyp_index - 1]
                + (ref_item != hyp_item)
            )

            current.append(
                min(
                    insertion,
                    deletion,
                    substitution,
                )
            )

        previous = current

    return previous[-1]


def character_error_rate(
    reference: str,
    hypothesis: str,
) -> tuple[int, int, float]:
    reference = normalize_for_scoring(reference)
    hypothesis = normalize_for_scoring(hypothesis)

    reference_count = len(reference)

    errors = _levenshtein_distance(
        reference,
        hypothesis,
    )

    if reference_count == 0:
        rate = 0.0 if not hypothesis else 1.0
    else:
        rate = errors / reference_count

    return errors, reference_count, rate


def word_error_rate(
    reference: str,
    hypothesis: str,
) -> tuple[int, int, float]:
    reference = normalize_for_scoring(reference)
    hypothesis = normalize_for_scoring(hypothesis)

    reference_words = reference.split()
    hypothesis_words = hypothesis.split()

    reference_count = len(reference_words)

    errors = _levenshtein_distance(
        reference_words,
        hypothesis_words,
    )

    if reference_count == 0:
        rate = 0.0 if not hypothesis_words else 1.0
    else:
        rate = errors / reference_count

    return errors, reference_count, rate


def exact_line_score(
    reference: str,
    hypothesis: str,
) -> tuple[int, int, float]:
    reference = normalize_for_scoring(reference)
    hypothesis = normalize_for_scoring(hypothesis)

    reference_lines = reference.split("\n")
    hypothesis_lines = hypothesis.split("\n")

    if reference == "":
        reference_lines = []

    if hypothesis == "":
        hypothesis_lines = []

    line_count = len(reference_lines)

    matches = sum(
        1
        for index, reference_line
        in enumerate(reference_lines)
        if index < len(hypothesis_lines)
        and hypothesis_lines[index] == reference_line
    )

    if line_count == 0:
        rate = (
            1.0
            if not hypothesis_lines
            else 0.0
        )
    else:
        rate = matches / line_count

    return matches, line_count, rate


def score_text(
    reference: str,
    hypothesis: str,
) -> TextMetrics:
    normalized_reference = normalize_for_scoring(
        reference
    )

    normalized_hypothesis = normalize_for_scoring(
        hypothesis
    )

    (
        character_errors,
        reference_characters,
        cer,
    ) = character_error_rate(
        normalized_reference,
        normalized_hypothesis,
    )

    (
        word_errors,
        reference_words,
        wer,
    ) = word_error_rate(
        normalized_reference,
        normalized_hypothesis,
    )

    (
        exact_line_matches,
        reference_lines,
        exact_line_match_rate,
    ) = exact_line_score(
        normalized_reference,
        normalized_hypothesis,
    )

    return TextMetrics(
        reference=normalized_reference,
        hypothesis=normalized_hypothesis,
        character_errors=character_errors,
        reference_characters=reference_characters,
        cer=cer,
        word_errors=word_errors,
        reference_words=reference_words,
        wer=wer,
        exact_text_match=(
            normalized_reference
            == normalized_hypothesis
        ),
        exact_line_matches=exact_line_matches,
        reference_lines=reference_lines,
        exact_line_match_rate=(
            exact_line_match_rate
        ),
    )