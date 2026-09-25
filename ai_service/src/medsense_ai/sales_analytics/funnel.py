"""Deterministic funnel_v1 over canonical facts; no model, transport, or partner imports."""

from bisect import bisect_left, bisect_right
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from fractions import Fraction
import logging

from medsense_ai.sales_data import (
    CoverageAssessment, CoverageState, CoverageStream, EventName, SalesDataset,
    ValidationCode, ValidationContext, ValidationReport, assess_coverage,
    in_reporting_interval, is_knowable, validate_dataset,
)
from medsense_ai.sales_data.contracts import utc_instant

from .contracts import (
    FOLLOWUP, AnalyticsStatus, FunnelCoverageSummary, FunnelDiagnostics, FunnelReport,
    FunnelRequest, FunnelStage, FunnelStageMetrics, FunnelTransition, RatioMetric,
    ReasonCount, SessionEligibility, SessionStageResolution, StreamCoverage,
    UnattributedReason, ratio,
)

logger = logging.getLogger(__name__)
BASE_STREAMS = (
    CoverageStream.PRODUCT_VIEWED, CoverageStream.CART_ITEM_ADDED,
    CoverageStream.ORDER_CREATED, CoverageStream.PURCHASE_COMPLETED,
    CoverageStream.PRODUCTS, CoverageStream.ORDERS,
)


class _Index:
    """Single-pass fact indexing, followed by per-session work; never pairwise event scans."""

    def __init__(self, data: SalesDataset, cutoff: datetime):
        customers = {row.customer_id for row in data.customers if is_knowable(row, cutoff)}
        products = {row.product_id for row in data.products if is_knowable(row, cutoff)}
        self.orders = {
            row.order_id: row for row in data.orders
            if is_knowable(row, cutoff) and (row.customer_id is None or row.customer_id in customers)
        }
        self.blocked = defaultdict(list)
        for row in data.orders:
            if row.created_at <= cutoff and row.order_id not in self.orders:
                self.blocked[CoverageStream.ORDERS].append(row.created_at)
        self.views = {}
        self.additions = defaultdict(list)
        self.creations = {}
        self.terminals = {}
        self.customer_sessions = set()
        self.unusable_past_events = 0
        for event in data.events:
            known = is_knowable(event, cutoff)
            if known and event.session_id is not None and event.customer_id is not None:
                self.customer_sessions.add(event.session_id)
            usable = (
                known
                and (event.customer_id is None or event.customer_id in customers)
                and (event.product_id is None or event.product_id in products)
                and (event.order_id is None or event.order_id in self.orders)
            )
            if not usable:
                if event.occurred_at <= cutoff:
                    self.blocked[CoverageStream(event.event_name.value)].append(event.occurred_at)
                    self.unusable_past_events += 1
                continue
            if event.event_name == EventName.PRODUCT_VIEWED:
                previous = self.views.get(event.session_id)
                if previous is None or (event.occurred_at, event.event_id) < (previous.occurred_at, previous.event_id):
                    self.views[event.session_id] = event
            elif event.event_name == EventName.CART_ITEM_ADDED:
                self.additions[event.session_id].append(event)
            elif event.event_name == EventName.ORDER_CREATED:
                self.creations[event.order_id] = event
            elif event.event_name in (EventName.PURCHASE_COMPLETED, EventName.ORDER_CANCELLED):
                self.terminals[event.order_id] = event
        self.orders_by_session = defaultdict(list)
        for order in self.orders.values():
            self.orders_by_session[order.session_id].append(order)
        for times in self.blocked.values():
            times.sort()

    def resolve(self) -> tuple[SessionStageResolution, ...]:
        rows = []
        for session, view in sorted(self.views.items()):
            first, horizon = view.occurred_at, view.occurred_at + FOLLOWUP
            stage = FunnelStage.PRODUCT_VIEW
            carts = {}
            for addition in self.additions[session]:
                if first <= addition.occurred_at <= horizon:
                    carts[addition.cart_id] = min(carts.get(addition.cart_id, addition.occurred_at), addition.occurred_at)
            if carts:
                stage = FunnelStage.CART_ADDITION
            qualifying = []
            completed = False
            for order in self.orders_by_session[session]:
                creation = self.creations.get(order.order_id)
                if creation is None or order.cart_id not in carts:
                    continue
                if not first <= carts[order.cart_id] <= order.created_at <= horizon:
                    continue
                qualifying.append(order.order_id)
                terminal = self.terminals.get(order.order_id)
                if terminal and terminal.event_name == EventName.PURCHASE_COMPLETED and order.created_at <= terminal.occurred_at <= horizon:
                    completed = True
            if qualifying:
                stage = FunnelStage.COMPLETED_PURCHASE if completed else FunnelStage.ORDER_CREATION
            rows.append(SessionStageResolution(
                session_id=session, first_view_at=first, maturity_time=horizon,
                highest_observed_stage=stage, qualifying_order_ids=tuple(sorted(qualifying)),
            ))
        return tuple(rows)


