from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


BENCHMARK_VERSION = "med-ocr-benchmark-1.0.0"
BENCHMARK_SEED = 260904


class BenchmarkSplit(StrEnum):
    CALIBRATION = "calibration"
    VALIDATION = "validation"
    SEALED_TEST = "sealed_test"


class PrintedQuality(StrEnum):
    CLEAN = "clean"
    ROTATED_90 = "rotated_90"
    NOISY_BLURRED = "noisy_blurred"
    LOW_CONTRAST = "low_contrast"


class BenchmarkSampleType(StrEnum):
    PRINTED = "printed"
    HANDWRITING_SAFETY = "handwriting_safety"


@dataclass(frozen=True, slots=True)
class MedicationEvidence:
    """
    Literal medication text intentionally rendered into a benchmark document.
    """

    text: str

    def __post_init__(self) -> None:
        if not self.text.strip():
            raise ValueError("Medication evidence cannot be empty.")


@dataclass(frozen=True, slots=True)
class PrintedBaseDocument:
    """
    One unique artificial printed prescription source document.

    All quality variants from this document must remain in the same split.
    """

    document_id: str
    split: BenchmarkSplit
    title: str
    medication_lines: tuple[MedicationEvidence, ...]
    instruction_lines: tuple[str, ...]

    def __post_init__(self) -> None:
        if not self.document_id.strip():
            raise ValueError("document_id cannot be empty.")

        if not self.medication_lines:
            raise ValueError(
                "Printed benchmark document must contain medication evidence."
            )


@dataclass(frozen=True, slots=True)
class BenchmarkSample:
    sample_id: str
    base_document_id: str
    split: BenchmarkSplit
    sample_type: BenchmarkSampleType
    expected_text: str
    medication_spans: tuple[str, ...]
    quality: PrintedQuality | None = None
    image_sha256: str | None = None

    def __post_init__(self) -> None:
        if not self.sample_id.strip():
            raise ValueError("sample_id cannot be empty.")

        if not self.base_document_id.strip():
            raise ValueError("base_document_id cannot be empty.")

        if self.sample_type is BenchmarkSampleType.PRINTED:
            if self.quality is None:
                raise ValueError(
                    "Printed samples must have a quality stratum."
                )

        if self.sample_type is BenchmarkSampleType.HANDWRITING_SAFETY:
            if self.quality is not None:
                raise ValueError(
                    "Handwriting safety samples cannot use printed quality."
                )