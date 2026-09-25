from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Iterable

from medsense_ai.ocr.benchmark.metrics import (
    TextMetrics,
    score_text,
)


@dataclass(frozen=True)
class SampleTextScore:
    sample_id: str
    split: str
    sample_type: str
    quality: str | None
    metrics: TextMetrics


@dataclass(frozen=True)
class AggregateTextMetrics:
    sample_count: int

    character_errors: int
    reference_characters: int
    micro_cer: float

    word_errors: int
    reference_words: int
    micro_wer: float

    exact_text_matches: int
    exact_text_match_rate: float

    exact_line_matches: int
    reference_lines: int
    exact_line_match_rate: float


def score_sample(
    *,
    sample_id: str,
    split: str,
    sample_type: str,
    quality: str | None,
    reference: str,
    hypothesis: str,
) -> SampleTextScore:
    if not sample_id:
        raise ValueError("sample_id must not be empty.")

    if not split:
        raise ValueError("split must not be empty.")

    if not sample_type:
        raise ValueError("sample_type must not be empty.")

    return SampleTextScore(
        sample_id=sample_id,
        split=split,
        sample_type=sample_type,
        quality=quality,
        metrics=score_text(
            reference,
            hypothesis,
        ),
    )


def aggregate_scores(
    scores: Iterable[SampleTextScore],
) -> AggregateTextMetrics:
    items = tuple(scores)

    sample_count = len(items)

    character_errors = sum(
        item.metrics.character_errors
        for item in items
    )

    reference_characters = sum(
        item.metrics.reference_characters
        for item in items
    )

    word_errors = sum(
        item.metrics.word_errors
        for item in items
    )

    reference_words = sum(
        item.metrics.reference_words
        for item in items
    )

    exact_text_matches = sum(
        int(item.metrics.exact_text_match)
        for item in items
    )

    exact_line_matches = sum(
        item.metrics.exact_line_matches
        for item in items
    )

    reference_lines = sum(
        item.metrics.reference_lines
        for item in items
    )

    if reference_characters == 0:
        micro_cer = (
            0.0
            if character_errors == 0
            else 1.0
        )
    else:
        micro_cer = (
            character_errors
            / reference_characters
        )

    if reference_words == 0:
        micro_wer = (
            0.0
            if word_errors == 0
            else 1.0
        )
    else:
        micro_wer = (
            word_errors
            / reference_words
        )

    if sample_count == 0:
        exact_text_match_rate = 0.0
    else:
        exact_text_match_rate = (
            exact_text_matches
            / sample_count
        )

    if reference_lines == 0:
        exact_line_match_rate = (
            0.0
            if exact_line_matches == 0
            else 1.0
        )
    else:
        exact_line_match_rate = (
            exact_line_matches
            / reference_lines
        )

    return AggregateTextMetrics(
        sample_count=sample_count,
        character_errors=character_errors,
        reference_characters=reference_characters,
        micro_cer=micro_cer,
        word_errors=word_errors,
        reference_words=reference_words,
        micro_wer=micro_wer,
        exact_text_matches=exact_text_matches,
        exact_text_match_rate=exact_text_match_rate,
        exact_line_matches=exact_line_matches,
        reference_lines=reference_lines,
        exact_line_match_rate=exact_line_match_rate,
    )


def aggregate_by_quality(
    scores: Iterable[SampleTextScore],
) -> dict[str, AggregateTextMetrics]:
    groups: dict[str, list[SampleTextScore]] = (
        defaultdict(list)
    )

    for score in scores:
        if score.quality is None:
            continue

        groups[score.quality].append(
            score
        )

    return {
        quality: aggregate_scores(
            groups[quality]
        )
        for quality in sorted(groups)
    }


def aggregate_by_split(
    scores: Iterable[SampleTextScore],
) -> dict[str, AggregateTextMetrics]:
    groups: dict[str, list[SampleTextScore]] = (
        defaultdict(list)
    )

    for score in scores:
        groups[score.split].append(
            score
        )

    return {
        split: aggregate_scores(
            groups[split]
        )
        for split in sorted(groups)
    }