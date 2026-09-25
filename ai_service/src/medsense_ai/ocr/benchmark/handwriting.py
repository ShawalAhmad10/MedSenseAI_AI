from __future__ import annotations

import io
import random
from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from medsense_ai.ocr.benchmark.contracts import (
    BENCHMARK_SEED,
    BENCHMARK_VERSION,
    BenchmarkSample,
    BenchmarkSampleType,
    BenchmarkSplit,
    MedicationEvidence,
)

CANVAS_WIDTH = 1400
CANVAS_HEIGHT = 1800

REGULAR_SCRIPT_FONT = Path(r"C:\Windows\Fonts\segoesc.ttf")
BOLD_SCRIPT_FONT = Path(r"C:\Windows\Fonts\segoescb.ttf")

HANDWRITING_STYLE_NOTICE = (
    "Synthetic script-font safety probe; this is not real human handwriting."
)


@dataclass(frozen=True)
class HandwritingSafetyDefinition:
    sample_id: str
    split: BenchmarkSplit
    medication_lines: tuple[str, ...]
    instruction_lines: tuple[str, ...]


@dataclass(frozen=True)
class RenderedHandwritingSafetySample:
    sample: BenchmarkSample
    png_bytes: bytes
    width: int
    height: int
    regular_font_sha256: str
    bold_font_sha256: str
    simulation_notice: str


def _definition(
    number: int,
    split: BenchmarkSplit,
    medication_lines: tuple[str, ...],
    instruction_lines: tuple[str, ...],
) -> HandwritingSafetyDefinition:
    return HandwritingSafetyDefinition(
        sample_id=f"handwriting_{number:03d}",
        split=split,
        medication_lines=medication_lines,
        instruction_lines=instruction_lines,
    )


