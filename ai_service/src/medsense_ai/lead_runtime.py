"""Dedicated exact-dependency runtime for canonical lead scoring.

This process intentionally does not initialize DDI, OCR, forecasting, or
commerce integrations. It reuses the existing canonical lead route and the
existing observational AI SQLite event store without creating or altering
database schema.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException

from medsense_ai.api.routes.amna_leads import (
    router as amna_leads_router,
)
from medsense_ai.config import Settings, get_settings
from medsense_ai.database import Database
from medsense_ai.integrations.amna_medcopy.lead_scoring import (
    load_production_lead_bundle,
)


def create_lead_runtime_app(
    settings: Settings | None = None,
) -> FastAPI:
    resolved = settings or get_settings()

    database = Database(
        resolved.database_url,
    )

    verified_bundle = (
        load_production_lead_bundle()
    )

    if verified_bundle is None:
        raise RuntimeError(
            "Verified production lead bundle "
            "is unavailable in this runtime"
        )

    metadata = verified_bundle.metadata

    @asynccontextmanager
    async def lifespan(
        application: FastAPI,
    ) -> AsyncIterator[None]:
        try:
            yield
        finally:
            database.dispose()

    application = FastAPI(
        title="MedSenseAI Lead Runtime",
        version="1.0.0",
        description=(
            "Dedicated exact-dependency runtime "
            "for canonical partner lead scoring."
        ),
        lifespan=lifespan,
    )

    application.state.settings = resolved
    application.state.database = database
    application.state.lead_bundle_verified = True

    application.include_router(
        amna_leads_router,
        prefix=resolved.api_prefix,
    )

    @application.get(
        f"{resolved.api_prefix}/lead-runtime/health"
    )
    def health() -> dict[str, object]:
        bundle = load_production_lead_bundle()

        if bundle is None:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Verified lead model bundle "
                    "is unavailable"
                ),
            )

        current = bundle.metadata

        return {
            "status": "ok",
            "model_ready": True,
            "model_version": current.get(
                "model_version"
            ),
            "feature_version": current.get(
                "feature_version"
            ),
            "target_version": current.get(
                "target_version"
            ),
            "data_origin": current.get(
                "data_origin"
            ),
            "production_business_policy": (
                current.get(
                    "production_business_policy"
                )
            ),
            "startup_model_version": metadata.get(
                "model_version"
            ),
        }

    return application


app = create_lead_runtime_app()
