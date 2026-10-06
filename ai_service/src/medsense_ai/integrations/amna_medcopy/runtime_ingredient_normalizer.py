"""Production runtime normalization for product_salt."""

from __future__ import annotations

import re

from medsense_ai.medical_data_ingestion.normalization import normalize_medical_name


_UNIT = (
    r"(?:mcg|ug|µg|μg|mg|g|kg|ng|"
    r"iu|i\.?\s*u\.?|units?|"
    r"meq|mmol|mol|ml|l)"
)

_STRENGTH_RE = re.compile(
    rf"""
    (?<![a-z0-9])
    \d+(?:\.\d+)?
    (?:\s*-\s*\d+(?:\.\d+)?)?
    \s*{_UNIT}
    (?:
        \s*/\s*
        (?:\d+(?:\.\d+)?\s*)?
        (?:{_UNIT}|dose|actuation|puff|spray)
    )?
    """,
    re.IGNORECASE | re.VERBOSE,
)

_PERCENT_RE = re.compile(
    r"(?<![a-z0-9])\d+(?:\.\d+)?\s*%"
)

_FORM_RE = re.compile(
    r"""
    \b(?:
        tablets?|tabs?|
        capsules?|caps?|
        caplets?|
        syrup|
        suspensions?|
        solutions?|
        injections?|injectables?|
        creams?|ointments?|gels?|
        drops?|sprays?|inhalers?|
        sachets?|powders?|granules?|
        suppositories?|patches?|
        ampoules?|ampules?|vials?
    )\b\s*$
    """,
    re.IGNORECASE | re.VERBOSE,
)

_RELEASE_RE = re.compile(
    r"""
    \b(?:
        xr|sr|cr|er|dr|
        extended\s+release|
        sustained\s+release|
        controlled\s+release|
        delayed\s+release|
        immediate\s+release|
        modified\s+release
    )\b\s*$
    """,
    re.IGNORECASE | re.VERBOSE,
)

_PHARMA_RE = re.compile(
    r"(?<![a-z0-9])(?:bp|usp|ep|ip)(?![a-z0-9])",
    re.IGNORECASE,
)

_SPACE_RE = re.compile(r"\s+")

# Governed pharmaceutical identity aliases.
# These remove formulation/counter-ion naming differences ONLY where the
# canonical target is already present in the governed DDI vocabulary.
_GOVERNED_RUNTIME_ALIASES = {
    'amikacin sulfate': 'amikacin',
    'amikacin sulphate': 'amikacin',
    'amlodipine besylate': 'amlodipine',
    'ampicillin sodium': 'ampicillin',
    'bisoprolol fumarate': 'bisoprolol',
    'chlorpheniramine maleate': 'chlorpheniramine',
    'diclofenac potassium': 'diclofenac',
    'diclofenac sodium': 'diclofenac',
    'losartan potassium': 'losartan',
    'montelukast sodium': 'montelukast',
    'olmesartan medoxomil': 'olmesartan',
    'pantoprazole sodium': 'pantoprazole',
    'paracetamol': 'acetaminophen',
    'prednisolone acetate': 'prednisolone',
    'vitamin d3': 'cholecalciferol',
}



def _clean(value: str) -> str:
    value = _SPACE_RE.sub(" ", value)
    return value.strip(" ,;:-_|")


def runtime_ingredient_candidates(source: str) -> tuple[str, ...]:

    normalized = normalize_medical_name(source)

    results = []
    seen = set()

    def add(value: str):
        value = _clean(value)

        if not value:
            return

        if value not in seen:
            seen.add(value)
            results.append(value)

    # Original exact value first
    add(normalized)

    candidate = normalized

    # Strength / concentration
    candidate = _STRENGTH_RE.sub(" ", candidate)
    candidate = _PERCENT_RE.sub(" ", candidate)
    candidate = _clean(candidate)
    add(candidate)

    # BP / USP etc.
    candidate = _PHARMA_RE.sub(" ", candidate)
    candidate = _clean(candidate)
    add(candidate)

    # Dosage form / release suffix
    for _ in range(5):

        old = candidate

        candidate = _FORM_RE.sub("", candidate)
        candidate = _RELEASE_RE.sub("", candidate)

        candidate = _clean(candidate)

        add(candidate)

        if candidate == old:
            break

    # Add governed canonical aliases after deterministic formulation cleanup.
    # Unknown ingredients are never guessed.
    for value in tuple(results):
        alias = _GOVERNED_RUNTIME_ALIASES.get(value)
        if alias is not None:
            add(alias)

    return tuple(results)



def split_active_ingredients(source: str | None) -> tuple[str, ...]:
    """Split explicit multi-ingredient product_salt text safely.

    Only '+' is treated as an ingredient separator.
    Slash is intentionally NOT split because it is also used in strengths
    such as 100mg/5ml and may appear in ambiguous source descriptions.
    """
    if source is None or not source.strip():
        return ()

    parts = re.split(r"\s*\+\s*", source.strip())

    cleaned = tuple(
        part.strip()
        for part in parts
        if part and part.strip()
    )

    return cleaned
