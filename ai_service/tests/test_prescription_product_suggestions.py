from __future__ import annotations

from io import BytesIO
from types import SimpleNamespace

from PIL import Image

from medsense_ai.integrations.amna_medcopy.contracts import (
    PartnerProductRecord,
)
from medsense_ai.integrations.amna_medcopy.prescription_orchestration import (
    PartnerPrescriptionOrchestrationService,
)
from medsense_ai.integrations.amna_medcopy.prescription_product_matcher import (
    PrescriptionProductMatchStatus,
)
from medsense_ai.integrations.amna_medcopy.prescription_product_suggestions import (
    PrescriptionProductSuggestionKind,
    PrescriptionProductSuggestionStatus,
    suggest_prescription_candidate_products,
)
from medsense_ai.ocr.contracts import (
    OCREngine,
    OCRLine,
    OCRResult,
    OCRRuntimeMetadata,
    OCRStatus,
)
from medsense_ai.prescription_analysis.contracts import (
    MedicationCandidate,
    PrescriptionLineEvidence,
)


def candidate(
    name: str,
    strength: str | None = "50mg",
    *,
    review: bool = False,
) -> MedicationCandidate:

    text = (
        f"{name} {strength}"
        if strength is not None
        else name
    )

    return MedicationCandidate(
        candidate_id="candidate-1",
        raw_name_text=name,
        raw_strength_text=strength,
        source=PrescriptionLineEvidence(
            line_index=0,
            text=text,
            confidence=0.90,
        ),
        review_required=review,
    )


