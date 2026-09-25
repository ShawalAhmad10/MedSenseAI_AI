"""Hand-calculated funnel paths, counts, attribution and deterministic metrics."""

from datetime import timedelta
from decimal import Decimal, Inexact, localcontext
import random

import pytest
from pydantic import ValidationError

from medsense_ai.sales_analytics import (
    AnalyticsStatus, FunnelReport, FunnelStage, FunnelTransition, analyze_funnel,
    resolve_session_stages,
)
from medsense_ai.sales_data import ValidationContext, validate_dataset
from sales_data_fixtures import changed
from sales_funnel_fixtures import START, FREEZE, TICK, batch, journey, request


def counts(report):
    return [row.stage_count for row in report.stages]


@pytest.mark.parametrize(("level", "terminal", "delay", "expected"), [
    (1, None, None, [1, 0, 0, 0]),
    (2, None, None, [1, 1, 0, 0]),
    (3, None, None, [1, 1, 1, 0]),
    (4, "purchase_completed", None, [1, 1, 1, 1]),
    (4, "order_cancelled", None, [1, 1, 1, 0]),
    (4, "purchase_completed", timedelta(days=7), [1, 1, 1, 1]),
    (4, "purchase_completed", timedelta(days=7) + TICK, [1, 1, 1, 0]),
])
def test_basic_paths(level, terminal, delay, expected):
    data = batch(journey("one", level, terminal=terminal, completion_at=START + delay if delay else None))
    result = analyze_funnel(data, request())
    assert result.status == AnalyticsStatus.VALID
    assert counts(result) == expected
    assert result.diagnostics.eligible_mature_sessions == 1


def test_hand_calculated_metrics_and_typed_roundtrip():
    data = batch(*(journey(str(i), i) for i in range(1, 5)))
    result = analyze_funnel(data, request())
    assert counts(result) == [4, 3, 2, 1]
    assert [row.adjacent_conversion_rate.value for row in result.stages] == [None, Decimal(".75"), Decimal("0.6666666666666666666666666667"), Decimal(".5")]
    assert [row.adjacent_dropoff_count for row in result.stages] == [1, 1, 1, None]
    assert [row.adjacent_dropoff_rate.value for row in result.stages] == [Decimal(".25"), Decimal("0.3333333333333333333333333333"), Decimal(".5"), None]
    assert [row.cumulative_conversion_rate.value for row in result.stages] == list(map(Decimal, ["1", ".75", ".5", ".25"]))
    assert [row.cumulative_dropoff_rate.value for row in result.stages] == list(map(Decimal, ["0", ".25", ".5", ".75"]))
    assert result.overall_purchase_conversion.value == Decimal(".25")
    assert result.largest_dropoff_stage == FunnelTransition.ORDER_TO_PURCHASE
    assert result.largest_dropoff_rate.value == Decimal(".5")
    assert result.stages[2].adjacent_conversion_rate.numerator == 2
    assert result.stages[2].adjacent_conversion_rate.denominator == 3
    assert result.contract_version == "sales_contract_v1" and result.funnel_version == "funnel_v1"
    assert result.data_origin == "synthetic_development"
    assert FunnelReport.model_validate_json(result.model_dump_json()) == result
    assert "customer_001" not in result.model_dump_json()


def test_zero_denominator_is_distinct_from_measured_zero():
    result = analyze_funnel(batch(journey("one", 1)), request())
    assert result.stages[1].adjacent_conversion_rate.value == Decimal(0)
    assert result.stages[1].adjacent_conversion_rate.status == AnalyticsStatus.VALID
    for row in result.stages[2:]:
        assert row.adjacent_conversion_rate.value is None
        assert row.adjacent_conversion_rate.status == AnalyticsStatus.NOT_APPLICABLE
        assert row.adjacent_conversion_rate.denominator == 0
    assert result.largest_dropoff_stage == FunnelTransition.VIEW_TO_CART


