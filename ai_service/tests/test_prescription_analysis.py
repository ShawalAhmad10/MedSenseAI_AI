from __future__ import annotations

import pytest

from medsense_ai.ocr.contracts import (
    OCREngine,
    OCRLine,
    OCRResult,
    OCRStatus,
    PreprocessMode,
)
from medsense_ai.prescription_analysis.contracts import (
    PrescriptionAnalysisStatus,
)
from medsense_ai.prescription_analysis.extraction import (
    analyze_prescription_ocr,
)


def make_result(
    *lines: OCRLine,
    status: OCRStatus = OCRStatus.SUCCESS,
    review_required: bool = False,
) -> OCRResult:
    raw_text = "\n".join(
        line.text for line in lines
    )

    return OCRResult(
        engine=OCREngine.PADDLEOCR,
        preprocess_mode=(
            PreprocessMode.DOCUMENT_BASIC_V1
        ),
        status=status,
        raw_text=raw_text,
        lines=tuple(lines),
        review_required=review_required,
    )


def test_extracts_single_medication() -> None:
    result = make_result(
        OCRLine(
            "Amoxicillin 250 mg",
            0.99,
        )
    )

    analysis = analyze_prescription_ocr(
        result
    )

    assert (
        analysis.status
        is PrescriptionAnalysisStatus.ANALYZED
    )
    assert analysis.review_required is False
    assert len(analysis.candidates) == 1

    candidate = analysis.candidates[0]

    assert (
        candidate.raw_name_text
        == "Amoxicillin"
    )
    assert (
        candidate.raw_strength_text
        == "250 mg"
    )
    assert candidate.review_required is False


def test_extracts_multiple_medications_in_order() -> None:
    result = make_result(
        OCRLine("Paracetamol 500 mg", 0.99),
        OCRLine("Vitamin D3 1000 IU", 0.98),
        OCRLine("Folic Acid 5 mg", 0.97),
    )

    analysis = analyze_prescription_ocr(
        result
    )

    assert [
        candidate.raw_name_text
        for candidate in analysis.candidates
    ] == [
        "Paracetamol",
        "Vitamin D3",
        "Folic Acid",
    ]

    assert [
        candidate.source.line_index
        for candidate in analysis.candidates
    ] == [0, 1, 2]


@pytest.mark.parametrize(
    ("line", "name", "strength"),
    [
        (
            "Cetirizine 10 mg",
            "Cetirizine",
            "10 mg",
        ),
        (
            "Vitamin D3 1000 IU",
            "Vitamin D3",
            "1000 IU",
        ),
        (
            "Drug Alpha 250 mcg",
            "Drug Alpha",
            "250 mcg",
        ),
        (
            "Drug Beta 1 g",
            "Drug Beta",
            "1 g",
        ),
        (
            "Drug Gamma 5 mL",
            "Drug Gamma",
            "5 mL",
        ),
        (
            "Drug Delta 1%",
            "Drug Delta",
            "1%",
        ),
        (
            "Drug Epsilon 125 mg/5 mL",
            "Drug Epsilon",
            "125 mg/5 mL",
        ),
    ],
)
def test_supported_strength_formats(
    line: str,
    name: str,
    strength: str,
) -> None:
    analysis = analyze_prescription_ocr(
        make_result(
            OCRLine(line, 0.99)
        )
    )

    assert len(analysis.candidates) == 1

    candidate = analysis.candidates[0]

    assert candidate.raw_name_text == name
    assert (
        candidate.raw_strength_text
        == strength
    )


def test_instruction_line_is_not_medication() -> None:
    result = make_result(
        OCRLine(
            "Take one tablet twice daily",
            0.99,
        )
    )

    analysis = analyze_prescription_ocr(
        result
    )

    assert (
        analysis.status
        is PrescriptionAnalysisStatus.NO_CANDIDATES
    )
    assert analysis.candidates == ()
    assert analysis.review_required is True
    assert (
        "NO_EXPLICIT_MEDICATION_CANDIDATES"
        in analysis.warnings
    )


