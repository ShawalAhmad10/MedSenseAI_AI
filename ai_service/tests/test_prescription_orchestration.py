from __future__ import annotations

from io import BytesIO

import pytest
from PIL import Image

from medsense_ai.integrations.amna_medcopy.contracts import (
    PartnerProductRecord,
)
from medsense_ai.integrations.amna_medcopy.prescription_orchestration import (
    FROZEN_OCR_REVIEW_THRESHOLD,
    PartnerPrescriptionOrchestrationService,
)
from medsense_ai.integrations.amna_medcopy.prescription_product_matcher import (
    PrescriptionProductMatchStatus,
)
from medsense_ai.ocr.contracts import (
    OCREngine,
    OCRLine,
    OCRResult,
    OCRRuntimeMetadata,
    OCRStatus,
    PreprocessMode,
)
from medsense_ai.ocr.engines.paddleocr import (
    PaddleOCRExecution,
)
from medsense_ai.ocr.input_validation import (
    ImageValidationError,
)


def image_bytes() -> bytes:
    buffer = BytesIO()

    Image.new(
        "RGB",
        (600, 900),
        "white",
    ).save(
        buffer,
        format="PNG",
    )

    return buffer.getvalue()


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


class FakeOCRAdapter:
    def __init__(
        self,
        result: OCRResult,
    ) -> None:
        self.result = result
        self.seen_mode = None

    def recognize(
        self,
        image,
    ) -> PaddleOCRExecution:
        self.seen_mode = (
            image.preprocess_mode
        )

        return PaddleOCRExecution(
            result=self.result,
            metadata=OCRRuntimeMetadata(
                engine=OCREngine.PADDLEOCR,
                engine_version="fake-paddle-test",
                preprocess_mode=(
                    image.preprocess_mode
                ),
                elapsed_ms=1.25,
            ),
        )


def success_result(
    *lines: OCRLine,
) -> OCRResult:
    return OCRResult(
        engine=OCREngine.PADDLEOCR,
        preprocess_mode=(
            PreprocessMode.DOCUMENT_BASIC_V1
        ),
        status=OCRStatus.SUCCESS,
        raw_text="\n".join(
            line.text
            for line in lines
        ),
        lines=tuple(lines),
        review_required=False,
    )


def test_orchestrates_image_to_unique_product_candidate() -> None:
    adapter = FakeOCRAdapter(
        success_result(
            OCRLine(
                "Amoxicillin 250 mg",
                0.99999,
            )
        )
    )

    service = (
        PartnerPrescriptionOrchestrationService(
            ocr_adapter=adapter
        )
    )

    result = service.analyze(
        image_bytes=image_bytes(),
        media_type="image/png",
        products=(
            product(
                10,
                title="Amoxicillin 250 mg Capsules",
                generic="Amoxicillin",
                salt="Amoxicillin",
            ),
        ),
    )

    assert (
        result.ocr_result.status
        is OCRStatus.SUCCESS
    )

    assert len(
        result.prescription_analysis.candidates
    ) == 1

    assert len(result.product_matches) == 1

    match = (
        result.product_matches[0]
        .product_match
    )

    assert (
        match.status
        is PrescriptionProductMatchStatus
        .UNIQUE_CANDIDATE
    )

    assert [
        item.product_id
        for item in match.products
    ] == [10]

    assert match.confirmation_required is True


def test_frozen_document_basic_preprocessing_is_used() -> None:
    adapter = FakeOCRAdapter(
        success_result(
            OCRLine(
                "Losartan 50 mg",
                0.99999,
            )
        )
    )

    service = (
        PartnerPrescriptionOrchestrationService(
            ocr_adapter=adapter
        )
    )

    service.analyze(
        image_bytes=image_bytes(),
        media_type="image/png",
        products=(),
    )

    assert (
        adapter.seen_mode
        is PreprocessMode.DOCUMENT_BASIC_V1
    )


def test_confidence_below_frozen_threshold_requires_review() -> None:
    confidence = (
        FROZEN_OCR_REVIEW_THRESHOLD
        - 0.000001
    )

    adapter = FakeOCRAdapter(
        success_result(
            OCRLine(
                "Amoxicillin 250 mg",
                confidence,
            )
        )
    )

    service = (
        PartnerPrescriptionOrchestrationService(
            ocr_adapter=adapter
        )
    )

    result = service.analyze(
        image_bytes=image_bytes(),
        media_type="image/png",
        products=(
            product(
                10,
                title="Amoxicillin 250 mg",
                generic="Amoxicillin",
                salt="Amoxicillin",
            ),
        ),
    )

    assert (
        result.ocr_result.status
        is OCRStatus.REVIEW_REQUIRED
    )

    assert result.ocr_result.review_required is True

    assert (
        "FROZEN_CONFIDENCE_THRESHOLD_TRIGGERED"
        in result.ocr_result.warnings
    )

    assert (
        result.product_matches[0]
        .product_match.status
        is PrescriptionProductMatchStatus
        .SOURCE_REVIEW_REQUIRED
    )


