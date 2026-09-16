"""Typed descriptive analytics results. Ratios retain exact integer numerators/denominators."""

from datetime import timedelta
from decimal import Context, Decimal, localcontext, ROUND_HALF_EVEN
from enum import StrEnum
from typing import Annotated, Literal, Self

from pydantic import Field, StrictInt, model_validator

from medsense_ai.sales_data.contracts import CanonicalModel, DataOrigin, Instant, OpaqueID
from medsense_ai.sales_data import CoverageAssessment, CoverageStream, ValidationCode

Count = Annotated[StrictInt, Field(ge=0)]
FOLLOWUP = timedelta(days=7)


class AnalyticsStatus(StrEnum):
    VALID = "valid"
    NOT_APPLICABLE = "not_applicable"
    INSUFFICIENT_COVERAGE = "insufficient_coverage"
    IMMATURE = "immature"
    INVALID_INPUT = "invalid_input"


class FunnelStage(StrEnum):
    PRODUCT_VIEW = "product_view"
    CART_ADDITION = "cart_addition"
    ORDER_CREATION = "order_creation"
    COMPLETED_PURCHASE = "completed_purchase"


class FunnelTransition(StrEnum):
    VIEW_TO_CART = "view_to_cart"
    CART_TO_ORDER = "cart_to_order"
    ORDER_TO_PURCHASE = "order_to_purchase"


class FunnelRequest(CanonicalModel):
    report_start: Instant
    report_end: Instant
    knowledge_cutoff: Instant
    session_history_start: Instant
    timestamp_resolution: timedelta = timedelta(microseconds=1)

    @model_validator(mode="after")
    def boundaries(self) -> Self:
        if self.report_start >= self.report_end:
            raise ValueError("Reporting interval must be nonempty and half-open")
        if self.session_history_start > self.report_start:
            raise ValueError("Session history must cover the reporting interval's start")
        if self.timestamp_resolution <= timedelta(0):
            raise ValueError("Timestamp resolution must be positive")
        if FOLLOWUP % self.timestamp_resolution:
            raise ValueError("Timestamp resolution must align with the seven-day horizon")
        return self


class RatioMetric(CanonicalModel):
    status: AnalyticsStatus
    numerator: Count | None = None
    denominator: Count | None = None
    value: Decimal | None = None

    @model_validator(mode="after")
    def consistency(self) -> Self:
        if self.status == AnalyticsStatus.VALID:
            if self.numerator is None or self.denominator is None or self.denominator == 0:
                raise ValueError("Measured ratios require a nonzero denominator")
            with localcontext(Context(prec=28, rounding=ROUND_HALF_EVEN)):
                expected = Decimal(self.numerator) / Decimal(self.denominator)
            if self.value != expected or not 0 <= expected <= 1:
                raise ValueError("Ratio value must match its exact counts")
        elif self.value is not None:
            raise ValueError("Unavailable ratios cannot contain a measured value")
        return self


def ratio(numerator: int, denominator: int) -> RatioMetric:
    """Decimal presentation is deterministic; the integer fraction remains exact."""
    if denominator == 0:
        return RatioMetric(status=AnalyticsStatus.NOT_APPLICABLE, numerator=numerator, denominator=0)
    with localcontext(Context(prec=28, rounding=ROUND_HALF_EVEN)):
        value = Decimal(numerator) / Decimal(denominator)
    return RatioMetric(status=AnalyticsStatus.VALID, numerator=numerator, denominator=denominator, value=value)


class FunnelStageMetrics(CanonicalModel):
    stage: FunnelStage
    stage_count: Count | None
    # Conversion is incoming (previous -> this); drop-off is outgoing (this -> next).
    adjacent_conversion_rate: RatioMetric
    adjacent_dropoff_count: Count | None
    adjacent_dropoff_rate: RatioMetric
    cumulative_conversion_rate: RatioMetric
    cumulative_dropoff_rate: RatioMetric


