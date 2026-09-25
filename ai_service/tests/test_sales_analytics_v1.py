"""Focused structural and semantic tests for sales_analytics_v1."""

from datetime import timedelta
from decimal import Decimal

import pytest

from medsense_ai.lead_scoring.model.contracts import LeadScoringResult
from medsense_ai.sales_analytics import MetricStatus, SalesAnalyticsRequest, analyze_funnel, analyze_sales
from medsense_ai.sales_analytics.v1_contracts import CurrencyAmount, RatioValue
from medsense_ai.sales_data import CoverageStream, EventName, Product
from tests.sales_data_fixtures import START, FREEZE, changed, dataset, envelope, event


def request(data=None, **updates):
    data = data or dataset()
    values = dict(source_namespace=data.manifest.source_namespace, dataset_id=data.manifest.dataset_id,
                  report_start=START, report_end=START + timedelta(days=1), knowledge_cutoff=FREEZE,
                  customer_history_start=START, bucket_granularity="day")
    return SalesAnalyticsRequest(**{**values, **updates})


def test_completion_time_money_units_ranking_inventory_and_roundtrip():
    data = dataset()
    report = analyze_sales(data, request(data))
    assert report.analytics_version == "sales_analytics_v1"
    assert report.period_sales.completed_order_count.value == 1
    assert report.period_sales.cancelled_order_count.value == 0
    assert report.period_sales.completed_units.value == 2
    assert report.period_sales.completed_order_count.reason is None
    assert report.period_sales.completed_merchandise_subtotals[0].amount_minor == 500
    assert report.period_sales.average_completed_order_subtotals[0].average_minor == 500
    assert report.product_rankings.products[0].product_id == "product_001"
    assert report.inventory_context[0].available_stock_at_start == 6
    assert report.inventory_context[0].available_stock_at_end == 7
    assert type(report).model_validate_json(report.model_dump_json()) == report


def test_cancellation_recognized_at_terminal_time_and_not_as_sale():
    data = dataset(EventName.ORDER_CANCELLED)
    report = analyze_sales(data, request(data))
    assert report.period_sales.completed_order_count.value == 0
    assert report.period_sales.cancelled_order_count.value == 1
    assert report.period_sales.completed_units.value == 0
    assert report.period_sales.average_completed_order_subtotals[0].status == MetricStatus.NOT_APPLICABLE


def test_metric_contracts_reject_numbers_for_unavailable_results_and_inconsistent_math():
    with pytest.raises(ValueError, match="cannot carry numeric"):
        RatioValue(status=MetricStatus.INSUFFICIENT_COVERAGE, numerator=0, denominator=0)
    with pytest.raises(ValueError, match="must equal"):
        RatioValue(status=MetricStatus.OBSERVED, numerator=1, denominator=2, value=Decimal("0.6"))
    with pytest.raises(ValueError, match="cannot carry numeric"):
        CurrencyAmount(currency="USD", status=MetricStatus.INSUFFICIENT_COVERAGE, amount_minor=0)
    with pytest.raises(ValueError, match="must equal"):
        CurrencyAmount(currency="USD", status=MetricStatus.OBSERVED, numerator_minor=1,
                       denominator=2, average_minor=Decimal("0.6"))

    assert RatioValue(status=MetricStatus.NOT_APPLICABLE, numerator=0, denominator=0).value is None
    assert CurrencyAmount(currency="USD", status=MetricStatus.NOT_APPLICABLE,
                          numerator_minor=0, denominator=0).average_minor is None


def test_half_open_boundary_and_late_fact_fail_closed():
    data = dataset()
    terminal = next(e for e in data.events if e.event_name == EventName.PURCHASE_COMPLETED)
    boundary = changed(terminal, occurred_at=START + timedelta(days=1), available_at=START + timedelta(days=1))
    events = tuple(boundary if e.event_id == terminal.event_id else e for e in data.events)
    moved = changed(data, events=events, inventory_movements=())
    assert analyze_sales(moved, request(moved)).period_sales.completed_order_count.value == 0

    late = changed(terminal, available_at=FREEZE)
    late_data = changed(data, events=tuple(late if e.event_id == terminal.event_id else e for e in data.events), order_items=(), inventory_movements=())
    cutoff = terminal.occurred_at + timedelta(microseconds=1)
    # Coverage known later cannot be used at this historical cutoff.
    rows = tuple(changed(c, known_at=cutoff, interval_end=cutoff) for c in late_data.coverage)
    late_data = changed(late_data, coverage=rows, manifest=changed(late_data.manifest, extracted_at=FREEZE))
    report = analyze_sales(late_data, request(late_data, report_end=cutoff, knowledge_cutoff=cutoff))
    assert report.period_sales.completed_order_count.status == MetricStatus.INSUFFICIENT_COVERAGE


def test_late_parent_order_before_report_does_not_become_observed_zero():
    data = dataset()
    order = data.orders[0]
    terminal = next(e for e in data.events if e.event_name == EventName.PURCHASE_COMPLETED)
    cutoff = terminal.occurred_at + timedelta(microseconds=1)
    created_at = START - timedelta(minutes=1)
    late_order = changed(order, created_at=created_at, available_at=FREEZE)
    offsets = {
        EventName.PRODUCT_VIEWED: -4, EventName.CART_ITEM_ADDED: -3,
        EventName.CART_ITEM_REMOVED: -2, EventName.ORDER_CREATED: -1,
    }
    events = tuple(changed(e, occurred_at=START + timedelta(minutes=offsets[e.event_name]),
                           available_at=START + timedelta(minutes=offsets[e.event_name]))
                   if e.event_name in offsets else e for e in data.events)
    rows = tuple(changed(c, known_at=cutoff, interval_end=cutoff,
                         interval_start=min(c.interval_start, late_order.created_at)) for c in data.coverage)
    customer = changed(data.customers[0], first_seen_at=START - timedelta(minutes=5), available_at=START - timedelta(minutes=5))
    late = changed(data, customers=(customer,), orders=(late_order,), events=events, order_items=(), inventory_movements=(), coverage=rows)
    report = analyze_sales(late, request(late, report_end=cutoff, knowledge_cutoff=cutoff,
                                         customer_history_start=late_order.created_at))
    assert report.period_sales.completed_order_count.status == MetricStatus.INSUFFICIENT_COVERAGE


