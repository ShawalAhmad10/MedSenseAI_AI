"""Temporal maturity, incomplete observation, point-in-time knowledge and input rejection."""

from datetime import timedelta

import pytest

from medsense_ai.sales_analytics import AnalyticsStatus, analyze_funnel
from medsense_ai.sales_data import ValidationCode, ValidationContext, validate_dataset
from sales_data_fixtures import changed, coverage
from sales_funnel_fixtures import START, HISTORY, FREEZE, TICK, batch, feed, journey, request


@pytest.mark.parametrize(("offset", "eligible"), [(timedelta(0), 1), (-TICK, 0), (timedelta(days=1), 0)])
def test_reporting_interval_is_half_open(offset, eligible):
    result = analyze_funnel(batch(journey("one", view_at=START + offset)), request())
    assert result.diagnostics.eligible_mature_sessions == eligible
    assert result.diagnostics.outside_cohort_sessions == 1 - eligible


def test_first_view_resolved_before_cohort_filter():
    data = batch(journey("one", view_at=START - TICK))
    second_view = changed(data.events[0], event_id="later_view", source_record_ref="later_view", occurred_at=START, available_at=START)
    result = analyze_funnel(changed(data, events=(*data.events, second_view)), request())
    assert result.diagnostics.candidate_sessions == 0
    assert result.diagnostics.outside_cohort_sessions == 1


@pytest.mark.parametrize(("offset", "status", "count"), [
    (-TICK, AnalyticsStatus.IMMATURE, None),
    (timedelta(0), AnalyticsStatus.VALID, 1),
    (TICK, AnalyticsStatus.VALID, 1),
])
def test_exact_maturity_boundary(offset, status, count):
    cutoff = START + timedelta(days=7) + offset
    result = analyze_funnel(batch(journey("one"), cutoff=cutoff), request(knowledge_cutoff=cutoff))
    assert result.status == status
    assert result.stages[0].stage_count == count
    assert result.diagnostics.immature_sessions == int(count is None)
    if count is None:
        assert result.overall_purchase_conversion.value is None
        assert result.diagnostics.excluded_sessions == 1


@pytest.mark.parametrize(("stream", "status", "state"), [
    ("product_viewed", None, "unknown"),
    ("cart_item_added", "partial", "partial"),
    ("purchase_completed", "unavailable", "unavailable"),
    ("order_created", "unsupported", "unsupported"),
    ("orders", None, "unknown"),
    ("products", None, "unknown"),
    ("customers", None, "unknown"),
])
def test_missing_or_incomplete_required_feed_is_not_zero(stream, status, state):
    result = analyze_funnel(feed(batch(journey("one")), stream, status), request())
    assert result.status == AnalyticsStatus.INSUFFICIENT_COVERAGE
    assert result.diagnostics.coverage_unavailable_sessions == 1
    assert result.diagnostics.eligible_mature_sessions == 0
    assert all(row.stage_count is None for row in result.stages)
    assert result.overall_purchase_conversion.value is None
    assert result.largest_dropoff_stage is None
    assert any(c.stream == stream and c.assessment.state == state for c in result.sessions[0].failed_coverage)


def test_unknown_empty_cohort_is_not_measured_empty():
    result = analyze_funnel(feed(batch(), "product_viewed"), request())
    assert result.status == AnalyticsStatus.INSUFFICIENT_COVERAGE
    assert result.stages[0].stage_count is None
    assert result.diagnostics.candidate_sessions == 0


def test_one_microsecond_telemetry_gap_excludes_session():
    data = feed(batch(journey("one")), "cart_item_added")
    gap = START + timedelta(days=3)
    intervals = (
        coverage("cart_item_added", interval_start=HISTORY, interval_end=gap - TICK, known_at=FREEZE),
        coverage("cart_item_added", interval_start=gap + TICK, interval_end=FREEZE, known_at=FREEZE),
    )
    result = analyze_funnel(changed(data, coverage=(*data.coverage, *intervals)), request())
    assert result.status == AnalyticsStatus.INSUFFICIENT_COVERAGE
    assert result.sessions[0].failed_coverage[0].assessment.has_gaps


