"""Integration-ready, partner-neutral contracts for forecast runtime v1."""

from datetime import timedelta
from enum import StrEnum
from typing import Annotated, Literal, Self

from pydantic import Field, model_validator

from medsense_ai.sales_data.contracts import CanonicalModel, Instant, OpaqueID
from .contracts import FEATURE_VERSION, TARGET_VERSION
from .model.contracts import MODEL_VERSION, NOTICE

RUNTIME_VERSION = "med-sales-forecast-runtime-1.0.0"
STOCKOUT_LIMITATION = (
    "Prediction estimates observed completed units from historical information available at T. "
    "Future stock availability may materially affect realized sales."
)


class ForecastStatus(StrEnum):
    FORECASTED = "forecasted"
    OUT_OF_SCOPE = "out_of_scope"
    INSUFFICIENT_HISTORY = "insufficient_history"
    INSUFFICIENT_COVERAGE = "insufficient_coverage"
    PRODUCT_NOT_KNOWN = "product_not_known"
    MODEL_UNAVAILABLE = "model_unavailable"
    INVALID_INPUT = "invalid_input"


class ForecastRequest(CanonicalModel):
    source_namespace: OpaqueID
    product_id: OpaqueID
    observation_time: Instant


class ForecastResult(CanonicalModel):
    status: ForecastStatus
    runtime_version: Literal["med-sales-forecast-runtime-1.0.0"] = RUNTIME_VERSION
    model_version: Literal["med-sales-forecast-1.0.0"] = MODEL_VERSION
    feature_version: Literal["forecast_features_v1"] = FEATURE_VERSION
    target_version: Literal["observed_completed_units_next_7d_v1"] = TARGET_VERSION
    source_namespace: OpaqueID | None = None
    product_id: OpaqueID | None = None
    observation_time: Instant | None = None
    horizon_start: Instant | None = None
    horizon_end: Instant | None = None
    predicted_completed_units_next_7d: Annotated[float, Field(ge=0, allow_inf_nan=False)] | None = None
    selling_unit: str | None = None
    reason_code: str | None = None
    stockout_limitation: Literal[STOCKOUT_LIMITATION] = STOCKOUT_LIMITATION
    synthetic_development_notice: Literal[NOTICE] = NOTICE

    @model_validator(mode="after")
    def prediction_only_when_forecasted(self) -> Self:
        if self.status == ForecastStatus.FORECASTED:
            required = (
                self.source_namespace, self.product_id, self.observation_time,
                self.horizon_start, self.horizon_end, self.predicted_completed_units_next_7d,
                self.selling_unit,
            )
            if any(value is None for value in required) or self.reason_code is not None:
                raise ValueError("Forecasted result requires complete identity, horizon, unit and prediction")
            if self.horizon_start != self.observation_time or self.horizon_end != self.observation_time + timedelta(days=7):
                raise ValueError("Forecast result horizon differs from the frozen seven-day target")
        else:
            if self.predicted_completed_units_next_7d is not None:
                raise ValueError("Non-forecasted status cannot carry a numeric prediction")
            if not self.reason_code:
                raise ValueError("Non-forecasted status requires an explicit reason code")
        return self


class ForecastBatchResult(CanonicalModel):
    runtime_version: Literal["med-sales-forecast-runtime-1.0.0"] = RUNTIME_VERSION
    source_namespace: OpaqueID
    observation_time: Instant
    results: tuple[ForecastResult, ...]
    deterministic_order: Literal["product_id_ascending"] = "product_id_ascending"

    @model_validator(mode="after")
    def ordered(self) -> Self:
        product_ids = [row.product_id for row in self.results]
        if product_ids != sorted(product_ids, key=lambda value: value or ""):
            raise ValueError("Batch forecast results are not deterministically ordered")
        return self
