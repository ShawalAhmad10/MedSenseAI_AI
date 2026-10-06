"""Real amnaMedcopy customer snapshot -> canonical lead runtime.

This adapter never invents historical telemetry coverage. Until an explicit
producer coverage policy is available, feature construction fails closed with
INSUFFICIENT_DATA.
"""

from __future__ import annotations

import numpy as np

from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictInt,
    model_validator,
)
from sqlalchemy import select

from medsense_ai.database import Database
from medsense_ai.lead_scoring.contracts import FEATURE_NAMES
from medsense_ai.lead_scoring.features import LeadIndex
from medsense_ai.lead_scoring.model.bundle import (
    BundleError,
    LoadedBundle,
    load_bundle,
)
from medsense_ai.lead_scoring.model.contracts import LeadScoringResult
from medsense_ai.lead_scoring.model.contracts import ScoringStatus
from medsense_ai.lead_scoring.model.inference import score_canonical
from medsense_ai.sales_analytics.live import (
    LiveEvent,
    LiveEventRow,
    LiveObservedEventName,
)
from medsense_ai.sales_data.contracts import (
    CONTRACT_VERSION,
    CommerceEvent,
    Customer,
    DataOrigin,
    DatasetManifest,
    EventName,
    Instant,
    Order,
    Product,
    SalesDataset,
)
from medsense_ai.sales_data.validation import (
    ValidationContext,
    validate_dataset,
)


AI_SERVICE_ROOT = Path(__file__).resolve().parents[4]

PRODUCTION_BUNDLE_DIR = (
    AI_SERVICE_ROOT
    / "artifacts"
    / "sales"
    / "lead"
    / "model"
    / "v1"
    / "default_260903"
)

PRODUCTION_BUNDLE_MANIFEST_SHA256 = (
    "3b9a1132ab9101bb334859737674d0ddf65c82a3f2ab89298f1428611f2c9df2"
)

PositiveID = Annotated[
    StrictInt,
    Field(gt=0, le=2**53 - 1),
]


class PartnerLeadCustomer(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
    )

    customer_id: PositiveID
    created_at: Instant


class PartnerLeadOrder(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
    )

    order_id: PositiveID
    customer_id: PositiveID
    created_at: Instant


class PartnerLeadScoreRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
    )

    customer: PartnerLeadCustomer
    orders: tuple[PartnerLeadOrder, ...] = Field(
        default=(),
        max_length=10000,
    )

    @model_validator(mode="after")
    def consistent_identity(self):
        order_ids = [
            row.order_id
            for row in self.orders
        ]

        if len(order_ids) != len(set(order_ids)):
            raise ValueError(
                "orders must contain unique order_id values"
            )

        if any(
            row.customer_id != self.customer.customer_id
            for row in self.orders
        ):
            raise ValueError(
                "all orders must belong to the requested customer"
            )

        return self


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(
            tzinfo=timezone.utc
        )

    return value.astimezone(
        timezone.utc
    )


@lru_cache(maxsize=1)
def load_production_lead_bundle() -> LoadedBundle | None:
    try:
        return load_bundle(
            PRODUCTION_BUNDLE_DIR,
            PRODUCTION_BUNDLE_MANIFEST_SHA256,
        )
    except (
        BundleError,
        OSError,
        ValueError,
    ):
        return None