def test_complete_empty_cohort_is_not_applicable():
    result = analyze_funnel(batch(), request())
    assert result.status == AnalyticsStatus.NOT_APPLICABLE
    assert counts(result) == [0, 0, 0, 0]
    assert result.overall_purchase_conversion.value is None
    assert result.overall_purchase_conversion.denominator == 0
    assert result.largest_dropoff_stage is None


def test_largest_dropoff_tie_uses_earliest_transition():
    # N=8,4,2,1 gives exactly 50% at every transition.
    levels = [1, 1, 1, 1, 2, 2, 3, 4]
    result = analyze_funnel(batch(*(journey(str(i), level) for i, level in enumerate(levels))), request())
    assert counts(result) == [8, 4, 2, 1]
    assert result.largest_dropoff_stage == FunnelTransition.VIEW_TO_CART
    assert result.largest_dropoff_rate.value == Decimal(".5")


def test_decimal_global_context_cannot_change_report():
    data = batch(*(journey(str(i), i) for i in range(1, 5)))
    expected = analyze_funnel(data, request())
    with localcontext() as context:
        context.prec = 2
        context.traps[Inexact] = True
        assert analyze_funnel(data, request()) == expected


def test_many_views_products_and_additions_are_one_journey():
    data = batch(journey("one"))
    product = changed(data.products[0], product_id="product_other", source_record_ref="other")
    events = list(data.events)
    events[1] = changed(events[1], product_id="product_other")
    events += [
        changed(events[0], event_id="view_other", source_record_ref="view_other", product_id="product_other", occurred_at=START + TICK, available_at=START + TICK),
        changed(events[1], event_id="add_again", source_record_ref="add_again", quantity=2),
    ]
    result = analyze_funnel(changed(data, products=(*data.products, product), events=events), request())
    assert counts(result) == [1, 1, 1, 1]


@pytest.mark.parametrize("completes", [False, True])
def test_multiple_orders_at_most_one_session(completes):
    data = batch(journey("a", 3), journey("b", 4 if completes else 3))
    data = changed(data, events=[changed(e, session_id="session_shared") for e in data.events], orders=[changed(o, session_id="session_shared") for o in data.orders])
    result = analyze_funnel(data, request())
    assert counts(result) == [1, 1, 1, int(completes)]
    assert result.sessions[0].resolution.qualifying_order_ids == ("order_a", "order_b")
    assert result.diagnostics.observed_orders == 2
    assert result.diagnostics.unattributed_orders == 0


def test_equal_timestamp_chain_qualifies_by_explicit_references():
    data = batch(journey("one"))
    data = changed(data, events=[changed(e, occurred_at=START, available_at=START) for e in data.events], orders=[changed(o, created_at=START, available_at=START) for o in data.orders])
    assert counts(analyze_funnel(data, request())) == [1, 1, 1, 1]


@pytest.mark.parametrize(("missing", "expected", "reason"), [
    ("product_viewed", [0, 0, 0, 0], "missing_view"),
    ("cart_item_added", [1, 0, 0, 0], "missing_cart_addition"),
])
def test_downstream_facts_do_not_invent_upstream(missing, expected, reason):
    data = batch(journey("one"))
    data = changed(data, events=[e for e in data.events if e.event_name != missing])
    result = analyze_funnel(data, request())
    assert counts(result) == expected
    assert result.diagnostics.unattributed_orders == 1
    assert result.diagnostics.unattributed_reasons[0].reason == reason


@pytest.mark.parametrize(("field", "reason"), [("session_id", "missing_session"), ("cart_id", "missing_cart")])
def test_missing_order_link_is_diagnostic(field, reason):
    data = batch(journey("one"))
    data = changed(data, orders=[changed(o, **{field: None}) for o in data.orders], events=[changed(e, **{field: None}) if e.order_id else e for e in data.events])
    result = analyze_funnel(data, request())
    assert counts(result) == [1, 1, 0, 0]
    assert result.diagnostics.unattributed_orders == 1
    assert result.diagnostics.unattributed_reasons[0].reason == reason


