from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from medsense_ai.ocr.benchmark.contracts import (
    PrintedBaseDocument,
)


CANVAS_WIDTH = 1400
CANVAS_HEIGHT = 1800

LEFT_MARGIN = 120
TOP_MARGIN = 120

TITLE_FONT_SIZE = 52
MEDICATION_FONT_SIZE = 40
INSTRUCTION_FONT_SIZE = 30

DEFAULT_FONT_PATH = Path(
    r"C:\Windows\Fonts\arial.ttf"
)


@dataclass(frozen=True, slots=True)
class RenderedPrintedDocument:
    document_id: str
    png_bytes: bytes
    width: int
    height: int
    expected_text: str
    medication_spans: tuple[str, ...]
    image_sha256: str
    font_sha256: str


def _file_sha256(path: Path) -> str:
    digest = sha256()

    with path.open("rb") as handle:
        for chunk in iter(
            lambda: handle.read(1024 * 1024),
            b"",
        ):
            digest.update(chunk)

    return digest.hexdigest()


def _encode_png(image: Image.Image) -> bytes:
    buffer = BytesIO()

    image.save(
        buffer,
        format="PNG",
        optimize=False,
        compress_level=6,
    )

    return buffer.getvalue()


def _ground_truth_lines(
    document: PrintedBaseDocument,
) -> tuple[str, ...]:
    lines: list[str] = [
        document.title,
    ]

    for medication, instruction in zip(
        document.medication_lines,
        document.instruction_lines,
        strict=True,
    ):
        lines.append(
            medication.text
        )
        lines.append(
            instruction
        )

    return tuple(lines)


def render_clean_document(
    document: PrintedBaseDocument,
    *,
    font_path: Path = DEFAULT_FONT_PATH,
) -> RenderedPrintedDocument:
    """
    Render one deterministic artificial printed prescription.

    This is benchmark ground truth only.
    It contains no patient data and performs no OCR or clinical inference.
    """

    if not font_path.is_file():
        raise FileNotFoundError(
            f"Benchmark font not found: {font_path}"
        )

    title_font = ImageFont.truetype(
        str(font_path),
        TITLE_FONT_SIZE,
    )

    medication_font = ImageFont.truetype(
        str(font_path),
        MEDICATION_FONT_SIZE,
    )

    instruction_font = ImageFont.truetype(
        str(font_path),
        INSTRUCTION_FONT_SIZE,
    )

    image = Image.new(
        "RGB",
        (
            CANVAS_WIDTH,
            CANVAS_HEIGHT,
        ),
        "white",
    )

    draw = ImageDraw.Draw(
        image
    )

    y = TOP_MARGIN

    draw.text(
        (
            LEFT_MARGIN,
            y,
        ),
        document.title,
        fill="black",
        font=title_font,
    )

    y += 130

    for medication, instruction in zip(
        document.medication_lines,
        document.instruction_lines,
        strict=True,
    ):
        draw.text(
            (
                LEFT_MARGIN,
                y,
            ),
            medication.text,
            fill="black",
            font=medication_font,
        )

        y += 65

        draw.text(
            (
                LEFT_MARGIN + 35,
                y,
            ),
            instruction,
            fill="black",
            font=instruction_font,
        )

        y += 115

    png_bytes = _encode_png(
        image
    )

    expected_lines = _ground_truth_lines(
        document
    )

    return RenderedPrintedDocument(
        document_id=document.document_id,
        png_bytes=png_bytes,
        width=image.width,
        height=image.height,
        expected_text="\n".join(
            expected_lines
        ),
        medication_spans=tuple(
            medication.text
            for medication
            in document.medication_lines
        ),
        image_sha256=sha256(
            png_bytes
        ).hexdigest(),
        font_sha256=_file_sha256(
            font_path
        ),
    )