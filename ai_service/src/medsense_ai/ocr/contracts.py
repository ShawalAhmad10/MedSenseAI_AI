from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from typing import TypeAlias


BoundingBox: TypeAlias = tuple[int, int, int, int]


class OCREngine(StrEnum):
    TESSERACT = "tesseract"
    PADDLEOCR = "paddleocr"
    RAPIDOCR = "rapidocr"


class PreprocessMode(StrEnum):
    DECODE_ONLY_V1 = "decode_only_v1"
    DOCUMENT_BASIC_V1 = "document_basic_v1"


class OCRStatus(StrEnum):
    SUCCESS = "SUCCESS"
    PARTIAL = "PARTIAL"
    LOW_CONFIDENCE = "LOW_CONFIDENCE"
    NO_TEXT = "NO_TEXT"
    UNSUPPORTED_IMAGE = "UNSUPPORTED_IMAGE"
    OCR_UNAVAILABLE = "OCR_UNAVAILABLE"
    REVIEW_REQUIRED = "REVIEW_REQUIRED"
    INVALID_INPUT = "INVALID_INPUT"


class VerificationStatus(StrEnum):
    UNVERIFIED = "UNVERIFIED"
    VERIFIED = "VERIFIED"
    REJECTED = "REJECTED"


@dataclass(frozen=True, slots=True)
class OCRLine:
    """
    One OCR line returned by an OCR engine.

    `text` is preserved exactly as emitted by the engine.
    Confidence is engine-specific and must not be compared directly
    across different OCR engines.
    """

    text: str
    confidence: float | None = None
    bounding_box: BoundingBox | None = None

    def __post_init__(self) -> None:
        if not isinstance(self.text, str):
            raise TypeError("OCRLine.text must be a string.")

        if self.confidence is not None and not isinstance(
            self.confidence, (int, float)
        ):
            raise TypeError("OCRLine.confidence must be numeric or None.")

        if self.bounding_box is not None:
            if len(self.bounding_box) != 4:
                raise ValueError(
                    "OCRLine.bounding_box must contain exactly four integers."
                )

            if not all(isinstance(value, int) for value in self.bounding_box):
                raise TypeError(
                    "OCRLine.bounding_box values must all be integers."
                )


@dataclass(frozen=True, slots=True)
class OCRResult:
    """
    Raw OCR evidence produced by one engine/preprocessing configuration.

    This object deliberately contains no medicine normalization,
    clinical interpretation, DDI decision, or inferred prescription data.
    """

    engine: OCREngine
    preprocess_mode: PreprocessMode
    status: OCRStatus
    raw_text: str
    lines: tuple[OCRLine, ...] = field(default_factory=tuple)
    review_required: bool = False
    warnings: tuple[str, ...] = field(default_factory=tuple)
    verification_status: VerificationStatus = VerificationStatus.UNVERIFIED

    def __post_init__(self) -> None:
        if not isinstance(self.raw_text, str):
            raise TypeError("OCRResult.raw_text must be a string.")

        if self.verification_status is not VerificationStatus.UNVERIFIED:
            raise ValueError(
                "OCR engine output must initially remain UNVERIFIED."
            )

        if self.status in {
            OCRStatus.PARTIAL,
            OCRStatus.LOW_CONFIDENCE,
            OCRStatus.REVIEW_REQUIRED,
        } and not self.review_required:
            raise ValueError(
                f"{self.status.value} results must require manual review."
            )

        if self.status is OCRStatus.NO_TEXT and self.raw_text:
            raise ValueError(
                "NO_TEXT result cannot contain non-empty raw_text."
            )


@dataclass(frozen=True, slots=True)
class OCRRuntimeMetadata:
    """
    Reproducibility metadata for one OCR execution.
    """

    engine: OCREngine
    engine_version: str
    preprocess_mode: PreprocessMode
    elapsed_ms: float

    def __post_init__(self) -> None:
        if not self.engine_version.strip():
            raise ValueError("engine_version cannot be empty.")

        if self.elapsed_ms < 0:
            raise ValueError("elapsed_ms cannot be negative.")