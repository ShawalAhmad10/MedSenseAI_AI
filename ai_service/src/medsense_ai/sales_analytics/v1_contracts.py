"""Typed outputs for deterministic, partner-independent sales_analytics_v1."""

from datetime import timedelta
from decimal import Context, Decimal, ROUND_HALF_EVEN, localcontext
from enum import StrEnum
from typing import Annotated, Literal, Self

from pydantic import Field, StrictInt, model_validator

from medsense_ai.sales_data.contracts import CanonicalModel, Instant, OpaqueID

ANALYTICS_VERSION = "sales_analytics_v1"
Count = Annotated[StrictInt, Field(ge=0)]


class MetricStatus(StrEnum):
    OBSERVED = "observed"
    INSUFFICIENT_COVERAGE = "insufficient_coverage"
    NOT_APPLICABLE = "not_applicable"
    INVALID_INPUT = "invalid_input"


class BucketGranularity(StrEnum):
    DAY = "day"
    WEEK = "week"
    MONTH = "month"


class SalesAnalyticsRequest(CanonicalModel):
    source_namespace: OpaqueID
    dataset_id: OpaqueID
    report_start: Instant
    report_end: Instant
    knowledge_cutoff: Instant
    bucket_granularity: BucketGranularity = BucketGranularity.MONTH
    customer_history_start: Instant
    session_history_start: Instant | None = None
    ranking_limit_n: Annotated[StrictInt, Field(gt=0)] | None = None
    timestamp_resolution: timedelta = timedelta(microseconds=1)

    @model_validator(mode="after")
    def boundaries(self) -> Self:
        if self.report_start >= self.report_end:
            raise ValueError("Reporting interval must be nonempty and half-open")
        if self.customer_history_start > self.report_start:
            raise ValueError("Customer history must begin no later than report start")
        if self.report_end > self.knowledge_cutoff:
            raise ValueError("Knowledge cutoff must cover the reporting interval")
        if self.session_history_start is not None and self.session_history_start > self.report_start:
            raise ValueError("Session history must begin no later than report start")
        if self.timestamp_resolution <= timedelta(0):
            raise ValueError("Timestamp resolution must be positive")
        return self


class CountMetric(CanonicalModel):
    status: MetricStatus
    value: Count | None = None
    reason: str | None = None

    @model_validator(mode="after")
    def available_value(self) -> Self:
        if (self.status == MetricStatus.OBSERVED) != (self.value is not None):
            raise ValueError("Only observed count metrics carry a value")
        if self.status == MetricStatus.OBSERVED and self.reason is not None:
            raise ValueError("Observed count metrics cannot carry an unavailability reason")
        return self


class RatioValue(CanonicalModel):
    status: MetricStatus
    numerator: Count | None = None
    denominator: Count | None = None
    value: Decimal | None = None

    @model_validator(mode="after")
    def coherent_value(self) -> Self:
        numeric = (self.numerator, self.denominator, self.value)
        if self.status == MetricStatus.OBSERVED:
            if any(item is None for item in numeric) or self.denominator == 0:
                raise ValueError("Observed ratios require a positive denominator and computed value")
            with localcontext(Context(prec=28, rounding=ROUND_HALF_EVEN)):
                expected = Decimal(self.numerator) / Decimal(self.denominator)
            if self.value != expected:
                raise ValueError("Observed ratio value must equal numerator / denominator")
        elif self.status == MetricStatus.NOT_APPLICABLE:
            if self.value is not None:
                raise ValueError("Not-applicable ratios cannot carry a value")
            if (self.numerator is None) != (self.denominator is None):
                raise ValueError("Not-applicable ratio counts must be supplied together")
            if self.denominator not in (None, 0):
                raise ValueError("Not-applicable ratios may only identify a zero denominator")
        elif any(item is not None for item in numeric):
            raise ValueError("Unavailable ratio metrics cannot carry numeric values")
        return self


class CurrencyAmount(CanonicalModel):
    currency: Annotated[str, Field(pattern=r"^[A-Z]{3}$")]
    status: MetricStatus
    amount_minor: Count | None = None
    numerator_minor: Count | None = None
    denominator: Count | None = None
    average_minor: Decimal | None = None
    reason: str | None = None

    @model_validator(mode="after")
    def coherent_value(self) -> Self:
        average_fields = (self.numerator_minor, self.denominator, self.average_minor)
        if self.status == MetricStatus.OBSERVED:
            is_total = self.amount_minor is not None and all(item is None for item in average_fields)
            is_average = self.amount_minor is None and all(item is not None for item in average_fields)
            if not (is_total or is_average):
                raise ValueError("Observed currency metrics require exactly one total or average representation")
            if is_average:
                if self.denominator == 0:
                    raise ValueError("Observed currency averages require a positive denominator")
                with localcontext(Context(prec=28, rounding=ROUND_HALF_EVEN)):
                    expected = Decimal(self.numerator_minor) / Decimal(self.denominator)
                if self.average_minor != expected:
                    raise ValueError("Observed currency average must equal numerator / denominator")
        elif self.status == MetricStatus.NOT_APPLICABLE:
            if self.amount_minor is not None or self.average_minor is not None:
                raise ValueError("Not-applicable currency metrics cannot carry a result")
            if (self.numerator_minor is None) != (self.denominator is None):
                raise ValueError("Not-applicable currency counts must be supplied together")
            if self.denominator not in (None, 0):
                raise ValueError("Not-applicable currency averages may only identify a zero denominator")
        elif any(item is not None for item in (self.amount_minor, *average_fields)):
            raise ValueError("Unavailable currency metrics cannot carry numeric values")
        return self


