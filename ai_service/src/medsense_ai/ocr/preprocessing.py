from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from io import BytesIO

from PIL import Image, ImageEnhance, ImageOps

from medsense_ai.ocr.contracts import PreprocessMode
from medsense_ai.ocr.input_validation import (
    MAX_DIMENSION,
    ValidatedImageInput,
    validate_image_bytes,
)


RECOMMENDED_SHORTEST_SIDE = 800
BOUNDED_CONTRAST_FACTOR = 1.15


@dataclass(frozen=True, slots=True)
class PreprocessedImage:
    """
    Deterministic raster evidence passed to an OCR engine.

    `png_bytes` contains the resulting pixels encoded as PNG.
    No OCR, medicine extraction, normalization, or clinical inference
    occurs in this layer.
    """

    preprocess_mode: PreprocessMode
    png_bytes: bytes
    width: int
    height: int
    image_mode: str
    sha256_hex: str
    applied_steps: tuple[str, ...]

    @property
    def pixel_count(self) -> int:
        return self.width * self.height


def _flatten_to_rgb(image: Image.Image) -> Image.Image:
    """
    Convert image to RGB while flattening transparency onto white.
    """

    has_alpha = "A" in image.getbands()
    palette_transparency = (
        image.mode == "P" and "transparency" in image.info
    )

    if has_alpha or palette_transparency:
        rgba = image.convert("RGBA")
        background = Image.new(
            "RGBA",
            rgba.size,
            (255, 255, 255, 255),
        )
        flattened = Image.alpha_composite(background, rgba)
        return flattened.convert("RGB")

    return image.convert("RGB")


def _canonical_decode(
    validated: ValidatedImageInput,
) -> tuple[Image.Image, list[str]]:
    """
    Perform operations common to both approved preprocessing modes.
    """

    with Image.open(BytesIO(validated.encoded_bytes)) as source:
        source.load()

        image = ImageOps.exif_transpose(source)
        image = _flatten_to_rgb(image)

    steps = [
        "validated_decode",
        "exif_transpose",
        "alpha_flatten_white",
        "rgb_color_normalization",
    ]

    return image, steps


def _correct_right_angle_orientation(
    image: Image.Image,
) -> tuple[Image.Image, bool]:
    """
    Conservative v1 prescription orientation rule.

    The benchmark prescription documents are portrait-oriented at source.
    A landscape raster is therefore treated as a 90-degree rotated
    prescription and rotated counter-clockwise back to portrait.

    No arbitrary-angle deskew or perspective correction is performed.
    """

    if image.width > image.height:
        return (
            image.transpose(Image.Transpose.ROTATE_90),
            True,
        )

    return image, False


def _bounded_upscale(image: Image.Image) -> tuple[Image.Image, bool]:
    """
    Upscale small images while preserving aspect ratio.

    Never intentionally exceed MAX_DIMENSION.
    """

    shortest = min(image.width, image.height)

    if shortest >= RECOMMENDED_SHORTEST_SIDE:
        return image, False

    desired_scale = RECOMMENDED_SHORTEST_SIDE / shortest
    dimension_scale = MAX_DIMENSION / max(
        image.width,
        image.height,
    )

    scale = min(desired_scale, dimension_scale)

    if scale <= 1.0:
        return image, False

    new_width = max(1, round(image.width * scale))
    new_height = max(1, round(image.height * scale))

    resized = image.resize(
        (new_width, new_height),
        resample=Image.Resampling.LANCZOS,
    )

    return resized, True


def _encode_png(image: Image.Image) -> bytes:
    buffer = BytesIO()

    image.save(
        buffer,
        format="PNG",
        optimize=False,
        compress_level=6,
    )

    return buffer.getvalue()


def preprocess_validated_image(
    validated: ValidatedImageInput,
    *,
    mode: PreprocessMode,
) -> PreprocessedImage:
    """
    Apply one frozen OCR-v1 preprocessing mode.
    """

    image, steps = _canonical_decode(validated)

    if mode is PreprocessMode.DECODE_ONLY_V1:
        pass

    elif mode is PreprocessMode.DOCUMENT_BASIC_V1:
        image, orientation_changed = (
            _correct_right_angle_orientation(image)
        )

        if orientation_changed:
            steps.append("right_angle_orientation_correction")

        image = ImageOps.grayscale(image)
        steps.append("grayscale")

        image = ImageEnhance.Contrast(image).enhance(
            BOUNDED_CONTRAST_FACTOR
        )
        steps.append("bounded_contrast_1.15")

        image, upscaled = _bounded_upscale(image)

        if upscaled:
            steps.append("aspect_preserving_upscale")

    else:
        raise ValueError(
            f"Unsupported preprocessing mode: {mode!r}"
        )

    png_bytes = _encode_png(image)

    return PreprocessedImage(
        preprocess_mode=mode,
        png_bytes=png_bytes,
        width=image.width,
        height=image.height,
        image_mode=image.mode,
        sha256_hex=sha256(png_bytes).hexdigest(),
        applied_steps=tuple(steps),
    )


def preprocess_image_bytes(
    data: bytes | bytearray | memoryview,
    *,
    mode: PreprocessMode,
    media_type: str | None = None,
) -> PreprocessedImage:
    """
    Validate then preprocess one OCR image.
    """

    validated = validate_image_bytes(
        data,
        media_type=media_type,
    )

    return preprocess_validated_image(
        validated,
        mode=mode,
    )