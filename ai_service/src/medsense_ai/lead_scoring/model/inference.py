"""Typed local scoring, including the existing canonical point-in-time feature path."""

import logging
from pathlib import Path

import numpy as np
from pydantic import ValidationError
from threadpoolctl import threadpool_limits

from ..contracts import Eligibility
from ..features import LeadIndex, build_features
from .bundle import BundleError, LoadedBundle, load_bundle
from .contracts import LeadScoringResult, ScoringInput, ScoringStatus
from .data import feature_array

logger=logging.getLogger(__name__)


def score_features(bundle: LoadedBundle, request: ScoringInput | dict) -> LeadScoringResult:
    request=ScoringInput.model_validate(request)
    with threadpool_limits(limits=1):
        values=bundle.model.predict_proba(feature_array([request.features]))
    p=float(values[0,1])
    if not np.isfinite(p) or not 0 <= p <= 1:
        raise BundleError("Estimator returned an invalid probability")
    return LeadScoringResult(status=ScoringStatus.SCORED,model_probability=p,lead_score=100*p,
        technical_threshold=bundle.threshold,technical_binary_prediction=p>=bundle.threshold)


def score_canonical(index: LeadIndex, customer_id: str, at, bundle: LoadedBundle | None) -> LeadScoringResult:
    """Reuse the SALES-04 index across calls; no duplicated features or model fitting."""
    try:
        result=build_features(index,customer_id,at)
        if result.eligibility != Eligibility.ELIGIBLE:
            status={Eligibility.OUT_OF_SCOPE:ScoringStatus.OUT_OF_SCOPE,
                    Eligibility.INSUFFICIENT_DATA:ScoringStatus.INSUFFICIENT_DATA,
                    Eligibility.NOT_KNOWN:ScoringStatus.INVALID_INPUT}[result.eligibility]
            return LeadScoringResult(status=status,reason=result.reason)
        if bundle is None:
            return LeadScoringResult(status=ScoringStatus.MODEL_UNAVAILABLE,reason="No verified bundle loaded")
        scored=score_features(bundle,ScoringInput(feature_version="lead_features_v1",features=result.features))
        return LeadScoringResult(**{**scored.model_dump(),"customer_id":customer_id,
            "source_namespace":index.data.manifest.source_namespace,"observation_time":at})
    except (ValidationError,ValueError) as exc:
        logger.warning("Canonical lead scoring failed (%s)",type(exc).__name__)
        status=ScoringStatus.MODEL_UNAVAILABLE if isinstance(exc,BundleError) else ScoringStatus.INVALID_INPUT
        return LeadScoringResult(status=status,reason="model_failure" if isinstance(exc,BundleError) else "canonical_input_validation_failed")


def score_local(directory: Path, expected_hash: str, request: ScoringInput | dict) -> LeadScoringResult:
    try:
        parsed=ScoringInput.model_validate(request)
    except ValidationError as exc:
        logger.warning("Invalid lead feature input (%s); rejected payload omitted",type(exc).__name__)
        return LeadScoringResult(status=ScoringStatus.INVALID_INPUT,reason="Feature contract validation failed")
    try:
        return score_features(load_bundle(directory,expected_hash),parsed)
    except BundleError as exc:
        logger.error("Lead model unavailable: %s",exc)
        return LeadScoringResult(status=ScoringStatus.MODEL_UNAVAILABLE,reason=str(exc))
