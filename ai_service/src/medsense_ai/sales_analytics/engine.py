"""Deterministic sales_analytics_v1 over validated sales_contract_v1 records."""

from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Context, Decimal, ROUND_HALF_EVEN, localcontext
import logging
from math import ceil

from medsense_ai.lead_scoring.model.contracts import LeadScoringResult, ScoringStatus
from medsense_ai.sales_data import CoverageStream, EventName, SalesDataset, ValidationContext, assess_coverage, is_knowable, validate_dataset

from .contracts import AnalyticsStatus, FunnelRequest
from .funnel import analyze_funnel
from .v1_contracts import (
    BucketGranularity, CountMetric, CurrencyAmount, FunnelSummary, LeadCohortSummary,
    LeadRank, MetricStatus, PeriodSalesSummary, ProductInventoryContext,
    ProductPerformance, ProductRankingReport, RatioValue, RepeatCustomerReport,
    SalesAnalyticsReport, SalesAnalyticsRequest, SalesInsight, TrendBucket, TrendReport,
)

logger = logging.getLogger(__name__)


def _count(value: int | None, status=MetricStatus.OBSERVED, reason=None):
    observed = status == MetricStatus.OBSERVED
    return CountMetric(status=status, value=value if observed else None, reason=None if observed else reason)


def _ratio(numerator: int, denominator: int) -> RatioValue:
    if denominator == 0:
        return RatioValue(status=MetricStatus.NOT_APPLICABLE, numerator=0, denominator=0)
    with localcontext(Context(prec=28, rounding=ROUND_HALF_EVEN)):
        value = Decimal(numerator) / Decimal(denominator)
    return RatioValue(status=MetricStatus.OBSERVED, numerator=numerator, denominator=denominator, value=value)


def _currency_totals(orders, *, average=False, currencies=()):
    grouped = {currency: [] for currency in currencies}
    for order in orders:
        grouped.setdefault(order.currency, []).append(order.item_subtotal_minor)
    rows = []
    for currency in sorted(grouped):
        values = grouped[currency]
        total = sum(values)
        if average:
            if not values:
                rows.append(CurrencyAmount(currency=currency, status=MetricStatus.NOT_APPLICABLE,
                                           numerator_minor=0, denominator=0, reason="No completed orders"))
                continue
            with localcontext(Context(prec=28, rounding=ROUND_HALF_EVEN)):
                mean = Decimal(total) / Decimal(len(values))
            rows.append(CurrencyAmount(currency=currency, status=MetricStatus.OBSERVED, numerator_minor=total, denominator=len(values), average_minor=mean))
        else:
            rows.append(CurrencyAmount(currency=currency, status=MetricStatus.OBSERVED, amount_minor=total))
    return tuple(rows)


def _coverage(data, request, streams, start, end, blocked=()):
    if end <= start:
        return True
    closed_end = end - request.timestamp_resolution
    if any(start <= time < end for time in blocked):
        return False
    for stream in streams:
        try:
            result = assess_coverage(data.manifest, data.coverage, stream, start, closed_end,
                                     known_by=request.knowledge_cutoff, resolution=request.timestamp_resolution)
        except ValueError:
            return False
        if not result.is_complete:
            return False
    return True


def _next_bucket(value: datetime, granularity: BucketGranularity) -> datetime:
    if granularity == BucketGranularity.DAY:
        return value + timedelta(days=1)
    if granularity == BucketGranularity.WEEK:
        return value + timedelta(days=7)
    year, month = value.year + (value.month == 12), 1 if value.month == 12 else value.month + 1
    return value.replace(year=year, month=month, day=1)


