"""Verified local forecast-bundle contracts and inference."""

from .bundle import BundleError, LoadedBundle, load_bundle
from .contracts import (
    MODEL_VERSION, NOTICE, ForecastInput, ForecastResult, FrozenSelection, TrainingConfig,
)
from .inference import score_features, score_local

__all__ = [
    "MODEL_VERSION", "NOTICE", "BundleError", "ForecastInput", "ForecastResult",
    "FrozenSelection", "LoadedBundle", "TrainingConfig", "load_bundle", "score_features",
    "score_local",
]
