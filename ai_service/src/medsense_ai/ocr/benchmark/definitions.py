from __future__ import annotations

from medsense_ai.ocr.benchmark.contracts import (
    BENCHMARK_VERSION,
    BenchmarkSplit,
    MedicationEvidence,
    PrintedBaseDocument,
)


# Artificial benchmark vocabulary only.
# These strings are OCR ground truth, not prescribing advice.
_MEDICATION_LINES: tuple[str, ...] = (
    "Paracetamol 500 mg",
    "Amoxicillin 250 mg",
    "Cetirizine 10 mg",
    "Ibuprofen 400 mg",
    "Omeprazole 20 mg",
    "Metformin 500 mg",
    "Azithromycin 250 mg",
    "Losartan 50 mg",
    "Amlodipine 5 mg",
    "Atorvastatin 20 mg",
    "Montelukast 10 mg",
    "Pantoprazole 40 mg",
    "Ciprofloxacin 500 mg",
    "Loratadine 10 mg",
    "Diclofenac 50 mg",
    "Doxycycline 100 mg",
    "Folic Acid 5 mg",
    "Vitamin D3 1000 IU",
    "Calcium Carbonate 500 mg",
    "Ferrous Sulfate 200 mg",
    "Clarithromycin 250 mg",
    "Fluconazole 150 mg",
    "Levocetirizine 5 mg",
    "Esomeprazole 20 mg",
    "Bisoprolol 5 mg",
    "Valsartan 80 mg",
    "Rosuvastatin 10 mg",
    "Clopidogrel 75 mg",
    "Domperidone 10 mg",
    "Ondansetron 4 mg",
)


_INSTRUCTION_LINES: tuple[str, ...] = (
    "Take one tablet after breakfast",
    "Take one tablet after dinner",
    "Take one tablet twice daily",
    "Take one tablet once daily",
    "Take with food",
    "Take after meals",
    "Take before breakfast",
    "Take at bedtime",
    "Use as directed",
    "Continue for 5 days",
    "Continue for 7 days",
    "Drink adequate water",
)


def _split_for_document_number(
    number: int,
) -> BenchmarkSplit:
    """
    Freeze the base-document split.

    01-30 -> calibration
    31-45 -> validation
    46-60 -> sealed test
    """

    if 1 <= number <= 30:
        return BenchmarkSplit.CALIBRATION

    if 31 <= number <= 45:
        return BenchmarkSplit.VALIDATION

    if 46 <= number <= 60:
        return BenchmarkSplit.SEALED_TEST

    raise ValueError(
        f"Document number out of range: {number}"
    )


def _medication_count(
    number: int,
) -> int:
    """
    Deterministically vary documents between 2 and 4 medication lines.
    """

    return 2 + ((number - 1) % 3)


def _medication_indices(
    number: int,
    count: int,
) -> tuple[int, ...]:
    """
    Produce deterministic, unique medication combinations.

    The stride values are coprime with the 30-item medication
    vocabulary, preventing short cycles and infinite loops.
    """

    start = (
        number * 7 + number // 3
    ) % len(_MEDICATION_LINES)

    stride_options = (
        7,
        11,
        13,
        17,
        19,
    )

    stride = stride_options[
        number % len(stride_options)
    ]

    indices: list[int] = []

    for offset in range(
        len(_MEDICATION_LINES)
    ):
        index = (
            start + offset * stride
        ) % len(_MEDICATION_LINES)

        if index not in indices:
            indices.append(index)

        if len(indices) == count:
            return tuple(indices)

    raise RuntimeError(
        "Unable to construct unique medication indices."
    )

def _instruction_indices(
    number: int,
    count: int,
) -> tuple[int, ...]:
    start = (
        number * 5
    ) % len(_INSTRUCTION_LINES)

    indices: list[int] = []

    for offset in range(count):
        indices.append(
            (
                start
                + offset * 3
                + number
            )
            % len(_INSTRUCTION_LINES)
        )

    return tuple(indices)


def build_printed_base_documents(
) -> tuple[PrintedBaseDocument, ...]:
    """
    Construct the frozen 60-document artificial printed benchmark.

    No patient information is used.
    """

    documents: list[
        PrintedBaseDocument
    ] = []

    for number in range(1, 61):
        medication_count = (
            _medication_count(number)
        )

        medication_indices = (
            _medication_indices(
                number,
                medication_count,
            )
        )

        instruction_indices = (
            _instruction_indices(
                number,
                medication_count,
            )
        )

        medications = tuple(
            MedicationEvidence(
                text=_MEDICATION_LINES[index]
            )
            for index in medication_indices
        )

        instructions = tuple(
            _INSTRUCTION_LINES[index]
            for index in instruction_indices
        )

        document = PrintedBaseDocument(
            document_id=(
                f"printed_{number:03d}"
            ),
            split=_split_for_document_number(
                number
            ),
            title="PRESCRIPTION",
            medication_lines=medications,
            instruction_lines=instructions,
        )

        documents.append(document)

    result = tuple(documents)

    _assert_base_document_integrity(
        result
    )

    return result


def _assert_base_document_integrity(
    documents: tuple[
        PrintedBaseDocument,
        ...
    ],
) -> None:
    if len(documents) != 60:
        raise AssertionError(
            "Benchmark must contain exactly 60 printed base documents."
        )

    document_ids = [
        document.document_id
        for document in documents
    ]

    if len(set(document_ids)) != 60:
        raise AssertionError(
            "Printed document IDs must be unique."
        )

    calibration = sum(
        document.split
        is BenchmarkSplit.CALIBRATION
        for document in documents
    )

    validation = sum(
        document.split
        is BenchmarkSplit.VALIDATION
        for document in documents
    )

    sealed_test = sum(
        document.split
        is BenchmarkSplit.SEALED_TEST
        for document in documents
    )

    if (
        calibration,
        validation,
        sealed_test,
    ) != (30, 15, 15):
        raise AssertionError(
            "Expected printed split counts 30/15/15."
        )

    signatures = {
        (
            tuple(
                medication.text
                for medication
                in document.medication_lines
            ),
            document.instruction_lines,
        )
        for document in documents
    }

    if len(signatures) != 60:
        raise AssertionError(
            "All printed base documents must have unique content."
        )


PRINTED_BASE_DOCUMENTS = (
    build_printed_base_documents()
)


__all__ = [
    "BENCHMARK_VERSION",
    "PRINTED_BASE_DOCUMENTS",
    "build_printed_base_documents",
]