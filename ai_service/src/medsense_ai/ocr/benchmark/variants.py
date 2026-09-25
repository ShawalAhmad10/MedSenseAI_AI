from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from io import BytesIO

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

from medsense_ai.ocr.benchmark.contracts import (
    BENCHMARK_SEED,
    BENCHMARK_VERSION,
    PrintedQuality,
)
from medsense_ai.ocr.benchmark.rendering import (
    RenderedPrintedDocument,
)


NOISE_STANDARD_DEVIATION = 14.0
BLUR_RADIUS = 1.2
LOW_CONTRAST_FACTOR = 0.38


@dataclass(frozen=True, slots=True)
class RenderedPrintedVariant:
    document_id: str
    quality: PrintedQuality
    png_bytes: bytes
    width: int
    height: int
    expected_text: str
    medication_spans: tuple[str, ...]
    image_sha256: str
    source_clean_sha256: str


def _encode_png(image: Image.Image) -> bytes:
    buffer = BytesIO()

    image.save(
        buffer,
        format="PNG",
        optimize=False,
        compress_level=6,
    )

    return buffer.getvalue()


def _decode_clean(
    rendered: RenderedPrintedDocument,
) -> Image.Image:
    with Image.open(
        BytesIO(rendered.png_bytes)
    ) as source:
        source.load()
        return source.convert("RGB")


def _deterministic_seed(
    document_id: str,
    quality: PrintedQuality,
) -> int:
    payload = (
        f"{BENCHMARK_VERSION}|"
        f"{BENCHMARK_SEED}|"
        f"{document_id}|"
        f"{quality.value}"
    ).encode("utf-8")

    digest = sha256(payload).digest()

    return int.from_bytes(
        digest[:8],
        byteorder="big",
        signed=False,
    )


def _apply_noisy_blurred(
    image: Image.Image,
    *,
    seed: int,
) -> Image.Image:
    """
    Apply deterministic bounded Gaussian noise followed by mild blur.
    """

    array = np.asarray(
        image,
        dtype=np.float32,
    )

    generator = np.random.default_rng(
        seed
    )

    noise = generator.normal(
        loc=0.0,
        scale=NOISE_STANDARD_DEVIATION,
        size=array.shape,
    )

    noisy = np.clip(
        array + noise,
        0,
        255,
    ).astype(np.uint8)

    result = Image.fromarray(
        noisy,
        mode="RGB",
    )

    return result.filter(
        ImageFilter.GaussianBlur(
            radius=BLUR_RADIUS
        )
    )


def _apply_low_contrast(
    image: Image.Image,
) -> Image.Image:
    return ImageEnhance.Contrast(
        image
    ).enhance(
        LOW_CONTRAST_FACTOR
    )


def render_variant(
    rendered: RenderedPrintedDocument,
    *,
    quality: PrintedQuality,
) -> RenderedPrintedVariant:
    """
    Derive one deterministic printed benchmark quality variant.

    Ground-truth text is inherited unchanged from the clean source.
    """

    image = _decode_clean(
        rendered
    )

    if quality is PrintedQuality.CLEAN:
        variant_image = image

    elif quality is PrintedQuality.ROTATED_90:
        # Clockwise 90-degree rotation.
        variant_image = image.transpose(
            Image.Transpose.ROTATE_270
        )

    elif quality is PrintedQuality.NOISY_BLURRED:
        variant_image = _apply_noisy_blurred(
            image,
            seed=_deterministic_seed(
                rendered.document_id,
                quality,
            ),
        )

    elif quality is PrintedQuality.LOW_CONTRAST:
        variant_image = _apply_low_contrast(
            image
        )

    else:
        raise ValueError(
            f"Unsupported printed quality: {quality!r}"
        )

    png_bytes = _encode_png(
        variant_image
    )

    return RenderedPrintedVariant(
        document_id=rendered.document_id,
        quality=quality,
        png_bytes=png_bytes,
        width=variant_image.width,
        height=variant_image.height,
        expected_text=rendered.expected_text,
        medication_spans=rendered.medication_spans,
        image_sha256=sha256(
            png_bytes
        ).hexdigest(),
        source_clean_sha256=rendered.image_sha256,
    )


def render_all_variants(
    rendered: RenderedPrintedDocument,
) -> tuple[RenderedPrintedVariant, ...]:
    return tuple(
        render_variant(
            rendered,
            quality=quality,
        )
        for quality in PrintedQuality
    )