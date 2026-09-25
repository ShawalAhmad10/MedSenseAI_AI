"""Conservative Prescription Analysis -> partner Product candidate matching."""

from __future__ import annotations

from enum import StrEnum
import re

from pydantic import BaseModel, ConfigDict

from medsense_ai.integrations.amna_medcopy.contracts import (
    PartnerProductRecord,
)
from medsense_ai.medical_data_ingestion.normalization import (
    normalize_medical_name,
)
from medsense_ai.prescription_analysis.contracts import (
    MedicationCandidate,
)


class PrescriptionProductMatchStatus(StrEnum):
    UNIQUE_CANDIDATE = "UNIQUE_CANDIDATE"
    AMBIGUOUS_CANDIDATES = "AMBIGUOUS_CANDIDATES"
    UNMAPPED = "UNMAPPED"
    SOURCE_REVIEW_REQUIRED = "SOURCE_REVIEW_REQUIRED"


class ProductNameMatchField(StrEnum):
    GENERIC_NAME = "product_generic_name"
    SALT = "product_salt"


class StrengthEvidenceStatus(StrEnum):
    MATCHED = "MATCHED"
    NOT_DECLARED = "NOT_DECLARED"


class PrescriptionProductCandidate(BaseModel):
    """One authoritative partner Product candidate; no automatic selection."""

    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
    )

    product_id: int
    product_title: str | None
    product_generic_name: str | None
    product_salt: str | None
    product_requires_rx: bool | None
    product_status: int

    name_match_fields: tuple[
        ProductNameMatchField,
        ...
    ]

    strength_evidence_status: StrengthEvidenceStatus


class PrescriptionProductMatchResult(BaseModel):
    """Fail-closed candidate result for one extracted prescription candidate."""

    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
    )

    prescription_candidate_id: str
    raw_name_text: str
    raw_strength_text: str | None

    status: PrescriptionProductMatchStatus

    products: tuple[
        PrescriptionProductCandidate,
        ...
    ] = ()

    confirmation_required: bool = True
    review_required: bool

    message: str


_STRENGTH_RE = re.compile(
    r"(?P<num_amount>\d+(?:\.\d+)?|\.\d+)\s*"
    r"(?P<num_unit>mcg|\u00b5g|\u03bcg|ug|mg|g|ml|mL|L|IU|units?|%)"
    r"(?:\s*/\s*"
    r"(?P<den_amount>\d+(?:\.\d+)?|\.\d+)?\s*"
    r"(?P<den_unit>mcg|\u00b5g|\u03bcg|ug|mg|g|ml|mL|L))?",
    re.IGNORECASE,
)


def _normalized_unit(value: str) -> str:
    unit = value.casefold()

    if unit in {"\u00b5g", "\u03bcg", "ug"}:
        return "mcg"

    if unit == "units":
        return "unit"

    return unit


def _canonical_strength_match(
    match: re.Match[str],
) -> str:
    numerator = (
        f"{match.group('num_amount').casefold()}"
        f"{_normalized_unit(match.group('num_unit'))}"
    )

    den_unit = match.group("den_unit")

    if den_unit is None:
        return numerator

    den_amount = match.group("den_amount") or ""

    denominator = (
        f"{den_amount.casefold()}"
        f"{_normalized_unit(den_unit)}"
    )

    return f"{numerator}/{denominator}"


def _normalized_strength(value: str) -> str:
    match = _STRENGTH_RE.search(value)

    if match is None:
        raise ValueError(
            "strength text does not contain a supported explicit strength"
        )

    return _canonical_strength_match(match)


def _declared_strengths(
    record: PartnerProductRecord,
) -> frozenset[str]:
    """
    Read only explicit strength expressions present in source Product text.

    No strength is inferred from product identity.
    """

    values = (
        record.product_title,
        record.product_generic_name,
        record.product_salt,
    )

    strengths: set[str] = set()

    for value in values:
        if value is None:
            continue

        for match in _STRENGTH_RE.finditer(value):
            strengths.add(
                _canonical_strength_match(match)
            )

    return frozenset(strengths)


def _name_match_fields(
    candidate_name: str,
    record: PartnerProductRecord,
) -> tuple[ProductNameMatchField, ...]:
    """
    Match only exact normalized source fields.

    product_title is deliberately not used for identity matching because
    it may be a brand/trade/display title.
    """

    target = normalize_medical_name(
        candidate_name
    )

    matched: list[
        ProductNameMatchField
    ] = []

    fields = (
        (
            ProductNameMatchField.GENERIC_NAME,
            record.product_generic_name,
        ),
        (
            ProductNameMatchField.SALT,
            record.product_salt,
        ),
    )

    for field, value in fields:
        if value is None or not value.strip():
            continue

        try:
            normalized = normalize_medical_name(
                value
            )
        except ValueError:
            continue

        if normalized == target:
            matched.append(field)

    return tuple(matched)


