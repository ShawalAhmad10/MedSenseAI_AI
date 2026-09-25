"""Bounded experiment policy and strictly versioned local scoring contracts."""

from enum import StrEnum
import hashlib
from typing import Annotated, Literal, Self

from pydantic import Field, StrictBool, model_validator

from medsense_ai.sales_data.contracts import CanonicalModel, Instant, OpaqueID
from ..contracts import FEATURE_NAMES, FEATURE_VERSION, TARGET_VERSION, Features, stable_json

MODEL_VERSION = "med-sales-lead-1.0.0"
NOTICE = "Synthetic-development model output; not a validated real-customer conversion probability or operational targeting policy."
Family = Literal["logistic_regression", "hist_gradient_boosting"]
Probability = Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)]


class TrainingConfig(CanonicalModel):
    model_version: Literal["med-sales-lead-1.0.0"] = MODEL_VERSION
    seed: Literal[260903] = 260903
    ap_tie_tolerance: Literal[0.005] = 0.005
    threshold_tie_tolerance: Literal[1e-12] = 1e-12
    calibration_method: Literal["none"] = "none"
    thread_limit: Literal[1] = 1
    permutation_repeats: Literal[3] = 3

    @property
    def policy(self) -> dict:
        return {
            **self.model_dump(), "feature_version": FEATURE_VERSION,
            "target_version": TARGET_VERSION, "split_version": "lead_temporal_split_v1",
            "selection_metric": "sklearn.metrics.average_precision_score",
            "selection_rule": "Higher validation AP; absolute gap <= 0.005 prefers Logistic Regression",
            "technical_threshold_rule": "Maximize validation F1, ties within 1e-12 prefer higher threshold; predict p >= threshold",
            "top_decile_rule": "Rank within observation Monday; k=ceil(0.1*n), descending p, example_id ascending on ties. Also report pooled diagnostic.",
            "logistic_regression": {
                "C": 1.0, "solver": "lbfgs", "max_iter": 1000, "tol": 1e-6,
                "class_weight": None, "random_state": self.seed,
            },
            "hist_gradient_boosting": {
                "loss": "log_loss", "learning_rate": 0.05, "max_iter": 150,
                "max_leaf_nodes": 15, "min_samples_leaf": 30,
                "l2_regularization": 1.0, "early_stopping": False,
                "categorical_features": None, "random_state": self.seed,
            },
            "preprocessing": {"logistic_regression": "TRAIN median imputer then TRAIN StandardScaler; all 28 columns, only cart recency nullable", "hist_gradient_boosting": "Native NaN handling; no fitted imputer/scaler"},
            "resampling": False, "candidate_adjustments": 0,
            "calibration_reason": "Native probabilities evaluated; only four validation Mondays, no post-hoc calibration fitted",
        }

    @property
    def sha256(self) -> str:
        return hashlib.sha256(stable_json(self.policy)).hexdigest()


class FrozenSelection(CanonicalModel):
    family: Family
    source_hash_manifest_sha256: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
    training_config_sha256: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
    validation_ap: Probability
    technical_validation_threshold: Probability
    calibration_method: Literal["none"] = "none"
    selection_scope: Literal["validation_only"] = "validation_only"


class ScoringInput(CanonicalModel):
    feature_version: Literal["lead_features_v1"]
    feature_order: tuple[str, ...] = FEATURE_NAMES
    features: Features

    @model_validator(mode="after")
    def ordered(self) -> Self:
        if self.feature_order != FEATURE_NAMES:
            raise ValueError("Inference feature order differs from the frozen allowlist")
        return self


class ScoringStatus(StrEnum):
    SCORED = "scored"
    OUT_OF_SCOPE = "out_of_scope"
    INSUFFICIENT_DATA = "insufficient_data"
    MODEL_UNAVAILABLE = "model_unavailable"
    INVALID_INPUT = "invalid_input"


class LeadScoringResult(CanonicalModel):
    status: ScoringStatus
    model_version: Literal["med-sales-lead-1.0.0"] = MODEL_VERSION
    feature_version: Literal["lead_features_v1"] = FEATURE_VERSION
    target_version: Literal["repeat_purchase_30d_v1"] = TARGET_VERSION
    sales_contract_version: Literal["sales_contract_v1"] = "sales_contract_v1"
    model_data_origin: Literal["synthetic_development"] = "synthetic_development"
    model_probability: Probability | None = None
    lead_score: Annotated[float, Field(ge=0, le=100, allow_inf_nan=False)] | None = None
    technical_threshold: Probability | None = None
    technical_binary_prediction: StrictBool | None = None
    synthetic_development_notice: Literal[NOTICE] = NOTICE
    reason: str | None = None
    customer_id: OpaqueID | None = None
    source_namespace: OpaqueID | None = None
    observation_time: Instant | None = None

    @model_validator(mode="after")
    def no_fabricated_scores(self) -> Self:
        values = (self.model_probability, self.lead_score, self.technical_threshold, self.technical_binary_prediction)
        if self.status == ScoringStatus.SCORED:
            if any(v is None for v in values):
                raise ValueError("Scored results require probability, score and technical decision")
            if self.lead_score != 100.0 * self.model_probability or self.technical_binary_prediction != (self.model_probability >= self.technical_threshold):
                raise ValueError("Score/technical prediction must match the model probability")
        elif any(v is not None for v in values):
            raise ValueError("Unavailable/ineligible results cannot carry a score")
        return self