def test_instruction_with_numeric_amount_is_not_medication() -> None:
    result = make_result(
        OCRLine(
            "Take 5 mL twice daily",
            0.99,
        )
    )

    analysis = analyze_prescription_ocr(
        result
    )

    assert analysis.candidates == ()


def test_header_is_not_medication() -> None:
    result = make_result(
        OCRLine("PRESCRIPTION", 0.99),
        OCRLine("Rx", 0.99),
    )

    analysis = analyze_prescription_ocr(
        result
    )

    assert analysis.candidates == ()


def test_name_without_strength_is_not_guessed() -> None:
    result = make_result(
        OCRLine("Amoxicillin", 0.99)
    )

    analysis = analyze_prescription_ocr(
        result
    )

    assert analysis.candidates == ()


def test_suspicious_ocr_name_requires_review_without_correction() -> None:
    result = make_result(
        OCRLine(
            "Amoxici?lin 500 mg",
            0.90,
        )
    )

    analysis = analyze_prescription_ocr(
        result
    )

    candidate = analysis.candidates[0]

    assert (
        candidate.raw_name_text
        == "Amoxici?lin"
    )
    assert (
        candidate.raw_name_text
        != "Amoxicillin"
    )
    assert candidate.review_required is True
    assert (
        "SUSPICIOUS_OCR_NAME_TEXT"
        in candidate.warnings
    )

    assert (
        analysis.status
        is PrescriptionAnalysisStatus.REVIEW_REQUIRED
    )


def test_missing_line_confidence_requires_review() -> None:
    result = make_result(
        OCRLine(
            "Losartan 50 mg",
            None,
        )
    )

    analysis = analyze_prescription_ocr(
        result
    )

    candidate = analysis.candidates[0]

    assert candidate.review_required is True
    assert (
        "SOURCE_LINE_CONFIDENCE_MISSING"
        in candidate.warnings
    )
    assert analysis.review_required is True


def test_low_confidence_ocr_propagates_review() -> None:
    result = make_result(
        OCRLine(
            "Metformin 500 mg",
            0.80,
        ),
        status=OCRStatus.LOW_CONFIDENCE,
        review_required=True,
    )

    analysis = analyze_prescription_ocr(
        result
    )

    assert (
        analysis.status
        is PrescriptionAnalysisStatus.REVIEW_REQUIRED
    )
    assert analysis.review_required is True
    assert (
        analysis.candidates[0]
        .review_required
        is True
    )
    assert (
        "SOURCE_OCR_REQUIRES_REVIEW"
        in analysis.warnings
    )


def test_no_text_ocr_is_blocked() -> None:
    result = OCRResult(
        engine=OCREngine.PADDLEOCR,
        preprocess_mode=(
            PreprocessMode.DOCUMENT_BASIC_V1
        ),
        status=OCRStatus.NO_TEXT,
        raw_text="",
        lines=(),
    )

    analysis = analyze_prescription_ocr(
        result
    )

    assert (
        analysis.status
        is PrescriptionAnalysisStatus.OCR_BLOCKED
    )
    assert analysis.candidates == ()
    assert analysis.review_required is True
    assert (
        "SOURCE_OCR_NOT_USABLE"
        in analysis.warnings
    )


def test_source_line_is_preserved_exactly() -> None:
    original = "  Folic Acid 5 mg  "

    result = make_result(
        OCRLine(
            original,
            0.976,
        )
    )

    analysis = analyze_prescription_ocr(
        result
    )

    candidate = analysis.candidates[0]

    assert candidate.source.text == original
    assert (
        candidate.source.confidence
        == 0.976
    )
    assert candidate.source.line_index == 0


