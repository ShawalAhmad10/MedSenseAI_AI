"""Deterministic text normalization primitives for future source pipelines."""

import unicodedata


def normalize_medical_name(value: str) -> str:
    """Normalize a source name for matching without making a mapping decision."""
    normalized = " ".join(unicodedata.normalize("NFKC", value).casefold().split())
    if not normalized:
        raise ValueError("A medical name cannot normalize to an empty value")
    return normalized
