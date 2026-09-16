"""Aggregate development QA, not a training feature/label dataset builder."""

from bisect import bisect_left, bisect_right
from collections import Counter, defaultdict
from fractions import Fraction
import logging
import math
import statistics
from time import perf_counter

from medsense_ai.sales_analytics import AnalyticsStatus, FunnelRequest, analyze_funnel
from .. import CoverageStream, SalesDataset, assess_coverage, is_knowable, validate_dataset
from .config import DAY, TICK, SyntheticConfig
from .generator import validation_context

logger = logging.getLogger(__name__)
WARNING = "Synthetic development data only; these results do not validate real pharmacy/customer behavior."
LIMITATIONS = [
    WARNING,
    "One simulated year with designed non-clinical weekday/drift effects cannot establish annual seasonality.",
    "Prices, behavior and replenishment parameters are engineering assumptions, not market estimates.",
    "Stock constrains observed sales; unmet simulated opportunities are diagnostics, not observed demand labels.",
    "Readiness is an aggregate QA preview at weekly UTC cutoffs using the export as label cutoff; it is not a training split or feature/label artifact.",
    "Overlapping weekly outcomes are correlated. Anonymous views remain unattributed to customers.",
    "Coverage certifies weekly checkpoints and the final export, not every arbitrary historical intraday cutoff.",
    "Generator config, seed, aggregate latent audits, IDs and all QA outcomes are excluded from future feature inputs.",
    "Partner identity, session, fulfillment/payment and coverage mappings still require thin adapters.",
]


def distribution(values):
    values = sorted(values)
    if not values:
        return dict(n=0, min=None, median=None, p90=None, max=None, mean=None)
    return dict(n=len(values), min=values[0], median=statistics.median(values), p90=values[math.ceil(.9 * len(values)) - 1], max=values[-1], mean=statistics.fmean(values))


def leakage_audit(data: SalesDataset) -> dict:
    envelope = {"dataset_id", "source_record_ref", "available_at"}
    allowed = {
        "customers": {"customer_id", "first_seen_at"},
        "products": {"product_id", "selling_unit", "merchandising_group"},
        "events": {"event_id", "event_name", "occurred_at", "customer_id", "session_id", "cart_id", "product_id", "order_id", "quantity"},
        "orders": {"order_id", "customer_id", "created_at", "session_id", "cart_id", "currency", "item_subtotal_minor"},
        "order_items": {"order_item_id", "order_id", "product_id", "quantity", "line_subtotal_minor"},
        "inventory_movements": {"movement_id", "product_id", "occurred_at", "movement_kind", "on_hand_delta", "reserved_delta", "order_item_id", "trigger_event_id"},
    }
    schemas = {}
    for name, fields in allowed.items():
        for row in getattr(data, name):
            if set(type(row).model_fields) != fields | envelope:
                raise ValueError(f"Canonical feature-input boundary changed: {name}")
        schemas[name] = sorted(fields | envelope)
    if data.manifest.data_origin != "synthetic_development":
        raise ValueError("Generator QA refuses to represent non-synthetic data as its output")
    return dict(passed=True, record_field_allowlist=schemas, provenance_only_fields=["generation_seed", "generation_config_hash", "producer_version", "dataset_id", "source_record_ref"], note="Canonical schema has no hidden state, future-target columns or lead scores. Future features still require a separate positive allowlist and point-in-time joins.")


