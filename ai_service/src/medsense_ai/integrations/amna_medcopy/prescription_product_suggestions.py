"""
Non-authoritative Product suggestions for prescription OCR evidence.

This module never confirms a medicine identity, selects a Product,
mutates cart state, or performs DDI. Suggestions always require
explicit human confirmation.

similarity_score is string similarity, not a probability.
"""

from __future__ import annotations

from difflib import SequenceMatcher
from enum import StrEnum
from typing import Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
)

from medsense_ai.integrations.amna_medcopy.contracts import (
    PartnerProductRecord,
)
from medsense_ai.integrations.amna_medcopy.prescription_product_matcher import (
    ProductNameMatchField,
    StrengthEvidenceStatus,
    _declared_strengths,
    _normalized_strength,
)
from medsense_ai.medical_data_ingestion.normalization import (
    normalize_medical_name,
)
from medsense_ai.prescription_analysis.contracts import (
    MedicationCandidate,
)


FUZZY_SUGGESTION_THRESHOLD = 0.90
FUZZY_SUGGESTION_MIN_PRODUCT_MARGIN = 0.05


class PrescriptionProductSuggestionStatus(StrEnum):
    EXACT_SUGGESTIONS = "EXACT_SUGGESTIONS"
    FUZZY_SUGGESTION = "FUZZY_SUGGESTION"
    NO_SUGGESTION = "NO_SUGGESTION"
    AMBIGUOUS_FUZZY = "AMBIGUOUS_FUZZY"


class PrescriptionProductSuggestionKind(StrEnum):
    EXACT = "EXACT"
    FUZZY = "FUZZY"


class PrescriptionProductSuggestion(BaseModel):
    """
    One non-authoritative Product suggestion.

    similarity_score measures normalized string similarity only.
    It must not be interpreted as medicine-identity probability.
    """

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

    matched_field: ProductNameMatchField
    matched_alias: str

    suggestion_kind: PrescriptionProductSuggestionKind

    similarity_score: float = Field(
        ge=0.0,
        le=1.0,
    )

    strength_evidence_status: StrengthEvidenceStatus


class PrescriptionProductSuggestionResult(BaseModel):
    """Fail-closed suggestions for one OCR medication candidate."""

    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
    )

    prescription_candidate_id: str
    raw_name_text: str
    raw_strength_text: str | None

    status: PrescriptionProductSuggestionStatus

    suggestions: tuple[
        PrescriptionProductSuggestion,
        ...
    ] = ()

    confirmation_required: Literal[True] = True
    review_required: Literal[True] = True

    similarity_threshold: float = (
        FUZZY_SUGGESTION_THRESHOLD
    )

    minimum_product_margin: float = (
        FUZZY_SUGGESTION_MIN_PRODUCT_MARGIN
    )

    message: str


def _aliases(
    record: PartnerProductRecord,
) -> tuple[
    tuple[
        ProductNameMatchField,
        str,
        str,
    ],
    ...,
]:
    """
    Return governed identity aliases.

    Product title is deliberately excluded, matching the authoritative
    matcher identity boundary.
    """

    source_fields = (
        (
            ProductNameMatchField.GENERIC_NAME,
            record.product_generic_name,
        ),
        (
            ProductNameMatchField.SALT,
            record.product_salt,
        ),
    )

    result: list[
        tuple[
            ProductNameMatchField,
            str,
            str,
        ]
    ] = []

    seen: set[
        tuple[
            ProductNameMatchField,
            str,
        ]
    ] = set()

    for field, value in source_fields:
        if value is None or not value.strip():
            continue

        try:
            normalized = normalize_medical_name(
                value
            )
        except ValueError:
            continue

        key = (
            field,
            normalized,
        )

        if key in seen:
            continue

        seen.add(key)

        result.append(
            (
                field,
                value,
                normalized,
            )
        )

    return tuple(result)


def _strength_status(
    *,
    record: PartnerProductRecord,
    candidate_strength: str | None,
) -> StrengthEvidenceStatus | None:
    """
    Reuse the authoritative matcher's explicit-strength semantics.

    None means explicit Product strength contradicts the candidate.
    """

    declared = _declared_strengths(
        record
    )

    if candidate_strength is None:
        return StrengthEvidenceStatus.NOT_DECLARED

    if not declared:
        return StrengthEvidenceStatus.NOT_DECLARED

    if candidate_strength not in declared:
        return None

    return StrengthEvidenceStatus.MATCHED


def _make_suggestion(
    *,
    record: PartnerProductRecord,
    field: ProductNameMatchField,
    alias: str,
    score: float,
    kind: PrescriptionProductSuggestionKind,
    strength_status: StrengthEvidenceStatus,
) -> PrescriptionProductSuggestion:

    return PrescriptionProductSuggestion(
        product_id=record.product_id,
        product_title=record.product_title,
        product_generic_name=(
            record.product_generic_name
        ),
        product_salt=record.product_salt,
        product_requires_rx=(
            record.product_requires_rx
        ),
        product_status=record.product_status,
        matched_field=field,
        matched_alias=alias,
        suggestion_kind=kind,
        similarity_score=float(score),
        strength_evidence_status=(
            strength_status
        ),
    )


def _empty_result(
    *,
    candidate: MedicationCandidate,
    status: PrescriptionProductSuggestionStatus,
    message: str,
) -> PrescriptionProductSuggestionResult:

    return PrescriptionProductSuggestionResult(
        prescription_candidate_id=(
            candidate.candidate_id
        ),
        raw_name_text=(
            candidate.raw_name_text
        ),
        raw_strength_text=(
            candidate.raw_strength_text
        ),
        status=status,
        suggestions=(),
        message=message,
    )


