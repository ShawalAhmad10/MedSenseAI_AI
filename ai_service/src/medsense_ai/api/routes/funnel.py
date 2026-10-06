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


# ============================================================
# CUSTOMER-LEVEL LIVE ACTIVITY
# Read-only endpoint used by Lead Scoring dashboard.
# ============================================================

from collections import Counter as _LeadActivityCounter
from datetime import datetime as _LeadActivityDatetime
from datetime import timedelta as _LeadActivityTimedelta
from datetime import timezone as _LeadActivityTimezone

from fastapi import Query as _LeadActivityQuery
from sqlalchemy import select as _LeadActivitySelect

from medsense_ai.sales_analytics.live import (
    LiveEventRow as _LeadActivityRow,
)


def _lead_activity_time(value):

    if not isinstance(value, str):
        return None

    try:

        parsed = (
            _LeadActivityDatetime
            .fromisoformat(
                value.replace(
                    "Z",
                    "+00:00"
                )
            )
        )

    except ValueError:
        return None

    if parsed.tzinfo is None:

        parsed = parsed.replace(
            tzinfo=_LeadActivityTimezone.utc
        )

    return parsed.astimezone(
        _LeadActivityTimezone.utc
    )


@router.get(
    "/customer-activity/{customer_id}"
)
def customer_activity(
    customer_id: str,
    request: Request,

    days: int = _LeadActivityQuery(
        default=30,
        ge=1,
        le=60
    ),

    origin: Literal[
        "partner_real",
        "synthetic_development"
    ] = "partner_real",
):

    customer_id = str(
        customer_id
    ).strip()

    if not customer_id:

        raise HTTPException(
            422,
            "customer_id is required"
        )


    now = _LeadActivityDatetime.now(
        _LeadActivityTimezone.utc
    )

    start = (
        now -
        _LeadActivityTimedelta(
            days=days
        )
    )


    with (
        request.app.state.database
        .session_factory()
        as session
    ):

        rows = tuple(
            session.scalars(
                _LeadActivitySelect(
                    _LeadActivityRow
                ).where(
                    _LeadActivityRow.data_origin
                    == origin
                )
            )
        )


    counts = (
        _LeadActivityCounter()
    )

    last_activity = None


    for row in rows:

        payload = (
            row.payload
            if isinstance(
                row.payload,
                dict
            )
            else {}
        )


        if (
            str(
                payload.get(
                    "customer_id"
                )
                or ""
            )
            != customer_id
        ):
            continue


        occurred_at = (
            _lead_activity_time(
                payload.get(
                    "occurred_at"
                )
            )
        )


        if (
            occurred_at is None
            or occurred_at < start
            or occurred_at > now
        ):
            continue


        event_name = str(
            payload.get(
                "event_name"
            )
            or ""
        )


        if not event_name:
            continue


        counts[
            event_name
        ] += 1


        if (
            last_activity is None
            or occurred_at >
                last_activity
        ):

            last_activity = (
                occurred_at
            )


    return {

        "customer_id":
            customer_id,

        "window_days":
            days,

        "data_origin":
            origin,

        "product_views":
            counts[
                "product_viewed"
            ],

        "cart_adds":
            counts[
                "cart_item_added"
            ],

        "cart_removes":
            counts[
                "cart_item_removed"
            ],

        "checkouts":
            counts[
                "checkout_started"
            ],

        "orders_created":
            counts[
                "order_created"
            ],

        "purchase_completed":
            counts[
                "purchase_completed"
            ],

        "last_activity_at":
            (
                last_activity.isoformat()
                if last_activity
                else None
            )
    }