def _lead_summary(results, request):
    if results is None:
        return LeadCohortSummary(status=MetricStatus.NOT_APPLICABLE, reason="No supplied LeadScoringResult cohort")
    try:
        rows = tuple(LeadScoringResult.model_validate(row) for row in results)
    except Exception as exc:
        logger.warning("Lead cohort validation failed: %s", type(exc).__name__)
        return LeadCohortSummary(status=MetricStatus.INVALID_INPUT, reason="Invalid lead scoring result")
    if not rows:
        return LeadCohortSummary(status=MetricStatus.NOT_APPLICABLE, reason="Supplied cohort is empty")
    signatures = {(r.source_namespace, r.model_version, r.feature_version, r.target_version, r.observation_time, r.synthetic_development_notice) for r in rows}
    if len(signatures) != 1 or any(r.source_namespace != request.source_namespace or r.customer_id is None or r.observation_time is None for r in rows):
        return LeadCohortSummary(status=MetricStatus.INVALID_INPUT, reason="Mixed or incomplete lead cohort identity/version/T")
    counts = Counter(r.status.value for r in rows)
    scored = sorted((r for r in rows if r.status == ScoringStatus.SCORED), key=lambda r: (-r.lead_score, r.customer_id))
    decile_size = ceil(len(scored) / 10) if scored else 1
    ranks = tuple(LeadRank(rank=i, customer_id=r.customer_id, lead_score=r.lead_score,
                           decile=min(10, ceil(i / decile_size))) for i, r in enumerate(scored, 1)) if scored else ()
    sig = rows[0]
    values = [r.lead_score for r in scored]
    return LeadCohortSummary(
        status=MetricStatus.OBSERVED if scored else MetricStatus.NOT_APPLICABLE,
        status_counts=dict(sorted(counts.items())), scored_customer_count=len(scored),
        minimum_score=min(values) if values else None, maximum_score=max(values) if values else None,
        mean_score=sum(values) / len(values) if values else None, ranking=ranks,
        model_version=sig.model_version, feature_version=sig.feature_version,
        target_version=sig.target_version, observation_time=sig.observation_time,
        synthetic_development_notice=sig.synthetic_development_notice,
        reason=None if scored else "No SCORED results in compatible cohort",
    )