class _Coverage:
    def __init__(self, data: SalesDataset, request: FunnelRequest, index: _Index):
        self.data, self.request, self.index = data, request, index
        self.rows = defaultdict(list)
        for row in data.coverage:
            if row.known_at <= request.knowledge_cutoff:
                self.rows[row.stream].append(row)
        self.starts, self.max_ends = {}, {}
        for stream, rows in self.rows.items():
            rows.sort(key=lambda row: row.interval_start)
            self.starts[stream] = [row.interval_start for row in rows]
            largest = rows[0].interval_end
            ends = []
            for row in rows:
                largest = max(largest, row.interval_end)
                ends.append(largest)
            self.max_ends[stream] = ends
        self.cache = {}

    def check(self, stream: CoverageStream, start: datetime, end: datetime) -> StreamCoverage:
        key = (stream, start, end)
        if key not in self.cache:
            blocked = self.index.blocked[stream]
            if bisect_left(blocked, start) < bisect_right(blocked, end):
                # A supplied past fact not knowable at K cannot be treated as zero
                # even if an inconsistent source watermark claims completeness.
                assessment = CoverageAssessment(state=CoverageState.UNAVAILABLE, has_gaps=True)
            else:
                left = bisect_left(self.max_ends.get(stream, []), start)
                right = bisect_right(self.starts.get(stream, []), end)
                assessment = assess_coverage(
                    self.data.manifest, self.rows[stream][left:right], stream, start, end,
                    known_by=self.request.knowledge_cutoff, resolution=self.request.timestamp_resolution,
                )
            self.cache[key] = StreamCoverage(stream=stream, interval_start=start, interval_end=end, assessment=assessment)
        return self.cache[key]

    def session(self, row: SessionStageResolution) -> tuple[StreamCoverage, ...]:
        streams = BASE_STREAMS + ((CoverageStream.CUSTOMERS,) if row.session_id in self.index.customer_sessions else ())
        checks = [self.check(stream, row.first_view_at, row.maturity_time) for stream in streams]
        # Complete history through V is needed to prove V is the session's FIRST
        # view, not the first row surviving a truncated report-period extraction.
        checks.append(self.check(CoverageStream.PRODUCT_VIEWED, min(self.request.session_history_start, row.first_view_at), row.first_view_at))
        return tuple(check for check in checks if not check.assessment.is_complete)

    def discovery(self) -> StreamCoverage | None:
        end = min(self.request.report_end - self.request.timestamp_resolution, self.request.knowledge_cutoff)
        if end < self.request.session_history_start:
            return None
        return self.check(CoverageStream.PRODUCT_VIEWED, self.request.session_history_start, end)


@dataclass
class _Prepared:
    validation: ValidationReport
    data: SalesDataset | None
    index: _Index | None
    coverage: _Coverage | None
    failure: AnalyticsStatus | None = None
    codes: tuple[ValidationCode, ...] = ()


def _prepare(value: SalesDataset | dict, request: FunnelRequest, *, session_policy: bool = True) -> _Prepared:
    validation = validate_dataset(value, context=ValidationContext(
        replay_carts=False, coverage_resolution=request.timestamp_resolution,
    ))
    if not validation.is_valid:
        failure = AnalyticsStatus.INVALID_INPUT if validation.status == "invalid" else AnalyticsStatus.INSUFFICIENT_COVERAGE
        return _Prepared(validation, None, None, None, failure, tuple(sorted({issue.code for issue in validation.issues})))
    data = validation.validated_dataset
    epoch = datetime(1970, 1, 1, tzinfo=timezone.utc)
    boundaries = (
        request.report_start, request.report_end, request.knowledge_cutoff, request.session_history_start,
        *(event.occurred_at for event in data.events), *(order.created_at for order in data.orders),
    )
    if request.knowledge_cutoff > data.manifest.extracted_at or any((value - epoch) % request.timestamp_resolution for value in boundaries):
        logger.error("Funnel input cutoff/precision is incompatible with dataset")
        return _Prepared(validation, data, None, None, AnalyticsStatus.INVALID_INPUT, (ValidationCode.INVALID_TIMESTAMP,))
    if data.manifest.completion_policy_version is None or (session_policy and data.manifest.session_policy_version is None):
        logger.warning("Analytics requires declared source interpretation policies")
        return _Prepared(validation, data, None, None, AnalyticsStatus.INSUFFICIENT_COVERAGE, (ValidationCode.MISSING_POLICY,))
    index = _Index(data, request.knowledge_cutoff)
    return _Prepared(validation, data, index, _Coverage(data, request, index))


