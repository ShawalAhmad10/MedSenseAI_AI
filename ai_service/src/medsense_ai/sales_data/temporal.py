"""Pure point-in-time and closed-watermark coverage helpers, without features or labels."""

from collections.abc import Iterable
from datetime import datetime, timedelta, timezone
from enum import StrEnum

from .contracts import (
    CanonicalModel, CommerceEvent, CoverageInterval, CoverageStatus, CoverageStream,
    Customer, DatasetManifest, InventoryMovement, Order, OrderItem, Product,
    SalesRecord, utc_instant,
)


def fact_time(record: SalesRecord, *, order: Order | None = None) -> datetime | None:
    """Products have no invented fact time; items inherit placement time from their parent."""
    if isinstance(record, Customer):
        return record.first_seen_at
    if isinstance(record, (CommerceEvent, InventoryMovement)):
        return record.occurred_at
    if isinstance(record, Order):
        return record.created_at
    if isinstance(record, OrderItem):
        if order is None or order.order_id != record.order_id or order.dataset_id != record.dataset_id:
            raise ValueError("OrderItem fact time requires its matching scoped parent Order")
        return order.created_at
    if isinstance(record, Product):
        return None
    raise ValueError("Unsupported canonical record type")


def is_knowable(record: SalesRecord, at: datetime, *, order: Order | None = None) -> bool:
    """Record-level availability only; other FK counterparts and coverage must also be checked."""
    cutoff = utc_instant(at)
    occurred = fact_time(record, order=order)
    return (
        record.available_at <= cutoff
        and (occurred is None or occurred <= cutoff)
        and (not isinstance(record, OrderItem) or order.available_at <= cutoff)
    )


def in_reporting_interval(value: datetime, start: datetime, end: datetime) -> bool:
    value, start, end = map(utc_instant, (value, start, end))
    if end < start:
        raise ValueError("Reporting interval end precedes start")
    return start <= value < end


def in_lead_lookback(value: datetime, at: datetime) -> bool:
    value, at = map(utc_instant, (value, at))
    return at - timedelta(days=60) <= value <= at


def in_future_outcome_window(value: datetime, at: datetime) -> bool:
    value, at = map(utc_instant, (value, at))
    return at < value <= at + timedelta(days=30)


class CoverageState(StrEnum):
    COMPLETE = "complete"
    PARTIAL = "partial"
    UNSUPPORTED = "unsupported"
    UNAVAILABLE = "unavailable"
    UNKNOWN = "unknown"
    CONFLICT = "conflict"


class CoverageAssessment(CanonicalModel):
    state: CoverageState
    has_gaps: bool
    observed_statuses: tuple[CoverageStatus, ...] = ()

    @property
    def is_complete(self) -> bool:
        return self.state == CoverageState.COMPLETE and not self.has_gaps


def coverage_conflicts(intervals: Iterable[CoverageInterval]) -> bool:
    """Closed intervals sharing an instant cannot declare different states/reasons."""
    rows = sorted(intervals, key=lambda row: row.interval_start)
    active: list[CoverageInterval] = []
    for row in rows:
        active = [other for other in active if other.interval_end >= row.interval_start]
        if any(
            row.dataset_id == other.dataset_id and row.stream == other.stream
            and (row.coverage_status, row.reason_code) != (other.coverage_status, other.reason_code)
            for other in active
        ):
            return True
        active.append(row)
    return False


def assess_coverage(
    manifest: DatasetManifest,
    intervals: Iterable[CoverageInterval],
    stream: CoverageStream,
    start: datetime,
    end: datetime,
    *,
    known_by: datetime | None = None,
    resolution: timedelta = timedelta(microseconds=1),
    invalidated_streams: Iterable[CoverageStream] = (),
) -> CoverageAssessment:
    """Check a closed interval at an explicit timestamp precision; absent means unknown.

    Resolution must match the producer policy. The conservative default is Python's
    microsecond precision; larger gaps are never bridged without an explicit policy.
    Pass a rejected batch's invalidated_streams when inspecting its source coverage.
    """
    start, end = map(utc_instant, (start, end))
    cutoff = manifest.extracted_at if known_by is None else utc_instant(known_by)
    if end < start or resolution <= timedelta(0):
        raise ValueError("Invalid coverage interval or timestamp resolution")
    if cutoff > manifest.extracted_at:
        raise ValueError("Coverage knowledge cutoff exceeds dataset freeze")
    stream = CoverageStream(stream)
    if stream in invalidated_streams:
        return CoverageAssessment(state=CoverageState.UNAVAILABLE, has_gaps=True)
    rows: list[CoverageInterval] = []
    epoch = datetime(1970, 1, 1, tzinfo=timezone.utc)
    for value in (start, end):
        if (value - epoch) % resolution:
            raise ValueError("Requested interval does not align to declared precision")
    for row in intervals:
        if row.dataset_id != manifest.dataset_id:
            raise ValueError("Coverage belongs to another dataset")
        if row.known_at > manifest.extracted_at:
            raise ValueError("Coverage assertion was not known by dataset freeze")
        if row.stream != stream or row.known_at > cutoff:
            continue
        if row.interval_end < start or row.interval_start > end:
            continue
        if any((value - epoch) % resolution for value in (row.interval_start, row.interval_end)):
            raise ValueError("Coverage boundary does not align to declared precision")
        rows.append(row)
    if not rows:
        return CoverageAssessment(state=CoverageState.UNKNOWN, has_gaps=True)
    statuses = tuple(sorted({row.coverage_status for row in rows}))
    if coverage_conflicts(rows):
        return CoverageAssessment(state=CoverageState.CONFLICT, has_gaps=True, observed_statuses=statuses)
    cursor = start
    has_gaps = False
    reached_end = False
    for row in sorted(rows, key=lambda row: row.interval_start):
        if row.interval_start > cursor:
            has_gaps = True
        if row.interval_end >= end:
            reached_end = True
            break
        cursor = max(cursor, row.interval_end + resolution)
    has_gaps = has_gaps or not reached_end
    state = CoverageState(statuses[0].value) if len(statuses) == 1 and not has_gaps else CoverageState.PARTIAL
    return CoverageAssessment(state=state, has_gaps=has_gaps, observed_statuses=statuses)
