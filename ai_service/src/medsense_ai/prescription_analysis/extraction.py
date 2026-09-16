from __future__ import annotations

import re

from medsense_ai.ocr.contracts import (
    OCRResult,
    OCRStatus,
)
from medsense_ai.prescription_analysis.contracts import (
    MedicationCandidate,
    PrescriptionAnalysisResult,
    PrescriptionAnalysisStatus,
    PrescriptionInstructionEvidence,
    PrescriptionLineEvidence,
)


_STRENGTH_RE = re.compile(
    r"""
    (?P<strength>
        (?:
            \d+(?:\.\d+)?
            |
            \.\d+
        )
        \s*
        (?:
            mcg
            |µg
            |ug
            |mg
            |g
            |ml
            |mL
            |L
            |IU
            |units?
            |%
        )
        (?:
            \s*/\s*
            (?:
                \d+(?:\.\d+)?\s*
            )?
            (?:
                mcg
                |µg
                |ug
                |mg
                |g
                |ml
                |mL
                |L
            )
        )?
    )
    """,
    re.VERBOSE | re.IGNORECASE,
)


_INSTRUCTION_PREFIXES = (
    "take ",
    "use ",
    "continue ",
    "drink ",
    "apply ",
    "instill ",
    "inhale ",
    "inject ",
    "swallow ",
    "chew ",
)


_HEADER_LINES = {
    "prescription",
    "rx",
}


_SUSPICIOUS_NAME_CHARACTERS = frozenset(
    "?�"
)


def _is_instruction_like(text: str) -> bool:
    lowered = text.lstrip().casefold()

    return any(
        lowered.startswith(prefix)
        for prefix in _INSTRUCTION_PREFIXES
    )


def _contains_suspicious_name_text(
    text: str,
) -> bool:
    if any(
        character in text
        for character in _SUSPICIOUS_NAME_CHARACTERS
    ):
        return True

    if ".." in text or "__" in text:
        return True

    return False


def _instruction_from_line(
    *,
    line_index: int,
    text: str,
    confidence: float | None,
    source_requires_review: bool,
) -> PrescriptionInstructionEvidence | None:
    stripped = text.strip()

    if not stripped:
        return None

    if not _is_instruction_like(stripped):
        return None

    warnings: list[str] = []

    review_required = source_requires_review

    if confidence is None:
        review_required = True
        warnings.append(
            "SOURCE_LINE_CONFIDENCE_MISSING"
        )

    return PrescriptionInstructionEvidence(
        source=PrescriptionLineEvidence(
            line_index=line_index,
            text=text,
            confidence=confidence,
        ),
        review_required=review_required,
        warnings=tuple(warnings),
    )


def _candidate_from_line(
    *,
    line_index: int,
    text: str,
    confidence: float | None,
    source_requires_review: bool,
) -> MedicationCandidate | None:
    stripped = text.strip()

    if not stripped:
        return None

    if stripped.casefold() in _HEADER_LINES:
        return None

    if _is_instruction_like(stripped):
        return None

    match = _STRENGTH_RE.search(
        stripped
    )

    if match is None:
        return None

    raw_name_text = stripped[
        : match.start()
    ].strip(" \t,;:-")

    if not raw_name_text:
        return None

    raw_strength_text = match.group(
        "strength"
    )

    warnings: list[str] = []

    review_required = source_requires_review

    if confidence is None:
        review_required = True
        warnings.append(
            "SOURCE_LINE_CONFIDENCE_MISSING"
        )

    if _contains_suspicious_name_text(
        raw_name_text
    ):
        review_required = True
        warnings.append(
            "SUSPICIOUS_OCR_NAME_TEXT"
        )

    source = PrescriptionLineEvidence(
        line_index=line_index,
        text=text,
        confidence=confidence,
    )

    return MedicationCandidate(
        candidate_id=(
            f"med-line-{line_index:04d}"
        ),
        raw_name_text=raw_name_text,
        raw_strength_text=raw_strength_text,
        source=source,
        review_required=review_required,
        warnings=tuple(warnings),
    )