def resolve_session_stages(validated: ValidationReport, *, knowledge_cutoff: datetime) -> tuple[SessionStageResolution, ...]:
    """Resolve observed causal chains from an accepted canonical batch, before cohort gating.

    This pure helper never implies complete coverage or mature follow-up. Use
    analyze_funnel for final metrics and eligibility. No wall-clock reads occur.
    """
    if not validated.is_valid:
        raise ValueError("Session resolution requires an accepted canonical validation report")
    cutoff = utc_instant(knowledge_cutoff)
    if cutoff > validated.validated_dataset.manifest.extracted_at:
        raise ValueError("Knowledge cutoff exceeds the dataset freeze")
    return _Index(validated.validated_dataset, cutoff).resolve()


def _metrics(counts: list[int] | None, status: AnalyticsStatus):
    missing = RatioMetric(status=status if counts is None else AnalyticsStatus.NOT_APPLICABLE)
    no_edge = RatioMetric(status=AnalyticsStatus.NOT_APPLICABLE)
    rows = []
    for i, stage in enumerate(FunnelStage):
        n = counts[i] if counts is not None else None
        adjacent = ratio(n, counts[i - 1]) if counts is not None and i else (no_edge if i == 0 else missing)
        dropped = counts[i] - counts[i + 1] if counts is not None and i < 3 else None
        outgoing = ratio(dropped, n) if dropped is not None else (no_edge if i == 3 else missing)
        rows.append(FunnelStageMetrics(
            stage=stage, stage_count=n, adjacent_conversion_rate=adjacent,
            adjacent_dropoff_count=dropped, adjacent_dropoff_rate=outgoing,
            cumulative_conversion_rate=ratio(n, counts[0]) if counts is not None else missing,
            cumulative_dropoff_rate=ratio(counts[0] - n, counts[0]) if counts is not None else missing,
        ))
    measurable = [(i, row.adjacent_dropoff_rate) for i, row in enumerate(rows[:3]) if row.adjacent_dropoff_rate.status == AnalyticsStatus.VALID]
    if measurable:
        # Exact fractions avoid rounding-induced ties; earliest funnel transition
        # wins a real tie. This is descriptive, with no causal explanation/action.
        i, largest = max(measurable, key=lambda pair: (Fraction(pair[1].numerator, pair[1].denominator), -pair[0]))
        transition = tuple(FunnelTransition)[i]
    else:
        transition, largest = None, (no_edge if counts is not None else missing)
    overall = ratio(counts[3], counts[0]) if counts is not None else missing
    return tuple(rows), overall, transition, largest


def _unattributed(index: _Index, coverage: _Coverage, request: FunnelRequest, resolutions: tuple[SessionStageResolution, ...]):
    by_session = {row.session_id: row for row in resolutions}
    chains = {row.session_id: set(row.qualifying_order_ids) for row in resolutions}
    reasons = Counter()
    observed = 0
    for order in index.orders.values():
        if not in_reporting_interval(order.created_at, request.report_start, request.report_end):
            continue
        observed += 1
        row = by_session.get(order.session_id)
        reason = None
        if order.session_id is None:
            reason = UnattributedReason.MISSING_SESSION
        elif order.cart_id is None:
            reason = UnattributedReason.MISSING_CART
        elif row is None:
            view_coverage = coverage.check(CoverageStream.PRODUCT_VIEWED, min(request.session_history_start, order.created_at), order.created_at)
            reason = UnattributedReason.MISSING_VIEW if view_coverage.assessment.is_complete else UnattributedReason.INSUFFICIENT_COVERAGE
        elif not row.first_view_at <= order.created_at <= row.maturity_time:
            reason = UnattributedReason.OUTSIDE_ATTRIBUTION_WINDOW
        elif order.order_id not in index.creations:
            reason = UnattributedReason.INSUFFICIENT_COVERAGE
        else:
            streams = tuple(stream for stream in BASE_STREAMS if stream != CoverageStream.PURCHASE_COMPLETED)
            if order.customer_id is not None:
                streams += (CoverageStream.CUSTOMERS,)
            checks = [coverage.check(stream, row.first_view_at, order.created_at) for stream in streams]
            checks.append(coverage.check(CoverageStream.PRODUCT_VIEWED, min(request.session_history_start, row.first_view_at), row.first_view_at))
            if any(not check.assessment.is_complete for check in checks):
                reason = UnattributedReason.INSUFFICIENT_COVERAGE
            elif order.order_id not in chains[row.session_id]:
                reason = UnattributedReason.MISSING_CART_ADDITION
        if reason:
            reasons[reason] += 1
    return observed, sum(reasons.values()), tuple(ReasonCount(reason=reason, count=reasons[reason]) for reason in sorted(reasons))