def product(
    product_id: int,
    *,
    generic: str | None,
    salt: str | None,
    title: str,
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


def test_reviewed_exact_candidate_can_receive_non_authoritative_suggestion(
) -> None:

    result = suggest_prescription_candidate_products(
        candidate(
            "Cimetidine",
            review=True,
        ),
        (
            product(
                1,
                generic="Cimetidine",
                salt="Cimetidine",
                title="Cimetidine 50mg",
            ),
        ),
    )

    assert (
        result.status
        is PrescriptionProductSuggestionStatus.EXACT_SUGGESTIONS
    )

    assert [
        item.product_id
        for item in result.suggestions
    ] == [1]

    assert (
        result.suggestions[0].suggestion_kind
        is PrescriptionProductSuggestionKind.EXACT
    )

    assert result.suggestions[0].similarity_score == 1.0
    assert result.review_required is True
    assert result.confirmation_required is True


def test_typo_can_receive_governed_fuzzy_suggestion(
) -> None:

    result = suggest_prescription_candidate_products(
        candidate("Cimetidne"),
        (
            product(
                1,
                generic="Cimetidine",
                salt="Cimetidine",
                title="Cimetidine 50mg",
            ),
            product(
                2,
                generic="Cetirizine",
                salt="Cetirizine",
                title="Cetirizine 10mg",
            ),
            product(
                3,
                generic="Metformin",
                salt="Metformin",
                title="Metformin 500mg",
            ),
        ),
    )

    assert (
        result.status
        is PrescriptionProductSuggestionStatus.FUZZY_SUGGESTION
    )

    assert [
        item.product_id
        for item in result.suggestions
    ] == [1]

    suggestion = result.suggestions[0]

    assert suggestion.similarity_score >= 0.90
    assert (
        suggestion.suggestion_kind
        is PrescriptionProductSuggestionKind.FUZZY
    )

    assert result.review_required is True
    assert result.confirmation_required is True


def test_below_threshold_returns_no_suggestion(
) -> None:

    result = suggest_prescription_candidate_products(
        candidate("CompletelyDifferent"),
        (
            product(
                1,
                generic="Cimetidine",
                salt="Cimetidine",
                title="Cimetidine 50mg",
            ),
        ),
    )

    assert (
        result.status
        is PrescriptionProductSuggestionStatus.NO_SUGGESTION
    )
    assert result.suggestions == ()


def test_close_second_product_fails_margin(
) -> None:

    result = suggest_prescription_candidate_products(
        candidate(
            "Cimetidinez",
            strength=None,
        ),
        (
            product(
                1,
                generic="Cimetidinex",
                salt="Cimetidinex",
                title="Product X",
            ),
            product(
                2,
                generic="Cimetidiney",
                salt="Cimetidiney",
                title="Product Y",
            ),
        ),
    )

    assert (
        result.status
        is PrescriptionProductSuggestionStatus.AMBIGUOUS_FUZZY
    )

    assert result.suggestions == ()


def test_duplicate_aliases_of_same_product_are_not_competitors(
) -> None:

    result = suggest_prescription_candidate_products(
        candidate("Cimetidne"),
        (
            product(
                1,
                generic="Cimetidine",
                salt="Cimetidine",
                title="Cimetidine 50mg",
            ),
        ),
    )

    assert (
        result.status
        is PrescriptionProductSuggestionStatus.FUZZY_SUGGESTION
    )
    assert len(result.suggestions) == 1
    assert result.suggestions[0].product_id == 1


def test_inactive_product_is_not_suggested(
) -> None:

    result = suggest_prescription_candidate_products(
        candidate("Cimetidine"),
        (
            product(
                1,
                generic="Cimetidine",
                salt="Cimetidine",
                title="Cimetidine 50mg",
                status=0,
            ),
        ),
    )

    assert result.suggestions == ()


def test_explicit_strength_contradiction_excludes_suggestion(
) -> None:

    result = suggest_prescription_candidate_products(
        candidate(
            "Cimetidne",
            "50mg",
        ),
        (
            product(
                1,
                generic="Cimetidine",
                salt="Cimetidine",
                title="Cimetidine 100mg",
            ),
        ),
    )

    assert result.suggestions == ()


def test_product_title_is_not_suggestion_identity(
) -> None:

    result = suggest_prescription_candidate_products(
        candidate(
            "BrandOnly",
            strength=None,
        ),
        (
            product(
                1,
                generic="Cimetidine",
                salt="Cimetidine",
                title="BrandOnly",
            ),
        ),
    )

    assert result.suggestions == ()


class FakeRapidAdapter:
    def recognize(self, image):
        result = OCRResult(
            engine=OCREngine.RAPIDOCR,
            preprocess_mode=image.preprocess_mode,
            status=OCRStatus.SUCCESS,
            raw_text="Cimetidne 50mg",
            lines=(
                OCRLine(
                    text="Cimetidne 50mg",
                    confidence=0.95,
                ),
            ),
        )

        metadata = OCRRuntimeMetadata(
            engine=OCREngine.RAPIDOCR,
            engine_version="fake-rapidocr-test",
            preprocess_mode=image.preprocess_mode,
            elapsed_ms=1.0,
        )

        return SimpleNamespace(
            result=result,
            metadata=metadata,
        )


def test_orchestration_keeps_authoritative_match_blocked_but_adds_suggestion(
) -> None:

    image = BytesIO()

    Image.new(
        "RGB",
        (400, 160),
        "white",
    ).save(
        image,
        format="PNG",
    )

    service = PartnerPrescriptionOrchestrationService(
        ocr_adapter=FakeRapidAdapter()
    )

    result = service.analyze(
        image_bytes=image.getvalue(),
        media_type="image/png",
        products=(
            product(
                1,
                generic="Cimetidine",
                salt="Cimetidine",
                title="Cimetidine 50mg",
            ),
            product(
                2,
                generic="Cetirizine",
                salt="Cetirizine",
                title="Cetirizine 10mg",
            ),
        ),
    )

    authoritative = (
        result.product_matches[0]
        .product_match
    )

    assert (
        authoritative.status
        is PrescriptionProductMatchStatus.SOURCE_REVIEW_REQUIRED
    )

    assert authoritative.products == ()

    assert len(
        result.product_suggestions
    ) == 1

    suggestion_result = (
        result.product_suggestions[0]
    )

    assert (
        suggestion_result.status
        is PrescriptionProductSuggestionStatus.FUZZY_SUGGESTION
    )

    assert [
        item.product_id
        for item in suggestion_result.suggestions
    ] == [1]

    assert suggestion_result.review_required is True
    assert suggestion_result.confirmation_required is True
