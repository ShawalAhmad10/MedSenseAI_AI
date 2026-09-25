from __future__ import annotations

import pytest

from medsense_ai.integrations.amna_medcopy.contracts import (
    PartnerProductRecord,
)
from medsense_ai.integrations.amna_medcopy.prescription_product_matcher import (
    PrescriptionProductMatchStatus,
    ProductNameMatchField,
    StrengthEvidenceStatus,
    match_prescription_candidate_to_products,
)
from medsense_ai.prescription_analysis.contracts import (
    MedicationCandidate,
    PrescriptionLineEvidence,
)


def candidate(
    name: str,
    strength: str | None = "250 mg",
    *,
    review_required: bool = False,
) -> MedicationCandidate:
    text = (
        f"{name} {strength}"
        if strength is not None
        else name
    )

    return MedicationCandidate(
        candidate_id="med-line-0001",
        raw_name_text=name,
        raw_strength_text=strength,
        source=PrescriptionLineEvidence(
            line_index=1,
            text=text,
            confidence=0.99,
        ),
        review_required=review_required,
    )


def product(
    product_id: int,
    *,
    title: str,
    generic: str | None,
    salt: str | None,
    status: int = 1,
) -> PartnerProductRecord:
    return PartnerProductRecord(
        product_id=product_id,
        product_title=title,
        product_generic_name=generic,
        product_salt=salt,
        product_requires_rx=True,
        product_status=status,
    )


def test_unique_exact_generic_match() -> None:
    result = match_prescription_candidate_to_products(
        candidate("Amoxicillin", "250 mg"),
        (
            product(
                10,
                title="Amoxicillin 250 mg Capsules",
                generic="Amoxicillin",
                salt="Amoxicillin",
            ),
        ),
    )

    assert (
        result.status
        is PrescriptionProductMatchStatus.UNIQUE_CANDIDATE
    )
    assert [p.product_id for p in result.products] == [10]
    assert result.confirmation_required is True
    assert result.review_required is False


def test_exact_salt_match_is_supported() -> None:
    result = match_prescription_candidate_to_products(
        candidate("Amoxicillin", "250 mg"),
        (
            product(
                10,
                title="Brand A 250 mg",
                generic=None,
                salt="Amoxicillin",
            ),
        ),
    )

    assert result.products[0].name_match_fields == (
        ProductNameMatchField.SALT,
    )


def test_normalization_allows_case_and_whitespace_only() -> None:
    result = match_prescription_candidate_to_products(
        candidate("  AMOXICILLIN  ", "250 mg"),
        (
            product(
                10,
                title="Brand A 250 mg",
                generic="amoxicillin",
                salt=None,
            ),
        ),
    )

    assert (
        result.status
        is PrescriptionProductMatchStatus.UNIQUE_CANDIDATE
    )


def test_typo_is_not_fuzzy_corrected() -> None:
    result = match_prescription_candidate_to_products(
        candidate("Amoxcillin", "250 mg"),
        (
            product(
                10,
                title="Amoxicillin 250 mg",
                generic="Amoxicillin",
                salt="Amoxicillin",
            ),
        ),
    )

    assert result.status is PrescriptionProductMatchStatus.UNMAPPED
    assert result.products == ()
    assert result.review_required is True


def test_product_title_is_not_used_as_identity() -> None:
    result = match_prescription_candidate_to_products(
        candidate("Amoxicillin", "250 mg"),
        (
            product(
                10,
                title="Amoxicillin 250 mg",
                generic="Different Ingredient",
                salt="Different Ingredient",
            ),
        ),
    )

    assert result.status is PrescriptionProductMatchStatus.UNMAPPED


def test_inactive_product_is_excluded() -> None:
    result = match_prescription_candidate_to_products(
        candidate("Amoxicillin", "250 mg"),
        (
            product(
                10,
                title="Amoxicillin 250 mg",
                generic="Amoxicillin",
                salt="Amoxicillin",
                status=0,
            ),
        ),
    )

    assert result.status is PrescriptionProductMatchStatus.UNMAPPED


def test_explicit_wrong_strength_is_excluded() -> None:
    result = match_prescription_candidate_to_products(
        candidate("Amoxicillin", "250 mg"),
        (
            product(
                10,
                title="Amoxicillin 500 mg Capsules",
                generic="Amoxicillin",
                salt="Amoxicillin",
            ),
        ),
    )

    assert result.status is PrescriptionProductMatchStatus.UNMAPPED