def analyze_sales(value: SalesDataset | dict, request: SalesAnalyticsRequest | dict, *,
                  funnel_request: FunnelRequest | dict | None = None,
                  lead_results=None) -> SalesAnalyticsReport:
    """Build independently gated descriptive sections; never fit models or infer actions."""
    request = SalesAnalyticsRequest.model_validate(request)
    parsed = SalesDataset.model_validate(value)
    # Inventory is an optional, independently gated profile. Validate the sales
    # profile without it, then require full canonical inventory replay only for
    # inventory outputs. This keeps missing/bad stock history from erasing valid sales.
    inventory_validation = validate_dataset(parsed, context=ValidationContext(
        replay_carts=False, require_inventory=bool(parsed.inventory_movements),
        coverage_resolution=request.timestamp_resolution,
    ))
    if inventory_validation.is_valid:
        data = inventory_validation.validated_dataset
    else:
        sales_only = SalesDataset(
            manifest=parsed.manifest, coverage=parsed.coverage, customers=parsed.customers,
            products=parsed.products, events=parsed.events, orders=parsed.orders,
            order_items=parsed.order_items, inventory_movements=(),
        )
        validation = validate_dataset(sales_only, context=ValidationContext(
            replay_carts=False, coverage_resolution=request.timestamp_resolution))
        if not validation.is_valid:
            raise ValueError("Sales analytics requires a valid canonical sales profile")
        data = validation.validated_dataset
    if (data.manifest.dataset_id, data.manifest.source_namespace) != (request.dataset_id, request.source_namespace):
        raise ValueError("Requested dataset/source scope does not match canonical manifest")
    if request.knowledge_cutoff > data.manifest.extracted_at:
        raise ValueError("Knowledge cutoff exceeds dataset freeze")

    all_orders = {o.order_id: o for o in data.orders}
    orders = {o.order_id: o for o in data.orders if is_knowable(o, request.knowledge_cutoff)}
    blocked_orders = tuple(o.created_at for o in data.orders if o.created_at <= request.knowledge_cutoff and not is_knowable(o, request.knowledge_cutoff))
    known_events = [e for e in data.events if is_knowable(e, request.knowledge_cutoff)]
    events = [e for e in known_events if e.order_id in orders]
    blocked_events = defaultdict(list)
    for e in data.events:
        if e.occurred_at <= request.knowledge_cutoff and not is_knowable(e, request.knowledge_cutoff):
            blocked_events[CoverageStream(e.event_name.value)].append(e.occurred_at)
    terminals = {e.order_id: e for e in events if e.event_name in (EventName.PURCHASE_COMPLETED, EventName.ORDER_CANCELLED)}
    completed_events = [e for e in terminals.values() if e.event_name == EventName.PURCHASE_COMPLETED and request.report_start <= e.occurred_at < request.report_end]
    cancelled_events = [e for e in terminals.values() if e.event_name == EventName.ORDER_CANCELLED and request.report_start <= e.occurred_at < request.report_end]
    raw_completed = [e for e in known_events if e.event_name == EventName.PURCHASE_COMPLETED and request.report_start <= e.occurred_at < request.report_end]
    raw_cancelled = [e for e in known_events if e.event_name == EventName.ORDER_CANCELLED and request.report_start <= e.occurred_at < request.report_end]
    completed = [orders[e.order_id] for e in completed_events]
    completed_order_start = min((all_orders[e.order_id].created_at for e in raw_completed if e.order_id in all_orders), default=request.report_start)
    cancelled_order_start = min((all_orders[e.order_id].created_at for e in raw_cancelled if e.order_id in all_orders), default=request.report_start)
    count_ok = (
        len(completed_events) == len(raw_completed)
        and _coverage(data, request, (CoverageStream.PURCHASE_COMPLETED,), request.report_start, request.report_end,
                      tuple(blocked_events[CoverageStream.PURCHASE_COMPLETED]))
        and _coverage(data, request, (CoverageStream.ORDERS,), min(request.report_start, completed_order_start), request.report_end, blocked_orders)
    )
    cancel_ok = (
        len(cancelled_events) == len(raw_cancelled)
        and _coverage(data, request, (CoverageStream.ORDER_CANCELLED,), request.report_start, request.report_end,
                      tuple(blocked_events[CoverageStream.ORDER_CANCELLED]))
        and _coverage(data, request, (CoverageStream.ORDERS,), min(request.report_start, cancelled_order_start), request.report_end, blocked_orders)
    )
    item_ok = count_ok and _coverage(data, request, (CoverageStream.ORDER_ITEMS,), request.report_start, request.report_end)
    items_by_order = defaultdict(list)
    for item in data.order_items:
        parent = orders.get(item.order_id)
        if parent and is_knowable(item, request.knowledge_cutoff, order=parent):
            items_by_order[item.order_id].append(item)
    units = sum(item.quantity for order in completed for item in items_by_order[order.order_id])
    complete_money = count_ok and all(o.currency is not None and o.item_subtotal_minor is not None for o in completed)
    unavailable = MetricStatus.INSUFFICIENT_COVERAGE
    reason = "Required canonical stream coverage/facts are incomplete"
    period = PeriodSalesSummary(
        status=MetricStatus.OBSERVED if count_ok and cancel_ok else unavailable,
        completed_order_count=_count(len(completed), MetricStatus.OBSERVED if count_ok else unavailable, reason),
        cancelled_order_count=_count(len(cancelled_events), MetricStatus.OBSERVED if cancel_ok else unavailable, reason),
        completed_units=_count(units, MetricStatus.OBSERVED if item_ok else unavailable, reason),
        identified_completed_order_count=_count(sum(o.customer_id is not None for o in completed), MetricStatus.OBSERVED if count_ok else unavailable, reason),
        anonymous_completed_order_count=_count(sum(o.customer_id is None for o in completed), MetricStatus.OBSERVED if count_ok else unavailable, reason),
        monetary_status=MetricStatus.OBSERVED if complete_money else unavailable,
        completed_merchandise_subtotals=_currency_totals(completed, currencies=data.manifest.currency_minor_units) if complete_money else (),
        average_completed_order_subtotals=_currency_totals(completed, average=True, currencies=data.manifest.currency_minor_units) if complete_money else (),
    )

    buckets = []
    cursor = request.report_start
    while cursor < request.report_end:
        end = min(_next_bucket(cursor, request.bucket_granularity), request.report_end)
        ce = [e for e in completed_events if cursor <= e.occurred_at < end]
        xe = [e for e in cancelled_events if cursor <= e.occurred_at < end]
        co = [orders[e.order_id] for e in ce]
        buckets.append(TrendBucket(
            bucket_start=cursor, bucket_end=end,
            completed_order_count=_count(len(ce), MetricStatus.OBSERVED if count_ok else unavailable, reason),
            cancelled_order_count=_count(len(xe), MetricStatus.OBSERVED if cancel_ok else unavailable, reason),
            completed_units=_count(sum(i.quantity for o in co for i in items_by_order[o.order_id]), MetricStatus.OBSERVED if item_ok else unavailable, reason),
            completed_merchandise_subtotals=_currency_totals(co, currencies=data.manifest.currency_minor_units) if complete_money else (),
        ))
        cursor = end
    trends = TrendReport(status=MetricStatus.OBSERVED if count_ok and cancel_ok else unavailable,
                         monetary_status=MetricStatus.OBSERVED if complete_money else unavailable,
                         granularity=request.bucket_granularity, buckets=tuple(buckets))

    products_ok = item_ok and _coverage(data, request, (CoverageStream.PRODUCTS,), request.report_start, request.report_end)
    ranking_rows = []
    if products_ok:
        aggregates = {p.product_id: [0, set(), defaultdict(int)] for p in data.products if is_knowable(p, request.knowledge_cutoff)}
        for order in completed:
            for item in items_by_order[order.order_id]:
                if item.product_id in aggregates:
                    row = aggregates[item.product_id]
                    row[0] += item.quantity; row[1].add(order.order_id); row[2][order.currency] += item.line_subtotal_minor
        ordered = sorted(aggregates.items(), key=lambda x: (-x[1][0], -len(x[1][1]), x[0]))
        for rank, (pid, row) in enumerate(ordered, 1):
            money = tuple(CurrencyAmount(currency=c, status=MetricStatus.OBSERVED, amount_minor=row[2].get(c, 0))
                          for c in sorted(data.manifest.currency_minor_units)) if complete_money else ()
            ranking_rows.append(ProductPerformance(product_id=pid, rank=rank, completed_units=row[0], completed_order_count=len(row[1]), completed_line_subtotals=money))
    n = request.ranking_limit_n
    if n is not None and products_ok and 2 * n > len(ranking_rows):
        raise ValueError("ranking_limit_n would make high/low seller sets overlap")
    rankings = ProductRankingReport(
        status=MetricStatus.OBSERVED if products_ok else unavailable,
        monetary_status=MetricStatus.OBSERVED if products_ok and complete_money else unavailable,
        products=tuple(ranking_rows),
        high_seller_product_ids=tuple(r.product_id for r in ranking_rows[:n]) if n else (),
        low_seller_product_ids=tuple(r.product_id for r in reversed(ranking_rows[-n:])) if n else (),
        reason=None if products_ok else reason,
    )

    repeat_ok = count_ok and data.manifest.identity_policy_version is not None and _coverage(
        data, request, (CoverageStream.CUSTOMERS, CoverageStream.ORDERS, CoverageStream.PURCHASE_COMPLETED),
        request.customer_history_start, request.report_end)
    history_completed = sorted((e for e in terminals.values() if e.event_name == EventName.PURCHASE_COMPLETED and
                                request.customer_history_start <= e.occurred_at < request.report_end), key=lambda e: (e.occurred_at, e.order_id))
    seen, repeat_ids = set(), set()
    by_time = defaultdict(list)
    for event in history_completed:
        by_time[event.occurred_at].append(event)
    for at in sorted(by_time):
        identified_at = [orders[e.order_id] for e in by_time[at] if orders[e.order_id].customer_id is not None]
        for order in identified_at:
            if order.customer_id in seen and request.report_start <= at:
                repeat_ids.add(order.order_id)
        seen.update(order.customer_id for order in identified_at)
    identified = [o for o in completed if o.customer_id is not None]
    repeats = [o for o in identified if o.order_id in repeat_ids]
    repeat = RepeatCustomerReport(
        status=MetricStatus.OBSERVED if repeat_ok else unavailable,
        identified_completed_order_count=_count(len(identified), MetricStatus.OBSERVED if repeat_ok else unavailable, reason),
        anonymous_completed_order_count=_count(len(completed)-len(identified), MetricStatus.OBSERVED if count_ok else unavailable, reason),
        repeat_completed_order_count=_count(len(repeats), MetricStatus.OBSERVED if repeat_ok else unavailable, reason),
        repeat_order_contribution=_ratio(len(repeats), len(identified)) if repeat_ok else RatioValue(status=unavailable),
        identified_completed_subtotals=_currency_totals(identified, currencies=data.manifest.currency_minor_units) if repeat_ok and complete_money else (),
        repeat_completed_subtotals=_currency_totals(repeats, currencies=data.manifest.currency_minor_units) if repeat_ok and complete_money else (),
        repeat_subtotal_contributions=tuple(
            CurrencyAmount(currency=c, status=MetricStatus.OBSERVED, numerator_minor=sum(o.item_subtotal_minor for o in repeats if o.currency == c),
                           denominator=sum(o.item_subtotal_minor for o in identified if o.currency == c),
                           average_minor=(Decimal(sum(o.item_subtotal_minor for o in repeats if o.currency == c)) / Decimal(sum(o.item_subtotal_minor for o in identified if o.currency == c))))
            for c in sorted({o.currency for o in identified}) if sum(o.item_subtotal_minor for o in identified if o.currency == c) > 0
        ) if repeat_ok and complete_money else (),
    )

    inventory = _inventory(data if inventory_validation.is_valid and data.inventory_movements else None, request, rankings)
    if funnel_request is None:
        funnel = FunnelSummary(status=MetricStatus.NOT_APPLICABLE, reason="No explicit FunnelRequest supplied")
    else:
        f = analyze_funnel(data, FunnelRequest.model_validate(funnel_request))
        fmap = {AnalyticsStatus.VALID: MetricStatus.OBSERVED, AnalyticsStatus.NOT_APPLICABLE: MetricStatus.NOT_APPLICABLE,
                AnalyticsStatus.INVALID_INPUT: MetricStatus.INVALID_INPUT}
        stages = {row.stage.value: row.stage_count for row in f.stages}
        transitions = tuple(("view_to_cart", "cart_to_order", "order_to_purchase"))
        funnel = FunnelSummary(
            status=fmap.get(f.status, MetricStatus.INSUFFICIENT_COVERAGE),
            stage_counts=stages,
            adjacent_conversion_rates={name: f.stages[i + 1].adjacent_conversion_rate.value for i, name in enumerate(transitions)},
            adjacent_dropoff_counts={name: f.stages[i].adjacent_dropoff_count for i, name in enumerate(transitions)},
            adjacent_dropoff_rates={name: f.stages[i].adjacent_dropoff_rate.value for i, name in enumerate(transitions)},
            overall_conversion=f.overall_purchase_conversion.value,
            largest_dropoff_transition=f.largest_dropoff_stage.value if f.largest_dropoff_stage else None,
            eligible_sessions=f.diagnostics.eligible_mature_sessions,
            immature_sessions=f.diagnostics.immature_sessions,
            coverage_unavailable_sessions=f.diagnostics.coverage_unavailable_sessions,
            unattributed_order_count=f.diagnostics.unattributed_orders,
            unattributed_reasons={row.reason.value: row.count for row in f.diagnostics.unattributed_reasons},
            coverage_evidence=f.coverage.model_dump(mode="json"),
        )
    lead = _lead_summary(lead_results, request)
    insights = _insights(request, rankings, inventory, funnel, repeat, lead)
    statuses = (period.status, trends.status, rankings.status, repeat.status)
    overall = MetricStatus.INVALID_INPUT if MetricStatus.INVALID_INPUT in statuses else (MetricStatus.OBSERVED if MetricStatus.OBSERVED in statuses else unavailable)
    return SalesAnalyticsReport(
        source_namespace=request.source_namespace, dataset_id=request.dataset_id, request=request, status=overall,
        period_sales=period, trends=trends, product_rankings=rankings, repeat_customers=repeat,
        inventory_context=inventory, funnel_summary=funnel, lead_cohort_summary=lead, insights=insights,
        limitations=("Describes observed completed sales; it is not unconstrained demand, profit, net revenue, or a forecast.",
                     "Stock context does not estimate lost demand or authorize a reorder quantity.",
                     "Lead scores are synthetic-development outputs, not validated real-customer probabilities or targeting policy."),
    )