def readiness_preview(data: SalesDataset, config: SyntheticConfig) -> dict:
    """Count weekly outcome categories; never return customer rows or label vectors."""
    orders = {o.order_id: o for o in data.orders}
    completions = defaultdict(list)
    for event in data.events:
        if event.event_name == "purchase_completed" and event.customer_id:
            completions[event.customer_id].append(event)
    times = {}
    for customer, events in completions.items():
        events.sort(key=lambda e: (e.occurred_at, e.event_id))
        times[customer] = [e.occurred_at for e in events]
    coverage = defaultdict(list)
    for row in data.coverage:
        coverage[row.stream].append(row)
    history_streams = (CoverageStream.CUSTOMERS, CoverageStream.PRODUCTS, CoverageStream.ORDERS, CoverageStream.PRODUCT_VIEWED, CoverageStream.CART_ITEM_ADDED, CoverageStream.CART_ITEM_REMOVED, CoverageStream.ORDER_CREATED, CoverageStream.PURCHASE_COMPLETED)
    outcome_streams = (CoverageStream.CUSTOMERS, CoverageStream.ORDERS, CoverageStream.ORDER_CREATED, CoverageStream.PURCHASE_COMPLETED)
    customers = {c.customer_id: c for c in data.customers}
    products = {p.product_id: p for p in data.products}
    # Usually empty in the clean stream. Index only records whose join-complete
    # availability lags the fact; do not repeatedly scan all events per Monday.
    delayed_facts = defaultdict(list)
    for event in data.events:
        availability = [event.available_at]
        if event.customer_id:
            availability.append(customers[event.customer_id].available_at)
        if event.product_id:
            availability.append(products[event.product_id].available_at)
        if event.order_id:
            availability.append(orders[event.order_id].available_at)
        known = max(availability)
        if known > event.occurred_at:
            delayed_facts[CoverageStream(event.event_name.value)].append((event.occurred_at, known))
    for order in data.orders:
        known = max(order.available_at, customers[order.customer_id].available_at) if order.customer_id else order.available_at
        if known > order.created_at:
            delayed_facts[CoverageStream.ORDERS].append((order.created_at, known))

    def complete(streams, start, end, cutoff):
        return all(
            assess_coverage(data.manifest, coverage[s], s, start, end, known_by=cutoff).is_complete
            and not any(start <= occurred <= end and available > cutoff for occurred, available in delayed_facts[s])
            for s in streams
        )

    totals = Counter({key: 0 for key in ("known_customer_snapshots", "eligible_mature", "positives", "negatives", "out_of_scope", "insufficient_data", "immature")})
    weekly = []
    at = config.start
    while at.weekday() != 0:
        at += DAY
    freeze = data.manifest.extracted_at
    while at < config.end:
        horizon, start = at + DAY * 30, at - DAY * 60
        good_history = complete(history_streams, start, at, at)
        mature = horizon <= freeze
        good_future = mature and complete(outcome_streams, at + TICK, horizon, freeze)
        counts = Counter({key: 0 for key in totals})
        for customer in data.customers:
            if not is_knowable(customer, at):
                continue
            counts["known_customer_snapshots"] += 1
            if not good_history:
                counts["insufficient_data"] += 1
                continue
            events = completions[customer.customer_id]
            stamps = times.get(customer.customer_id, [])
            past = events[bisect_left(stamps, start):bisect_right(stamps, at)]
            if not any(is_knowable(e, at) and is_knowable(orders[e.order_id], at) for e in past):
                counts["out_of_scope"] += 1
                continue
            if not mature:
                counts["immature"] += 1
                continue
            if not good_future:
                counts["insufficient_data"] += 1
                continue
            future = events[bisect_right(stamps, at):bisect_right(stamps, horizon)]
            positive = any(at < orders[e.order_id].created_at <= horizon and is_knowable(e, freeze) and is_knowable(orders[e.order_id], freeze) for e in future)
            counts["eligible_mature"] += 1
            counts["positives" if positive else "negatives"] += 1
        totals.update(counts)
        weekly.append({"observation_time": at.isoformat(), **counts, "prevalence": counts["positives"] / counts["eligible_mature"] if counts["eligible_mature"] else None})
        at += DAY * 7
    return {"target_version": "repeat_purchase_30d_v1", "lookback_days": 60, "horizon_days": 30, "label_knowledge_cutoff": freeze.isoformat(), "qa_only_no_example_rows": True, **totals, "prevalence": totals["positives"] / totals["eligible_mature"] if totals["eligible_mature"] else None, "weekly": weekly}


def inventory_summary(data):
    balances, previous, durations, episodes = {}, {}, Counter(), Counter()
    minima = dict(on_hand=0, reserved=0, available=0)
    # Existing validation already checks atomic conservation and item/trigger
    # matching. This pass derives descriptive balances and stockout durations.
    for row in sorted(data.inventory_movements, key=lambda r: (r.occurred_at, r.movement_id)):
        key = row.product_id
        hand, reserved = balances.get(key, (0, 0))
        if key in previous and hand - reserved == 0:
            durations[key] += (row.occurred_at - previous[key]).total_seconds()
        before = hand - reserved
        hand, reserved = hand + row.on_hand_delta, reserved + row.reserved_delta
        if before > 0 and hand - reserved == 0:
            episodes[key] += 1
        balances[key], previous[key] = (hand, reserved), row.occurred_at
        for name, value in (("on_hand", hand), ("reserved", reserved), ("available", hand - reserved)):
            minima[name] = min(minima[name], value)
    for key, (hand, reserved) in balances.items():
        if hand - reserved == 0:
            durations[key] += (data.manifest.extracted_at - previous[key]).total_seconds()
    exposure = sum((data.manifest.extracted_at - p.available_at).total_seconds() for p in data.products)
    return dict(conservation_passed=True, negative_state_observations=0, minimum_balances=minima, products_with_stockouts=sum(value > 0 for value in durations.values()), stockout_episodes=sum(episodes.values()), stockout_fraction_of_product_time=sum(durations.values()) / exposure if exposure else None, final_balances={key: dict(on_hand=h, reserved=r, available=h-r, stockout_seconds=durations[key]) for key, (h, r) in sorted(balances.items())})


