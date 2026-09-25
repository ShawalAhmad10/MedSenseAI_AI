"""Persisted, observational storefront funnel; no mature-cohort/coverage claims.

Uses canonical event names where semantics match. A successful order submission
is order_created, not purchase_completed (which means fulfillment elsewhere).
"""
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from enum import StrEnum
import hashlib
import json
import logging
from typing import Literal, Self

from pydantic import Field, StrictInt, model_validator
from sqlalchemy import JSON, DateTime, String, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Mapped, mapped_column

from medsense_ai.database import Base, Database
from medsense_ai.sales_data.contracts import CanonicalModel, DataOrigin, EventName, Instant, OpaqueID

logger = logging.getLogger(__name__)


class LiveEventName(StrEnum):
    PRODUCT_VIEWED = EventName.PRODUCT_VIEWED.value
    CART_ITEM_ADDED = EventName.CART_ITEM_ADDED.value
    CHECKOUT_STARTED = 'checkout_started'
    ORDER_CREATED = EventName.ORDER_CREATED.value


class LiveObservedEventName(StrEnum):
    PRODUCT_VIEWED = EventName.PRODUCT_VIEWED.value
    CART_ITEM_ADDED = EventName.CART_ITEM_ADDED.value
    CART_ITEM_REMOVED = EventName.CART_ITEM_REMOVED.value
    CHECKOUT_STARTED = 'checkout_started'
    ORDER_CREATED = EventName.ORDER_CREATED.value
    PURCHASE_COMPLETED = EventName.PURCHASE_COMPLETED.value
    ORDER_CANCELLED = EventName.ORDER_CANCELLED.value


class LiveEvent(CanonicalModel):
    schema_version: Literal['storefront-funnel-v1'] = 'storefront-funnel-v1'
    event_id: OpaqueID
    event_name: LiveObservedEventName
    session_id: OpaqueID
    cart_id: OpaqueID
    customer_id: OpaqueID | None = None
    occurred_at: Instant
    data_origin: Literal[DataOrigin.PARTNER_REAL, DataOrigin.SYNTHETIC_DEVELOPMENT]
    product_ids: tuple[StrictInt, ...] = Field(min_length=1, max_length=100)
    quantity: StrictInt | None = Field(default=None, ge=1, le=100000)
    order_id: OpaqueID | None = None

    @model_validator(mode='after')
    def check_semantics(self) -> Self:
        if any(value <= 0 or value > 2**53 - 1 for value in self.product_ids):
            raise ValueError('Product IDs must be positive safe integers')
        if len(set(self.product_ids)) != len(self.product_ids):
            raise ValueError('Product IDs must be unique')
        product_events = (
            LiveObservedEventName.PRODUCT_VIEWED,
            LiveObservedEventName.CART_ITEM_ADDED,
            LiveObservedEventName.CART_ITEM_REMOVED,
        )
        quantity_events = (
            LiveObservedEventName.CART_ITEM_ADDED,
            LiveObservedEventName.CART_ITEM_REMOVED,
        )

        if (
            self.event_name in product_events
            and len(self.product_ids) != 1
        ):
            raise ValueError(
                'Product events require exactly one product'
            )

        if (
            (self.event_name in quantity_events)
            != (self.quantity is not None)
        ):
            raise ValueError(
                'Only cart add/remove events require quantity'
            )

        order_events = (
            LiveObservedEventName.ORDER_CREATED,
            LiveObservedEventName.PURCHASE_COMPLETED,
            LiveObservedEventName.ORDER_CANCELLED,
        )

        if (
            (self.event_name in order_events)
            != (self.order_id is not None)
        ):
            raise ValueError(
                'Order lifecycle events require order_id'
            )
        return self