HANDWRITING_SAFETY_DEFINITIONS: tuple[HandwritingSafetyDefinition, ...] = (
    _definition(
        1,
        BenchmarkSplit.CALIBRATION,
        ("Paracetamol 500 mg", "Cetirizine 10 mg"),
        ("Take after food", "Once daily"),
    ),
    _definition(
        2,
        BenchmarkSplit.CALIBRATION,
        ("Amoxicillin 250 mg", "Omeprazole 20 mg"),
        ("Three times daily", "Continue 5 days"),
    ),
    _definition(
        3,
        BenchmarkSplit.CALIBRATION,
        ("Metformin 500 mg", "Losartan 50 mg"),
        ("Take with meals", "Once daily"),
    ),
    _definition(
        4,
        BenchmarkSplit.CALIBRATION,
        ("Amlodipine 5 mg", "Atorvastatin 20 mg"),
        ("Take at night",),
    ),
    _definition(
        5,
        BenchmarkSplit.CALIBRATION,
        ("Azithromycin 250 mg", "Ibuprofen 400 mg"),
        ("Once daily", "Take after food"),
    ),
    _definition(
        6,
        BenchmarkSplit.CALIBRATION,
        ("Clopidogrel 75 mg", "Pantoprazole 40 mg"),
        ("Once daily", "Before breakfast"),
    ),
    _definition(
        7,
        BenchmarkSplit.CALIBRATION,
        ("Diclofenac 50 mg", "Cetirizine 10 mg"),
        ("Take after food", "At bedtime"),
    ),
    _definition(
        8,
        BenchmarkSplit.CALIBRATION,
        ("Ciprofloxacin 500 mg", "Paracetamol 500 mg"),
        ("Twice daily", "Use for 5 days"),
    ),
    _definition(
        9,
        BenchmarkSplit.CALIBRATION,
        ("Montelukast 10 mg", "Levocetirizine 5 mg"),
        ("Take at night",),
    ),
    _definition(
        10,
        BenchmarkSplit.CALIBRATION,
        ("Calcium Carbonate 500 mg", "Vitamin D3 1000 IU"),
        ("Once daily", "Take after breakfast"),
    ),
    _definition(
        11,
        BenchmarkSplit.CALIBRATION,
        ("Glimepiride 2 mg", "Metformin 500 mg"),
        ("Before breakfast", "Take with meals"),
    ),
    _definition(
        12,
        BenchmarkSplit.CALIBRATION,
        ("Aspirin 75 mg", "Losartan 50 mg"),
        ("Once daily",),
    ),
    _definition(
        13,
        BenchmarkSplit.VALIDATION,
        ("Clarithromycin 250 mg", "Pantoprazole 40 mg"),
        ("Twice daily", "Before breakfast"),
    ),
    _definition(
        14,
        BenchmarkSplit.VALIDATION,
        ("Furosemide 40 mg", "Spironolactone 25 mg"),
        ("Take in the morning",),
    ),
    _definition(
        15,
        BenchmarkSplit.VALIDATION,
        ("Bisoprolol 5 mg", "Amlodipine 5 mg"),
        ("Once daily",),
    ),
    _definition(
        16,
        BenchmarkSplit.VALIDATION,
        ("Paracetamol 500 mg", "Azithromycin 250 mg"),
        ("Take after food", "Continue 3 days"),
    ),
    _definition(
        17,
        BenchmarkSplit.VALIDATION,
        ("Omeprazole 20 mg", "Cetirizine 10 mg"),
        ("Before breakfast", "At bedtime"),
    ),
    _definition(
        18,
        BenchmarkSplit.VALIDATION,
        ("Metformin 500 mg", "Atorvastatin 20 mg"),
        ("Take with meals", "Take at night"),
    ),
    _definition(
        19,
        BenchmarkSplit.SEALED_TEST,
        ("Amoxicillin 250 mg", "Paracetamol 500 mg"),
        ("Three times daily", "Take after food"),
    ),
    _definition(
        20,
        BenchmarkSplit.SEALED_TEST,
        ("Losartan 50 mg", "Amlodipine 5 mg"),
        ("Once daily",),
    ),
    _definition(
        21,
        BenchmarkSplit.SEALED_TEST,
        ("Clopidogrel 75 mg", "Atorvastatin 20 mg"),
        ("Once daily", "Take at night"),
    ),
    _definition(
        22,
        BenchmarkSplit.SEALED_TEST,
        ("Ciprofloxacin 500 mg", "Pantoprazole 40 mg"),
        ("Twice daily", "Before breakfast"),
    ),
    _definition(
        23,
        BenchmarkSplit.SEALED_TEST,
        ("Montelukast 10 mg", "Levocetirizine 5 mg"),
        ("Take at night",),
    ),
    _definition(
        24,
        BenchmarkSplit.SEALED_TEST,
        ("Glimepiride 2 mg", "Metformin 500 mg"),
        ("Before breakfast", "Take with meals"),
    ),
)


def _sha256_bytes(data: bytes) -> str:
    return sha256(data).hexdigest()


def _file_sha256(path: Path) -> str:
    return _sha256_bytes(path.read_bytes())


def _seed_for(sample_id: str) -> int:
    material = (
        f"{BENCHMARK_VERSION}|{BENCHMARK_SEED}|"
        f"handwriting-safety|{sample_id}"
    ).encode("utf-8")

    return int.from_bytes(
        sha256(material).digest()[:8],
        byteorder="big",
        signed=False,
    )


def _expected_text(definition: HandwritingSafetyDefinition) -> str:
    lines = ["PRESCRIPTION"]

    max_lines = max(
        len(definition.medication_lines),
        len(definition.instruction_lines),
    )

    for index in range(max_lines):
        if index < len(definition.medication_lines):
            lines.append(definition.medication_lines[index])

        if index < len(definition.instruction_lines):
            lines.append(definition.instruction_lines[index])

    return "\n".join(lines)


def _medication_evidence(
    definition: HandwritingSafetyDefinition,
) -> tuple[MedicationEvidence, ...]:
    return tuple(
        MedicationEvidence(text=text)
        for text in definition.medication_lines
    )


def _render_line(
    *,
    base: Image.Image,
    text: str,
    font: ImageFont.FreeTypeFont,
    x: int,
    y: int,
    angle: float,
) -> None:
    scratch = Image.new(
        "RGBA",
        (1200, 180),
        (255, 255, 255, 0),
    )

    draw = ImageDraw.Draw(scratch)

    draw.text(
        (20, 20),
        text,
        font=font,
        fill=(20, 20, 20, 255),
    )

    rotated = scratch.rotate(
        angle,
        resample=Image.Resampling.BICUBIC,
        expand=True,
        fillcolor=(255, 255, 255, 0),
    )

    base.alpha_composite(rotated, (x, y))


