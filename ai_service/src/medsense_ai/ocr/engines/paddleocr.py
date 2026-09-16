from __future__ import annotations

from dataclasses import dataclass
from importlib.metadata import PackageNotFoundError, version
from io import BytesIO
from time import perf_counter
from typing import Any

import numpy as np
from PIL import Image

from medsense_ai.ocr.contracts import (
    OCRLine,
    OCREngine,
    OCRResult,
    OCRRuntimeMetadata,
    OCRStatus,
)
from medsense_ai.ocr.preprocessing import PreprocessedImage


DETECTION_MODEL_NAME = "PP-OCRv6_medium_det"
RECOGNITION_MODEL_NAME = "PP-OCRv6_medium_rec"
DEFAULT_LANGUAGE = "en"


@dataclass(frozen=True, slots=True)
class PaddleOCRExecution:
    result: OCRResult
    metadata: OCRRuntimeMetadata


def _package_version(package_name: str) -> str:
    try:
        return version(package_name)
    except PackageNotFoundError:
        return "unavailable"


def _engine_version_string() -> str:
    return (
        f"paddleocr {_package_version('paddleocr')}; "
        f"paddlepaddle {_package_version('paddlepaddle')}; "
        f"det={DETECTION_MODEL_NAME}; "
        f"rec={RECOGNITION_MODEL_NAME}; "
        "device=cpu; mkldnn=false"
    )


def _normalise_box(value: Any) -> tuple[int, int, int, int] | None:
    """
    Convert PaddleOCR's [left, top, right, bottom] box to the
    shared OCR contract.
    """

    if value is None:
        return None

    try:
        values = list(value)
    except TypeError:
        return None

    if len(values) != 4:
        return None

    try:
        return tuple(int(item) for item in values)  # type: ignore[return-value]
    except (TypeError, ValueError):
        return None


def _extract_lines(
    results: list[Any],
) -> tuple[OCRLine, ...]:
    """
    Preserve PaddleOCR recognizer text exactly as returned in rec_texts.
    """

    lines: list[OCRLine] = []

    for result in results:
        payload = result.json

        if not isinstance(payload, dict):
            continue

        res = payload.get("res")

        if not isinstance(res, dict):
            continue

        texts = res.get("rec_texts") or []
        scores = res.get("rec_scores") or []
        boxes = res.get("rec_boxes") or []

        for index, text in enumerate(texts):
            if not isinstance(text, str):
                continue

            confidence: float | None = None

            if index < len(scores):
                try:
                    confidence = float(scores[index])
                except (TypeError, ValueError):
                    confidence = None

            bounding_box = None

            if index < len(boxes):
                bounding_box = _normalise_box(
                    boxes[index]
                )

            lines.append(
                OCRLine(
                    text=text,
                    confidence=confidence,
                    bounding_box=bounding_box,
                )
            )

    return tuple(lines)


class PaddleOCRAdapter:
    """
    Controlled CPU adapter for PaddleOCR 3.x.

    Frozen local configuration:
    - PP-OCRv6_medium_det
    - PP-OCRv6_medium_rec
    - CPU only
    - document orientation classifier disabled
    - document unwarping disabled
    - text-line orientation disabled
    - MKL-DNN disabled

    No medicine normalization, spelling correction, inference,
    LLM processing, or DDI integration occurs here.
    """

    def __init__(
        self,
        *,
        language: str = DEFAULT_LANGUAGE,
    ) -> None:
        if not language.strip():
            raise ValueError(
                "PaddleOCR language cannot be empty."
            )

        self.language = language
        self._pipeline: Any | None = None

    @property
    def engine_version(self) -> str:
        return _engine_version_string()

    def _get_pipeline(self) -> Any:
        if self._pipeline is not None:
            return self._pipeline

        from paddleocr import PaddleOCR

        self._pipeline = PaddleOCR(
            device="cpu",
            text_detection_model_name=DETECTION_MODEL_NAME,
            text_recognition_model_name=RECOGNITION_MODEL_NAME,
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
            enable_mkldnn=False,
        )

        return self._pipeline

    def recognize(
        self,
        image: PreprocessedImage,
    ) -> PaddleOCRExecution:
        started = perf_counter()

        try:
            with Image.open(
                BytesIO(image.png_bytes)
            ) as source:
                source.load()
                rgb = source.convert("RGB")

            array = np.asarray(rgb)

            pipeline = self._get_pipeline()

            results = list(
                pipeline.predict(array)
            )

            lines = _extract_lines(
                results
            )

        except Exception as exc:
            elapsed_ms = (
                perf_counter() - started
            ) * 1000.0

            return PaddleOCRExecution(
                result=OCRResult(
                    engine=OCREngine.PADDLEOCR,
                    preprocess_mode=image.preprocess_mode,
                    status=OCRStatus.OCR_UNAVAILABLE,
                    raw_text="",
                    lines=(),
                    review_required=True,
                    warnings=(
                        "paddleocr_execution_error:"
                        + str(exc)[:200],
                    ),
                ),
                metadata=OCRRuntimeMetadata(
                    engine=OCREngine.PADDLEOCR,
                    engine_version=self.engine_version,
                    preprocess_mode=image.preprocess_mode,
                    elapsed_ms=elapsed_ms,
                ),
            )

        # PaddleOCR 3.x exposes recognized text as rec_texts rather
        # than one native TXT document. The individual OCRLine.text
        # values above preserve those recognizer strings exactly.
        # This shared raw_text representation only joins those exact
        # strings with newline separators; it performs no correction.
        raw_text = "\n".join(
            line.text
            for line in lines
        )

        elapsed_ms = (
            perf_counter() - started
        ) * 1000.0

        if raw_text:
            status = OCRStatus.SUCCESS
            review_required = False
        else:
            status = OCRStatus.NO_TEXT
            review_required = True

        return PaddleOCRExecution(
            result=OCRResult(
                engine=OCREngine.PADDLEOCR,
                preprocess_mode=image.preprocess_mode,
                status=status,
                raw_text=raw_text,
                lines=lines,
                review_required=review_required,
                warnings=(),
            ),
            metadata=OCRRuntimeMetadata(
                engine=OCREngine.PADDLEOCR,
                engine_version=self.engine_version,
                preprocess_mode=image.preprocess_mode,
                elapsed_ms=elapsed_ms,
            ),
        )