class StreamCoverage(CanonicalModel):
    stream: CoverageStream
    interval_start: Instant
    interval_end: Instant
    assessment: CoverageAssessment


class SessionStageResolution(CanonicalModel):
    """Observed chain only; eligibility/coverage are decided separately, without customer IDs."""
    session_id: OpaqueID
    first_view_at: Instant
    maturity_time: Instant
    highest_observed_stage: FunnelStage
    qualifying_order_ids: tuple[OpaqueID, ...] = ()


class SessionEligibility(CanonicalModel):
    resolution: SessionStageResolution
    status: AnalyticsStatus
    failed_coverage: tuple[StreamCoverage, ...] = ()


class FunnelCoverageSummary(CanonicalModel):
    # Cohort discovery checks first-view history, including a zero-observed-session cohort.
    cohort_discovery: StreamCoverage | None = None
    requested_streams: tuple[CoverageStream, ...] = ()
    failed_session_checks: tuple[StreamCoverage, ...] = ()


class UnattributedReason(StrEnum):
    MISSING_SESSION = "missing_session"
    MISSING_CART = "missing_cart"
    MISSING_VIEW = "missing_view"
    MISSING_CART_ADDITION = "missing_cart_addition"
    OUTSIDE_ATTRIBUTION_WINDOW = "outside_attribution_window"
    INSUFFICIENT_COVERAGE = "insufficient_coverage"


class ReasonCount(CanonicalModel):
    reason: UnattributedReason
    count: Count


class FunnelDiagnostics(CanonicalModel):
    candidate_sessions: Count = 0
    eligible_mature_sessions: Count = 0
    immature_sessions: Count = 0
    coverage_unavailable_sessions: Count = 0
    excluded_sessions: Count = 0
    outside_cohort_sessions: Count = 0
    # These order diagnostics concern known order placements in [report_start, report_end).
    observed_orders: Count | None = None
    unattributed_orders: Count | None = None
    unattributed_reasons: tuple[ReasonCount, ...] = ()
    identical_retransmissions: Count = 0
    unusable_past_events: Count = 0
    validation_codes: tuple[ValidationCode, ...] = ()


class FunnelReport(CanonicalModel):
    contract_version: Literal["sales_contract_v1"] = "sales_contract_v1"
    funnel_version: Literal["funnel_v1"] = "funnel_v1"
    dataset_id: OpaqueID | None
    source_namespace: OpaqueID | None
    data_origin: DataOrigin | None
    request: FunnelRequest
    followup_days: Literal[7] = 7
    status: AnalyticsStatus
    stages: tuple[FunnelStageMetrics, ...]
    overall_purchase_conversion: RatioMetric
    largest_dropoff_stage: FunnelTransition | None
    largest_dropoff_rate: RatioMetric
    coverage: FunnelCoverageSummary
    diagnostics: FunnelDiagnostics
    sessions: tuple[SessionEligibility, ...] = ()

    @model_validator(mode="after")
    def stage_order(self) -> Self:
        if tuple(row.stage for row in self.stages) != tuple(FunnelStage):
            raise ValueError("funnel_v1 requires exactly its four ordered stages")
        counts = [row.stage_count for row in self.stages]
        if all(count is not None for count in counts):
            if counts != sorted(counts, reverse=True):
                raise ValueError("Funnel stage counts must be nested")
        return self


class OrderLifecycleReport(CanonicalModel):
    """Order-placement cohort with its own 7-day follow-up; explicitly not funnel_v1."""
    report_kind: Literal["order_lifecycle_7d"] = "order_lifecycle_7d"
    dataset_id: OpaqueID | None
    data_origin: DataOrigin | None
    request: FunnelRequest
    status: AnalyticsStatus
    observed_created_orders: Count | None
    eligible_mature_orders: Count
    completed_within_followup: Count | None
    cancelled_within_followup: Count | None
    pending_at_followup_end: Count | None
    immature_orders: Count
    unavailable_orders: Count
    completion_rate: RatioMetric
    validation_codes: tuple[ValidationCode, ...] = ()
