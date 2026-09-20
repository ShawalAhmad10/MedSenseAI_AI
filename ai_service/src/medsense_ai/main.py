"""FastAPI application entry point."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI

from medsense_ai.api.router import api_router
from medsense_ai.config import Settings, get_settings
from medsense_ai.database import Database
from medsense_ai.ddi_runtime import RuntimeDDIService
from medsense_ai.integrations.amna_medcopy.cart_ddi import PartnerCartDDIService
from medsense_ai.integrations.amna_medcopy.ddi_bridge import ExactDDIIngredientResolver
from medsense_ai.integrations.amna_medcopy.ddi_rxcui_sidecar import (
    ExactRxCUIIdentityResolver,
    RxCUIInteractionEvidenceIndex,
)
from medsense_ai.integrations.amna_medcopy.prescription_orchestration import PartnerPrescriptionOrchestrationService
from medsense_ai.logging_config import configure_logging

logger = logging.getLogger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    """Create a configured application without opening external connections."""
    resolved_settings = settings or get_settings()
    configure_logging(resolved_settings.log_level)
    database = Database(resolved_settings.database_url)

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        logger.info("Starting MedSenseAI service", extra={"environment": resolved_settings.environment})
        try:
            database.create_schema()
        except Exception:
            logger.exception("Database initialization failed")
            database.dispose()
            raise
        try:
            application.state.amna_prescription_service = (
                PartnerPrescriptionOrchestrationService()
            )
        except Exception:
            application.state.amna_prescription_service = None
            logger.exception(
                "Partner prescription integration initialization failed"
            )
        try:
            application.state.amna_cart_ddi_service = PartnerCartDDIService(
                resolver=ExactDDIIngredientResolver.from_artifact(),
                rxcui_identity_resolver=(
                    ExactRxCUIIdentityResolver.from_artifact()
                ),
                rxcui_evidence_index=(
                    RxCUIInteractionEvidenceIndex.from_artifact()
                ),
                runtime_service=RuntimeDDIService(
                    model_dir=resolved_settings.ddi_model_dir,
                    known_interaction_source=resolved_settings.ddi_known_interaction_source,
                ),
            )
        except Exception:
            application.state.amna_cart_ddi_service = None
            logger.exception("Partner cart DDI integration initialization failed")
        try:
            yield
        finally:
            database.dispose()
            logger.info("MedSenseAI service stopped")

    application = FastAPI(
        title="MedSenseAI AI Service",
        version="0.1.0",
        description="Safety-focused service foundation; no medical decision logic is implemented.",
        lifespan=lifespan,
    )
    application.state.settings = resolved_settings
    application.state.database = database
    application.include_router(api_router, prefix=resolved_settings.api_prefix)
    return application


app = create_app()