def build_qa(data: SalesDataset | dict, config: SyntheticConfig, generator_audit: dict | None = None) -> tuple[dict, dict]:
    begin = perf_counter()
    validation = validate_dataset(data, context=validation_context(config))
    if not validation.is_valid:
        logger.error("Synthetic QA rejected input: %s", sorted({i.code.value for i in validation.issues}))
        raise ValueError("QA requires complete canonical, cart and inventory validation")
    data = validation.validated_dataset
    if data.manifest.generation_config_hash != config.sha256 or data.manifest.dataset_id != config.dataset_id:
        raise ValueError("QA config does not match the canonical manifest")
    timing = {"qa_validation_seconds": perf_counter() - begin}
    begin = perf_counter()
    funnel = analyze_funnel(data, FunnelRequest(report_start=config.start, report_end=config.end, knowledge_cutoff=data.manifest.extracted_at, session_history_start=config.start))
    if funnel.status == AnalyticsStatus.INVALID_INPUT:
        raise ValueError("Existing funnel_v1 rejected generated canonical data")
    counts = [s.stage_count for s in funnel.stages]
    if all(n is not None for n in counts):
        if counts != sorted(counts, reverse=True):
            raise ValueError("Existing funnel returned non-nested counts")
        for left, right in zip(funnel.stages, funnel.stages[1:]):
            a, b = left.adjacent_dropoff_rate, right.adjacent_conversion_rate
            if a.value is not None and b.value is not None:
                if Fraction(a.numerator, a.denominator) + Fraction(b.numerator, b.denominator) != 1:
                    raise ValueError("Funnel transition fractions do not reconcile")
    funnel_summary = funnel.model_dump(mode="json", exclude={"sessions", "coverage"})
    funnel_summary["coverage"] = {"cohort_discovery": funnel.coverage.cohort_discovery.model_dump(mode="json") if funnel.coverage.cohort_discovery else None, "failed_interval_checks": len(funnel.coverage.failed_session_checks)}
    timing["funnel_qa_seconds"] = perf_counter() - begin
    begin = perf_counter()
    readiness = readiness_preview(data, config)
    timing["readiness_seconds"] = perf_counter() - begin
    inventory = inventory_summary(data)
    event_counts = Counter(e.event_name.value for e in data.events)
    completed_orders = {e.order_id for e in data.events if e.event_name == "purchase_completed"}
    cancelled_orders = {e.order_id for e in data.events if e.event_name == "order_cancelled"}
    customer_orders, customer_completions, latest = Counter(), Counter(), {}
    visits, view_counts, sales = defaultdict(set), Counter(), Counter()
    sessions, carts = set(), set()
    monthly = defaultdict(Counter)
    for event in data.events:
        monthly[event.occurred_at.strftime("%Y-%m")][event.event_name.value] += 1
        if event.event_name in ("product_viewed", "cart_item_added", "cart_item_removed"):
            sessions.add(event.session_id)
            if event.customer_id:
                visits[event.customer_id].add(event.session_id)
        if event.cart_id:
            carts.add(event.cart_id)
        if event.event_name == "product_viewed":
            view_counts[event.product_id] += 1
        if event.event_name == "purchase_completed" and event.customer_id:
            customer_completions[event.customer_id] += 1
            latest[event.customer_id] = max(latest.get(event.customer_id, event.occurred_at), event.occurred_at)
    for order in data.orders:
        customer_orders[order.customer_id] += 1
    for item in data.order_items:
        if item.order_id in completed_orders:
            sales[item.product_id] += item.quantity
    customer_counts = [customer_orders[c.customer_id] for c in data.customers]
    quantities = [sales[p.product_id] for p in data.products]
    delayed = [e for e in data.events if e.available_at > e.occurred_at]
    eligible_delay_events = sum(e.event_name in ("product_viewed", "cart_item_added") for e in data.events)
    report = {
        "warning": WARNING, "qa_passed": True, "generator_version": config.generator_version,
        "data_origin": data.manifest.data_origin.value, "dataset_id": config.dataset_id, "master_seed": config.master_seed, "config_sha256": config.sha256,
        "counts": dict(customers=len(data.customers), products=len(data.products), sessions=len(sessions), carts=len(carts), commerce_events=len(data.events), orders=len(data.orders), order_items=len(data.order_items), inventory_movements=len(data.inventory_movements)),
        "event_distribution": {name: event_counts[name] for name in ("product_viewed", "cart_item_added", "cart_item_removed", "order_created", "purchase_completed", "order_cancelled")},
        "order_outcomes": dict(completed=len(completed_orders), cancelled=len(cancelled_orders), pending=len(data.orders) - len(completed_orders) - len(cancelled_orders)),
        "relationships": dict(canonical_validation="passed", cart_replay="passed", item_amount_reconciliation="passed", unexpected_orphans=0, lifecycle_conflicts=0, identical_retransmissions=validation.identical_duplicate_count),
        "inventory": inventory, "funnel_v1": funnel_summary, "lead_readiness": readiness,
        "temporal": dict(start_inclusive=config.start.isoformat(), end_exclusive=config.end.isoformat(), extracted_at=data.manifest.extracted_at.isoformat(), first_event_at=min((e.occurred_at for e in data.events), default=None).isoformat() if data.events else None, last_event_at=max((e.occurred_at for e in data.events), default=None).isoformat() if data.events else None, delayed_event_count=len(delayed), delayed_fraction_all_events=len(delayed)/len(data.events) if data.events else None, delayed_fraction_selected_streams=len(delayed)/eligible_delay_events if eligible_delay_events else None, coverage_intervals=len(data.coverage), coverage_status_counts=dict(Counter(c.coverage_status.value for c in data.coverage)), timestamp_order_passed=True),
        "customer_behavior": dict(zero_orders=sum(n == 0 for n in customer_counts), one_order=sum(n == 1 for n in customer_counts), repeat_completed_customers=sum(n >= 2 for n in customer_completions.values()), customers_with_completion=len(customer_completions), sessions_per_attributed_customer=distribution([len(visits[c.customer_id]) for c in data.customers]), completed_frequency=distribution([customer_completions[c.customer_id] for c in data.customers]), completion_recency_days=distribution([(data.manifest.extracted_at - at).total_seconds()/86400 for at in latest.values()])),
        "product_behavior": dict(views_per_product=distribution([view_counts[p.product_id] for p in data.products]), completed_units_per_product=distribution(quantities), zero_selling_products=sum(n == 0 for n in quantities), low_selling_products_1_to_5_units=sum(0 < n <= 5 for n in quantities), top_decile_sales_share=sum(sorted(quantities, reverse=True)[:math.ceil(.1 * len(quantities))]) / sum(quantities) if sum(quantities) else None),
        "order_subtotal_minor": distribution([o.item_subtotal_minor for o in data.orders]), "monthly_event_distribution": dict(sorted(monthly.items())),
        "leakage_audit": leakage_audit(data), "known_limitations": LIMITATIONS,
    }
    if generator_audit is not None:
        report["isolated_generator_aggregate_audit"] = generator_audit
    report["synthetic_process_sanity"] = dict(
        nonuniform_customer_activity=len({len(visits[c.customer_id]) for c in data.customers}) > 1,
        nonuniform_product_views=len({view_counts[p.product_id] for p in data.products}) > 1,
        nonuniform_order_values=len({o.item_subtotal_minor for o in data.orders}) > 1,
        repeat_exists_not_universal=0 < report["customer_behavior"]["repeat_completed_customers"] < len(data.customers),
        cancellations_not_dominant=0 < len(cancelled_orders) < len(data.orders) / 2,
        stockouts_exist_not_dominant=0 < (inventory["stockout_fraction_of_product_time"] or 0) < .5,
        latent_group_conversion_overlap=all(v["purchasers"] > 0 and v["non_purchasers"] > 0 for v in generator_audit["behavior_groups"].values()) if generator_audit else None,
    )
    return report, timing


def require_default_acceptance(report: dict) -> None:
    counts = [row["stage_count"] for row in report["funnel_v1"]["stages"]]
    lead, orders = report["lead_readiness"], report["order_outcomes"]
    if not (all(n is not None and n > 0 for n in counts) and all(a > b for a, b in zip(counts, counts[1:])) and orders["completed"] > 0 and orders["cancelled"] > 0 and lead["positives"] > 0 and lead["negatives"] > 0 and report["customer_behavior"]["repeat_completed_customers"] > 0):
        raise ValueError("Default generation lacks required observed funnel/outcome/readiness diversity")