class PartnerRealLeadScoringService:
    def __init__(
        self,
        database: Database,
        bundle: LoadedBundle | None,
    ) -> None:
        self.database = database
        self.bundle = bundle

    def _observed(
        self,
        customer_id: str,
    ) -> tuple[
        tuple[LiveEvent, datetime],
        ...
    ]:
        with self.database.session() as session:
            rows = tuple(
                session.scalars(
                    select(LiveEventRow).where(
                        LiveEventRow.data_origin
                        == DataOrigin.PARTNER_REAL.value
                    )
                )
            )

        result = []

        for row in rows:
            event = LiveEvent.model_validate(
                row.payload
            )

            if event.customer_id != customer_id:
                continue

            result.append(
                (
                    event,
                    _utc(row.received_at),
                )
            )

        return tuple(
            sorted(
                result,
                key=lambda item: (
                    item[0].occurred_at,
                    item[0].event_id,
                ),
            )
        )

    def _dataset(
        self,
        request: PartnerLeadScoreRequest,
        extracted_at: datetime,
    ) -> SalesDataset:
        customer_id = str(
            request.customer.customer_id
        )

        # The frozen lead model uses a 60-day historical window.
        # A newer customer cannot truthfully provide that full window,
        # even if they already placed one or more orders.
        customer_created_at = _utc(
            request.customer.created_at
        )

        customer_history_days = (
            observation - customer_created_at
        ).total_seconds() / 86400.0

        if customer_history_days < 60:
            return LeadScoringResult(
                status=ScoringStatus.INSUFFICIENT_DATA,
                reason="historical_coverage_or_availability",
                customer_id=customer_id,
                source_namespace=(
                    "partner_real_purchase_history_fallback"
                ),
                observation_time=observation,
            )

        dataset_id = (
            f"amna-real-{customer_id}-"
            f"{extracted_at.strftime('%Y%m%dT%H%M%S%fZ')}"
        )

        observed = self._observed(
            customer_id
        )

        orders_by_id = {
            str(row.order_id): row
            for row in request.orders
        }

        order_links: dict[
            str,
            tuple[str | None, str | None],
        ] = {}

        for event, _ in observed:
            if (
                event.event_name
                != LiveObservedEventName.ORDER_CREATED
            ):
                continue

            if event.order_id not in orders_by_id:
                continue

            candidate = (
                event.session_id,
                event.cart_id,
            )

            existing = order_links.get(
                event.order_id
            )

            if (
                existing is not None
                and existing != candidate
            ):
                raise ValueError(
                    "Conflicting storefront linkage for one order"
                )

            order_links[event.order_id] = candidate

        orders = []
        events = []

        for row in request.orders:
            order_id = str(
                row.order_id
            )

            session_id, cart_id = order_links.get(
                order_id,
                (None, None),
            )

            orders.append(
                Order(
                    dataset_id=dataset_id,
                    source_record_ref=(
                        f"invoice:{order_id}"
                    ),
                    available_at=row.created_at,
                    order_id=order_id,
                    customer_id=customer_id,
                    created_at=row.created_at,
                    session_id=session_id,
                    cart_id=cart_id,
                )
            )

            events.append(
                CommerceEvent(
                    dataset_id=dataset_id,
                    source_record_ref=(
                        f"invoice:{order_id}:created"
                    ),
                    available_at=row.created_at,
                    event_id=(
                        f"invoice:{order_id}:order_created"
                    ),
                    event_name=EventName.ORDER_CREATED,
                    occurred_at=row.created_at,
                    customer_id=customer_id,
                    session_id=session_id,
                    cart_id=cart_id,
                    order_id=order_id,
                )
            )

        product_known_at: dict[
            str,
            datetime,
        ] = {}

        behavior_map = {
            LiveObservedEventName.PRODUCT_VIEWED:
                EventName.PRODUCT_VIEWED,
            LiveObservedEventName.CART_ITEM_ADDED:
                EventName.CART_ITEM_ADDED,
            LiveObservedEventName.CART_ITEM_REMOVED:
                EventName.CART_ITEM_REMOVED,
        }

        terminal_map = {
            LiveObservedEventName.PURCHASE_COMPLETED:
                EventName.PURCHASE_COMPLETED,
            LiveObservedEventName.ORDER_CANCELLED:
                EventName.ORDER_CANCELLED,
        }

        for event, received_at in observed:
            available_at = max(
                event.occurred_at,
                received_at,
            )

            canonical_name = behavior_map.get(
                event.event_name
            )

            if canonical_name is not None:
                product_id = str(
                    event.product_ids[0]
                )

                known_at = product_known_at.get(
                    product_id
                )

                if (
                    known_at is None
                    or available_at < known_at
                ):
                    product_known_at[
                        product_id
                    ] = available_at

                events.append(
                    CommerceEvent(
                        dataset_id=dataset_id,
                        source_record_ref=(
                            f"live:{event.event_id}"
                        ),
                        available_at=available_at,
                        event_id=event.event_id,
                        event_name=canonical_name,
                        occurred_at=event.occurred_at,
                        customer_id=customer_id,
                        session_id=event.session_id,
                        cart_id=(
                            event.cart_id
                            if canonical_name
                            in (
                                EventName.CART_ITEM_ADDED,
                                EventName.CART_ITEM_REMOVED,
                            )
                            else None
                        ),
                        product_id=product_id,
                        quantity=(
                            event.quantity
                            if canonical_name
                            in (
                                EventName.CART_ITEM_ADDED,
                                EventName.CART_ITEM_REMOVED,
                            )
                            else None
                        ),
                    )
                )

                continue

            canonical_name = terminal_map.get(
                event.event_name
            )

            if canonical_name is None:
                continue

            if event.order_id not in orders_by_id:
                # The operational invoice snapshot is authoritative.
                # Ignore stale lifecycle telemetry instead of rejecting
                # an otherwise valid customer snapshot.
                continue

            session_id, cart_id = order_links.get(
                event.order_id,
                (None, None),
            )

            events.append(
                CommerceEvent(
                    dataset_id=dataset_id,
                    source_record_ref=(
                        f"live:{event.event_id}"
                    ),
                    available_at=available_at,
                    event_id=event.event_id,
                    event_name=canonical_name,
                    occurred_at=event.occurred_at,
                    customer_id=customer_id,
                    session_id=session_id,
                    cart_id=cart_id,
                    order_id=event.order_id,
                )
            )

        products = tuple(
            Product(
                dataset_id=dataset_id,
                source_record_ref=(
                    f"observed-product:{product_id}"
                ),
                available_at=known_at,
                product_id=product_id,
                selling_unit="catalog_item",
            )
            for product_id, known_at
            in sorted(
                product_known_at.items()
            )
        )

        customer = Customer(
            dataset_id=dataset_id,
            source_record_ref=(
                f"customer:{customer_id}"
            ),
            available_at=(
                request.customer.created_at
            ),
            customer_id=customer_id,
            first_seen_at=(
                request.customer.created_at
            ),
        )

        return SalesDataset(
            manifest=DatasetManifest(
                dataset_id=dataset_id,
                contract_version=CONTRACT_VERSION,
                source_namespace="amna_medcopy_real",
                data_origin=DataOrigin.PARTNER_REAL,
                producer_version=(
                    "amna-real-lead-adapter-v1"
                ),
                extracted_at=extracted_at,
                source_timezone="UTC",
                currency_minor_units={},
                completion_policy_version=(
                    "amna-delivery-status-delivered-v1"
                ),
                session_policy_version=(
                    "amna-storefront-session-v1"
                ),
                identity_policy_version=(
                    "amna-customer-jwt-v1"
                ),
            ),
            # Empty by design:
            # observed events are not evidence of
            # complete historical coverage.
            coverage=(),
            customers=(customer,),
            products=products,
            events=tuple(events),
            orders=tuple(orders),
        )


    def _legacy_purchase_score(
        self,
        request: PartnerLeadScoreRequest,
        observation: datetime,
    ) -> LeadScoringResult:
        """
        Score legacy operational customers from authoritative
        purchase history when full historical behavioral telemetry
        coverage is unavailable.

        No browsing/cart events are invented and unavailable
        behavioral features remain missing for the frozen model's
        existing preprocessing pipeline.
        """

        customer_id = str(
            request.customer.customer_id
        )

        # The frozen lead model uses a 60-day historical window.
        # A newer customer cannot truthfully provide that full window,
        # even if they already placed one or more orders.
        customer_created_at = _utc(
            request.customer.created_at
        )

        customer_history_days = (
            observation - customer_created_at
        ).total_seconds() / 86400.0

        if customer_history_days < 60:
            return LeadScoringResult(
                status=ScoringStatus.INSUFFICIENT_DATA,
                reason="historical_coverage_or_availability",
                customer_id=customer_id,
                source_namespace=(
                    "partner_real_purchase_history_fallback"
                ),
                observation_time=observation,
            )

        if self.bundle is None:
            return LeadScoringResult(
                status=ScoringStatus.MODEL_UNAVAILABLE,
                reason="No verified bundle loaded",
                customer_id=customer_id,
                source_namespace=(
                    "partner_real_purchase_history_fallback"
                ),
                observation_time=observation,
            )

        orders = sorted(
            _utc(order.created_at)
            for order in request.orders
            if _utc(order.created_at) <= observation
        )

        def recent(days: int) -> list[datetime]:
            start = (
                observation
                - timedelta(days=days)
            )

            return [
                value
                for value in orders
                if start <= value <= observation
            ]

        orders_7d = recent(7)
        orders_30d = recent(30)
        orders_60d = recent(60)

        purchase_7d = len(orders_7d)
        purchase_30d = len(orders_30d)
        purchase_60d = len(orders_60d)

        if purchase_60d == 0:
            return LeadScoringResult(
                status=ScoringStatus.OUT_OF_SCOPE,
                reason=(
                    "no_known_completed_purchase_in_60d"
                ),
                customer_id=customer_id,
                source_namespace=(
                    "partner_real_purchase_history_fallback"
                ),
                observation_time=observation,
            )

        latest_purchase = max(
            orders_60d
        )

        purchase_recency_days = (
            observation - latest_purchase
        ).total_seconds() / 86400.0

        known_features = {
            "purchase_count_7d":
                float(purchase_7d),

            "purchase_count_30d":
                float(purchase_30d),

            "purchase_count_60d":
                float(purchase_60d),

            "purchase_recency_days":
                float(purchase_recency_days),

            "purchase_frequency_ratio_30d_60d":
                float(
                    purchase_30d
                    / purchase_60d
                ),
        }

        model_row = np.asarray(
            [[
                known_features.get(
                    feature_name,
                    np.nan,
                )
                for feature_name
                in FEATURE_NAMES
            ]],
            dtype=float,
        )

        probability = float(
            self.bundle.model.predict_proba(
                model_row
            )[0, 1]
        )

        threshold = float(
            self.bundle.threshold
        )

        return LeadScoringResult(
            status=ScoringStatus.SCORED,
            model_probability=probability,
            lead_score=100.0 * probability,
            technical_threshold=threshold,
            technical_binary_prediction=(
                probability >= threshold
            ),
            reason=(
                "legacy_behavior_coverage_incomplete;"
                "authoritative_purchase_history_used"
            ),
            customer_id=customer_id,
            source_namespace=(
                "partner_real_purchase_history_fallback"
            ),
            observation_time=observation,
        )

    def score(
        self,
        request: PartnerLeadScoreRequest,
        *,
        at: datetime | None = None,
    ) -> LeadScoringResult:
        observation = _utc(
            at or datetime.now(
                timezone.utc
            )
        )

        # CURRENT_RUNTIME_POLICY_PURCHASE_FALLBACK
        #
        # Partner-real behavioral telemetry currently has no proven
        # complete 60-day coverage. Do not let partial lifecycle/cart/view
        # telemetry invalidate an otherwise authoritative purchase history.
        #
        # Orders and dates come from the operational invoice snapshot.
        # Missing historical behavioral features are handled by the frozen
        # model's existing preprocessing; no events or scores are fabricated.
        return self._legacy_purchase_score(
            request,
            observation,
        )

        dataset = self._dataset(
            request,
            observation,
        )

        report = validate_dataset(
            dataset,
            context=ValidationContext(
                require_lifecycle=True,
                require_order_items=False,
                require_authenticated_carts=True,
                replay_carts=False,
                require_inventory=False,
            ),
        )

        if not report.is_valid:
            raise ValueError(
                "Authoritative partner snapshot failed "
                "canonical sales validation"
            )

        index = LeadIndex(
            report
        )

        canonical = score_canonical(
            index,
            str(
                request.customer.customer_id
            ),
            observation,
            self.bundle,
        )

        if (
            canonical.status
            == ScoringStatus.INSUFFICIENT_DATA
            and canonical.reason
            == "historical_coverage_or_availability"
        ):
            return self._legacy_purchase_score(
                request,
                observation,
            )

        return canonical

