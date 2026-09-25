"""Small independent order-placement cohort report, explicitly not the four-stage funnel."""

from medsense_ai.sales_data import CoverageStream, EventName, SalesDataset, in_reporting_interval

from .contracts import AnalyticsStatus, FOLLOWUP, FunnelRequest, OrderLifecycleReport, RatioMetric, ratio
from .funnel import _prepare


def analyze_order_lifecycle(value: SalesDataset | dict, request: FunnelRequest) -> OrderLifecycleReport:
    """Count outcomes within seven days of ORDER creation, with mature complete cohorts.

    Completion after this horizon remains a sale; this report only measures its
    named fixed-horizon cohort. No view, cart or session telemetry is required.
    """
    request = FunnelRequest.model_validate(request)
    prepared = _prepare(value, request, session_policy=False)
    data, index, coverage = prepared.data, prepared.index, prepared.coverage
    identity = dict(dataset_id=data.manifest.dataset_id if data else None, data_origin=data.manifest.data_origin if data else None)
    if prepared.failure:
        return OrderLifecycleReport(
            **identity, request=request, status=prepared.failure, observed_created_orders=None,
            eligible_mature_orders=0, completed_within_followup=None, cancelled_within_followup=None,
            pending_at_followup_end=None, immature_orders=0, unavailable_orders=0,
            completion_rate=RatioMetric(status=prepared.failure), validation_codes=prepared.codes,
        )
    eligible = completed = cancelled = immature = unavailable = observed = 0
    for order in index.orders.values():
        if not in_reporting_interval(order.created_at, request.report_start, request.report_end):
            continue
        observed += 1
        end = order.created_at + FOLLOWUP
        if end > request.knowledge_cutoff:
            immature += 1
            continue
        streams = (CoverageStream.ORDERS, CoverageStream.ORDER_CREATED, CoverageStream.PURCHASE_COMPLETED, CoverageStream.ORDER_CANCELLED)
        if order.customer_id is not None:
            streams += (CoverageStream.CUSTOMERS,)
        if order.order_id not in index.creations or any(not coverage.check(stream, order.created_at, end).assessment.is_complete for stream in streams):
            unavailable += 1
            continue
        eligible += 1
        terminal = index.terminals.get(order.order_id)
        if terminal and terminal.occurred_at <= end:
            completed += terminal.event_name == EventName.PURCHASE_COMPLETED
            cancelled += terminal.event_name == EventName.ORDER_CANCELLED
    discovery_end = min(request.knowledge_cutoff, request.report_end - request.timestamp_resolution)
    discovery = None if discovery_end < request.report_start else coverage.check(CoverageStream.ORDER_CREATED, request.report_start, discovery_end)
    if unavailable or (discovery is not None and not discovery.assessment.is_complete):
        status = AnalyticsStatus.INSUFFICIENT_COVERAGE
    elif immature or discovery is None or request.knowledge_cutoff < request.report_end - request.timestamp_resolution:
        status = AnalyticsStatus.IMMATURE
    else:
        status = AnalyticsStatus.VALID if eligible else AnalyticsStatus.NOT_APPLICABLE
    measurable = eligible > 0 or status == AnalyticsStatus.NOT_APPLICABLE
    return OrderLifecycleReport(
        **identity, request=request, status=status, observed_created_orders=observed,
        eligible_mature_orders=eligible, completed_within_followup=completed if measurable else None,
        cancelled_within_followup=cancelled if measurable else None,
        pending_at_followup_end=eligible - completed - cancelled if measurable else None,
        immature_orders=immature, unavailable_orders=unavailable,
        completion_rate=ratio(completed, eligible) if measurable else RatioMetric(status=status),
    )
