"""Partner prescription-analysis API.

Thin transport adapter only:
base64 image + authoritative Product snapshot
-> frozen prescription orchestration service.
"""

from __future__ import annotations

import base64
import binascii
from typing import Annotated, Any

from fastapi import (
    APIRouter,
    HTTPException,
    Request,
    status,
)
from fastapi.encoders import jsonable_encoder
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictStr,
)

from medsense_ai.integrations.amna_medcopy.contracts import (
    PartnerProductRecord,
)
from medsense_ai.ocr.input_validation import (
    ImageValidationError,
)


router = APIRouter(
    prefix="/integrations/amna/prescription",
    tags=["amna-prescription"],
)


class PartnerPrescriptionAnalyzeRequest(BaseModel):
    """Transport contract supplied by the partner backend."""

    model_config = ConfigDict(
        extra="forbid",
        strict=True,
    )

    image_base64: Annotated[
        StrictStr,
        Field(min_length=1),
    ]

    media_type: Annotated[
        StrictStr,
        Field(
            pattern=r"^image/(png|jpeg)$",
        ),
    ]

    products: list[
        PartnerProductRecord
    ]


def _decode_image_base64(
    value: str,
) -> bytes:
    try:
        return base64.b64decode(
            value,
            validate=True,
        )
    except (
        binascii.Error,
        ValueError,
    ) as exc:
        raise HTTPException(
            status_code=(
                status.HTTP_422_UNPROCESSABLE_CONTENT
            ),
            detail={
                "code": "INVALID_IMAGE_BASE64",
                "message": (
                    "image_base64 must contain valid "
                    "standard Base64 data."
                ),
            },
        ) from exc


@router.post(
    "/analyze",
    status_code=status.HTTP_200_OK,
)
def analyze_prescription(
    payload: PartnerPrescriptionAnalyzeRequest,
    request: Request,
) -> Any:
    """
    Analyze one prescription against a caller-supplied authoritative
    Product snapshot.

    This endpoint does not confirm Products, mutate cart state,
    or perform DDI.
    """

    service = getattr(
        request.app.state,
        "amna_prescription_service",
        None,
    )

    if service is None:
        raise HTTPException(
            status_code=(
                status.HTTP_503_SERVICE_UNAVAILABLE
            ),
            detail={
                "code": (
                    "PRESCRIPTION_SERVICE_UNAVAILABLE"
                ),
                "message": (
                    "Prescription analysis service "
                    "is unavailable."
                ),
            },
        )

    image_bytes = _decode_image_base64(
        payload.image_base64
    )

    try:
        result = service.analyze(
            image_bytes=image_bytes,
            media_type=payload.media_type,
            products=tuple(payload.products),
        )

    except ImageValidationError as exc:
        raise HTTPException(
            status_code=(
                status.HTTP_422_UNPROCESSABLE_CONTENT
            ),
            detail={
                "code": exc.code.value,
                "message": str(exc),
            },
        ) from exc

    return jsonable_encoder(result)
