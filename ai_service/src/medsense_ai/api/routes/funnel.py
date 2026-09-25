"""Local partner service ingestion and persisted funnel metrics."""
import secrets
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Request

from medsense_ai.sales_analytics.live import (
    EventConflict, EventReceipt, LiveEvent, LiveFunnelReport, ingest_event, live_funnel,
)
from medsense_ai.sales_data.contracts import DataOrigin


def authorize(request: Request, x_medsense_key: str | None = Header(default=None)) -> None:
    key = request.app.state.settings.integration_api_key
    if key and (x_medsense_key is None or not secrets.compare_digest(key.get_secret_value(), x_medsense_key)):
        raise HTTPException(401, 'Invalid integration credential')


router = APIRouter(prefix='/integrations/amna/funnel', tags=['amna-funnel'], dependencies=[Depends(authorize)])


@router.post('/events', response_model=EventReceipt)
def ingest(payload: LiveEvent, request: Request) -> EventReceipt:
    try:
        return ingest_event(request.app.state.database, payload)
    except EventConflict as error:
        raise HTTPException(409, str(error)) from error
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


@router.get('/metrics', response_model=LiveFunnelReport)
def metrics(request: Request, origin: Literal['partner_real', 'synthetic_development'] = 'partner_real') -> LiveFunnelReport:
    return live_funnel(request.app.state.database, DataOrigin(origin))
