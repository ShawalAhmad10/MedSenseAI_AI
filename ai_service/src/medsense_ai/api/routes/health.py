"""Service health endpoint."""

from fastapi import APIRouter, Request, Response, status

from medsense_ai.schemas.health import HealthResponse

router = APIRouter(tags=["health"])


@router.get(
    "/health",
    response_model=HealthResponse,
    responses={status.HTTP_503_SERVICE_UNAVAILABLE: {"model": HealthResponse}},
)
def health_check(request: Request, response: Response) -> HealthResponse:
    """Report healthy only when the service database can be reached."""
    database_healthy = request.app.state.database.is_healthy()
    if not database_healthy:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return HealthResponse(status="unhealthy", database="unavailable")
    return HealthResponse(status="healthy", database="available")