def render_handwriting_safety_sample(
    definition: HandwritingSafetyDefinition,
) -> RenderedHandwritingSafetySample:
    if not REGULAR_SCRIPT_FONT.is_file():
        raise FileNotFoundError(
            f"Required script font not found: {REGULAR_SCRIPT_FONT}"
        )

    if not BOLD_SCRIPT_FONT.is_file():
        raise FileNotFoundError(
            f"Required script font not found: {BOLD_SCRIPT_FONT}"
        )

    rng = random.Random(_seed_for(definition.sample_id))

    canvas = Image.new(
        "RGBA",
        (CANVAS_WIDTH, CANVAS_HEIGHT),
        (255, 255, 255, 255),
    )

    title_font = ImageFont.truetype(
        str(BOLD_SCRIPT_FONT),
        size=62,
    )

    medication_font = ImageFont.truetype(
        str(REGULAR_SCRIPT_FONT),
        size=54,
    )

    instruction_font = ImageFont.truetype(
        str(REGULAR_SCRIPT_FONT),
        size=44,
    )

    y = 130

    _render_line(
        base=canvas,
        text="PRESCRIPTION",
        font=title_font,
        x=120 + rng.randint(-15, 15),
        y=y,
        angle=rng.uniform(-2.0, 2.0),
    )

    y += 220

    max_lines = max(
        len(definition.medication_lines),
        len(definition.instruction_lines),
    )

    for index in range(max_lines):
        if index < len(definition.medication_lines):
            _render_line(
                base=canvas,
                text=definition.medication_lines[index],
                font=medication_font,
                x=130 + rng.randint(-35, 35),
                y=y,
                angle=rng.uniform(-3.5, 3.5),
            )

            y += 145

        if index < len(definition.instruction_lines):
            _render_line(
                base=canvas,
                text=definition.instruction_lines[index],
                font=instruction_font,
                x=185 + rng.randint(-35, 35),
                y=y,
                angle=rng.uniform(-3.0, 3.0),
            )

            y += 135

        y += 55

    flattened = Image.new(
        "RGB",
        canvas.size,
        "white",
    )

    flattened.paste(
        canvas.convert("RGB"),
        (0, 0),
    )

    buffer = io.BytesIO()

    flattened.save(
        buffer,
        format="PNG",
        optimize=False,
        compress_level=9,
    )

    png_bytes = buffer.getvalue()
    image_hash = _sha256_bytes(png_bytes)

    sample = BenchmarkSample(
        sample_id=definition.sample_id,
        base_document_id=definition.sample_id,
        split=definition.split,
        sample_type=BenchmarkSampleType.HANDWRITING_SAFETY,
        expected_text=_expected_text(definition),
        medication_spans=_medication_evidence(definition),
        quality=None,
        image_sha256=image_hash,
    )

    return RenderedHandwritingSafetySample(
        sample=sample,
        png_bytes=png_bytes,
        width=CANVAS_WIDTH,
        height=CANVAS_HEIGHT,
        regular_font_sha256=_file_sha256(REGULAR_SCRIPT_FONT),
        bold_font_sha256=_file_sha256(BOLD_SCRIPT_FONT),
        simulation_notice=HANDWRITING_STYLE_NOTICE,
    )


def build_handwriting_safety_samples(
) -> tuple[RenderedHandwritingSafetySample, ...]:
    rendered = tuple(
        render_handwriting_safety_sample(definition)
        for definition in HANDWRITING_SAFETY_DEFINITIONS
    )

    sample_ids = {
        item.sample.sample_id
        for item in rendered
    }

    image_hashes = {
        item.sample.image_sha256
        for item in rendered
    }

    if len(rendered) != 24:
        raise RuntimeError(
            f"Expected 24 handwriting safety samples, got {len(rendered)}."
        )

    if len(sample_ids) != 24:
        raise RuntimeError(
            "Handwriting safety sample IDs are not unique."
        )

    if len(image_hashes) != 24:
        raise RuntimeError(
            "Handwriting safety image hashes are not unique."
        )

    return rendered