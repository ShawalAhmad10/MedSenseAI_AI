"""Sorted canonical histories and point-in-time behavioral features; no generator inputs."""

from bisect import bisect_left, bisect_right
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime

from medsense_ai.sales_data import (
    CommerceEvent, CoverageState, CoverageStream, EventName, ValidationReport,
    assess_coverage, is_knowable,
)
from medsense_ai.sales_data.contracts import SalesRecord, utc_instant
from .contracts import (
    DAY, CoverageFailure, Eligibility, FeatureEvidence, FeatureResult, Features,
    elapsed_days, quotient,
)

HISTORY_STREAMS = (
    CoverageStream.CUSTOMERS, CoverageStream.PRODUCTS, CoverageStream.ORDERS,
    CoverageStream.ORDER_CREATED, CoverageStream.PURCHASE_COMPLETED,
    CoverageStream.PRODUCT_VIEWED, CoverageStream.CART_ITEM_ADDED, CoverageStream.CART_ITEM_REMOVED,
)
LABEL_STREAMS = (CoverageStream.CUSTOMERS, CoverageStream.ORDERS, CoverageStream.ORDER_CREATED, CoverageStream.PURCHASE_COMPLETED)
BEHAVIOR = (EventName.PRODUCT_VIEWED, EventName.CART_ITEM_ADDED, EventName.CART_ITEM_REMOVED)
FEATURE_EVENTS = (*BEHAVIOR, EventName.PURCHASE_COMPLETED)


@dataclass(frozen=True)
class KnownEvent:
    event: CommerceEvent
    joins: tuple[SalesRecord, ...]
    known_at: datetime

    def knowable(self, at: datetime) -> bool:
        return is_knowable(self.event, at) and all(is_knowable(row, at) for row in self.joins)


class LeadIndex:
    """One validated source scope. Index once, slice histories instead of scanning the batch."""

    def __init__(self, validated: ValidationReport):
        if not validated.is_valid:
            raise ValueError("Lead construction requires accepted canonical validation")
        self.data = validated.validated_dataset
        self.customers = {c.customer_id: c for c in self.data.customers}
        self.products = {p.product_id: p for p in self.data.products}
        self.orders = {o.order_id: o for o in self.data.orders}
        self.events = {}
        self.histories, self.times = defaultdict(list), {}
        self.delayed, self.delayed_times = defaultdict(list), {}
        self.coverage, self.coverage_cache = defaultdict(list), {}
        for row in self.data.coverage:
            self.coverage[row.stream].append(row)
        for event in self.data.events:
            joins = []
            if event.customer_id is not None:
                joins.append(self.customers[event.customer_id])
            if event.product_id is not None:
                joins.append(self.products[event.product_id])
            if event.order_id is not None:
                joins.append(self.orders[event.order_id])
            known_at = max(event.available_at, *(row.available_at for row in joins)) if joins else event.available_at
            fact = KnownEvent(event, tuple(joins), known_at)
            self.events[event.event_id] = fact
            if event.customer_id is not None:
                self.histories[(event.customer_id, event.event_name)].append(fact)
            if known_at > event.occurred_at:
                self.delayed[CoverageStream(event.event_name.value)].append((event.occurred_at, known_at))
        for order in self.data.orders:
            known_at = max(order.available_at, self.customers[order.customer_id].available_at) if order.customer_id else order.available_at
            if known_at > order.created_at:
                self.delayed[CoverageStream.ORDERS].append((order.created_at, known_at))
        for customer in self.data.customers:
            if customer.available_at > customer.first_seen_at:
                self.delayed[CoverageStream.CUSTOMERS].append((customer.first_seen_at, customer.available_at))
        for key, rows in self.histories.items():
            rows.sort(key=lambda f: (f.event.occurred_at, f.event.event_id))
            self.times[key] = [f.event.occurred_at for f in rows]
        for stream, rows in self.delayed.items():
            rows.sort()
            self.delayed_times[stream] = [r[0] for r in rows]

    def window(self, customer: str, name: EventName, start: datetime, end: datetime, cutoff: datetime, *, left_open: bool = False) -> tuple[KnownEvent, ...]:
        key = (customer, name)
        stamps = self.times.get(key, ())
        left = bisect_right(stamps, start) if left_open else bisect_left(stamps, start)
        right = bisect_right(stamps, end)
        return tuple(f for f in self.histories[key][left:right] if f.knowable(cutoff))

    def coverage_failures(self, streams, start: datetime, end: datetime, cutoff: datetime) -> tuple[CoverageFailure, ...]:
        key = (tuple(streams), start, end, cutoff)
        if key not in self.coverage_cache:
            failures = []
            for stream in streams:
                assessment = assess_coverage(self.data.manifest, self.coverage[stream], stream, start, end, known_by=cutoff)
                stamps = self.delayed_times.get(stream, ())
                left, right = bisect_left(stamps, start), bisect_right(stamps, end)
                late = any(known_at > cutoff for _, known_at in self.delayed[stream][left:right])
                if late:
                    failures.append(CoverageFailure(stream=stream, state=CoverageState.UNAVAILABLE, has_gaps=True, reason="fact_or_join_unavailable"))
                elif not assessment.is_complete:
                    failures.append(CoverageFailure(stream=stream, state=assessment.state, has_gaps=assessment.has_gaps, reason="source_coverage"))
            self.coverage_cache[key] = tuple(failures)
        return self.coverage_cache[key]


