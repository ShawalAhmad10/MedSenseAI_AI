from __future__ import annotations

from io import BytesIO

import pytest
from PIL import Image

from medsense_ai.ocr.contracts import (
    OCRLine,
    OCREngine,
    OCRResult,
    OCRStatus,
    PreprocessMode,
    VerificationStatus,
)
from medsense_ai.ocr.input_validation import (
    ImageValidationError,
    ImageValidationErrorCode,
    validate_image_bytes,
)
from medsense_ai.ocr.preprocessing import preprocess_image_bytes


def _image_bytes(
    *,
    width: int = 800,
    height: int = 1000,
    image_format: str = "PNG",
) -> bytes:
    buffer = BytesIO()

    Image.new(
        "RGB",
        (width, height),
        "white",
    ).save(
        buffer,
        format=image_format,
    )

    return buffer.getvalue()


def test_ocr_result_starts_unverified() -> None:
    result = OCRResult(
        engine=OCREngine.TESSERACT,
        preprocess_mode=PreprocessMode.DECODE_ONLY_V1,
        status=OCRStatus.SUCCESS,
        raw_text="Paracetamol 500 mg",
        lines=(
            OCRLine(
                text="Paracetamol 500 mg",
                confidence=95.0,
            ),
        ),
    )

    assert (
        result.verification_status
        is VerificationStatus.UNVERIFIED
    )


@pytest.mark.parametrize(
    "status",
    [
        OCRStatus.PARTIAL,
        OCRStatus.LOW_CONFIDENCE,
        OCRStatus.REVIEW_REQUIRED,
    ],
)
def test_review_statuses_require_manual_review(
    status: OCRStatus,
) -> None:
    with pytest.raises(ValueError):
        OCRResult(
            engine=OCREngine.TESSERACT,
            preprocess_mode=(
                PreprocessMode.DECODE_ONLY_V1
            ),
            status=status,
            raw_text="uncertain text",
            review_required=False,
        )


def test_empty_input_is_rejected() -> None:
    with pytest.raises(
        ImageValidationError
    ) as exc_info:
        validate_image_bytes(
            b"",
            media_type="image/png",
        )

    assert (
        exc_info.value.code
        is ImageValidationErrorCode.EMPTY_INPUT
    )


def test_corrupt_image_is_rejected() -> None:
    with pytest.raises(
        ImageValidationError
    ) as exc_info:
        validate_image_bytes(
            b"not-an-image",
            media_type="image/png",
        )

    assert (
        exc_info.value.code
        is ImageValidationErrorCode.CORRUPT_IMAGE
    )


def test_media_type_mismatch_is_rejected() -> None:
    data = _image_bytes(
        image_format="PNG",
    )

    with pytest.raises(
        ImageValidationError
    ) as exc_info:
        validate_image_bytes(
            data,
            media_type="image/jpeg",
        )

    assert (
        exc_info.value.code
        is ImageValidationErrorCode.MEDIA_TYPE_MISMATCH
    )


def test_valid_png_is_accepted() -> None:
    result = validate_image_bytes(
        _image_bytes(),
        media_type="image/png",
    )

    assert result.image_format == "PNG"
    assert result.media_type == "image/png"
    assert result.width == 800
    assert result.height == 1000
    assert result.pixel_count == 800_000


def test_decode_only_preserves_dimensions() -> None:
    result = preprocess_image_bytes(
        _image_bytes(
            width=900,
            height=1200,
        ),
        mode=PreprocessMode.DECODE_ONLY_V1,
        media_type="image/png",
    )

    assert result.width == 900
    assert result.height == 1200
    assert result.image_mode == "RGB"

    assert (
        "right_angle_orientation_correction"
        not in result.applied_steps
    )


def test_document_basic_corrects_right_angle_rotation() -> None:
    result = preprocess_image_bytes(
        _image_bytes(
            width=1200,
            height=800,
        ),
        mode=PreprocessMode.DOCUMENT_BASIC_V1,
        media_type="image/png",
    )

    assert result.width == 800
    assert result.height == 1200
    assert result.image_mode == "L"

    assert (
        "right_angle_orientation_correction"
        in result.applied_steps
    )


def test_document_basic_upscales_short_side_to_800() -> None:
    result = preprocess_image_bytes(
        _image_bytes(
            width=400,
            height=600,
            image_format="JPEG",
        ),
        mode=PreprocessMode.DOCUMENT_BASIC_V1,
        media_type="image/jpeg",
    )

    assert result.width == 800
    assert result.height == 1200
    assert min(
        result.width,
        result.height,
    ) == 800

    assert (
        "aspect_preserving_upscale"
        in result.applied_steps
    )


def test_preprocessing_is_deterministic() -> None:
    data = _image_bytes(
        width=500,
        height=900,
    )

    first = preprocess_image_bytes(
        data,
        mode=PreprocessMode.DOCUMENT_BASIC_V1,
        media_type="image/png",
    )

    second = preprocess_image_bytes(
        data,
        mode=PreprocessMode.DOCUMENT_BASIC_V1,
        media_type="image/png",
    )

    assert first.sha256_hex == second.sha256_hex
    assert first.png_bytes == second.png_bytes