def _inventory(data, request, rankings):
    if data is None:
        return tuple(ProductInventoryContext(product_id=r.product_id, status=MetricStatus.INSUFFICIENT_COVERAGE,
                                             reason="Inventory profile failed validation/replay") for r in rankings.products)
    movements = [m for m in data.inventory_movements if is_knowable(m, request.knowledge_cutoff)]
    if not movements:
        return tuple(ProductInventoryContext(product_id=r.product_id, status=MetricStatus.INSUFFICIENT_COVERAGE,
                                             reason="Inventory history unavailable") for r in rankings.products)
    opening = {m.product_id: m.occurred_at for m in movements if m.movement_kind.value == "opening_balance"}
    rows = []
    for product in rankings.products:
        origin = opening.get(product.product_id)
        ok = origin is not None and _coverage(data, request, (CoverageStream.INVENTORY_MOVEMENTS,), origin, request.report_end)
        if not ok:
            rows.append(ProductInventoryContext(product_id=product.product_id, status=MetricStatus.INSUFFICIENT_COVERAGE, reason="Complete replayable inventory history unavailable")); continue
        hand = reserved = 0
        start_stock = None
        stockout_start = None
        bounded, count, observed = [], 0, False
        grouped = defaultdict(list)
        for m in movements:
            if m.product_id == product.product_id and m.occurred_at < request.report_end:
                grouped[m.occurred_at].append(m)
        for at in sorted(grouped):
            before = hand - reserved
            hand += sum(m.on_hand_delta for m in grouped[at]); reserved += sum(m.reserved_delta for m in grouped[at])
            after = hand - reserved
            if at < request.report_start:
                continue
            if at == request.report_start and start_stock is None:
                start_stock = after
                if after == 0:
                    stockout_start = request.report_start; observed = True
                continue
            if start_stock is None:
                start_stock = before
                if before == 0:
                    stockout_start = request.report_start; observed = True
            if at < request.report_end:
                if before > 0 and after == 0:
                    stockout_start = at; count += 1; observed = True
                elif before == 0 and after > 0 and stockout_start is not None:
                    bounded.append((stockout_start, at)); stockout_start = None
        if start_stock is None:
            start_stock = hand - reserved
        end_stock = hand - reserved
        seconds = sum(int((end-start).total_seconds()) for start, end in bounded)
        rows.append(ProductInventoryContext(product_id=product.product_id, status=MetricStatus.OBSERVED,
                                            available_stock_at_start=start_stock, available_stock_at_end=end_stock,
                                            observed_stockout=observed or end_stock == 0, stockout_count=count,
                                            fully_bounded_stockout_seconds=seconds, stockout_boundaries=tuple(bounded)))
    return tuple(rows)


