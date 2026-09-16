"""Point-in-time feature arithmetic, joins, coverage and hard input boundaries."""

from decimal import Decimal, localcontext, Inexact
import pytest
from pydantic import ValidationError

from medsense_ai.lead_scoring import Eligibility, FEATURE_NAMES, Features, LeadIndex, build_features
from medsense_ai.lead_scoring.contracts import FeatureResult
from medsense_ai.sales_data import EventName
from lead_dataset_fixtures import DAY, FREEZE, START, T, TICK, accepted, behavior, changed, dataset


def test_exact_purchase_windows_and_ratio():
    dates = [T-DAY*60-TICK, T-DAY*60, T-DAY*30, T-DAY*7, T, T+TICK]
    data = dataset([(at-DAY, at, "purchase_completed") for at in dates])
    result = build_features(LeadIndex(accepted(data)), "customer_1", T)
    f = result.features
    assert result.eligibility == Eligibility.ELIGIBLE
    assert (f.purchase_count_7d, f.purchase_count_30d, f.purchase_count_60d) == (2, 3, 4)
    assert f.purchase_recency_days == 0
    assert f.purchase_frequency_ratio_30d_60d == Decimal(".75")
    assert f.no_cart_add_60d and f.days_since_last_cart_add is None
    assert f.product_view_count_60d == 0
    assert result.evidence.maximum_fact_time == T


def test_hand_calculated_behavior_features_and_identity():
    events = [
        behavior("product_viewed", T-DAY*60, "v60", session_id="s60"),
        behavior("product_viewed", T-DAY*30, "v30", product_id="product_2", session_id="s30"),
        behavior("product_viewed", T-DAY*7, "v7", session_id="s7"),
        behavior("product_viewed", T, "v0", session_id="s7"),
        behavior("product_viewed", T, "anonymous", customer_id=None, session_id="anonymous_session"),
        behavior("cart_item_added", T-DAY*60, "a60", quantity=2, session_id="s60"),
        behavior("cart_item_added", T-DAY*30, "a30", quantity=3, session_id="s30"),
        behavior("cart_item_added", T-DAY*7, "a7", quantity=4, session_id="s7"),
        behavior("cart_item_removed", T-DAY*7, "r7", quantity=2, session_id="s7"),
        behavior("cart_item_removed", T, "r0", quantity=1, session_id="s0"),
    ]
    result = build_features(LeadIndex(accepted(dataset(events=events))), "customer_1", T)
    f = result.features
    assert [getattr(f, f"session_count_{n}d") for n in (7,30,60)] == [2,3,4]
    assert [getattr(f, f"product_view_count_{n}d") for n in (7,30,60)] == [2,3,4]
    assert [getattr(f, f"distinct_products_viewed_{n}d") for n in (7,30,60)] == [1,2,2]
    assert [getattr(f, f"cart_add_count_{n}d") for n in (7,30,60)] == [1,2,3]
    assert [getattr(f, f"cart_add_quantity_{n}d") for n in (7,30,60)] == [4,7,9]
    assert [getattr(f, f"cart_remove_count_{n}d") for n in (7,30,60)] == [2,2,2]
    assert [getattr(f, f"cart_remove_quantity_{n}d") for n in (7,30,60)] == [3,3,3]
    assert f.days_since_last_cart_add == 7 and not f.no_cart_add_60d
    assert f.purchase_recency_days == 20
    assert "anonymous" not in result.evidence.event_ids
    assert len(FEATURE_NAMES) == 28
    assert set(f.model_dump()) == set(FEATURE_NAMES)


@pytest.mark.parametrize("kind", ["no_purchase", "too_old", "unknown_customer", "unavailable_customer"])
def test_observation_eligibility_is_not_a_negative_label(kind):
    data = dataset([] if kind == "no_purchase" else [(T-DAY*62, T-DAY*60-TICK, "purchase_completed")])
    key = "absent" if kind == "unknown_customer" else "customer_1"
    if kind == "unavailable_customer":
        data = changed(data, customers=[changed(data.customers[0], available_at=T+TICK)])
    result = build_features(LeadIndex(accepted(data)), key, T)
    assert result.eligibility == (Eligibility.NOT_KNOWN if kind in ("unknown_customer", "unavailable_customer") else Eligibility.OUT_OF_SCOPE)
    assert result.features is None


@pytest.mark.parametrize("stream", ["customers", "products", "orders", "order_created", "purchase_completed", "product_viewed", "cart_item_added", "cart_item_removed"])
def test_missing_required_stream_is_not_zero_activity(stream):
    data = dataset()
    data = changed(data, coverage=[c for c in data.coverage if c.stream != stream])
    result = build_features(LeadIndex(accepted(data)), "customer_1", T)
    assert result.eligibility == Eligibility.INSUFFICIENT_DATA
    assert result.features is None
    assert result.failed_coverage[0].stream == stream


@pytest.mark.parametrize("kind", ["late_event", "late_product", "late_order"])
def test_unavailable_fact_or_join_excludes_snapshot_and_raw_history(kind):
    event = behavior("product_viewed", T-DAY, "view")
    data = dataset(events=[event])
    if kind == "late_event":
        data = changed(data, events=[changed(e, available_at=T+TICK) if e.event_id == "view" else e for e in data.events])
        name = EventName.PRODUCT_VIEWED
    elif kind == "late_product":
        data = changed(data, products=[changed(p, available_at=T+TICK) if p.product_id == "product_1" else p for p in data.products])
        name = EventName.PRODUCT_VIEWED
    else:
        data = changed(data, orders=[changed(o, available_at=T+TICK) if o.order_id == "order_0" else o for o in data.orders])
        name = EventName.PURCHASE_COMPLETED
    index = LeadIndex(accepted(data))
    assert not index.window("customer_1", name, T-DAY*60, T, T)
    assert build_features(index, "customer_1", T).eligibility == Eligibility.INSUFFICIENT_DATA


def test_future_events_cannot_change_past_features_or_retroactively_identify_views():
    base = dataset(events=[behavior("product_viewed", T-DAY, "anon", customer_id=None)])
    expected = build_features(LeadIndex(accepted(base)), "customer_1", T)
    future = behavior("cart_item_added", T+TICK, "future", quantity=20)
    actual = build_features(LeadIndex(accepted(changed(base, events=(*base.events, future)))), "customer_1", T)
    assert actual == expected
    assert actual.features.session_count_60d == 0


def test_decimal_arithmetic_ignores_ambient_context():
    data = dataset([(T-DAY*50, T-DAY*49, "purchase_completed"), (T-DAY*40,T-DAY*39,"purchase_completed"), (T-DAY*2,T-DAY,"purchase_completed")])
    index = LeadIndex(accepted(data))
    expected = build_features(index, "customer_1", T)
    with localcontext() as context:
        context.prec = 2
        context.traps[Inexact] = True
        assert build_features(index, "customer_1", T) == expected


def test_invalid_feature_schema_or_cutoff_is_explicit():
    result = build_features(LeadIndex(accepted(dataset())), "customer_1", T)
    with pytest.raises(ValidationError):
        Features(**result.features.model_dump(), customer_id="not_a_feature")
    with pytest.raises(ValidationError):
        FeatureResult(eligibility="insufficient_data", features=result.features)
    with pytest.raises(ValueError):
        build_features(LeadIndex(accepted(dataset())), "customer_1", FREEZE+TICK)
    with pytest.raises(ValueError):
        build_features(LeadIndex(accepted(dataset())), "customer_1", T.replace(tzinfo=None))
