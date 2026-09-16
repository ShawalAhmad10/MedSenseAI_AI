from __future__ import annotations

from io import BytesIO

from PIL import Image

from medsense_ai.ocr.contracts import (
    OCREngine,
    OCRStatus,
    PreprocessMode,
)
from medsense_ai.ocr.engines.paddleocr import (
    PaddleOCRAdapter,
    _extract_lines,
)
from medsense_ai.ocr.engines.tesseract import (
    TesseractAdapter,
    _parse_tsv_lines,
)
from medsense_ai.ocr.preprocessing import (
    PreprocessedImage,
    preprocess_image_bytes,
)


def _preprocessed_blank_image() -> PreprocessedImage:
    buffer = BytesIO()

    Image.new(
        "RGB",
        (800, 1000),
        "white",
    ).save(
        buffer,
        format="PNG",
    )

    return preprocess_image_bytes(
        buffer.getvalue(),
        mode=PreprocessMode.DECODE_ONLY_V1,
        media_type="image/png",
    )


def test_tesseract_tsv_parser_builds_line_evidence() -> None:
    tsv = (
        "level\tpage_num\tblock_num\tpar_num\tline_num\t"
        "word_num\tleft\ttop\twidth\theight\tconf\ttext\n"
        "5\t1\t1\t1\t1\t1\t10\t20\t100\t30\t95.0\tParacetamol\n"
        "5\t1\t1\t1\t1\t2\t120\t20\t50\t30\t90.0\t500\n"
        "5\t1\t1\t1\t1\t3\t180\t20\t30\t30\t92.0\tmg\n"
    ).encode("utf-8")

    lines = _parse_tsv_lines(tsv)

    assert len(lines) == 1

    line = lines[0]

    assert line.text == "Paracetamol 500 mg"
    assert line.bounding_box == (
        10,
        20,
        210,
        50,
    )

    assert line.confidence is not None
    assert round(line.confidence, 4) == round(
        (95.0 + 90.0 + 92.0) / 3,
        4,
    )


def test_missing_tesseract_fails_closed() -> None:
    image = _preprocessed_blank_image()

    execution = TesseractAdapter(
        executable="definitely_missing_tesseract_binary",
    ).recognize(image)

    assert (
        execution.result.status
        is OCRStatus.OCR_UNAVAILABLE
    )

    assert execution.result.review_required is True
    assert execution.result.raw_text == ""
    assert execution.result.lines == ()

    assert (
        "tesseract_executable_not_found"
        in execution.result.warnings
    )


class _FakePaddleResult:
    def __init__(self) -> None:
        self.json = {
            "res": {
                "rec_texts": [
                    "Paracetamol 500 mg",
                    "Cetirizine 10 mg",
                ],
                "rec_scores": [
                    0.99,
                    0.97,
                ],
                "rec_boxes": [
                    [10, 20, 210, 60],
                    [10, 80, 180, 120],
                ],
            }
        }


def test_paddle_result_extraction_preserves_evidence() -> None:
    lines = _extract_lines(
        [_FakePaddleResult()]
    )

    assert len(lines) == 2

    assert (
        lines[0].text
        == "Paracetamol 500 mg"
    )

    assert lines[0].confidence == 0.99

    assert lines[0].bounding_box == (
        10,
        20,
        210,
        60,
    )

    assert (
        lines[1].text
        == "Cetirizine 10 mg"
    )


class _FakePaddlePipeline:
    def predict(self, _image):
        return [
            _FakePaddleResult()
        ]


def test_paddle_adapter_success_with_fake_pipeline() -> None:
    image = _preprocessed_blank_image()

    adapter = PaddleOCRAdapter()

    adapter._pipeline = (
        _FakePaddlePipeline()
    )

    execution = adapter.recognize(
        image
    )

    assert (
        execution.result.engine
        is OCREngine.PADDLEOCR
    )

    assert (
        execution.result.status
        is OCRStatus.SUCCESS
    )

    assert execution.result.raw_text == (
        "Paracetamol 500 mg\n"
        "Cetirizine 10 mg"
    )

    assert len(
        execution.result.lines
    ) == 2

    assert (
        execution.result.review_required
        is False
    )


class _FailingPaddlePipeline:
    def predict(self, _image):
        raise RuntimeError(
            "synthetic pipeline failure"
        )


def test_paddle_adapter_failure_fails_closed() -> None:
    image = _preprocessed_blank_image()

    adapter = PaddleOCRAdapter()

    adapter._pipeline = (
        _FailingPaddlePipeline()
    )

    execution = adapter.recognize(
        image
    )

    assert (
        execution.result.status
        is OCRStatus.OCR_UNAVAILABLE
    )

    assert (
        execution.result.review_required
        is True
    )

    assert execution.result.raw_text == ""
    assert execution.result.lines == ()

    assert execution.result.warnings

    assert (
        "paddleocr_execution_error:"
        in execution.result.warnings[0]
    )