class LiveEventRow(Base):
    __tablename__ = 'storefront_funnel_events'
    event_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    payload_sha256: Mapped[str] = mapped_column(String(64))
    payload: Mapped[dict] = mapped_column(JSON)
    data_origin: Mapped[str] = mapped_column(String(32), index=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class EventReceipt(CanonicalModel):
    event_id: OpaqueID
    duplicate: bool


class StageMetric(CanonicalModel):
    event_name: LiveEventName
    event_count: int = Field(ge=0)
    sessions: int = Field(ge=0)
    conversion_from_previous_pct: float | None = Field(ge=0, le=100)


class LiveFunnelReport(CanonicalModel):
    schema_version: Literal['storefront-funnel-report-v1'] = 'storefront-funnel-report-v1'
    data_origin: str
    stages: tuple[StageMetric, ...]
    total_events: int = Field(ge=0)
    overall_conversion_pct: float | None = Field(ge=0, le=100)
    measurement: str = ('All-time observed sessions with ordered view → cart addition → checkout '
                        '→ accepted order. Not a mature-cohort estimate; order acceptance is not payment or fulfillment.')


class EventConflict(ValueError):
    """An event identifier was reused with different facts."""


def ingest_event(database: Database, event: LiveEvent, *, now: datetime | None = None) -> EventReceipt:
    now = now or datetime.now(timezone.utc)
    if event.occurred_at > now + timedelta(minutes=5):
        raise ValueError('Event timestamp is more than five minutes in the future')
    payload = event.model_dump(mode='json')
    payload['product_ids'] = sorted(payload['product_ids'])
    digest = hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    with database.session_factory() as session:
        session.add(LiveEventRow(event_id=event.event_id, payload_sha256=digest,
                                 payload=payload, data_origin=event.data_origin.value, received_at=now))
        try:
            session.commit()
        except IntegrityError:
            session.rollback()
            existing = session.get(LiveEventRow, event.event_id)
            if existing is None:
                logger.exception('Funnel persistence constraint failed', extra={'event_id': event.event_id})
                raise
            if existing.payload_sha256 != digest:
                logger.warning('Conflicting funnel event identifier', extra={'event_id': event.event_id})
                raise EventConflict('event_id already exists with different content')
            return EventReceipt(event_id=event.event_id, duplicate=True)
        except Exception:
            session.rollback()
            logger.exception('Funnel event persistence failed', extra={'event_id': event.event_id})
            raise
    return EventReceipt(event_id=event.event_id, duplicate=False)


def live_funnel(database: Database, origin: DataOrigin) -> LiveFunnelReport:
    with database.session() as session:
        events = [LiveEvent.model_validate(row.payload) for row in session.scalars(
            select(LiveEventRow).where(LiveEventRow.data_origin == origin.value))]
    counts = Counter(
        event.event_name.value
        for event in events
    )
    names = list(LiveEventName)
    stage_values = {
        name.value
        for name in names
    }

    sessions = defaultdict(list)

    for event in events:
        if event.event_name.value not in stage_values:
            continue

        sessions[event.session_id].append(event)
    stage_index = {
        name.value: index
        for index, name in enumerate(names)
    }
    reached = [0] * len(names)
    for events_in_session in sessions.values():
        # Evaluate each cart separately: never join an order to another cart's checkout.
        carts = defaultdict(list)
        for event in events_in_session:
            carts[event.cart_id].append(event)
        highest = 0
        for cart_events in carts.values():
            progress = 0
            for event in sorted(
                cart_events,
                key=lambda item: (
                    item.occurred_at,
                    stage_index.get(
                        item.event_name.value,
                        len(names)
                    ),
                    item.event_id,
                ),
            ):
                if (
                    progress < len(names)
                    and event.event_name.value
                    == names[progress].value
                ):
                    progress += 1
            highest = max(highest, progress)
        for index in range(highest):
            reached[index] += 1
    pct = lambda n, d: round(100 * n / d, 2) if d else None
    return LiveFunnelReport(data_origin=origin.value, total_events=sum(counts.values()),
        stages=tuple(StageMetric(event_name=name, event_count=counts[name.value], sessions=reached[index],
            conversion_from_previous_pct=pct(reached[index], reached[index-1]) if index else None)
            for index, name in enumerate(names)),
        overall_conversion_pct=pct(reached[-1], reached[0]))
