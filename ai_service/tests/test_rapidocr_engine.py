from __future__ import annotations

from io import BytesIO
from types import SimpleNamespace

from PIL import Image

from medsense_ai.integrations.amna_medcopy.prescription_orchestration import (
    PartnerPrescriptionOrchestrationService,
    _apply_frozen_review_policy,
)
from medsense_ai.ocr.contracts import (
    OCREngine,
    OCRStatus,
    PreprocessMode,
)
from medsense_ai.ocr.engines.paddleocr import PaddleOCRAdapter
from medsense_ai.ocr.engines.rapidocr import RapidOCRAdapter
from medsense_ai.ocr.preprocessing import preprocess_image_bytes


def _image():
    buffer = BytesIO()

    Image.new(
        "RGB",
        (500, 200),
        "white",
    ).save(
        buffer,
        format="PNG",
    )

    return preprocess_image_bytes(
        buffer.getvalue(),
        mode=PreprocessMode.DOCUMENT_BASIC_V1,
        media_type="image/png",
    )


class FakeRapidEngine:
    def __call__(self, image):
        return SimpleNamespace(
            txts=(
                "Aspirin 75 mg",
                "1 tab daily",
            ),
            scores=(
                0.98,
                0.93,
            ),
            boxes=(
                (
                    (10, 10),
                    (180, 10),
                    (180, 40),
                    (10, 40),
                ),
                (
                    (10, 55),
                    (160, 55),
                    (160, 85),
                    (10, 85),
                ),
            ),
        )


class BrokenRapidEngine:
    def __call__(self, image):
        raise RuntimeError(
            "synthetic rapidocr failure"
        )


def test_rapidocr_preserves_raw_evidence():
    result = RapidOCRAdapter(
        engine=FakeRapidEngine()
    ).recognize(
        _image()
    ).result

    assert result.engine is OCREngine.RAPIDOCR
    assert result.status is OCRStatus.SUCCESS

    assert result.raw_text == (
        "Aspirin 75 mg\n"
        "1 tab daily"
    )

    assert (
        result.lines[0].bounding_box
        == (10, 10, 180, 40)
    )


def test_rapidocr_failure_fails_closed():
    result = RapidOCRAdapter(
        engine=BrokenRapidEngine()
    ).recognize(
        _image()
    ).result

    assert (
        result.status
        is OCRStatus.OCR_UNAVAILABLE
    )

    assert result.review_required is True


def test_rapidocr_has_separate_review_policy():
    original = RapidOCRAdapter(
        engine=FakeRapidEngine()
    ).recognize(
        _image()
    ).result

    result = _apply_frozen_review_policy(
        original
    )

    assert (
        result.status
        is OCRStatus.REVIEW_REQUIRED
    )
    assert result.review_required is True
    assert result.raw_text == original.raw_text
    assert result.lines == original.lines

    assert (
        "RAPIDOCR_REVIEW_REQUIRED_UNTIL_CALIBRATED"
        in result.warnings
    )

    assert (
        "FROZEN_CONFIDENCE_THRESHOLD_TRIGGERED"
        not in result.warnings
    )


def test_rapidocr_is_production_default(
    monkeypatch,
):
    monkeypatch.delenv(
        "MEDSENSE_PRESCRIPTION_OCR_ENGINE",
        raising=False,
    )

    service = (
        PartnerPrescriptionOrchestrationService()
    )

    assert isinstance(
        service._ocr_adapter,
        RapidOCRAdapter,
    )


def test_paddle_remains_rollback(
    monkeypatch,
):
    monkeypatch.setenv(
        "MEDSENSE_PRESCRIPTION_OCR_ENGINE",
        "paddleocr",
    )

    service = (
        PartnerPrescriptionOrchestrationService()
    )

    assert isinstance(
        service._ocr_adapter,
        PaddleOCRAdapter,
    )
