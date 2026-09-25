from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum

from medsense_ai.ocr.contracts import (
    OCREngine,
    OCRStatus,
    PreprocessMode,
    VerificationStatus,
)


class PrescriptionAnalysisStatus(StrEnum):
    ANALYZED = "ANALYZED"
    REVIEW_REQUIRED = "REVIEW_REQUIRED"
    NO_CANDIDATES = "NO_CANDIDATES"
    OCR_BLOCKED = "OCR_BLOCKED"


@dataclass(frozen=True, slots=True)
class PrescriptionLineEvidence:
    """
    Source-preserved evidence from exactly one OCR line.

    Confidence is OCR-engine-specific. It is not a probability that
    medication identity or clinical meaning is correct.
    """

    line_index: int
    text: str
    confidence: float | None = None

    def __post_init__(self) -> None:
        if self.line_index < 0:
            raise ValueError(
                "line_index must be non-negative."
            )

        if not isinstance(self.text, str):
            raise TypeError(
                "PrescriptionLineEvidence.text must be a string."
            )

        if not self.text.strip():
            raise ValueError(
                "PrescriptionLineEvidence.text must not be blank."
            )

        if (
            self.confidence is not None
            and not isinstance(
                self.confidence,
                (int, float),
            )
        ):
            raise TypeError(
                "confidence must be numeric or None."
            )


@dataclass(frozen=True, slots=True)
class PrescriptionInstructionEvidence:
    """
    One source-preserved instruction-like OCR line.

    This evidence is deliberately NOT linked to a medication and is
    not interpreted as a dose, frequency, duration, or clinical order.
    """

    source: PrescriptionLineEvidence
    review_required: bool = False
    warnings: tuple[str, ...] = field(
        default_factory=tuple
    )

    def __post_init__(self) -> None:
        if any(
            not isinstance(warning, str)
            or not warning.strip()
            for warning in self.warnings
        ):
            raise ValueError(
                "warnings must contain only non-blank strings."
            )


@dataclass(frozen=True, slots=True)
class MedicationCandidate:
    """
    One source-preserved medication-like candidate extracted from OCR.

    This is NOT a normalized medicine identity, Product match,
    RxNorm concept, prescribing decision, or DDI input.
    """

    candidate_id: str
    raw_name_text: str
    raw_strength_text: str | None
    source: PrescriptionLineEvidence
    review_required: bool

    warnings: tuple[str, ...] = field(
        default_factory=tuple
    )

    def __post_init__(self) -> None:
        if not self.candidate_id.strip():
            raise ValueError(
                "candidate_id must not be blank."
            )

        if not self.raw_name_text.strip():
            raise ValueError(
                "raw_name_text must not be blank."
            )

        if (
            self.raw_strength_text is not None
            and not self.raw_strength_text.strip()
        ):
            raise ValueError(
                "raw_strength_text must be None or non-blank."
            )

        if any(
            not isinstance(warning, str)
            or not warning.strip()
            for warning in self.warnings
        ):
            raise ValueError(
                "warnings must contain only non-blank strings."
            )


@dataclass(frozen=True, slots=True)
class PrescriptionAnalysisResult:
    """
    Structured prescription evidence derived from raw OCR.

    No Product resolution, ingredient normalization, clinical
    interpretation, recommendation, or DDI decision occurs here.
    """

    status: PrescriptionAnalysisStatus

    source_engine: OCREngine
    source_preprocess_mode: PreprocessMode
    source_ocr_status: OCRStatus
    source_verification_status: VerificationStatus

    candidates: tuple[
        MedicationCandidate,
        ...
    ] = field(default_factory=tuple)

    instructions: tuple[
        PrescriptionInstructionEvidence,
        ...
    ] = field(default_factory=tuple)

    review_required: bool = False

    warnings: tuple[str, ...] = field(
        default_factory=tuple
    )

    def __post_init__(self) -> None:
        if (
            self.source_verification_status
            is not VerificationStatus.UNVERIFIED
        ):
            raise ValueError(
                "Prescription analysis must begin from "
                "UNVERIFIED OCR evidence."
            )

        if (
            self.status
            is PrescriptionAnalysisStatus.NO_CANDIDATES
            and self.candidates
        ):
            raise ValueError(
                "NO_CANDIDATES cannot contain candidates."
            )

        if (
            self.status
            in {
                PrescriptionAnalysisStatus.REVIEW_REQUIRED,
                PrescriptionAnalysisStatus.OCR_BLOCKED,
            }
            and not self.review_required
        ):
            raise ValueError(
                f"{self.status.value} must require review."
            )

        candidate_ids = tuple(
            candidate.candidate_id
            for candidate in self.candidates
        )

        if len(candidate_ids) != len(
            set(candidate_ids)
        ):
            raise ValueError(
                "candidate_id values must be unique."
            )

        if (
            any(
                candidate.review_required
                for candidate in self.candidates
            )
            and not self.review_required
        ):
            raise ValueError(
                "A review-required candidate requires "
                "document-level review."
            )

        if (
            any(
                instruction.review_required
                for instruction in self.instructions
            )
            and not self.review_required
        ):
            raise ValueError(
                "Review-required instruction evidence requires "
                "document-level review."
            )

        if any(
            not isinstance(warning, str)
            or not warning.strip()
            for warning in self.warnings
        ):
            raise ValueError(
                "warnings must contain only non-blank strings."
            )
