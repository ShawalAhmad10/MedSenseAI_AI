"""Model-independent lead_features_v1 schemas, fixed allowlist and audit states."""

from datetime import timedelta
from decimal import Context, Decimal, ROUND_HALF_EVEN, localcontext
from enum import StrEnum
import hashlib
import json
from typing import Annotated, Literal, Self

from pydantic import Field, StrictBool, StrictInt, model_validator

from medsense_ai.sales_data import CoverageState, CoverageStream, DataOrigin
from medsense_ai.sales_data.contracts import CanonicalModel, Instant, OpaqueID

FEATURE_VERSION = "lead_features_v1"
TARGET_VERSION = "repeat_purchase_30d_v1"
BUILDER_VERSION = "med-sales-lead-dataset-1.0.0"
SPLIT_VERSION = "lead_temporal_split_v1"
DAY = timedelta(days=1)
TICK = timedelta(microseconds=1)
Count = Annotated[StrictInt, Field(ge=0)]
Days = Annotated[Decimal, Field(ge=0, le=60, allow_inf_nan=False)]


def stable_json(value: object) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False) + "\n").encode("utf-8")


def quotient(numerator: int, denominator: int) -> Decimal:
    with localcontext(Context(prec=28, rounding=ROUND_HALF_EVEN)):
        return Decimal(numerator) / Decimal(denominator)


def elapsed_days(delta: timedelta) -> Decimal:
    microseconds = (delta.days * 86400 + delta.seconds) * 1_000_000 + delta.microseconds
    return quotient(microseconds, 86_400_000_000)


class Features(CanonicalModel):
    purchase_count_7d: Count
    purchase_count_30d: Count
    purchase_count_60d: Count
    purchase_recency_days: Days
    session_count_7d: Count
    session_count_30d: Count
    session_count_60d: Count
    product_view_count_7d: Count
    product_view_count_30d: Count
    product_view_count_60d: Count
    distinct_products_viewed_7d: Count
    distinct_products_viewed_30d: Count
    distinct_products_viewed_60d: Count
    cart_add_count_7d: Count
    cart_add_count_30d: Count
    cart_add_count_60d: Count
    cart_add_quantity_7d: Count
    cart_add_quantity_30d: Count
    cart_add_quantity_60d: Count
    cart_remove_count_7d: Count
    cart_remove_count_30d: Count
    cart_remove_count_60d: Count
    cart_remove_quantity_7d: Count
    cart_remove_quantity_30d: Count
    cart_remove_quantity_60d: Count
    days_since_last_cart_add: Days | None
    no_cart_add_60d: StrictBool
    purchase_frequency_ratio_30d_60d: Annotated[Decimal, Field(ge=0, le=1, allow_inf_nan=False)]

    @model_validator(mode="after")
    def coherent(self) -> Self:
        for stem in COUNT_STEMS:
            values = [getattr(self, f"{stem}_{days}d") for days in (7, 30, 60)]
            if values != sorted(values):
                raise ValueError("Nested feature windows must be monotone")
        if self.purchase_count_60d == 0:
            raise ValueError("Features require an eligible prior purchaser")
        if self.purchase_frequency_ratio_30d_60d != quotient(self.purchase_count_30d, self.purchase_count_60d):
            raise ValueError("Purchase ratio differs from the documented count fraction")
        if self.no_cart_add_60d != (self.cart_add_count_60d == 0) or self.no_cart_add_60d != (self.days_since_last_cart_add is None):
            raise ValueError("Cart recency null must mean no observed add under complete coverage")
        return self


COUNT_STEMS = ("purchase_count", "session_count", "product_view_count", "distinct_products_viewed", "cart_add_count", "cart_add_quantity", "cart_remove_count", "cart_remove_quantity")
FEATURE_NAMES = tuple(Features.model_fields)


class Partition(StrEnum):
    WARMUP = "warmup"
    TRAIN = "train"
    PURGE_1 = "purge_1"
    VALIDATION = "validation"
    PURGE_2 = "purge_2"
    TEST = "test"
    TAIL = "tail"
    OUTSIDE = "outside"


