"""Health endpoint schemas."""

from typing import Literal

from pydantic import BaseModel, ConfigDict


class HealthResponse(BaseModel):
    """Typed health response with explicit database state."""

    model_config = ConfigDict(extra="forbid")

    status: Literal["healthy", "unhealthy"]
    database: Literal["available", "unavailable"]