def test_coverage_must_include_maturity_instant():
    data = batch(journey("one"))
    rows = [changed(c, interval_end=START + timedelta(days=7) - TICK) if c.stream == "purchase_completed" else c for c in data.coverage]
    result = analyze_funnel(changed(data, coverage=rows), request())
    assert result.status == AnalyticsStatus.INSUFFICIENT_COVERAGE


def test_mixed_coverage_keeps_only_provable_subset():
    data = feed(batch(journey("early"), journey("late", view_at=START + timedelta(hours=12))), "purchase_completed")
    boundary = START + timedelta(days=7, hours=6)
    intervals = (
        coverage("purchase_completed", interval_start=HISTORY, interval_end=boundary, known_at=FREEZE),
        coverage("purchase_completed", interval_start=boundary + TICK, interval_end=FREEZE, known_at=FREEZE, coverage_status="unavailable", reason_code="artificial_outage"),
    )
    result = analyze_funnel(changed(data, coverage=(*data.coverage, *intervals)), request())
    assert result.status == AnalyticsStatus.INSUFFICIENT_COVERAGE
    assert [row.stage_count for row in result.stages] == [1, 1, 1, 1]
    assert result.overall_purchase_conversion.status == AnalyticsStatus.VALID
    assert result.diagnostics.eligible_mature_sessions == 1
    assert result.diagnostics.coverage_unavailable_sessions == 1
    assert result.diagnostics.excluded_sessions == 1


def test_mixed_mature_and_immature_sessions():
    cutoff = START + timedelta(days=7)
    data = batch(journey("early"), journey("late", view_at=START + timedelta(hours=12)), cutoff=cutoff)
    result = analyze_funnel(data, request(knowledge_cutoff=cutoff))
    assert result.status == AnalyticsStatus.IMMATURE
    assert [s.stage_count for s in result.stages] == [1, 1, 1, 1]
    assert result.diagnostics.immature_sessions == 1


def test_missing_prior_history_cannot_assert_first_view():
    data = batch(journey("one"))
    data = changed(data, coverage=[changed(c, interval_start=START) if c.stream == "product_viewed" else c for c in data.coverage])
    result = analyze_funnel(data, request())
    assert result.status == AnalyticsStatus.INSUFFICIENT_COVERAGE
    assert not result.coverage.cohort_discovery.assessment.is_complete


@pytest.mark.parametrize("kind", ["completion", "view", "product", "customer", "order"])
def test_late_facts_and_references_are_not_usable_at_historical_cutoff(kind):
    cutoff = START + timedelta(days=8)
    data = batch(journey("one"), cutoff=cutoff)
    data = changed(data, manifest=changed(data.manifest, extracted_at=FREEZE))
    late = cutoff + timedelta(days=1)
    if kind in ("completion", "view"):
        name = "purchase_completed" if kind == "completion" else "product_viewed"
        data = changed(data, events=[changed(e, available_at=late) if e.event_name == name else e for e in data.events])
    else:
        field = {"product": "products", "customer": "customers", "order": "orders"}[kind]
        data = changed(data, **{field: [changed(row, available_at=late) for row in getattr(data, field)]})
    result = analyze_funnel(data, request(knowledge_cutoff=cutoff))
    assert result.status == AnalyticsStatus.INSUFFICIENT_COVERAGE
    assert result.stages[0].stage_count is None
    assert result.diagnostics.unusable_past_events > 0
    later_export = changed(data, manifest=changed(data.manifest, extracted_at=FREEZE + timedelta(days=1)))
    assert analyze_funnel(later_export, request(knowledge_cutoff=cutoff)) == result


def test_future_completion_does_not_change_observed_stage_at_cutoff():
    cutoff = START + timedelta(days=4)
    data = batch(journey("one", completion_at=cutoff + TICK))
    result = analyze_funnel(data, request(knowledge_cutoff=cutoff))
    assert result.sessions[0].resolution.highest_observed_stage == "order_creation"
    assert result.stages[3].stage_count is None


def test_late_coverage_declaration_does_not_rewrite_knowledge():
    data = batch(journey("one"))
    result = analyze_funnel(data, request(knowledge_cutoff=START + timedelta(days=8)))
    assert result.status == AnalyticsStatus.INSUFFICIENT_COVERAGE
    assert result.coverage.cohort_discovery.assessment.state == "unknown"


