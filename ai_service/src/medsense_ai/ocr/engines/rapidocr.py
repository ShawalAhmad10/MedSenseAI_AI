"""Local lightweight OCR adapter backed by RapidOCR."""

from __future__ import annotations

from dataclasses import dataclass
from importlib.metadata import PackageNotFoundError, version
from threading import Lock
from time import perf_counter
from typing import Any

import cv2
import numpy as np

from medsense_ai.ocr.contracts import (
    OCRLine,
    OCREngine,
    OCRResult,
    OCRRuntimeMetadata,
    OCRStatus,
)
from medsense_ai.ocr.preprocessing import PreprocessedImage


DETECTION_MODEL_NAME = "PP-OCRv6_det_small"
RECOGNITION_MODEL_NAME = "PP-OCRv6_rec_small"


@dataclass(frozen=True, slots=True)
class RapidOCRExecution:
    result: OCRResult
    metadata: OCRRuntimeMetadata


def _package_version(name: str) -> str:
    try:
        return version(name)
    except PackageNotFoundError:
        return "unavailable"


def _engine_version() -> str:
    return (
        f"rapidocr {_package_version('rapidocr')}; "
        f"onnxruntime {_package_version('onnxruntime')}; "
        f"det={DETECTION_MODEL_NAME}; "
        f"rec={RECOGNITION_MODEL_NAME}; "
        "device=cpu"
    )


def _decode(image: PreprocessedImage) -> np.ndarray:
    encoded = np.frombuffer(
        image.png_bytes,
        dtype=np.uint8,
    )

    decoded = cv2.imdecode(
        encoded,
        cv2.IMREAD_COLOR,
    )

    if decoded is None:
        raise ValueError(
            "Could not decode preprocessed PNG."
        )

    return decoded


def _box(value: object) -> tuple[int, int, int, int] | None:
    if value is None:
        return None

    try:
        points = list(value)
    except TypeError:
        return None

    if len(points) != 4:
        return None

    try:
        xs = [float(point[0]) for point in points]
        ys = [float(point[1]) for point in points]
    except (TypeError, ValueError, IndexError):
        return None

    return (
        int(round(min(xs))),
        int(round(min(ys))),
        int(round(max(xs))),
        int(round(max(ys))),
    )


class RapidOCRAdapter:
    """
    Lightweight local CPU OCR.

    Raw OCR evidence is preserved.
    No medicine identity or clinical decision occurs here.
    """

    def __init__(
        self,
        *,
        engine: Any | None = None,
    ) -> None:
        self._engine = engine
        self._init_lock = Lock()
        self._run_lock = Lock()

    @property
    def engine_version(self) -> str:
        return _engine_version()

    def _get_engine(self) -> Any:
        if self._engine is not None:
            return self._engine

        with self._init_lock:
            if self._engine is None:
                from rapidocr import RapidOCR

                self._engine = RapidOCR()

        return self._engine

    def recognize(
        self,
        image: PreprocessedImage,
    ) -> RapidOCRExecution:
        started = perf_counter()

        try:
            engine = self._get_engine()
            array = _decode(image)

            with self._run_lock:
                native = engine(array)

            native_texts = getattr(
                native,
                "txts",
                None,
            )
            native_scores = getattr(
                native,
                "scores",
                None,
            )
            native_boxes = getattr(
                native,
                "boxes",
                None,
            )

            texts = (
                tuple(native_texts)
                if native_texts is not None
                else ()
            )
            scores = (
                tuple(native_scores)
                if native_scores is not None
                else ()
            )
            boxes = (
                tuple(native_boxes)
                if native_boxes is not None
                else ()
            )

            lines: list[OCRLine] = []

            for index, text in enumerate(texts):
                confidence = None
                bounding_box = None

                if index < len(scores):
                    confidence = float(
                        scores[index]
                    )

                if index < len(boxes):
                    bounding_box = _box(
                        boxes[index]
                    )

                lines.append(
                    OCRLine(
                        text=str(text),
                        confidence=confidence,
                        bounding_box=bounding_box,
                    )
                )

            raw_text = "\n".join(
                line.text
                for line in lines
            )

            if raw_text:
                status = OCRStatus.SUCCESS
                review_required = False
            else:
                status = OCRStatus.NO_TEXT
                review_required = True

            result = OCRResult(
                engine=OCREngine.RAPIDOCR,
                preprocess_mode=image.preprocess_mode,
                status=status,
                raw_text=raw_text,
                lines=tuple(lines),
                review_required=review_required,
                warnings=(),
            )

        except Exception as exc:
            result = OCRResult(
                engine=OCREngine.RAPIDOCR,
                preprocess_mode=image.preprocess_mode,
                status=OCRStatus.OCR_UNAVAILABLE,
                raw_text="",
                lines=(),
                review_required=True,
                warnings=(
                    "rapidocr_execution_error:"
                    + str(exc)[:200],
                ),
            )

        elapsed_ms = (
            perf_counter() - started
        ) * 1000.0

        return RapidOCRExecution(
            result=result,
            metadata=OCRRuntimeMetadata(
                engine=OCREngine.RAPIDOCR,
                engine_version=self.engine_version,
                preprocess_mode=image.preprocess_mode,
                elapsed_ms=elapsed_ms,
            ),
        )