def _insights(request, rankings, inventory, funnel, repeat, lead):
    rows = []
    inv = {r.product_id: r for r in inventory}
    for pid in rankings.high_seller_product_ids:
        p = next(x for x in rankings.products if x.product_id == pid)
        rows.append(SalesInsight(rule_id="product_rank_high_observed_units", source_namespace=request.source_namespace,
            report_start=request.report_start, report_end=request.report_end, metric_references=(f"product:{pid}:completed_units",),
            underlying_values={"product_id": pid, "completed_units": p.completed_units}, coverage_status=MetricStatus.OBSERVED,
            limitation_code="observed_sales_not_forecast", text=f"Product {pid} ranked among the high sellers with {p.completed_units} observed completed units."))
    for pid in rankings.low_seller_product_ids:
        p, stock = next(x for x in rankings.products if x.product_id == pid), inv.get(pid)
        if stock and stock.status == MetricStatus.OBSERVED and stock.observed_stockout:
            rule, limitation, text = "product_rank_low_stock_constrained", "underlying_demand_not_inferred", "Low observed completed units occurred with constrained recorded availability; underlying demand cannot be inferred."
        elif stock and stock.status == MetricStatus.OBSERVED:
            rule, limitation, text = "product_rank_low_observed_units", "observed_sales_not_demand", "Low observed completed units with no recorded stockout in the covered inventory ledger."
        else:
            rule, limitation, text = "product_rank_low_stock_context_unavailable", "stock_context_unavailable", "Low observed completed units; stock availability effect is unavailable."
        rows.append(SalesInsight(rule_id=rule, source_namespace=request.source_namespace, report_start=request.report_start,
            report_end=request.report_end, metric_references=(f"product:{pid}:completed_units", f"product:{pid}:inventory"),
            underlying_values={"product_id": pid, "completed_units": p.completed_units}, coverage_status=MetricStatus.OBSERVED,
            limitation_code=limitation, text=text))
    if repeat.status == MetricStatus.OBSERVED:
        rows.append(SalesInsight(rule_id="repeat_contribution_observed", source_namespace=request.source_namespace,
            report_start=request.report_start, report_end=request.report_end, metric_references=("repeat_order_contribution",),
            underlying_values=repeat.repeat_order_contribution.model_dump(mode="json"), coverage_status=MetricStatus.OBSERVED,
            limitation_code="descriptive_identity_bound", text="Repeat-customer contribution was measured over identified completed orders with covered prior history."))
    if funnel.status == MetricStatus.OBSERVED and funnel.largest_dropoff_transition:
        rows.append(SalesInsight(rule_id="largest_funnel_dropoff_observed", source_namespace=request.source_namespace,
            report_start=request.report_start, report_end=request.report_end, metric_references=("funnel_v1.largest_dropoff_rate",),
            underlying_values={"transition": funnel.largest_dropoff_transition}, coverage_status=MetricStatus.OBSERVED,
            limitation_code="descriptive_not_causal", text=f"The largest observed funnel drop-off was {funnel.largest_dropoff_transition}; review the covered journey evidence."))
    if lead.status == MetricStatus.OBSERVED:
        rows.append(SalesInsight(rule_id="lead_cohort_distribution_observed", source_namespace=request.source_namespace,
            report_start=request.report_start, report_end=request.report_end, metric_references=("lead_cohort_summary",),
            underlying_values={"scored_customer_count": lead.scored_customer_count, "mean_score": lead.mean_score},
            coverage_status=MetricStatus.OBSERVED, limitation_code="synthetic_not_operational_policy",
            text="The supplied compatible lead-score cohort distribution was summarized; scores are synthetic-development outputs, not an operational targeting policy."))
    return tuple(sorted(rows, key=lambda row: (row.rule_id, str(row.underlying_values))))