def test_future_identity_does_not_change_historical_anonymous_eligibility():
    cutoff = START + timedelta(days=8)
    data = batch(journey("one", 1), cutoff=cutoff)
    anonymous = changed(data.events[0], customer_id=None)
    data = changed(data, events=[anonymous], coverage=[c for c in data.coverage if c.stream != "customers"], manifest=changed(data.manifest, extracted_at=FREEZE))
    expected = analyze_funnel(data, request(knowledge_cutoff=cutoff))
    future = changed(anonymous, event_id="future_view", source_record_ref="future_view", customer_id="customer_001", occurred_at=cutoff + TICK, available_at=cutoff + TICK)
    assert analyze_funnel(changed(data, events=(anonymous, future)), request(knowledge_cutoff=cutoff)) == expected


def test_unattributed_reason_does_not_infer_missing_cart_from_partial_feed():
    data = batch(journey("one"))
    data = changed(data, events=[e for e in data.events if e.event_name != "cart_item_added"])
    result = analyze_funnel(feed(data, "cart_item_added", "partial"), request())
    assert result.diagnostics.unattributed_orders == 1
    assert result.diagnostics.unattributed_reasons[0].reason == "insufficient_coverage"


@pytest.mark.parametrize("policy", ["completion_policy_version", "session_policy_version"])
def test_missing_source_policy_is_explicit(policy):
    data = batch(journey("one", 1))
    data = changed(data, manifest=changed(data.manifest, **{policy: None}))
    result = analyze_funnel(data, request())
    assert result.status == AnalyticsStatus.INSUFFICIENT_COVERAGE
    assert ValidationCode.MISSING_POLICY in result.diagnostics.validation_codes


@pytest.mark.parametrize("kind", ["malformed", "conflicting_duplicate", "lifecycle_reference", "missing_creation"])
def test_invalid_input_is_never_an_empty_valid_report(kind):
    data = batch(journey("one"))
    if kind == "malformed":
        data = {"manifest": {"data_origin": "made_up"}}
    elif kind == "conflicting_duplicate":
        data = changed(data, events=(*data.events, changed(data.events[1], quantity=2)))
    elif kind == "lifecycle_reference":
        data = changed(data, events=[changed(e, session_id="wrong") if e.order_id else e for e in data.events])
    else:
        data = changed(data, events=[e for e in data.events if e.event_name != "order_created"])
    result = analyze_funnel(data, request())
    assert result.status == AnalyticsStatus.INVALID_INPUT
    assert result.diagnostics.validation_codes
    assert result.stages[0].stage_count is None
    assert result.overall_purchase_conversion.status == AnalyticsStatus.INVALID_INPUT


@pytest.mark.parametrize("kind", ["cutoff_after_freeze", "misaligned_request", "misaligned_event"])
def test_invalid_cutoff_or_precision_is_typed(kind):
    data, req = batch(journey("one")), request()
    if kind == "cutoff_after_freeze":
        req = request(knowledge_cutoff=FREEZE + TICK)
    elif kind == "misaligned_request":
        req = request(report_start=START + TICK, timestamp_resolution=timedelta(seconds=1))
    else:
        data = batch(journey("one", view_at=START + TICK))
        req = request(timestamp_resolution=timedelta(seconds=1))
    result = analyze_funnel(data, req)
    assert result.status == AnalyticsStatus.INVALID_INPUT
    assert result.diagnostics.validation_codes == (ValidationCode.INVALID_TIMESTAMP,)


def test_funnel_profile_omits_replay_but_default_still_requires_it():
    data = feed(batch(journey("one")), "cart_item_removed")
    assert not validate_dataset(data).is_valid
    assert validate_dataset(data, context=ValidationContext(replay_carts=False)).is_valid
    assert analyze_funnel(data, request()).status == AnalyticsStatus.VALID


def test_cart_identity_conflict_remains_invalid_without_replay():
    data = batch(journey("one"))
    customer = changed(data.customers[0], customer_id="customer_other", source_record_ref="customer_other")
    data = changed(data, customers=(*data.customers, customer), events=[changed(e, customer_id="customer_other") if e.event_name == "cart_item_added" else e for e in data.events])
    validation = validate_dataset(data, context=ValidationContext(replay_carts=False))
    assert validation.status == "invalid"
    assert ValidationCode.REFERENCE_MISMATCH in {issue.code for issue in validation.issues}
