"""Partner-neutral canonical feature construction plus verified bundle inference."""

from datetime import timedelta
import logging
from pathlib import Path
from time import perf_counter

from pydantic import ValidationError

from medsense_ai.sales_data import ValidationReport
from .dataset import ForecastIndex, build_feature_snapshot
from .model.bundle import BundleError, LoadedBundle, load_bundle
from .model.contracts import ForecastInput
from .model.inference import score_features
from .runtime_contracts import (
    ForecastBatchResult, ForecastRequest, ForecastResult, ForecastStatus,
)

logger = logging.getLogger(__name__)

REASON_STATUS = {
    "source_namespace_mismatch": ForecastStatus.OUT_OF_SCOPE,
    "invalid_observation_time": ForecastStatus.INVALID_INPUT,
    "unknown_product": ForecastStatus.OUT_OF_SCOPE,
    "product_not_known_at_t": ForecastStatus.PRODUCT_NOT_KNOWN,
    "insufficient_historical_coverage": ForecastStatus.INSUFFICIENT_HISTORY,
    "late_historical_fact": ForecastStatus.INSUFFICIENT_COVERAGE,
    "insufficient_pre_t_inventory": ForecastStatus.INSUFFICIENT_COVERAGE,
}


class ForecastRuntime:
    """Reuse one canonical index and one verified bundle for single or bounded batch calls."""

    def __init__(self, index: ForecastIndex, bundle: LoadedBundle | None, bundle_error: str | None = None,
                 timings: dict[str, float] | None = None):
        self.index, self.bundle = index, bundle
        self.bundle_error = bundle_error
        self.timings = dict(timings or {})
        if bundle is not None and bundle.selected_method != "persistence":
            self.bundle, self.bundle_error = None, "selected_method_mismatch"

    @classmethod
    def from_validated(cls, validated: ValidationReport, bundle_dir: Path, expected_bundle_hash: str):
        before = perf_counter()
        index = ForecastIndex(validated)
        index_seconds = perf_counter() - before
        before = perf_counter()
        try:
            bundle, error = load_bundle(bundle_dir, expected_bundle_hash), None
        except BundleError as exc:
            logger.error("Forecast bundle unavailable: %s", exc)
            bundle, error = None, "bundle_verification_failed"
        return cls(index, bundle, error, {
            "feature_index_construction_seconds": index_seconds,
            "bundle_verification_load_seconds": perf_counter() - before,
        })

    @staticmethod
    def _base(request: ForecastRequest) -> dict:
        return {
            "source_namespace": request.source_namespace,
            "product_id": request.product_id,
            "observation_time": request.observation_time,
            "horizon_start": request.observation_time,
            "horizon_end": request.observation_time + timedelta(days=7),
        }

    def forecast(self, request: ForecastRequest | dict) -> ForecastResult:
        try:
            parsed = ForecastRequest.model_validate(request)
        except ValidationError:
            logger.warning("Invalid forecast request rejected; payload omitted")
            return ForecastResult(status=ForecastStatus.INVALID_INPUT, reason_code="request_validation_failed")
        base = self._base(parsed)
        snapshot, reason = build_feature_snapshot(
            self.index, parsed.source_namespace, parsed.product_id, parsed.observation_time,
        )
        if snapshot is None:
            return ForecastResult(status=REASON_STATUS.get(reason, ForecastStatus.INSUFFICIENT_COVERAGE),
                                  reason_code=reason, **base)
        if self.bundle is None:
            return ForecastResult(status=ForecastStatus.MODEL_UNAVAILABLE,
                                  reason_code=self.bundle_error or "verified_bundle_not_loaded",
                                  selling_unit=snapshot.selling_unit, **base)
        try:
            raw = score_features(self.bundle, ForecastInput(
                feature_version="forecast_features_v1", features=snapshot.features,
            ))
        except (BundleError, ValidationError, ValueError) as exc:
            logger.error("Forecast scoring failed after feature construction: %s", type(exc).__name__)
            return ForecastResult(status=ForecastStatus.MODEL_UNAVAILABLE,
                                  reason_code="bundle_inference_failed", selling_unit=snapshot.selling_unit, **base)
        return ForecastResult(
            status=ForecastStatus.FORECASTED,
            predicted_completed_units_next_7d=raw.predicted_completed_units_next_7d,
            selling_unit=snapshot.selling_unit,
            **base,
        )

    def forecast_batch(self, source_namespace: str, observation_time, product_ids) -> ForecastBatchResult:
        ordered = sorted(str(product_id) for product_id in product_ids)
        results = tuple(self.forecast({
            "source_namespace": source_namespace,
            "product_id": product_id,
            "observation_time": observation_time,
        }) for product_id in ordered)
        return ForecastBatchResult(
            source_namespace=source_namespace,
            observation_time=observation_time,
            results=results,
        )

