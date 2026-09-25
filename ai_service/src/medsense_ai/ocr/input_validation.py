from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from io import BytesIO
from typing import Final

from PIL import Image, UnidentifiedImageError


MAX_ENCODED_BYTES: Final[int] = 10 * 1024 * 1024
MAX_DECODED_PIXELS: Final[int] = 16_000_000
MAX_DIMENSION: Final[int] = 4096

SUPPORTED_FORMATS: Final[frozenset[str]] = frozenset({"PNG", "JPEG"})

FORMAT_TO_MEDIA_TYPE: Final[dict[str, str]] = {
    "PNG": "image/png",
    "JPEG": "image/jpeg",
}

SUPPORTED_MEDIA_TYPES: Final[frozenset[str]] = frozenset(
    FORMAT_TO_MEDIA_TYPE.values()
)


class ImageValidationErrorCode(StrEnum):
    EMPTY_INPUT = "EMPTY_INPUT"
    FILE_TOO_LARGE = "FILE_TOO_LARGE"
    UNSUPPORTED_MEDIA_TYPE = "UNSUPPORTED_MEDIA_TYPE"
    UNSUPPORTED_IMAGE_FORMAT = "UNSUPPORTED_IMAGE_FORMAT"
    MEDIA_TYPE_MISMATCH = "MEDIA_TYPE_MISMATCH"
    CORRUPT_IMAGE = "CORRUPT_IMAGE"
    INVALID_DIMENSIONS = "INVALID_DIMENSIONS"
    TOO_MANY_PIXELS = "TOO_MANY_PIXELS"
    DIMENSION_TOO_LARGE = "DIMENSION_TOO_LARGE"


class ImageValidationError(ValueError):
    def __init__(
        self,
        code: ImageValidationErrorCode,
        message: str,
    ) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True, slots=True)
class ValidatedImageInput:
    encoded_bytes: bytes
    encoded_size_bytes: int
    image_format: str
    media_type: str
    width: int
    height: int

    @property
    def pixel_count(self) -> int:
        return self.width * self.height


def _normalise_media_type(media_type: str | None) -> str | None:
    if media_type is None:
        return None

    normalised = media_type.strip().lower()

    if not normalised:
        return None

    # Parameters such as `image/jpeg; charset=binary`
    # are not part of the canonical media type.
    return normalised.split(";", maxsplit=1)[0].strip()


def validate_image_bytes(
    data: bytes | bytearray | memoryview,
    *,
    media_type: str | None = None,
) -> ValidatedImageInput:
    """
    Validate one raster prescription image before OCR.

    Supported:
      - PNG
      - JPEG/JPG

    Limits:
      - <= 10 MiB encoded
      - <= 16 megapixels decoded
      - <= 4096 px in either dimension

    This function performs no OCR, preprocessing, medicine extraction,
    normalization, or clinical interpretation.
    """

    if not isinstance(data, (bytes, bytearray, memoryview)):
        raise TypeError(
            "data must be bytes, bytearray, or memoryview."
        )

    encoded_bytes = bytes(data)
    encoded_size = len(encoded_bytes)

    if encoded_size == 0:
        raise ImageValidationError(
            ImageValidationErrorCode.EMPTY_INPUT,
            "Image input is empty.",
        )

    if encoded_size > MAX_ENCODED_BYTES:
        raise ImageValidationError(
            ImageValidationErrorCode.FILE_TOO_LARGE,
            (
                f"Encoded image exceeds {MAX_ENCODED_BYTES} bytes "
                f"({10} MiB)."
            ),
        )

    declared_media_type = _normalise_media_type(media_type)

    if (
        declared_media_type is not None
        and declared_media_type not in SUPPORTED_MEDIA_TYPES
    ):
        raise ImageValidationError(
            ImageValidationErrorCode.UNSUPPORTED_MEDIA_TYPE,
            (
                "Unsupported media type. "
                "Only image/png and image/jpeg are accepted."
            ),
        )

    try:
        with Image.open(BytesIO(encoded_bytes)) as probe:
            detected_format = (probe.format or "").upper()
            width, height = probe.size

            # Verify encoded image integrity without modifying the image.
            probe.verify()

    except (UnidentifiedImageError, OSError, SyntaxError, ValueError) as exc:
        raise ImageValidationError(
            ImageValidationErrorCode.CORRUPT_IMAGE,
            "Input is not a valid readable raster image.",
        ) from exc

    if detected_format not in SUPPORTED_FORMATS:
        raise ImageValidationError(
            ImageValidationErrorCode.UNSUPPORTED_IMAGE_FORMAT,
            (
                f"Unsupported decoded image format: "
                f"{detected_format or 'UNKNOWN'}."
            ),
        )

    actual_media_type = FORMAT_TO_MEDIA_TYPE[detected_format]

    if (
        declared_media_type is not None
        and declared_media_type != actual_media_type
    ):
        raise ImageValidationError(
            ImageValidationErrorCode.MEDIA_TYPE_MISMATCH,
            (
                f"Declared media type {declared_media_type!r} "
                f"does not match decoded image type "
                f"{actual_media_type!r}."
            ),
        )

    if width <= 0 or height <= 0:
        raise ImageValidationError(
            ImageValidationErrorCode.INVALID_DIMENSIONS,
            "Decoded image dimensions must be positive.",
        )

    pixel_count = width * height

    if pixel_count > MAX_DECODED_PIXELS:
        raise ImageValidationError(
            ImageValidationErrorCode.TOO_MANY_PIXELS,
            (
                f"Decoded image contains {pixel_count} pixels; "
                f"maximum is {MAX_DECODED_PIXELS}."
            ),
        )

    if width > MAX_DIMENSION or height > MAX_DIMENSION:
        raise ImageValidationError(
            ImageValidationErrorCode.DIMENSION_TOO_LARGE,
            (
                f"Image dimensions {width}x{height} exceed "
                f"the {MAX_DIMENSION}px per-dimension limit."
            ),
        )

    return ValidatedImageInput(
        encoded_bytes=encoded_bytes,
        encoded_size_bytes=encoded_size,
        image_format=detected_format,
        media_type=actual_media_type,
        width=width,
        height=height,
    )