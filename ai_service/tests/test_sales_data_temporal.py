"""Point-in-time and closed-coverage boundaries without feature/label construction."""

from datetime import timedelta

import pytest
from pydantic import ValidationError

from medsense_ai.sales_data import (
    CoverageState, CoverageStream, assess_coverage, fact_time,
    in_future_outcome_window, in_lead_lookback, in_reporting_interval, is_knowable,
)
from sales_data_fixtures import START, FREEZE, changed, coverage, dataset, event, manifest

MICROSECOND = timedelta(microseconds=1)


@pytest.mark.parametrize(("offset", "expected"), [
    (-timedelta(days=60), True), (-timedelta(days=60) - MICROSECOND, False),
    (timedelta(0), True), (MICROSECOND, False),
])
def test_inclusive_60_day_lookback(offset, expected):
    assert in_lead_lookback(START + offset, START) is expected


@pytest.mark.parametrize(("offset", "expected"), [
    (timedelta(0), False), (MICROSECOND, True),
    (timedelta(days=30), True), (timedelta(days=30) + MICROSECOND, False),
])
def test_open_start_closed_30_day_outcome_window(offset, expected):
    assert in_future_outcome_window(START + offset, START) is expected


def test_half_open_reporting_and_naive_helper_arguments():
    assert in_reporting_interval(START, START, FREEZE)
    assert not in_reporting_interval(FREEZE, START, FREEZE)
    assert not in_reporting_interval(START, START, START)
    with pytest.raises(ValueError):
        in_reporting_interval(START, FREEZE, START)
    with pytest.raises(ValueError):
        in_lead_lookback(START.replace(tzinfo=None), START)


def test_delayed_fact_is_not_knowable_and_exact_availability_is_inclusive():
    record = event("product_viewed", START, available_at=START + timedelta(days=1))
    assert fact_time(record) == START
    assert not is_knowable(record, START)
    assert is_knowable(record, START + timedelta(days=1))


def test_fact_times_for_all_entities_and_parent_availability():
    data = dataset()
    assert fact_time(data.customers[0]) == START
    assert fact_time(data.products[0]) is None
    assert fact_time(data.inventory_movements[0]) == START
    assert is_knowable(data.products[0], START)
    parent = data.orders[0]
    item = data.order_items[0]
    assert fact_time(parent) == parent.created_at
    assert fact_time(item, order=parent) == parent.created_at
    assert is_knowable(item, parent.created_at, order=parent)
    delayed_parent = changed(parent, available_at=parent.available_at + timedelta(days=1))
    assert not is_knowable(item, parent.created_at, order=delayed_parent)
    with pytest.raises(ValueError):
        fact_time(item)
    with pytest.raises(ValueError):
        fact_time(item, order=changed(parent, dataset_id="other_dataset"))
    with pytest.raises(ValueError):
        fact_time(item, order=changed(parent, order_id="different_order"))


@pytest.mark.parametrize("updates", [
    {"interval_end": START - MICROSECOND},
    {"known_at": START},
    {"coverage_status": "partial"},
    {"coverage_status": "unsupported"},
    {"coverage_status": "unavailable"},
])
def test_invalid_coverage_declarations(updates):
    with pytest.raises(ValidationError):
        coverage(**updates)


@pytest.mark.parametrize("state", ["complete", "partial", "unsupported", "unavailable"])
def test_coverage_state_is_explicit(state):
    row = coverage(coverage_status=state, reason_code=None if state == "complete" else "source_outage")
    result = assess_coverage(manifest(), [row], CoverageStream.PRODUCT_VIEWED, START, FREEZE)
    assert result.state.value == state
    assert not result.has_gaps
    assert result.is_complete is (state == "complete")


def test_missing_coverage_is_unknown_not_zero_activity():
    result = assess_coverage(manifest(), [], CoverageStream.PRODUCT_VIEWED, START, FREEZE)
    assert result.state == CoverageState.UNKNOWN
    assert not result.is_complete