def test_matching_strength_is_recorded() -> None:
    result = match_prescription_candidate_to_products(
        candidate("Amoxicillin", "250 mg"),
        (
            product(
                10,
                title="Amoxicillin 250 mg Capsules",
                generic="Amoxicillin",
                salt="Amoxicillin",
            ),
        ),
    )

    assert (
        result.products[0].strength_evidence_status
        is StrengthEvidenceStatus.MATCHED
    )


def test_absent_product_strength_remains_unknown() -> None:
    result = match_prescription_candidate_to_products(
        candidate("Amoxicillin", "250 mg"),
        (
            product(
                10,
                title="Brand A",
                generic="Amoxicillin",
                salt="Amoxicillin",
            ),
        ),
    )

    assert (
        result.status
        is PrescriptionProductMatchStatus.UNIQUE_CANDIDATE
    )

    assert (
        result.products[0].strength_evidence_status
        is StrengthEvidenceStatus.NOT_DECLARED
    )


def test_multiple_exact_products_are_ambiguous() -> None:
    result = match_prescription_candidate_to_products(
        candidate("Amoxicillin", "250 mg"),
        (
            product(
                20,
                title="Brand B 250 mg",
                generic="Amoxicillin",
                salt="Amoxicillin",
            ),
            product(
                10,
                title="Brand A 250 mg",
                generic="Amoxicillin",
                salt="Amoxicillin",
            ),
        ),
    )

    assert (
        result.status
        is PrescriptionProductMatchStatus.AMBIGUOUS_CANDIDATES
    )

    assert [p.product_id for p in result.products] == [10, 20]
    assert result.review_required is True
    assert result.confirmation_required is True


def test_source_review_required_blocks_matching() -> None:
    result = match_prescription_candidate_to_products(
        candidate(
            "Amoxicillin",
            "250 mg",
            review_required=True,
        ),
        (
            product(
                10,
                title="Amoxicillin 250 mg",
                generic="Amoxicillin",
                salt="Amoxicillin",
            ),
        ),
    )

    assert (
        result.status
        is PrescriptionProductMatchStatus.SOURCE_REVIEW_REQUIRED
    )
    assert result.products == ()
    assert result.review_required is True


def test_candidate_without_strength_can_still_return_exact_name_candidate() -> None:
    result = match_prescription_candidate_to_products(
        candidate("Amoxicillin", None),
        (
            product(
                10,
                title="Amoxicillin 250 mg",
                generic="Amoxicillin",
                salt="Amoxicillin",
            ),
        ),
    )

    assert (
        result.status
        is PrescriptionProductMatchStatus.UNIQUE_CANDIDATE
    )

    assert result.confirmation_required is True


def test_deterministic_product_order() -> None:
    result = match_prescription_candidate_to_products(
        candidate("Amoxicillin", "250 mg"),
        (
            product(
                30,
                title="Brand C 250 mg",
                generic="Amoxicillin",
                salt="Amoxicillin",
            ),
            product(
                10,
                title="Brand A 250 mg",
                generic="Amoxicillin",
                salt="Amoxicillin",
            ),
            product(
                20,
                title="Brand B 250 mg",
                generic="Amoxicillin",
                salt="Amoxicillin",
            ),
        ),
    )

    assert [
        item.product_id
        for item in result.products
    ] == [10, 20, 30]


def test_match_never_auto_confirms_product() -> None:
    result = match_prescription_candidate_to_products(
        candidate("Amoxicillin", "250 mg"),
        (
            product(
                10,
                title="Amoxicillin 250 mg",
                generic="Amoxicillin",
                salt="Amoxicillin",
            ),
        ),
    )

    assert result.confirmation_required is True


def test_liquid_ratio_strength_matches_exactly() -> None:
    result = match_prescription_candidate_to_products(
        candidate(
            "Amoxicillin",
            "125 mg/5 mL",
        ),
        (
            product(
                10,
                title="Amoxicillin 125 mg/5 mL Suspension",
                generic="Amoxicillin",
                salt="Amoxicillin",
            ),
        ),
    )

    assert (
        result.status
        is PrescriptionProductMatchStatus.UNIQUE_CANDIDATE
    )

    assert (
        result.products[0].strength_evidence_status
        is StrengthEvidenceStatus.MATCHED
    )


def test_liquid_ratio_denominator_mismatch_is_excluded() -> None:
    result = match_prescription_candidate_to_products(
        candidate(
            "Amoxicillin",
            "125 mg/5 mL",
        ),
        (
            product(
                10,
                title="Amoxicillin 125 mg/10 mL Suspension",
                generic="Amoxicillin",
                salt="Amoxicillin",
            ),
        ),
    )

    assert (
        result.status
        is PrescriptionProductMatchStatus.UNMAPPED
    )
    assert result.products == ()
