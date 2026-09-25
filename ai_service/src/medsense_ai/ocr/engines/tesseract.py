from __future__ import annotations

import csv
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from time import perf_counter

from medsense_ai.ocr.contracts import (
    OCRLine,
    OCREngine,
    OCRResult,
    OCRRuntimeMetadata,
    OCRStatus,
)
from medsense_ai.ocr.preprocessing import PreprocessedImage


DEFAULT_TESSERACT_EXECUTABLE = "tesseract"
DEFAULT_LANGUAGE = "eng"
DEFAULT_PSM = 6
DEFAULT_TIMEOUT_SECONDS = 60.0


@dataclass(frozen=True, slots=True)
class TesseractExecution:
    result: OCRResult
    metadata: OCRRuntimeMetadata


@lru_cache(maxsize=8)
def _read_tesseract_version(executable: str) -> str:
    resolved = shutil.which(executable)

    if resolved is None:
        return "unavailable"

    try:
        completed = subprocess.run(
            [resolved, "--version"],
            check=False,
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (OSError, subprocess.SubprocessError):
        return "unavailable"

    output = completed.stdout or completed.stderr

    if not output:
        return "unknown"

    first_line = output.splitlines()[0].strip()

    return first_line or "unknown"


def _parse_tsv_lines(tsv_bytes: bytes) -> tuple[OCRLine, ...]:
    """
    Convert Tesseract word-level TSV evidence into ordered line evidence.

    raw_text is NOT reconstructed here. It is preserved separately from
    Tesseract's native TXT output.
    """

    text = tsv_bytes.decode("utf-8", errors="replace")

    reader = csv.DictReader(
        text.splitlines(),
        delimiter="\t",
    )

    grouped: dict[
        tuple[int, int, int, int],
        dict[str, object],
    ] = {}

    for row in reader:
        token = (row.get("text") or "").strip()

        if not token:
            continue

        try:
            level = int(row.get("level") or 0)
        except ValueError:
            continue

        # Tesseract level 5 = individual word.
        if level != 5:
            continue

        try:
            page_num = int(row.get("page_num") or 0)
            block_num = int(row.get("block_num") or 0)
            par_num = int(row.get("par_num") or 0)
            line_num = int(row.get("line_num") or 0)

            left = int(row.get("left") or 0)
            top = int(row.get("top") or 0)
            width = int(row.get("width") or 0)
            height = int(row.get("height") or 0)
        except ValueError:
            continue

        key = (
            page_num,
            block_num,
            par_num,
            line_num,
        )

        group = grouped.setdefault(
            key,
            {
                "words": [],
                "confidences": [],
                "left": left,
                "top": top,
                "right": left + width,
                "bottom": top + height,
            },
        )

        words = group["words"]
        assert isinstance(words, list)
        words.append(token)

        try:
            confidence = float(row.get("conf") or -1)
        except ValueError:
            confidence = -1.0

        if confidence >= 0:
            confidences = group["confidences"]
            assert isinstance(confidences, list)
            confidences.append(confidence)

        group["left"] = min(
            int(group["left"]),
            left,
        )
        group["top"] = min(
            int(group["top"]),
            top,
        )
        group["right"] = max(
            int(group["right"]),
            left + width,
        )
        group["bottom"] = max(
            int(group["bottom"]),
            top + height,
        )

    lines: list[OCRLine] = []

    for group in grouped.values():
        words = group["words"]
        confidences = group["confidences"]

        assert isinstance(words, list)
        assert isinstance(confidences, list)

        line_text = " ".join(
            str(word)
            for word in words
        )

        confidence = (
            sum(float(value) for value in confidences)
            / len(confidences)
            if confidences
            else None
        )

        left = int(group["left"])
        top = int(group["top"])
        right = int(group["right"])
        bottom = int(group["bottom"])

        lines.append(
            OCRLine(
                text=line_text,
                confidence=confidence,
                bounding_box=(
                    left,
                    top,
                    right,
                    bottom,
                ),
            )
        )

    return tuple(lines)


class TesseractAdapter:
    """
    Thin deterministic adapter around the Tesseract 5 CLI.

    It performs no:
    - medicine correction
    - normalization
    - dose inference
    - LLM processing
    - DDI lookup
    """

    def __init__(
        self,
        *,
        executable: str = DEFAULT_TESSERACT_EXECUTABLE,
        language: str = DEFAULT_LANGUAGE,
        psm: int = DEFAULT_PSM,
        timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        if not executable.strip():
            raise ValueError(
                "Tesseract executable cannot be empty."
            )

        if not language.strip():
            raise ValueError(
                "Tesseract language cannot be empty."
            )

        if not 0 <= psm <= 13:
            raise ValueError(
                "Tesseract PSM must be between 0 and 13."
            )

        if timeout_seconds <= 0:
            raise ValueError(
                "timeout_seconds must be positive."
            )

        self.executable = executable
        self.language = language
        self.psm = psm
        self.timeout_seconds = timeout_seconds

    @property
    def engine_version(self) -> str:
        return _read_tesseract_version(
            self.executable
        )

    def recognize(
        self,
        image: PreprocessedImage,
    ) -> TesseractExecution:
        started = perf_counter()

        resolved = shutil.which(
            self.executable
        )

        if resolved is None:
            elapsed_ms = (
                perf_counter() - started
            ) * 1000.0

            return TesseractExecution(
                result=OCRResult(
                    engine=OCREngine.TESSERACT,
                    preprocess_mode=image.preprocess_mode,
                    status=OCRStatus.OCR_UNAVAILABLE,
                    raw_text="",
                    lines=(),
                    review_required=True,
                    warnings=(
                        "tesseract_executable_not_found",
                    ),
                ),
                metadata=OCRRuntimeMetadata(
                    engine=OCREngine.TESSERACT,
                    engine_version="unavailable",
                    preprocess_mode=image.preprocess_mode,
                    elapsed_ms=elapsed_ms,
                ),
            )

        try:
            with tempfile.TemporaryDirectory(
                prefix="medsense_ocr_tesseract_"
            ) as temp_dir:
                temp_path = Path(temp_dir)

                input_path = (
                    temp_path / "input.png"
                )

                output_base = (
                    temp_path / "output"
                )

                input_path.write_bytes(
                    image.png_bytes
                )

                command = [
                    resolved,
                    str(input_path),
                    str(output_base),
                    "-l",
                    self.language,
                    "--psm",
                    str(self.psm),
                    "txt",
                    "tsv",
                ]

                completed = subprocess.run(
                    command,
                    check=False,
                    capture_output=True,
                    text=True,
                    timeout=self.timeout_seconds,
                )

                if completed.returncode != 0:
                    detail = (
                        completed.stderr
                        or completed.stdout
                        or "unknown_error"
                    ).strip()

                    elapsed_ms = (
                        perf_counter() - started
                    ) * 1000.0

                    return TesseractExecution(
                        result=OCRResult(
                            engine=OCREngine.TESSERACT,
                            preprocess_mode=image.preprocess_mode,
                            status=OCRStatus.OCR_UNAVAILABLE,
                            raw_text="",
                            lines=(),
                            review_required=True,
                            warnings=(
                                "tesseract_process_failed:"
                                + detail[:200],
                            ),
                        ),
                        metadata=OCRRuntimeMetadata(
                            engine=OCREngine.TESSERACT,
                            engine_version=self.engine_version,
                            preprocess_mode=image.preprocess_mode,
                            elapsed_ms=elapsed_ms,
                        ),
                    )

                txt_path = output_base.with_suffix(
                    ".txt"
                )

                tsv_path = output_base.with_suffix(
                    ".tsv"
                )

                if not txt_path.exists():
                    raise RuntimeError(
                        "Tesseract TXT output was not produced."
                    )

                if not tsv_path.exists():
                    raise RuntimeError(
                        "Tesseract TSV output was not produced."
                    )

                # Decode bytes directly so the native OCR text is not
                # reconstructed from normalized tokens.
                raw_text = txt_path.read_bytes().decode(
                    "utf-8",
                    errors="replace",
                )

                lines = _parse_tsv_lines(
                    tsv_path.read_bytes()
                )

        except subprocess.TimeoutExpired:
            elapsed_ms = (
                perf_counter() - started
            ) * 1000.0

            return TesseractExecution(
                result=OCRResult(
                    engine=OCREngine.TESSERACT,
                    preprocess_mode=image.preprocess_mode,
                    status=OCRStatus.OCR_UNAVAILABLE,
                    raw_text="",
                    lines=(),
                    review_required=True,
                    warnings=(
                        "tesseract_timeout",
                    ),
                ),
                metadata=OCRRuntimeMetadata(
                    engine=OCREngine.TESSERACT,
                    engine_version=self.engine_version,
                    preprocess_mode=image.preprocess_mode,
                    elapsed_ms=elapsed_ms,
                ),
            )

        except (
            OSError,
            RuntimeError,
            UnicodeError,
        ) as exc:
            elapsed_ms = (
                perf_counter() - started
            ) * 1000.0

            return TesseractExecution(
                result=OCRResult(
                    engine=OCREngine.TESSERACT,
                    preprocess_mode=image.preprocess_mode,
                    status=OCRStatus.OCR_UNAVAILABLE,
                    raw_text="",
                    lines=(),
                    review_required=True,
                    warnings=(
                        "tesseract_execution_error:"
                        + str(exc)[:200],
                    ),
                ),
                metadata=OCRRuntimeMetadata(
                    engine=OCREngine.TESSERACT,
                    engine_version=self.engine_version,
                    preprocess_mode=image.preprocess_mode,
                    elapsed_ms=elapsed_ms,
                ),
            )

        elapsed_ms = (
            perf_counter() - started
        ) * 1000.0

        if raw_text.strip():
            status = OCRStatus.SUCCESS
            review_required = False
        else:
            status = OCRStatus.NO_TEXT
            review_required = True

        return TesseractExecution(
            result=OCRResult(
                engine=OCREngine.TESSERACT,
                preprocess_mode=image.preprocess_mode,
                status=status,
                raw_text=raw_text,
                lines=lines,
                review_required=review_required,
                warnings=(),
            ),
            metadata=OCRRuntimeMetadata(
                engine=OCREngine.TESSERACT,
                engine_version=self.engine_version,
                preprocess_mode=image.preprocess_mode,
                elapsed_ms=elapsed_ms,
            ),
        )