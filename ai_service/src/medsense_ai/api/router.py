"""Top-level API router."""

from fastapi import APIRouter

from medsense_ai.api.routes.amna_ddi import router as amna_ddi_router
from medsense_ai.api.routes.amna_prescription import (
    router as amna_prescription_router,
)
from medsense_ai.api.routes.amna_leads import router as amna_leads_router
from medsense_ai.api.routes.funnel import router as funnel_router
from medsense_ai.api.routes.health import router as health_router


api_router = APIRouter()

api_router.include_router(health_router)
api_router.include_router(amna_ddi_router)
api_router.include_router(amna_prescription_router)
api_router.include_router(amna_leads_router)
api_router.include_router(funnel_router)
