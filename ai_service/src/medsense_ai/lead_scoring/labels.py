"""Future new-order labels with split-specific evidence cutoffs; no feature access."""

from datetime import datetime

from medsense_ai.sales_data import EventName, in_future_outcome_window
from medsense_ai.sales_data.contracts import utc_instant
from .contracts import DAY, TICK, Eligibility, LabelResult, LabelStatus
from .features import LABEL_STREAMS, LeadIndex


def build_label(index: LeadIndex, customer_id: str, observation_time: datetime, evidence_cutoff: datetime, eligibility: Eligibility) -> LabelResult:
    at, cutoff = utc_instant(observation_time), utc_instant(evidence_cutoff)
    if cutoff > index.data.manifest.extracted_at:
        raise ValueError("Label evidence cutoff exceeds source freeze")
    horizon = at + DAY * 30
    metadata = dict(horizon_end=horizon, evidence_cutoff=cutoff)
    if eligibility != Eligibility.ELIGIBLE:
        return LabelResult(**metadata, status=LabelStatus.NOT_ELIGIBLE, reason="observation_not_eligible")
    if horizon > cutoff:
        return LabelResult(**metadata, status=LabelStatus.IMMATURE, reason="horizon_exceeds_label_cutoff")
    failures = index.coverage_failures(LABEL_STREAMS, at + TICK, horizon, cutoff)
    if failures:
        return LabelResult(**metadata, status=LabelStatus.INSUFFICIENT_FOLLOWUP, reason="future_coverage_or_availability", failed_coverage=failures)
    future = index.window(customer_id, EventName.PURCHASE_COMPLETED, at, horizon, cutoff, left_open=True)
    qualifying = tuple(sorted({f.event.order_id for f in future if in_future_outcome_window(index.orders[f.event.order_id].created_at, at)}))
    return LabelResult(**metadata, status=LabelStatus.LABELED, label=int(bool(qualifying)), qualifying_order_ids=qualifying)