def analyze_funnel(value: SalesDataset | dict, request: FunnelRequest) -> FunnelReport:
    """Compute mature eligible-session metrics for [start,end), using only knowledge at K.

    session_history_start is an explicit adapter declaration covering session
    origins; never substitute report_start for a truncated export's missing past.
    Report-level status flags incomplete cohorts. Available ratios always refer
    ONLY to eligible mature sessions, even when other sessions were excluded.
    """
    request = FunnelRequest.model_validate(request)
    prepared = _prepare(value, request)
    data = prepared.data
    identity = dict(
        dataset_id=data.manifest.dataset_id if data else None,
        source_namespace=data.manifest.source_namespace if data else None,
        data_origin=data.manifest.data_origin if data else None,
    )
    if prepared.failure:
        stages, overall, transition, largest = _metrics(None, prepared.failure)
        return FunnelReport(
            **identity, request=request, status=prepared.failure, stages=stages,
            overall_purchase_conversion=overall, largest_dropoff_stage=transition, largest_dropoff_rate=largest,
            coverage=FunnelCoverageSummary(requested_streams=BASE_STREAMS),
            diagnostics=FunnelDiagnostics(validation_codes=prepared.codes),
        )
    index, coverage = prepared.index, prepared.coverage
    resolutions = index.resolve()
    sessions, eligible = [], []
    failures = {}
    for row in resolutions:
        if not in_reporting_interval(row.first_view_at, request.report_start, request.report_end):
            continue
        if row.maturity_time > request.knowledge_cutoff:
            sessions.append(SessionEligibility(resolution=row, status=AnalyticsStatus.IMMATURE))
            continue
        failed = coverage.session(row)
        status = AnalyticsStatus.INSUFFICIENT_COVERAGE if failed else AnalyticsStatus.VALID
        sessions.append(SessionEligibility(resolution=row, status=status, failed_coverage=failed))
        if failed:
            for failure in failed:
                failures[(failure.stream, failure.interval_start, failure.interval_end)] = failure
        else:
            eligible.append(row)
    discovery = coverage.discovery()
    immature = sum(row.status == AnalyticsStatus.IMMATURE for row in sessions)
    unavailable = sum(row.status == AnalyticsStatus.INSUFFICIENT_COVERAGE for row in sessions)
    enumeration_pending = request.knowledge_cutoff < request.report_end - request.timestamp_resolution
    if unavailable or (discovery is not None and not discovery.assessment.is_complete):
        status = AnalyticsStatus.INSUFFICIENT_COVERAGE
    elif immature or enumeration_pending or discovery is None:
        status = AnalyticsStatus.IMMATURE
    else:
        status = AnalyticsStatus.VALID if eligible else AnalyticsStatus.NOT_APPLICABLE
    counts = None
    if eligible or status == AnalyticsStatus.NOT_APPLICABLE:
        counts = [0, 0, 0, 0]
        stages_in_order = tuple(FunnelStage)
        for row in eligible:
            highest = stages_in_order.index(row.highest_observed_stage)
            for i in range(highest + 1):
                counts[i] += 1
    stages, overall, transition, largest = _metrics(counts, status)
    observed_orders, unattributed, reasons = _unattributed(index, coverage, request, resolutions)
    return FunnelReport(
        **identity, request=request, status=status, stages=stages,
        overall_purchase_conversion=overall, largest_dropoff_stage=transition, largest_dropoff_rate=largest,
        coverage=FunnelCoverageSummary(
            cohort_discovery=discovery,
            requested_streams=BASE_STREAMS + ((CoverageStream.CUSTOMERS,) if index.customer_sessions else ()),
            failed_session_checks=tuple(failures[key] for key in sorted(failures)),
        ),
        diagnostics=FunnelDiagnostics(
            candidate_sessions=len(sessions), eligible_mature_sessions=len(eligible),
            immature_sessions=immature, coverage_unavailable_sessions=unavailable,
            excluded_sessions=immature + unavailable, outside_cohort_sessions=len(resolutions) - len(sessions),
            observed_orders=observed_orders, unattributed_orders=unattributed, unattributed_reasons=reasons,
            identical_retransmissions=prepared.validation.identical_duplicate_count,
            unusable_past_events=index.unusable_past_events,
        ),
        sessions=tuple(sessions),
    )
