"""Safe orchestration from prescription image evidence to Product candidates."""

from __future__ import annotations

import os

from dataclasses import dataclass
from typing import Protocol

from medsense_ai.integrations.amna_medcopy.contracts import (
    PartnerProductRecord,
)
from medsense_ai.integrations.amna_medcopy.prescription_product_matcher import (
    PrescriptionProductMatchResult,
    PrescriptionProductMatchStatus,
    match_prescription_candidate_to_products,
)
from medsense_ai.integrations.amna_medcopy.prescription_product_suggestions import (
    PrescriptionProductSuggestionResult,
    suggest_prescription_candidate_products,
)
from medsense_ai.ocr.contracts import (
    OCREngine,
    OCRResult,
    OCRRuntimeMetadata,
    OCRStatus,
    PreprocessMode,
)
from medsense_ai.ocr.engines.paddleocr import (
    PaddleOCRAdapter,
    PaddleOCRExecution,
)
from medsense_ai.ocr.engines.rapidocr import (
    RapidOCRAdapter,
    RapidOCRExecution,
)
from medsense_ai.ocr.input_validation import (
    validate_image_bytes,
)
from medsense_ai.ocr.preprocessing import (
    PreprocessedImage,
    preprocess_validated_image,
)
from medsense_ai.prescription_analysis import (
    PrescriptionAnalysisResult,
    analyze_prescription_ocr,
)


FROZEN_OCR_REVIEW_THRESHOLD = 0.9998738169670105


class PrescriptionOCRAdapter(Protocol):
    def recognize(
        self,
        image: PreprocessedImage,
    ) -> PaddleOCRExecution | RapidOCRExecution:
        ...


@dataclass(frozen=True, slots=True)
class PrescriptionCandidateProductMatch:
    candidate_id: str
    product_match: PrescriptionProductMatchResult


@dataclass(frozen=True, slots=True)
class PartnerPrescriptionAnalysis:
    ocr_result: OCRResult
    ocr_metadata: OCRRuntimeMetadata
    prescription_analysis: PrescriptionAnalysisResult
    product_matches: tuple[
        PrescriptionCandidateProductMatch,
        ...
    ]
    product_suggestions: tuple[
        PrescriptionProductSuggestionResult,
        ...
    ] = ()


def _apply_frozen_review_policy(
    result: OCRResult,
) -> OCRResult:
    """
    Apply the calibration-frozen Paddle confidence threshold.

    Missing confidence and confidence <= threshold fail closed to review.
    Raw OCR text and OCR lines are never modified.
    """

    if result.status is not OCRStatus.SUCCESS:
        return result

    if result.engine is OCREngine.RAPIDOCR:
        return OCRResult(
            engine=result.engine,
            preprocess_mode=result.preprocess_mode,
            status=OCRStatus.REVIEW_REQUIRED,
            raw_text=result.raw_text,
            lines=result.lines,
            review_required=True,
            warnings=(
                *result.warnings,
                "RAPIDOCR_REVIEW_REQUIRED_UNTIL_CALIBRATED",
            ),
            verification_status=result.verification_status,
        )

    confidences = tuple(
        line.confidence
        for line in result.lines
    )

    review_reason: str | None = None

    if not confidences:
        review_reason = (
            "FROZEN_CONFIDENCE_POLICY_NO_LINE_CONFIDENCE"
        )

    elif any(
        confidence is None
        for confidence in confidences
    ):
        review_reason = (
            "FROZEN_CONFIDENCE_POLICY_MISSING_LINE_CONFIDENCE"
        )

    else:
        numeric = tuple(
            float(confidence)
            for confidence in confidences
            if confidence is not None
        )

        if min(numeric) <= FROZEN_OCR_REVIEW_THRESHOLD:
            review_reason = (
                "FROZEN_CONFIDENCE_THRESHOLD_TRIGGERED"
            )

    if review_reason is None:
        return result

    return OCRResult(
        engine=result.engine,
        preprocess_mode=result.preprocess_mode,
        status=OCRStatus.REVIEW_REQUIRED,
        raw_text=result.raw_text,
        lines=result.lines,
        review_required=True,
        warnings=(
            *result.warnings,
            review_reason,
        ),
        verification_status=(
            result.verification_status
        ),
    )


def _default_ocr_adapter() -> PrescriptionOCRAdapter:
    requested = os.getenv(
        "MEDSENSE_PRESCRIPTION_OCR_ENGINE",
        "rapidocr",
    ).strip().lower()

    if requested == "rapidocr":
        return RapidOCRAdapter()

    if requested == "paddleocr":
        return PaddleOCRAdapter()

    raise ValueError(
        "MEDSENSE_PRESCRIPTION_OCR_ENGINE must be "
        "'rapidocr' or 'paddleocr'."
    )


class PartnerPrescriptionOrchestrationService:
    """
    Image -> frozen OCR -> Prescription Analysis -> Product candidates.

    This service performs no cart mutation and no DDI decision.
    """

    def __init__(
        self,
        *,
        ocr_adapter: PrescriptionOCRAdapter | None = None,
    ) -> None:
        self._ocr_adapter = (
            ocr_adapter
            if ocr_adapter is not None
            else _default_ocr_adapter()
        )

    def analyze(
        self,
        *,
        image_bytes: bytes,
        media_type: str | None,
        products: tuple[
            PartnerProductRecord,
            ...
        ],
    ) -> PartnerPrescriptionAnalysis:
        validated = validate_image_bytes(
            image_bytes,
            media_type=media_type,
        )

        preprocessed = preprocess_validated_image(
            validated,
            mode=PreprocessMode.DOCUMENT_BASIC_V1,
        )

        execution = self._ocr_adapter.recognize(
            preprocessed
        )

        governed_ocr_result = (
            _apply_frozen_review_policy(
                execution.result
            )
        )

        analysis = analyze_prescription_ocr(
            governed_ocr_result
        )

        matches: list[
            PrescriptionCandidateProductMatch
        ] = []

        suggestions: list[
            PrescriptionProductSuggestionResult
        ] = []

        for candidate in analysis.candidates:
            product_match = (
                match_prescription_candidate_to_products(
                    candidate,
                    products,
                )
            )

            if product_match.status in {
                PrescriptionProductMatchStatus.UNMAPPED,
                PrescriptionProductMatchStatus.SOURCE_REVIEW_REQUIRED,
            }:
                suggestions.append(
                    suggest_prescription_candidate_products(
                        candidate,
                        products,
                    )
                )

            matches.append(
                PrescriptionCandidateProductMatch(
                    candidate_id=(
                        candidate.candidate_id
                    ),
                    product_match=product_match,
                )
            )

        return PartnerPrescriptionAnalysis(
            ocr_result=governed_ocr_result,
            ocr_metadata=execution.metadata,
            prescription_analysis=analysis,
            product_matches=tuple(matches),
            product_suggestions=tuple(suggestions),
        )
