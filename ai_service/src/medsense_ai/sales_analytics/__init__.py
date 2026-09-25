"""Deterministic non-clinical funnel and explicitly separate order lifecycle analytics."""

from .contracts import (
    AnalyticsStatus, FunnelCoverageSummary, FunnelDiagnostics, FunnelReport, FunnelRequest, FunnelStage, FunnelStageMetrics,
    FunnelTransition, OrderLifecycleReport, RatioMetric, SessionStageResolution,
)
from .funnel import analyze_funnel, resolve_session_stages
from .order_lifecycle import analyze_order_lifecycle
from .engine import analyze_sales
from .v1_contracts import (
    ANALYTICS_VERSION, BucketGranularity, FunnelSummary, LeadCohortSummary,
    MetricStatus, PeriodSalesSummary, ProductInventoryContext,
    ProductPerformance, ProductRankingReport, RepeatCustomerReport,
    SalesAnalyticsReport, SalesAnalyticsRequest, SalesInsight, TrendBucket, TrendReport,
)

__all__ = [
    "AnalyticsStatus", "FunnelCoverageSummary", "FunnelDiagnostics", "FunnelReport", "FunnelRequest", "FunnelStage", "FunnelStageMetrics",
    "FunnelTransition", "OrderLifecycleReport", "RatioMetric", "SessionStageResolution",
    "analyze_funnel", "analyze_order_lifecycle", "resolve_session_stages",
    "ANALYTICS_VERSION", "BucketGranularity", "FunnelSummary", "LeadCohortSummary",
    "MetricStatus", "PeriodSalesSummary", "ProductInventoryContext", "ProductPerformance",
    "ProductRankingReport", "RepeatCustomerReport", "SalesAnalyticsReport",
    "SalesAnalyticsRequest", "SalesInsight", "TrendBucket", "TrendReport", "analyze_sales",
]