def match_prescription_candidate_to_products(
    candidate: MedicationCandidate,
    products: tuple[
        PartnerProductRecord,
        ...
    ],
) -> PrescriptionProductMatchResult:
    """
    Produce authoritative Product candidates without automatic selection.

    Safety rules:
    - reviewed/uncertain prescription evidence cannot auto-progress;
    - inactive Products are excluded;
    - identity matching is exact normalized generic/salt matching only;
    - explicit contradictory strength evidence excludes a Product;
    - absent source strength is preserved as unknown, not treated as a match;
    - fuzzy matching and Product-title identity inference are forbidden.
    """

    if not isinstance(
        candidate,
        MedicationCandidate,
    ):
        raise TypeError(
            "candidate must be MedicationCandidate"
        )

    if candidate.review_required:
        return PrescriptionProductMatchResult(
            prescription_candidate_id=(
                candidate.candidate_id
            ),
            raw_name_text=(
                candidate.raw_name_text
            ),
            raw_strength_text=(
                candidate.raw_strength_text
            ),
            status=(
                PrescriptionProductMatchStatus
                .SOURCE_REVIEW_REQUIRED
            ),
            products=(),
            confirmation_required=True,
            review_required=True,
            message=(
                "Prescription candidate requires review before "
                "authoritative Product matching."
            ),
        )

    candidate_strength = None

    if candidate.raw_strength_text is not None:
        candidate_strength = (
            _normalized_strength(
                candidate.raw_strength_text
            )
        )

    matches: list[
        PrescriptionProductCandidate
    ] = []

    for record in sorted(
        products,
        key=lambda item: item.product_id,
    ):
        # Never offer inactive Products as selectable candidates.
        if record.product_status != 1:
            continue

        fields = _name_match_fields(
            candidate.raw_name_text,
            record,
        )

        if not fields:
            continue

        declared_strengths = (
            _declared_strengths(record)
        )

        strength_status = (
            StrengthEvidenceStatus.NOT_DECLARED
        )

        if candidate_strength is not None:
            if declared_strengths:
                if (
                    candidate_strength
                    not in declared_strengths
                ):
                    # Explicit contradictory Product strength.
                    continue

                strength_status = (
                    StrengthEvidenceStatus.MATCHED
                )

        matches.append(
            PrescriptionProductCandidate(
                product_id=record.product_id,
                product_title=(
                    record.product_title
                ),
                product_generic_name=(
                    record.product_generic_name
                ),
                product_salt=(
                    record.product_salt
                ),
                product_requires_rx=(
                    record.product_requires_rx
                ),
                product_status=(
                    record.product_status
                ),
                name_match_fields=fields,
                strength_evidence_status=(
                    strength_status
                ),
            )
        )

    result_products = tuple(matches)

    if not result_products:
        return PrescriptionProductMatchResult(
            prescription_candidate_id=(
                candidate.candidate_id
            ),
            raw_name_text=(
                candidate.raw_name_text
            ),
            raw_strength_text=(
                candidate.raw_strength_text
            ),
            status=(
                PrescriptionProductMatchStatus.UNMAPPED
            ),
            products=(),
            confirmation_required=True,
            review_required=True,
            message=(
                "No active authoritative Product matched the "
                "prescription candidate using exact governed rules."
            ),
        )

    if len(result_products) == 1:
        return PrescriptionProductMatchResult(
            prescription_candidate_id=(
                candidate.candidate_id
            ),
            raw_name_text=(
                candidate.raw_name_text
            ),
            raw_strength_text=(
                candidate.raw_strength_text
            ),
            status=(
                PrescriptionProductMatchStatus
                .UNIQUE_CANDIDATE
            ),
            products=result_products,
            confirmation_required=True,
            review_required=False,
            message=(
                "One authoritative Product candidate matched. "
                "Explicit confirmation is still required before cart addition."
            ),
        )

    return PrescriptionProductMatchResult(
        prescription_candidate_id=(
            candidate.candidate_id
        ),
        raw_name_text=(
            candidate.raw_name_text
        ),
        raw_strength_text=(
            candidate.raw_strength_text
        ),
        status=(
            PrescriptionProductMatchStatus
            .AMBIGUOUS_CANDIDATES
        ),
        products=result_products,
        confirmation_required=True,
        review_required=True,
        message=(
            "Multiple authoritative Product candidates matched; "
            "no Product was selected automatically."
        ),
    )
