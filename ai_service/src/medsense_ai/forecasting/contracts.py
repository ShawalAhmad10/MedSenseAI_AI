"""Frozen contracts for med-sales-forecast-dataset-1.0.0."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from enum import StrEnum
import hashlib
import json
from typing import Annotated, Literal, Self

from pydantic import Field, StrictBool, StrictInt, model_validator

from medsense_ai.sales_data import DataOrigin
from medsense_ai.sales_data.contracts import CanonicalModel, Instant, OpaqueID

BUILDER_VERSION = "med-sales-forecast-dataset-1.0.0"
FEATURE_VERSION = "forecast_features_v1"
TARGET_VERSION = "observed_completed_units_next_7d_v1"
SPLIT_VERSION = "forecast_temporal_split_v1"
DAY = timedelta(days=1)
WEEK = timedelta(days=7)
TICK = timedelta(microseconds=1)
Count = Annotated[StrictInt, Field(ge=0)]
NonnegativeDecimal = Annotated[Decimal, Field(ge=0, allow_inf_nan=False)]


def stable_json(value: object) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False) + "\n").encode()


class ForecastFeatures(CanonicalModel):
    completed_units_lag_1w: Count
    completed_units_lag_2w: Count
    completed_units_lag_4w: Count
    completed_units_lag_8w: Count
    completed_units_sum_4w: Count
    completed_units_mean_4w: NonnegativeDecimal
    completed_units_sum_8w: Count
    completed_units_mean_8w: NonnegativeDecimal
    nonzero_sales_weeks_8w: Annotated[StrictInt, Field(ge=0, le=8)]
    cancellation_count_1w: Count
    cancellation_count_4w: Count
    available_stock_at_t: Count
    stockout_seconds_1w: Count
    stockout_seconds_4w: Count
    receipt_quantity_4w: Count
    iso_week_sin: Annotated[float, Field(ge=-1, le=1, allow_inf_nan=False)]
    iso_week_cos: Annotated[float, Field(ge=-1, le=1, allow_inf_nan=False)]
    month_sin: Annotated[float, Field(ge=-1, le=1, allow_inf_nan=False)]
    month_cos: Annotated[float, Field(ge=-1, le=1, allow_inf_nan=False)]

    @model_validator(mode="after")
    def nested(self) -> Self:
        if self.completed_units_sum_4w > self.completed_units_sum_8w:
            raise ValueError("Nested completed-unit sums must be monotone")
        if self.stockout_seconds_1w > self.stockout_seconds_4w:
            raise ValueError("Nested stockout durations must be monotone")
        if self.stockout_seconds_1w > 7 * 86400 or self.stockout_seconds_4w > 28 * 86400:
            raise ValueError("Stockout duration exceeds its historical window")
        return self


FEATURE_NAMES = tuple(ForecastFeatures.model_fields)


class Partition(StrEnum):
    TRAIN = "train"
    VALIDATION = "validation"
    TEST = "test"


class InventoryContextStatus(StrEnum):
    OBSERVED = "observed"
    INSUFFICIENT_COVERAGE = "insufficient_coverage"


class FeatureLineage(CanonicalModel):
    maximum_normal_fact_time: Instant | None = None
    maximum_inventory_fact_time: Instant | None = None
    maximum_available_at: Instant | None = None
    completion_event_ids: tuple[OpaqueID, ...] = ()
    cancellation_event_ids: tuple[OpaqueID, ...] = ()
    inventory_movement_ids: tuple[OpaqueID, ...] = ()


class ForecastExample(CanonicalModel):
    example_id: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
    dataset_id: OpaqueID
    source_namespace: OpaqueID
    product_id: OpaqueID
    selling_unit: str
    observation_time: Instant
    partition: Partition
    data_origin: DataOrigin
    features: ForecastFeatures
    target_completed_units: Count
    target_start: Instant
    target_end: Instant
    target_stockout_observed: StrictBool | None
    target_stockout_seconds: Count | None
    target_full_week_stockout: StrictBool | None
    inventory_context_status: InventoryContextStatus
    lineage: FeatureLineage

    @model_validator(mode="after")
    def censoring(self) -> Self:
        fields = (self.target_stockout_observed, self.target_stockout_seconds, self.target_full_week_stockout)
        if self.inventory_context_status == InventoryContextStatus.OBSERVED:
            if any(value is None for value in fields):
                raise ValueError("Observed inventory context requires target censoring values")
            if self.target_full_week_stockout != (self.target_stockout_seconds == 7 * 86400):
                raise ValueError("Full-week stockout flag differs from duration")
        elif any(value is not None for value in fields):
            raise ValueError("Unavailable inventory context cannot carry censoring values")
        return self


class Exclusion(CanonicalModel):
    product_id: OpaqueID
    observation_time: Instant
    partition: Partition
    reason: str


class BuildConfig(CanonicalModel):
    builder_version: Literal["med-sales-forecast-dataset-1.0.0"] = BUILDER_VERSION
    feature_version: Literal["forecast_features_v1"] = FEATURE_VERSION
    target_version: Literal["observed_completed_units_next_7d_v1"] = TARGET_VERSION
    split_version: Literal["forecast_temporal_split_v1"] = SPLIT_VERSION
    first_observation: Literal[datetime(2025, 10, 27, tzinfo=timezone.utc)] = datetime(2025, 10, 27, tzinfo=timezone.utc)
    last_observation: Literal[datetime(2026, 8, 24, tzinfo=timezone.utc)] = datetime(2026, 8, 24, tzinfo=timezone.utc)
    lookback_weeks: Literal[8] = 8
    horizon_days: Literal[7] = 7
    # Deterministic bounded audit/reproducibility subset; default builds all products.
    product_limit: Annotated[StrictInt, Field(gt=0)] | None = None

    @property
    def sha256(self) -> str:
        return hashlib.sha256(stable_json(self.model_dump(mode="json"))).hexdigest()