def analyze_prescription_ocr(
    ocr_result: OCRResult,
) -> PrescriptionAnalysisResult:
    """
    Extract source-preserved medication and instruction evidence.

    Medicine spelling is never corrected. No dictionary, fuzzy match,
    Product lookup, RxNorm lookup, clinical interpretation, or DDI
    operation occurs in this layer.
    """

    blocked_statuses = {
        OCRStatus.NO_TEXT,
        OCRStatus.UNSUPPORTED_IMAGE,
        OCRStatus.OCR_UNAVAILABLE,
        OCRStatus.INVALID_INPUT,
    }

    if ocr_result.status in blocked_statuses:
        return PrescriptionAnalysisResult(
            status=(
                PrescriptionAnalysisStatus.OCR_BLOCKED
            ),
            source_engine=ocr_result.engine,
            source_preprocess_mode=(
                ocr_result.preprocess_mode
            ),
            source_ocr_status=ocr_result.status,
            source_verification_status=(
                ocr_result.verification_status
            ),
            candidates=(),
            instructions=(),
            review_required=True,
            warnings=(
                "SOURCE_OCR_NOT_USABLE",
            ),
        )

    if not ocr_result.lines:
        return PrescriptionAnalysisResult(
            status=(
                PrescriptionAnalysisStatus.NO_CANDIDATES
            ),
            source_engine=ocr_result.engine,
            source_preprocess_mode=(
                ocr_result.preprocess_mode
            ),
            source_ocr_status=ocr_result.status,
            source_verification_status=(
                ocr_result.verification_status
            ),
            candidates=(),
            instructions=(),
            review_required=True,
            warnings=(
                "SOURCE_OCR_LINES_MISSING",
            ),
        )

    source_requires_review = (
        ocr_result.review_required
        or ocr_result.status
        is not OCRStatus.SUCCESS
    )

    candidates: list[
        MedicationCandidate
    ] = []

    instructions: list[
        PrescriptionInstructionEvidence
    ] = []

    for line_index, line in enumerate(
        ocr_result.lines
    ):
        instruction = _instruction_from_line(
            line_index=line_index,
            text=line.text,
            confidence=line.confidence,
            source_requires_review=(
                source_requires_review
            ),
        )

        if instruction is not None:
            instructions.append(
                instruction
            )
            continue

        candidate = _candidate_from_line(
            line_index=line_index,
            text=line.text,
            confidence=line.confidence,
            source_requires_review=(
                source_requires_review
            ),
        )

        if candidate is not None:
            candidates.append(candidate)

    result_candidates = tuple(candidates)
    result_instructions = tuple(
        instructions
    )

    if not result_candidates:
        return PrescriptionAnalysisResult(
            status=(
                PrescriptionAnalysisStatus.NO_CANDIDATES
            ),
            source_engine=ocr_result.engine,
            source_preprocess_mode=(
                ocr_result.preprocess_mode
            ),
            source_ocr_status=ocr_result.status,
            source_verification_status=(
                ocr_result.verification_status
            ),
            candidates=(),
            instructions=result_instructions,
            review_required=True,
            warnings=(
                "NO_EXPLICIT_MEDICATION_CANDIDATES",
            ),
        )

    requires_review = (
        source_requires_review
        or any(
            candidate.review_required
            for candidate in result_candidates
        )
        or any(
            instruction.review_required
            for instruction in result_instructions
        )
    )

    status = (
        PrescriptionAnalysisStatus.REVIEW_REQUIRED
        if requires_review
        else PrescriptionAnalysisStatus.ANALYZED
    )

    warnings: list[str] = []

    if source_requires_review:
        warnings.append(
            "SOURCE_OCR_REQUIRES_REVIEW"
        )

    if result_instructions:
        warnings.append(
            "INSTRUCTIONS_PRESERVED_UNLINKED"
        )

    return PrescriptionAnalysisResult(
        status=status,
        source_engine=ocr_result.engine,
        source_preprocess_mode=(
            ocr_result.preprocess_mode
        ),
        source_ocr_status=ocr_result.status,
        source_verification_status=(
            ocr_result.verification_status
        ),
        candidates=result_candidates,
        instructions=result_instructions,
        review_required=requires_review,
        warnings=tuple(warnings),
    )