def build_features(index: LeadIndex, customer_id: str, observation_time: datetime) -> FeatureResult:
    at = utc_instant(observation_time)
    if at > index.data.manifest.extracted_at:
        raise ValueError("Feature observation time exceeds the source freeze")
    customer = index.customers.get(customer_id)
    if customer is None or not is_knowable(customer, at):
        return FeatureResult(eligibility=Eligibility.NOT_KNOWN, reason="customer_not_known_at_observation")
    start = at - DAY * 60
    failures = index.coverage_failures(HISTORY_STREAMS, start, at, at)
    if failures:
        return FeatureResult(eligibility=Eligibility.INSUFFICIENT_DATA, reason="historical_coverage_or_availability", failed_coverage=failures)
    histories = {name: index.window(customer_id, name, start, at, at) for name in FEATURE_EVENTS}
    purchases = histories[EventName.PURCHASE_COMPLETED]
    if not purchases:
        return FeatureResult(eligibility=Eligibility.OUT_OF_SCOPE, reason="no_known_completed_purchase_in_60d")
    values = {}
    for days in (7, 30, 60):
        left = at - DAY * days
        recent = {name: tuple(f.event for f in rows if f.event.occurred_at >= left) for name, rows in histories.items()}
        views, adds, removes = (recent[n] for n in BEHAVIOR)
        values.update({
            f"purchase_count_{days}d": len({e.order_id for e in recent[EventName.PURCHASE_COMPLETED]}),
            f"session_count_{days}d": len({e.session_id for name in BEHAVIOR for e in recent[name]}),
            f"product_view_count_{days}d": len(views),
            f"distinct_products_viewed_{days}d": len({e.product_id for e in views}),
            f"cart_add_count_{days}d": len(adds), f"cart_add_quantity_{days}d": sum(e.quantity for e in adds),
            f"cart_remove_count_{days}d": len(removes), f"cart_remove_quantity_{days}d": sum(e.quantity for e in removes),
        })
    adds = histories[EventName.CART_ITEM_ADDED]
    values.update(purchase_recency_days=elapsed_days(at - purchases[-1].event.occurred_at), days_since_last_cart_add=elapsed_days(at - adds[-1].event.occurred_at) if adds else None, no_cart_add_60d=not adds, purchase_frequency_ratio_30d_60d=quotient(values["purchase_count_30d"], values["purchase_count_60d"]))
    used = sorted((f for rows in histories.values() for f in rows), key=lambda f: f.event.event_id)
    evidence = FeatureEvidence(
        event_ids=tuple(f.event.event_id for f in used),
        order_ids=tuple(sorted({f.event.order_id for f in used if f.event.order_id})),
        product_ids=tuple(sorted({f.event.product_id for f in used if f.event.product_id})),
        maximum_fact_time=max(f.event.occurred_at for f in used),
        maximum_available_at=max(customer.available_at, *(f.known_at for f in used)),
    )
    return FeatureResult(eligibility=Eligibility.ELIGIBLE, features=Features(**values), evidence=evidence)
