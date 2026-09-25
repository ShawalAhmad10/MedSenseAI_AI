"""Typed local inference from an already verified bundle; never fits or retrains."""

from pathlib import Path

import numpy as np
from threadpoolctl import threadpool_limits

from ..contracts import FEATURE_NAMES
from .bundle import BundleError, LoadedBundle, load_bundle
from .contracts import ForecastInput, ForecastResult


def feature_array(request: ForecastInput) -> np.ndarray:
    return np.asarray([[float(getattr(request.features, name)) for name in FEATURE_NAMES]], dtype=np.float64)


def score_features(bundle: LoadedBundle, request: ForecastInput | dict) -> ForecastResult:
    parsed = ForecastInput.model_validate(request)
    if bundle.selected_method == "persistence":
        prediction = float(parsed.features.completed_units_lag_1w)
    elif bundle.selected_method == "poisson_regressor" and bundle.model is not None:
        with threadpool_limits(limits=1):
            prediction = float(bundle.model.predict(feature_array(parsed))[0])
    else:
        raise BundleError("Verified forecast bundle has no usable selected method")
    if not np.isfinite(prediction) or prediction < 0:
        raise BundleError("Forecast method returned an invalid prediction")
    return ForecastResult(selected_method=bundle.selected_method, predicted_completed_units_next_7d=prediction)


def score_local(directory: Path, expected_manifest_sha256: str, request: ForecastInput | dict) -> ForecastResult:
    return score_features(load_bundle(directory, expected_manifest_sha256), request)