def test_confidence_equal_to_threshold_requires_review() -> None:
    adapter = FakeOCRAdapter(
        success_result(
            OCRLine(
                "Metformin 500 mg",
                FROZEN_OCR_REVIEW_THRESHOLD,
            )
        )
    )

    service = (
        PartnerPrescriptionOrchestrationService(
            ocr_adapter=adapter
        )
    )

    result = service.analyze(
        image_bytes=image_bytes(),
        media_type="image/png",
        products=(),
    )

    assert (
        result.ocr_result.status
        is OCRStatus.REVIEW_REQUIRED
    )


def test_missing_line_confidence_requires_review() -> None:
    adapter = FakeOCRAdapter(
        success_result(
            OCRLine(
                "Metformin 500 mg",
                None,
            )
        )
    )

    service = (
        PartnerPrescriptionOrchestrationService(
            ocr_adapter=adapter
        )
    )

    result = service.analyze(
        image_bytes=image_bytes(),
        media_type="image/png",
        products=(),
    )

    assert (
        result.ocr_result.status
        is OCRStatus.REVIEW_REQUIRED
    )

    assert (
        "FROZEN_CONFIDENCE_POLICY_MISSING_LINE_CONFIDENCE"
        in result.ocr_result.warnings
    )


def test_instruction_evidence_survives_orchestration() -> None:
    adapter = FakeOCRAdapter(
        success_result(
            OCRLine(
                "Amoxicillin 250 mg",
                0.99999,
            ),
            OCRLine(
                "Take one tablet twice daily",
                0.99999,
            ),
        )
    )

    service = (
        PartnerPrescriptionOrchestrationService(
            ocr_adapter=adapter
        )
    )

    result = service.analyze(
        image_bytes=image_bytes(),
        media_type="image/png",
        products=(),
    )

    assert len(
        result.prescription_analysis.instructions
    ) == 1

    assert (
        result.prescription_analysis
        .instructions[0].source.text
        == "Take one tablet twice daily"
    )


def test_ambiguous_products_remain_ambiguous() -> None:
    adapter = FakeOCRAdapter(
        success_result(
            OCRLine(
                "Amoxicillin 250 mg",
                0.99999,
            )
        )
    )

    service = (
        PartnerPrescriptionOrchestrationService(
            ocr_adapter=adapter
        )
    )

    result = service.analyze(
        image_bytes=image_bytes(),
        media_type="image/png",
        products=(
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

    match = (
        result.product_matches[0]
        .product_match
    )

    assert (
        match.status
        is PrescriptionProductMatchStatus
        .AMBIGUOUS_CANDIDATES
    )

    assert [
        item.product_id
        for item in match.products
    ] == [10, 20]


def test_no_text_ocr_produces_no_product_matches() -> None:
    adapter = FakeOCRAdapter(
        OCRResult(
            engine=OCREngine.PADDLEOCR,
            preprocess_mode=(
                PreprocessMode.DOCUMENT_BASIC_V1
            ),
            status=OCRStatus.NO_TEXT,
            raw_text="",
            lines=(),
            review_required=True,
        )
    )

    service = (
        PartnerPrescriptionOrchestrationService(
            ocr_adapter=adapter
        )
    )

    result = service.analyze(
        image_bytes=image_bytes(),
        media_type="image/png",
        products=(),
    )

    assert (
        result.prescription_analysis
        .candidates
        == ()
    )

    assert result.product_matches == ()


def test_invalid_image_is_rejected_before_ocr() -> None:
    adapter = FakeOCRAdapter(
        success_result(
            OCRLine(
                "Amoxicillin 250 mg",
                0.99999,
            )
        )
    )

    service = (
        PartnerPrescriptionOrchestrationService(
            ocr_adapter=adapter
        )
    )

    with pytest.raises(
        ImageValidationError
    ):
        service.analyze(
            image_bytes=b"not-an-image",
            media_type="image/png",
            products=(),
        )

    assert adapter.seen_mode is None


def test_media_type_mismatch_is_rejected() -> None:
    adapter = FakeOCRAdapter(
        success_result(
            OCRLine(
                "Amoxicillin 250 mg",
                0.99999,
            )
        )
    )

    service = (
        PartnerPrescriptionOrchestrationService(
            ocr_adapter=adapter
        )
    )

    with pytest.raises(
        ImageValidationError
    ):
        service.analyze(
            image_bytes=image_bytes(),
            media_type="image/jpeg",
            products=(),
        )


def test_orchestrator_does_not_mutate_or_auto_confirm_cart() -> None:
    adapter = FakeOCRAdapter(
        success_result(
            OCRLine(
                "Amoxicillin 250 mg",
                0.99999,
            )
        )
    )

    service = (
        PartnerPrescriptionOrchestrationService(
            ocr_adapter=adapter
        )
    )

    result = service.analyze(
        image_bytes=image_bytes(),
        media_type="image/png",
        products=(
            product(
                10,
                title="Amoxicillin 250 mg",
                generic="Amoxicillin",
                salt="Amoxicillin",
            ),
        ),
    )

    match = (
        result.product_matches[0]
        .product_match
    )

    assert match.confirmation_required is True

    assert not hasattr(
        result,
        "cart",
    )

    assert not hasattr(
        result,
        "ddi_result",
    )