def test_partial_items_block_units_products_but_not_order_count():
    data = dataset()
    rows = tuple(changed(c, coverage_status="partial", reason_code="fixture_gap") if c.stream == CoverageStream.ORDER_ITEMS else c for c in data.coverage)
    partial = changed(data, coverage=rows, order_items=(), inventory_movements=())
    report = analyze_sales(partial, request(partial))
    assert report.period_sales.completed_order_count.value == 1
    assert report.period_sales.completed_units.status == MetricStatus.INSUFFICIENT_COVERAGE
    assert report.product_rankings.status == MetricStatus.INSUFFICIENT_COVERAGE


def test_missing_inventory_does_not_invalidate_sales():
    data = changed(dataset(), inventory_movements=())
    report = analyze_sales(data, request(data))
    assert report.period_sales.completed_order_count.value == 1
    assert report.inventory_context[0].status == MetricStatus.INSUFFICIENT_COVERAGE


def test_ranking_limit_rejects_overlap_and_request_rejects_future_cutoff():
    data = dataset()
    with pytest.raises(ValueError, match="overlap"):
        analyze_sales(data, request(data, ranking_limit_n=1))
    with pytest.raises(ValueError, match="cutoff"):
        request(data, report_end=FREEZE + timedelta(microseconds=1))


def test_repeat_empty_identified_denominator_not_applicable_and_anonymous_separate():
    data = dataset()
    order = changed(data.orders[0], customer_id=None)
    events = tuple(changed(e, customer_id=None) if e.event_name in (EventName.ORDER_CREATED, EventName.PURCHASE_COMPLETED) else e for e in data.events)
    anonymous = changed(data, orders=(order,), events=events, inventory_movements=())
    report = analyze_sales(anonymous, request(anonymous))
    assert report.repeat_customers.anonymous_completed_order_count.value == 1
    assert report.repeat_customers.repeat_order_contribution.status == MetricStatus.NOT_APPLICABLE


def test_lead_summary_is_optional_and_never_rescores():
    report = analyze_sales(dataset(), request())
    assert report.lead_cohort_summary.status == MetricStatus.NOT_APPLICABLE
    assert report.lead_cohort_summary.reason.startswith("No supplied")


def test_insights_are_deterministically_ordered_and_noncausal():
    data = dataset()
    report = analyze_sales(data, request(data))
    assert [x.rule_id for x in report.insights] == sorted(x.rule_id for x in report.insights)
    prohibited = ("caused", "reorder quantity", "promotion caused")
    assert not any(word in x.text.lower() for x in report.insights for word in prohibited)


def test_product_ties_input_order_and_nonoverlapping_lists():
    data = dataset()
    second = Product(**envelope("product_002"), product_id="product_002", selling_unit="unit")
    two = changed(data, products=(second, *data.products))
    report = analyze_sales(two, request(two, ranking_limit_n=1))
    assert report.product_rankings.high_seller_product_ids == ("product_001",)
    assert report.product_rankings.low_seller_product_ids == ("product_002",)
    assert [p.product_id for p in report.product_rankings.products] == ["product_001", "product_002"]


def test_inventory_zero_transition_is_observed_stockout():
    data = dataset()
    movements = tuple(m for m in data.inventory_movements if m.movement_kind.value != "receipt")
    opening = changed(movements[0], on_hand_delta=2)
    stockout = changed(data, inventory_movements=(opening, *movements[1:]))
    context = analyze_sales(stockout, request(stockout)).inventory_context[0]
    assert context.observed_stockout is True
    assert context.stockout_count == 1
    assert context.available_stock_at_end == 0


def test_lead_cohort_ties_deciles_and_mixed_cohort_rejected_without_rescoring():
    common = dict(status="scored", source_namespace="artificial_source", observation_time=START,
                  model_probability=.5, lead_score=50.0, technical_threshold=.3,
                  technical_binary_prediction=True)
    rows = [LeadScoringResult(customer_id="customer_b", **common), LeadScoringResult(customer_id="customer_a", **common)]
    report = analyze_sales(dataset(), request(), lead_results=rows)
    assert [r.customer_id for r in report.lead_cohort_summary.ranking] == ["customer_a", "customer_b"]
    assert [r.decile for r in report.lead_cohort_summary.ranking] == [1, 2]
    mixed = [rows[0], changed(rows[1], observation_time=START + timedelta(days=1))]
    assert analyze_sales(dataset(), request(), lead_results=mixed).lead_cohort_summary.status == MetricStatus.INVALID_INPUT


def test_funnel_summary_is_derived_from_frozen_report():
    from tests.sales_funnel_fixtures import batch, journey, request as funnel_request

    data = batch(journey("one"))
    sales_request = request(data, customer_history_start=START - timedelta(days=1))
    frozen = analyze_funnel(data, funnel_request())
    summary = analyze_sales(data, sales_request, funnel_request=funnel_request()).funnel_summary
    assert summary.stage_counts == {row.stage.value: row.stage_count for row in frozen.stages}
    assert summary.unattributed_order_count == frozen.diagnostics.unattributed_orders