def test_cart_added_in_other_session_cannot_qualify_order():
    data = batch(journey("one"))
    data = changed(data, events=[changed(e, session_id="other_session") if e.event_name == "cart_item_added" else e for e in data.events])
    result = analyze_funnel(data, request())
    assert counts(result) == [1, 0, 0, 0]
    assert result.diagnostics.unattributed_orders == 1


@pytest.mark.parametrize("bad_edge", ["add_before_view", "order_before_add", "order_after_horizon"])
def test_causal_chain_is_required(bad_edge):
    data = batch(journey("one", 3))
    events, orders = list(data.events), list(data.orders)
    if bad_edge == "add_before_view":
        events[1] = changed(events[1], occurred_at=START - TICK, available_at=START - TICK)
        expected = [1, 0, 0, 0]
    elif bad_edge == "order_before_add":
        events[1] = changed(events[1], occurred_at=START + timedelta(minutes=3), available_at=START + timedelta(minutes=3))
        # A closed cart cannot be changed after placement in sales_contract_v1.
        result = analyze_funnel(changed(data, events=events), request())
        assert result.status == AnalyticsStatus.INVALID_INPUT
        assert "cart_conflict" in result.diagnostics.validation_codes
        return
    else:
        at = START + timedelta(days=7) + TICK
        events[2] = changed(events[2], occurred_at=at, available_at=at)
        orders[0] = changed(orders[0], created_at=at, available_at=at)
        expected = [1, 1, 0, 0]
    assert counts(analyze_funnel(changed(data, events=events, orders=orders), request())) == expected


def test_retransmissions_do_not_inflate_counts():
    data = batch(journey("one"))
    expected = analyze_funnel(data, request())
    retransmitted = changed(data, events=(*data.events, *data.events), orders=(*data.orders, *data.orders))
    result = analyze_funnel(retransmitted, request())
    assert result.stages == expected.stages
    assert result.diagnostics.identical_retransmissions == 5
    assert result.diagnostics.observed_orders == 1


@pytest.mark.parametrize("seed", [1, 19, 73])
def test_record_order_does_not_change_report(seed):
    data = batch(*(journey(str(i), i) for i in range(1, 5)))
    expected = analyze_funnel(data, request())
    rng = random.Random(seed)
    updates = {}
    for field in ("events", "orders", "products", "customers", "coverage"):
        values = list(getattr(data, field))
        rng.shuffle(values)
        updates[field] = values
    assert analyze_funnel(changed(data, **updates), request()) == expected


def test_observed_resolver_is_pure_and_does_not_claim_eligibility():
    data = batch(journey("one"))
    validation = validate_dataset(data, context=ValidationContext(replay_carts=False))
    resolved = resolve_session_stages(validation, knowledge_cutoff=START + timedelta(minutes=3))
    assert resolved[0].highest_observed_stage == FunnelStage.COMPLETED_PURCHASE
    assert resolved[0].maturity_time == START + timedelta(days=7)
    assert data.events == batch(journey("one")).events
    with pytest.raises(ValueError):
        resolve_session_stages(validate_dataset({}), knowledge_cutoff=FREEZE)
    with pytest.raises(ValueError):
        resolve_session_stages(validation, knowledge_cutoff=FREEZE + TICK)
    with pytest.raises(ValueError):
        resolve_session_stages(validation, knowledge_cutoff=START.replace(tzinfo=None))


def test_anonymous_view_can_be_counted_without_customer_feed():
    data = batch(journey("one", 1))
    data = changed(data, customers=(), events=[changed(e, customer_id=None) for e in data.events], coverage=[c for c in data.coverage if c.stream != "customers"])
    assert counts(analyze_funnel(data, request())) == [1, 0, 0, 0]


def test_request_rejects_naive_or_reversed_boundaries():
    with pytest.raises(ValidationError):
        request(report_start=START.replace(tzinfo=None))
    with pytest.raises(ValidationError):
        request(report_end=START)
    with pytest.raises(ValidationError):
        request(session_history_start=START + TICK)