class PeriodSalesSummary(CanonicalModel):
    status: MetricStatus
    completed_order_count: CountMetric
    cancelled_order_count: CountMetric
    completed_units: CountMetric
    identified_completed_order_count: CountMetric
    anonymous_completed_order_count: CountMetric
    monetary_status: MetricStatus
    completed_merchandise_subtotals: tuple[CurrencyAmount, ...] = ()
    average_completed_order_subtotals: tuple[CurrencyAmount, ...] = ()


class TrendBucket(CanonicalModel):
    bucket_start: Instant
    bucket_end: Instant
    completed_order_count: CountMetric
    cancelled_order_count: CountMetric
    completed_units: CountMetric
    completed_merchandise_subtotals: tuple[CurrencyAmount, ...] = ()


class TrendReport(CanonicalModel):
    status: MetricStatus
    timezone: Literal["UTC"] = "UTC"
    granularity: BucketGranularity
    monetary_status: MetricStatus
    buckets: tuple[TrendBucket, ...] = ()


class ProductPerformance(CanonicalModel):
    product_id: OpaqueID
    rank: Annotated[StrictInt, Field(gt=0)]
    completed_units: Count
    completed_order_count: Count
    completed_line_subtotals: tuple[CurrencyAmount, ...] = ()


class ProductRankingReport(CanonicalModel):
    status: MetricStatus
    monetary_status: MetricStatus
    products: tuple[ProductPerformance, ...] = ()
    high_seller_product_ids: tuple[OpaqueID, ...] = ()
    low_seller_product_ids: tuple[OpaqueID, ...] = ()
    reason: str | None = None


class RepeatCustomerReport(CanonicalModel):
    status: MetricStatus
    identified_completed_order_count: CountMetric
    anonymous_completed_order_count: CountMetric
    repeat_completed_order_count: CountMetric
    repeat_order_contribution: RatioValue
    identified_completed_subtotals: tuple[CurrencyAmount, ...] = ()
    repeat_completed_subtotals: tuple[CurrencyAmount, ...] = ()
    repeat_subtotal_contributions: tuple[CurrencyAmount, ...] = ()


class ProductInventoryContext(CanonicalModel):
    product_id: OpaqueID
    status: MetricStatus
    available_stock_at_start: StrictInt | None = None
    available_stock_at_end: StrictInt | None = None
    observed_stockout: bool | None = None
    stockout_count: Count | None = None
    fully_bounded_stockout_seconds: Count | None = None
    stockout_boundaries: tuple[tuple[Instant, Instant], ...] = ()
    reason: str | None = None


class FunnelSummary(CanonicalModel):
    status: MetricStatus
    funnel_version: Literal["funnel_v1"] = "funnel_v1"
    stage_counts: dict[str, Count | None] = {}
    adjacent_conversion_rates: dict[str, Decimal | None] = {}
    adjacent_dropoff_counts: dict[str, Count | None] = {}
    adjacent_dropoff_rates: dict[str, Decimal | None] = {}
    overall_conversion: Decimal | None = None
    largest_dropoff_transition: str | None = None
    eligible_sessions: Count = 0
    immature_sessions: Count = 0
    coverage_unavailable_sessions: Count = 0
    unattributed_order_count: Count | None = None
    unattributed_reasons: dict[str, Count] = {}
    coverage_evidence: dict = {}
    reason: str | None = None


class LeadRank(CanonicalModel):
    rank: Annotated[StrictInt, Field(gt=0)]
    customer_id: OpaqueID
    lead_score: Annotated[float, Field(ge=0, le=100, allow_inf_nan=False)]
    decile: Annotated[StrictInt, Field(ge=1, le=10)]


class LeadCohortSummary(CanonicalModel):
    status: MetricStatus
    status_counts: dict[str, Count] = {}
    scored_customer_count: Count = 0
    minimum_score: float | None = None
    maximum_score: float | None = None
    mean_score: float | None = None
    ranking: tuple[LeadRank, ...] = ()
    model_version: str | None = None
    feature_version: str | None = None
    target_version: str | None = None
    observation_time: Instant | None = None
    synthetic_development_notice: str | None = None
    reason: str | None = None


class SalesInsight(CanonicalModel):
    rule_id: str
    analytics_version: Literal["sales_analytics_v1"] = ANALYTICS_VERSION
    source_namespace: OpaqueID
    report_start: Instant
    report_end: Instant
    metric_references: tuple[str, ...]
    underlying_values: dict[str, object]
    coverage_status: MetricStatus
    limitation_code: str
    text: str


class SalesAnalyticsReport(CanonicalModel):
    analytics_version: Literal["sales_analytics_v1"] = ANALYTICS_VERSION
    sales_contract_version: Literal["sales_contract_v1"] = "sales_contract_v1"
    source_namespace: OpaqueID
    dataset_id: OpaqueID
    request: SalesAnalyticsRequest
    status: MetricStatus
    period_sales: PeriodSalesSummary
    trends: TrendReport
    product_rankings: ProductRankingReport
    repeat_customers: RepeatCustomerReport
    inventory_context: tuple[ProductInventoryContext, ...] = ()
    funnel_summary: FunnelSummary
    lead_cohort_summary: LeadCohortSummary
    insights: tuple[SalesInsight, ...] = ()
    limitations: tuple[str, ...] = ()