class Eligibility(StrEnum):
    ELIGIBLE = "eligible"
    OUT_OF_SCOPE = "out_of_scope"
    INSUFFICIENT_DATA = "insufficient_data"
    NOT_KNOWN = "not_known"


class LabelStatus(StrEnum):
    LABELED = "labeled"
    NOT_ELIGIBLE = "not_eligible"
    IMMATURE = "immature"
    INSUFFICIENT_FOLLOWUP = "insufficient_followup"


class CoverageFailure(CanonicalModel):
    stream: CoverageStream
    state: CoverageState
    has_gaps: StrictBool
    reason: Literal["source_coverage", "fact_or_join_unavailable"]


class FeatureEvidence(CanonicalModel):
    # Audit-only references to the actual contributing facts; never matrix columns.
    event_ids: tuple[OpaqueID, ...]
    order_ids: tuple[OpaqueID, ...]
    product_ids: tuple[OpaqueID, ...]
    maximum_fact_time: Instant
    maximum_available_at: Instant


class FeatureResult(CanonicalModel):
    eligibility: Eligibility
    reason: str | None = None
    features: Features | None = None
    evidence: FeatureEvidence | None = None
    failed_coverage: tuple[CoverageFailure, ...] = ()

    @model_validator(mode="after")
    def availability(self) -> Self:
        present = (self.features is not None, self.evidence is not None)
        if (self.eligibility == Eligibility.ELIGIBLE and not all(present)) or (self.eligibility != Eligibility.ELIGIBLE and any(present)):
            raise ValueError("Only eligible snapshots carry features and evidence")
        return self


class LabelResult(CanonicalModel):
    status: LabelStatus
    horizon_end: Instant
    evidence_cutoff: Instant
    label: Literal[0, 1] | None = None
    reason: str | None = None
    qualifying_order_ids: tuple[OpaqueID, ...] = ()
    failed_coverage: tuple[CoverageFailure, ...] = ()

    @model_validator(mode="after")
    def availability(self) -> Self:
        if (self.status == LabelStatus.LABELED) != (self.label is not None):
            raise ValueError("Only mature covered outcomes may have a label")
        if bool(self.qualifying_order_ids) != (self.label == 1):
            raise ValueError("Positive labels require qualifying audit references")
        return self


class Example(CanonicalModel):
    example_id: OpaqueID
    dataset_id: OpaqueID
    source_namespace: OpaqueID
    customer_id: OpaqueID
    observation_time: Instant
    data_origin: DataOrigin
    partition: Partition
    feature_result: FeatureResult
    label_result: LabelResult

    @property
    def supervised(self) -> bool:
        return self.partition in (Partition.TRAIN, Partition.VALIDATION, Partition.TEST) and self.feature_result.eligibility == Eligibility.ELIGIBLE and self.label_result.status == LabelStatus.LABELED


class BuildConfig(CanonicalModel):
    builder_version: Literal["med-sales-lead-dataset-1.0.0"] = BUILDER_VERSION
    feature_version: Literal["lead_features_v1"] = FEATURE_VERSION
    target_version: Literal["repeat_purchase_30d_v1"] = TARGET_VERSION
    split_policy_version: Literal["lead_temporal_split_v1"] = SPLIT_VERSION
    observation_start: Instant = "2025-11-01T00:00:00Z"
    observation_end: Instant = "2026-08-02T00:00:00Z"
    # An optional deterministic audit subset, never outcome-based resampling.
    customer_limit: Annotated[StrictInt, Field(gt=0)] | None = None

    @model_validator(mode="after")
    def interval(self) -> Self:
        if self.observation_start >= self.observation_end:
            raise ValueError("Observation interval must be nonempty")
        return self

    @property
    def sha256(self) -> str:
        return hashlib.sha256(stable_json(self.model_dump(mode="json"))).hexdigest()