def suggest_prescription_candidate_products(
    candidate: MedicationCandidate,
    products: tuple[
        PartnerProductRecord,
        ...,
    ],
) -> PrescriptionProductSuggestionResult:
    """
    Suggest Products without creating authoritative medicine identity.

    Rules:
    - active Products only;
    - generic/salt aliases only;
    - exact normalized aliases take precedence;
    - fuzzy score >= 0.90;
    - top Product must beat second Product by >= 0.05;
    - aliases belonging to the same Product never become competitors;
    - explicit strength contradiction excludes the Product;
    - every result remains review + confirmation required.
    """

    if not isinstance(
        candidate,
        MedicationCandidate,
    ):
        raise TypeError(
            "candidate must be MedicationCandidate"
        )

    try:
        target = normalize_medical_name(
            candidate.raw_name_text
        )
    except ValueError:
        return _empty_result(
            candidate=candidate,
            status=(
                PrescriptionProductSuggestionStatus
                .NO_SUGGESTION
            ),
            message=(
                "Candidate name could not be normalized "
                "for non-authoritative suggestion."
            ),
        )

    candidate_strength: str | None = None

    if candidate.raw_strength_text is not None:
        try:
            candidate_strength = (
                _normalized_strength(
                    candidate.raw_strength_text
                )
            )
        except ValueError:
            return _empty_result(
                candidate=candidate,
                status=(
                    PrescriptionProductSuggestionStatus
                    .NO_SUGGESTION
                ),
                message=(
                    "Candidate strength could not be governed "
                    "for non-authoritative suggestion."
                ),
            )

    exact: list[
        PrescriptionProductSuggestion
    ] = []

    fuzzy_by_product: list[
        tuple[
            float,
            int,
            PrescriptionProductSuggestion,
        ]
    ] = []

    for record in sorted(
        products,
        key=lambda item: item.product_id,
    ):
        if record.product_status != 1:
            continue

        strength_status = _strength_status(
            record=record,
            candidate_strength=(
                candidate_strength
            ),
        )

        if strength_status is None:
            continue

        aliases = _aliases(
            record
        )

        if not aliases:
            continue

        exact_alias = next(
            (
                (
                    field,
                    alias,
                )
                for (
                    field,
                    alias,
                    normalized,
                ) in aliases
                if normalized == target
            ),
            None,
        )

        if exact_alias is not None:
            field, alias = exact_alias

            exact.append(
                _make_suggestion(
                    record=record,
                    field=field,
                    alias=alias,
                    score=1.0,
                    kind=(
                        PrescriptionProductSuggestionKind
                        .EXACT
                    ),
                    strength_status=(
                        strength_status
                    ),
                )
            )

            continue

        scored_aliases = tuple(
            (
                SequenceMatcher(
                    None,
                    target,
                    normalized,
                ).ratio(),
                field,
                alias,
            )
            for (
                field,
                alias,
                normalized,
            ) in aliases
        )

        if not scored_aliases:
            continue

        (
            best_score,
            best_field,
            best_alias,
        ) = max(
            scored_aliases,
            key=lambda item: item[0],
        )

        fuzzy_by_product.append(
            (
                float(best_score),
                record.product_id,
                _make_suggestion(
                    record=record,
                    field=best_field,
                    alias=best_alias,
                    score=best_score,
                    kind=(
                        PrescriptionProductSuggestionKind
                        .FUZZY
                    ),
                    strength_status=(
                        strength_status
                    ),
                ),
            )
        )

    # Exact governed alias evidence always takes precedence over fuzzy.
    if exact:
        exact.sort(
            key=lambda item: item.product_id
        )

        return PrescriptionProductSuggestionResult(
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
                PrescriptionProductSuggestionStatus
                .EXACT_SUGGESTIONS
            ),
            suggestions=tuple(exact),
            message=(
                "Active Product alias matched exactly. "
                "This remains non-authoritative and requires "
                "explicit human confirmation."
            ),
        )

    if not fuzzy_by_product:
        return _empty_result(
            candidate=candidate,
            status=(
                PrescriptionProductSuggestionStatus
                .NO_SUGGESTION
            ),
            message=(
                "No active Product produced eligible "
                "non-authoritative suggestion evidence."
            ),
        )

    fuzzy_by_product.sort(
        key=lambda item: (
            -item[0],
            item[1],
        )
    )

    top_score = fuzzy_by_product[0][0]

    if (
        top_score
        < FUZZY_SUGGESTION_THRESHOLD
    ):
        return _empty_result(
            candidate=candidate,
            status=(
                PrescriptionProductSuggestionStatus
                .NO_SUGGESTION
            ),
            message=(
                "Best Product alias string similarity "
                "was below the governed suggestion threshold."
            ),
        )

    if len(fuzzy_by_product) > 1:
        second_score = (
            fuzzy_by_product[1][0]
        )

        margin = (
            top_score
            - second_score
        )

        if (
            margin
            < FUZZY_SUGGESTION_MIN_PRODUCT_MARGIN
        ):
            return _empty_result(
                candidate=candidate,
                status=(
                    PrescriptionProductSuggestionStatus
                    .AMBIGUOUS_FUZZY
                ),
                message=(
                    "Top fuzzy Product aliases were too close "
                    "to present a governed suggestion."
                ),
            )

    top = fuzzy_by_product[0][2]

    return PrescriptionProductSuggestionResult(
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
            PrescriptionProductSuggestionStatus
            .FUZZY_SUGGESTION
        ),
        suggestions=(
            top,
        ),
        message=(
            "One Product passed the governed string-similarity "
            "suggestion threshold and Product-level margin. "
            "The similarity score is not a probability and "
            "explicit human confirmation is required."
        ),
    )
