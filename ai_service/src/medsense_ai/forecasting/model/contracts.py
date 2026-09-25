"""Frozen contracts for bounded observed-sales forecasting model v1."""

from hashlib import sha256
from typing import Annotated, Literal, Self

from pydantic import Field, model_validator

from medsense_ai.sales_data.contracts import CanonicalModel
from ..contracts import FEATURE_NAMES, FEATURE_VERSION, TARGET_VERSION, ForecastFeatures, stable_json

MODEL_VERSION = "med-sales-forecast-1.0.0"
SPLIT_VERSION = "forecast_temporal_split_v1"
NOTICE = (
    "Synthetic-development prediction of observed completed-unit sales; not true demand, "
    "required inventory, a reorder quantity, or a procurement instruction."
)
Method = Literal["persistence", "poisson_regressor"]


class TrainingConfig(CanonicalModel):
    model_version: Literal["med-sales-forecast-1.0.0"] = MODEL_VERSION
    thread_limit: Literal[1] = 1
    poisson_alpha: Literal[1.0] = 1.0
    poisson_max_iter: Literal[1000] = 1000
    poisson_tol: Literal[1e-7] = 1e-7
    poisson_solver: Literal["lbfgs"] = "lbfgs"
    candidate_adjustments: Literal[0] = 0

    @property
    def policy(self) -> dict:
        return {
            **self.model_dump(),
            "feature_version": FEATURE_VERSION,
            "target_version": TARGET_VERSION,
            "split_version": SPLIT_VERSION,
            "methods": ["persistence", "poisson_regressor"],
            "selection_metric": "pooled product-week validation MAE",
            "selection_rule": "lower validation MAE; an exact tie selects persistence",
            "persistence": {"prediction_feature": "completed_units_lag_1w", "fitted": False},
            "poisson_regressor": {
                "pooled_model": True,
                "preprocessing": "StandardScaler fitted on TRAIN only",
                "alpha": self.poisson_alpha,
                "fit_intercept": True,
                "solver": self.poisson_solver,
                "max_iter": self.poisson_max_iter,
                "tol": self.poisson_tol,
                "warm_start": False,
            },
            "feature_order": list(FEATURE_NAMES),
            "resampling": False,
            "target_transformation": "none",
            "product_id_feature": False,
        }

    @property
    def sha256(self) -> str:
        return sha256(stable_json(self.policy)).hexdigest()


class FrozenSelection(CanonicalModel):
    method: Method
    source_hash_manifest_sha256: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
    training_config_sha256: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
    validation_mae: Annotated[float, Field(ge=0, allow_inf_nan=False)]
    selection_scope: Literal["validation_only"] = "validation_only"


class ForecastInput(CanonicalModel):
    feature_version: Literal["forecast_features_v1"]
    feature_order: tuple[str, ...] = FEATURE_NAMES
    features: ForecastFeatures

    @model_validator(mode="after")
    def ordered(self) -> Self:
        if self.feature_order != FEATURE_NAMES:
            raise ValueError("Inference feature order differs from forecast_features_v1")
        return self


class ForecastResult(CanonicalModel):
    model_version: Literal["med-sales-forecast-1.0.0"] = MODEL_VERSION
    feature_version: Literal["forecast_features_v1"] = FEATURE_VERSION
    target_version: Literal["observed_completed_units_next_7d_v1"] = TARGET_VERSION
    selected_method: Method
    predicted_completed_units_next_7d: Annotated[float, Field(ge=0, allow_inf_nan=False)]
    synthetic_development_notice: Literal[NOTICE] = NOTICE