def test_duplicate_source_lines_remain_distinct_evidence() -> None:
    result = make_result(
        OCRLine(
            "Paracetamol 500 mg",
            0.99,
        ),
        OCRLine(
            "Paracetamol 500 mg",
            0.98,
        ),
    )

    analysis = analyze_prescription_ocr(
        result
    )

    assert len(analysis.candidates) == 2

    assert (
        analysis.candidates[0].candidate_id
        != analysis.candidates[1].candidate_id
    )

    assert [
        candidate.source.line_index
        for candidate in analysis.candidates
    ] == [0, 1]


def test_mixed_document_extracts_only_medication_lines() -> None:
    result = make_result(
        OCRLine("PRESCRIPTION", 0.99),
        OCRLine(
            "Amoxicillin 250 mg",
            0.99,
        ),
        OCRLine(
            "Take one tablet twice daily",
            0.98,
        ),
        OCRLine(
            "Vitamin D3 1000 IU",
            0.97,
        ),
        OCRLine(
            "Continue for 5 days",
            0.96,
        ),
    )

    analysis = analyze_prescription_ocr(
        result
    )

    assert [
        candidate.raw_name_text
        for candidate in analysis.candidates
    ] == [
        "Amoxicillin",
        "Vitamin D3",
    ]


def test_analysis_does_not_normalize_or_resolve_identity() -> None:
    result = make_result(
        OCRLine(
            "UnknownBrandLikeText 25 mg",
            0.99,
        )
    )

    analysis = analyze_prescription_ocr(
        result
    )

    candidate = analysis.candidates[0]

    assert (
        candidate.raw_name_text
        == "UnknownBrandLikeText"
    )

    assert not hasattr(
        candidate,
        "product_id",
    )

    assert not hasattr(
        candidate,
        "rxnorm_rxcui",
    )

    assert not hasattr(
        candidate,
        "normalized_ingredient",
    )


def test_instruction_evidence_is_preserved_separately() -> None:
    result = make_result(
        OCRLine("Amoxicillin 250 mg", 0.99),
        OCRLine(
            "Take one tablet twice daily",
            0.98,
        ),
    )

    analysis = analyze_prescription_ocr(
        result
    )

    assert len(analysis.candidates) == 1
    assert len(analysis.instructions) == 1

    instruction = analysis.instructions[0]

    assert (
        instruction.source.text
        == "Take one tablet twice daily"
    )
    assert instruction.source.line_index == 1
    assert instruction.source.confidence == 0.98
    assert instruction.review_required is False

    assert (
        "INSTRUCTIONS_PRESERVED_UNLINKED"
        in analysis.warnings
    )


def test_instruction_is_not_linked_to_medication() -> None:
    result = make_result(
        OCRLine("Losartan 50 mg", 0.99),
        OCRLine(
            "Take one tablet after dinner",
            0.98,
        ),
    )

    analysis = analyze_prescription_ocr(
        result
    )

    candidate = analysis.candidates[0]
    instruction = analysis.instructions[0]

    assert not hasattr(
        candidate,
        "instruction",
    )
    assert not hasattr(
        instruction,
        "medication_candidate_id",
    )


def test_instruction_only_document_preserves_instruction_but_has_no_candidate() -> None:
    result = make_result(
        OCRLine(
            "Take one tablet once daily",
            0.99,
        )
    )

    analysis = analyze_prescription_ocr(
        result
    )

    assert (
        analysis.status
        is PrescriptionAnalysisStatus.NO_CANDIDATES
    )
    assert analysis.candidates == ()
    assert len(analysis.instructions) == 1
    assert analysis.review_required is True


def test_instruction_missing_confidence_requires_review() -> None:
    result = make_result(
        OCRLine("Metformin 500 mg", 0.99),
        OCRLine(
            "Take after meals",
            None,
        ),
    )

    analysis = analyze_prescription_ocr(
        result
    )

    instruction = analysis.instructions[0]

    assert instruction.review_required is True
    assert (
        "SOURCE_LINE_CONFIDENCE_MISSING"
        in instruction.warnings
    )

    assert (
        analysis.status
        is PrescriptionAnalysisStatus.REVIEW_REQUIRED
    )
    assert analysis.review_required is True
