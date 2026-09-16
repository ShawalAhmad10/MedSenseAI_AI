from __future__ import annotations

import base64
from io import BytesIO

from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image

from medsense_ai.api.routes.amna_prescription import (
    router,
)
from medsense_ai.integrations.amna_medcopy.prescription_orchestration import (
    PartnerPrescriptionOrchestrationService,
)
from medsense_ai.ocr.contracts import (
    OCREngine,
    OCRLine,
    OCRResult,
    OCRRuntimeMetadata,
    OCRStatus,
    PreprocessMode,
)
from medsense_ai.ocr.engines.paddleocr import (
    PaddleOCRExecution,
)


PATH = "/integrations/amna/prescription/analyze"


def png_bytes() -> bytes:
    buffer = BytesIO()

    Image.new(
        "RGB",
        (600, 900),
        "white",
    ).save(
        buffer,
        format="PNG",
    )

    return buffer.getvalue()


def encoded_png() -> str:
    return base64.b64encode(
        png_bytes()
    ).decode("ascii")


class FakeOCRAdapter:
    def recognize(
        self,
        image,
    ) -> PaddleOCRExecution:
        result = OCRResult(
            engine=OCREngine.PADDLEOCR,
            preprocess_mode=(
                PreprocessMode.DOCUMENT_BASIC_V1
            ),
            status=OCRStatus.SUCCESS,
            raw_text="Amoxicillin 250 mg",
            lines=(
                OCRLine(
                    text="Amoxicillin 250 mg",
                    confidence=0.99999,
                ),
            ),
            review_required=False,
        )

        metadata = OCRRuntimeMetadata(
            engine=OCREngine.PADDLEOCR,
            engine_version="fake-api-paddle",
            preprocess_mode=(
                image.preprocess_mode
            ),
            elapsed_ms=1.0,
        )

        return PaddleOCRExecution(
            result=result,
            metadata=metadata,
        )


def client_with_service() -> TestClient:
    app = FastAPI()
    app.include_router(router)

    app.state.amna_prescription_service = (
        PartnerPrescriptionOrchestrationService(
            ocr_adapter=FakeOCRAdapter(),
        )
    )

    return TestClient(app)


def valid_payload() -> dict:
    return {
        "image_base64": encoded_png(),
        "media_type": "image/png",
        "products": [
            {
                "product_id": 10,
                "product_title": (
                    "Amoxicillin 250 mg Capsules"
                ),
                "product_generic_name": (
                    "Amoxicillin"
                ),
                "product_salt": (
                    "Amoxicillin"
                ),
                "product_requires_rx": True,
                "product_status": 1,
            }
        ],
    }


def test_api_runs_full_prescription_product_chain() -> None:
    with client_with_service() as client:
        response = client.post(
            PATH,
            json=valid_payload(),
        )

    assert response.status_code == 200

    body = response.json()

    assert (
        body["ocr_result"]["status"]
        == "SUCCESS"
    )

    assert len(
        body["prescription_analysis"]["candidates"]
    ) == 1

    assert len(body["product_matches"]) == 1

    match = (
        body["product_matches"][0]
        ["product_match"]
    )

    assert (
        match["status"]
        == "UNIQUE_CANDIDATE"
    )

    assert (
        match["products"][0]["product_id"]
        == 10
    )

    assert (
        match["confirmation_required"]
        is True
    )


def test_api_rejects_invalid_base64() -> None:
    payload = valid_payload()
    payload["image_base64"] = "%%%not-base64%%%"

    with client_with_service() as client:
        response = client.post(
            PATH,
            json=payload,
        )

    assert response.status_code == 422

    assert (
        response.json()["detail"]["code"]
        == "INVALID_IMAGE_BASE64"
    )


def test_api_rejects_wrong_media_type_contract() -> None:
    payload = valid_payload()
    payload["media_type"] = "application/pdf"

    with client_with_service() as client:
        response = client.post(
            PATH,
            json=payload,
        )

    assert response.status_code == 422


def test_api_rejects_extra_product_fields() -> None:
    payload = valid_payload()

    payload["products"][0][
        "made_up_field"
    ] = "must-not-pass"

    with client_with_service() as client:
        response = client.post(
            PATH,
            json=payload,
        )

    assert response.status_code == 422


def test_api_rejects_invalid_product_status() -> None:
    payload = valid_payload()

    payload["products"][0][
        "product_status"
    ] = 7

    with client_with_service() as client:
        response = client.post(
            PATH,
            json=payload,
        )

    assert response.status_code == 422


def test_api_rejects_corrupt_decoded_image() -> None:
    payload = valid_payload()

    payload["image_base64"] = (
        base64.b64encode(
            b"not-an-image"
        ).decode("ascii")
    )

    with client_with_service() as client:
        response = client.post(
            PATH,
            json=payload,
        )

    assert response.status_code == 422

    assert (
        response.json()["detail"]["code"]
        == "CORRUPT_IMAGE"
    )


def test_api_fails_closed_without_service() -> None:
    app = FastAPI()
    app.include_router(router)

    with TestClient(app) as client:
        response = client.post(
            PATH,
            json=valid_payload(),
        )

    assert response.status_code == 503

    assert (
        response.json()["detail"]["code"]
        == "PRESCRIPTION_SERVICE_UNAVAILABLE"
    )


def test_api_does_not_return_cart_or_ddi_state() -> None:
    with client_with_service() as client:
        response = client.post(
            PATH,
            json=valid_payload(),
        )

    assert response.status_code == 200

    body = response.json()

    assert "cart" not in body
    assert "ddi_result" not in body


def test_main_app_wires_prescription_route_and_service(
    client: TestClient,
) -> None:
    paths = client.app.openapi()["paths"]

    assert (
        "/api/v1/integrations/amna/prescription/analyze"
        in paths
    )

    assert getattr(
        client.app.state,
        "amna_prescription_service",
        None,
    ) is not None
