"""Partner cart DDI endpoint backed by authoritative Product-domain records."""

from fastapi import APIRouter, Request, Response, status

from medsense_ai.integrations.amna_medcopy.cart_ddi import (
    PartnerCartCheckRequest,
    PartnerCartCheckResponse,
    unavailable_cart_response,
)


router = APIRouter(prefix="/integrations/amna/ddi", tags=["amna-ddi"])


@router.post(
    "/cart-check",
    response_model=PartnerCartCheckResponse,
    responses={status.HTTP_503_SERVICE_UNAVAILABLE: {"model": PartnerCartCheckResponse}},
)
def cart_check(
    payload: PartnerCartCheckRequest,
    request: Request,
    response: Response,
) -> PartnerCartCheckResponse:
    service = getattr(request.app.state, "amna_cart_ddi_service", None)
    if service is None:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return unavailable_cart_response(payload)
    result = service.evaluate(payload)
    if result.status.value == "SERVICE_UNAVAILABLE":
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return result