def test_complete_closed_intervals_join_only_at_declared_precision():
    boundary = START + timedelta(hours=1)
    left = coverage(interval_end=boundary)
    right = coverage(interval_start=boundary + MICROSECOND)
    assert assess_coverage(manifest(), [right, left], CoverageStream.PRODUCT_VIEWED, START, FREEZE).is_complete
    gap = changed(right, interval_start=boundary + 2 * MICROSECOND)
    result = assess_coverage(manifest(), [left, gap], CoverageStream.PRODUCT_VIEWED, START, FREEZE)
    assert result.state == CoverageState.PARTIAL and result.has_gaps
    seconds_right = changed(right, interval_start=boundary + timedelta(seconds=1))
    assert not assess_coverage(manifest(), [left, seconds_right], CoverageStream.PRODUCT_VIEWED, START, FREEZE).is_complete
    assert assess_coverage(manifest(), [left, seconds_right], CoverageStream.PRODUCT_VIEWED, START, FREEZE, resolution=timedelta(seconds=1)).is_complete


def test_coverage_rejects_misaligned_precision_and_nonpositive_resolution():
    with pytest.raises(ValueError):
        assess_coverage(manifest(), [coverage()], CoverageStream.PRODUCT_VIEWED, START + MICROSECOND, FREEZE, resolution=timedelta(seconds=1))
    with pytest.raises(ValueError):
        assess_coverage(manifest(), [], CoverageStream.PRODUCT_VIEWED, START, FREEZE, resolution=timedelta(0))


def test_single_instant_at_upper_boundary_is_covered():
    assert assess_coverage(manifest(), [coverage()], CoverageStream.PRODUCT_VIEWED, FREEZE, FREEZE).is_complete


def test_contradictory_overlap_including_shared_boundary_fails_closed():
    boundary = START + timedelta(hours=1)
    left = coverage(interval_end=boundary)
    right = coverage(interval_start=boundary, coverage_status="unavailable", reason_code="source_outage")
    result = assess_coverage(manifest(), [left, right], CoverageStream.PRODUCT_VIEWED, START, FREEZE)
    assert result.state == CoverageState.CONFLICT
    assert not result.is_complete


def test_same_state_overlap_and_duplicate_assertions_are_not_conflicts():
    row = coverage()
    assert assess_coverage(manifest(), [row, row, changed(row, interval_start=START + timedelta(hours=1))], CoverageStream.PRODUCT_VIEWED, START, FREEZE).is_complete


def test_coverage_known_at_cutoff_is_required():
    result = assess_coverage(manifest(), [coverage()], CoverageStream.PRODUCT_VIEWED, START, START, known_by=START)
    assert result.state == CoverageState.UNKNOWN
    known_now = coverage(interval_end=START, known_at=START)
    assert assess_coverage(manifest(), [known_now], CoverageStream.PRODUCT_VIEWED, START, START, known_by=START).is_complete


def test_future_conflicting_assertion_does_not_rewrite_historical_knowledge():
    first = coverage(interval_end=START, known_at=START)
    future = coverage(interval_end=START, coverage_status="partial", reason_code="source_outage")
    result = assess_coverage(manifest(), [first, future], CoverageStream.PRODUCT_VIEWED, START, START, known_by=START)
    assert result.is_complete
    assert assess_coverage(manifest(), [first, future], CoverageStream.PRODUCT_VIEWED, START, START).state == CoverageState.CONFLICT


def test_coverage_cannot_cross_dataset_or_export_freeze():
    with pytest.raises(ValueError):
        assess_coverage(manifest(), [coverage(dataset_id="other_dataset")], CoverageStream.PRODUCT_VIEWED, START, FREEZE)
    with pytest.raises(ValueError):
        assess_coverage(manifest(), [coverage(known_at=FREEZE + MICROSECOND)], CoverageStream.PRODUCT_VIEWED, START, FREEZE)
    with pytest.raises(ValueError):
        assess_coverage(manifest(), [coverage()], CoverageStream.PRODUCT_VIEWED, START, FREEZE, known_by=FREEZE + MICROSECOND)


def test_invalidated_batch_coverage_is_unavailable():
    result = assess_coverage(manifest(), [coverage()], CoverageStream.PRODUCT_VIEWED, START, FREEZE, invalidated_streams=[CoverageStream.PRODUCT_VIEWED])
    assert result.state == CoverageState.UNAVAILABLE
    assert not result.is_complete


def test_mixed_noncomplete_intervals_report_partial_and_original_states():
    middle = START + timedelta(hours=1)
    rows = [coverage(interval_end=middle), coverage(interval_start=middle + MICROSECOND, coverage_status="unavailable", reason_code="source_outage")]
    result = assess_coverage(manifest(), rows, CoverageStream.PRODUCT_VIEWED, START, FREEZE)
    assert result.state == CoverageState.PARTIAL
    assert not result.has_gaps
    assert set(result.observed_statuses) == {"complete", "unavailable"}
