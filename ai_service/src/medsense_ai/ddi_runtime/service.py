"""Offline runtime orchestration for model scoring and exact DDI evidence lookup."""

from __future__ import annotations

import logging
import time
import unicodedata
from pathlib import Path
from typing import Callable

from medsense_ai.ddi_model.inference import DDIInferenceModel, UnsupportedDrugError
from medsense_ai.ddi_runtime.contracts import RuntimeDDIResult, RuntimeDDIStatus
from medsense_ai.ddi_runtime.evidence import KnownInteractionEvidence, KnownInteractionIndex
from medsense_ai.medical_data_ingestion.normalization import normalize_medical_name

logger = logging.getLogger(__name__)

COMMON_LIMITATIONS = (
    "The model warning score is not a calibrated clinical probability.",
    "The comparison class was sampled-unlabeled, not clinically verified non-interacting.",
    "No model warning or absent source row does not establish safety or absence of interaction.",
    "Runtime resolution is exact after whitespace/case normalization; no fuzzy or external lookup is used.",
)


class RuntimeInputError(ValueError):
    pass


class RuntimeDDIService:
    """Reusable service that loads expensive immutable artifacts once."""

    def __init__(
        self,
        *,
        model_dir: Path,
        known_interaction_source: Path,
        model_loader: Callable[[Path], DDIInferenceModel] = DDIInferenceModel,
    ) -> None:
        self._model: DDIInferenceModel | None = None
        self._evidence_index: KnownInteractionIndex | None = None
        self._initialization_failure = False
        try:
            self._model = model_loader(model_dir)
        except Exception:
            self._initialization_failure = True
            logger.exception("DDI runtime model initialization failed")
        try:
            self._evidence_index = KnownInteractionIndex(known_interaction_source)
        except Exception:
            self._initialization_failure = True
            logger.exception("DDI runtime evidence-index initialization failed")

    @property
    def ready(self) -> bool:
        return (
            not self._initialization_failure
            and self._model is not None
            and self._evidence_index is not None
        )

    @staticmethod
    def _normalize_input(value: object, field_name: str) -> str:
        if not isinstance(value, str):
            raise RuntimeInputError(f"{field_name} must be a string")
        if len(value) > 200:
            raise RuntimeInputError(f"{field_name} exceeds 200 characters")
        if any(unicodedata.category(character) == "Cc" for character in value):
            raise RuntimeInputError(f"{field_name} contains control characters")
        try:
            return normalize_medical_name(value)
        except ValueError as exc:
            raise RuntimeInputError(f"{field_name} cannot be blank") from exc

    def _evidence_for(
        self, normalized_a: str, normalized_b: str
    ) -> KnownInteractionEvidence | None:
        if self._evidence_index is None:
            return None
        return self._evidence_index.lookup(normalized_a, normalized_b)

    def _result(
        self,
        *,
        started: float,
        status: RuntimeDDIStatus,
        normalized_a: str | None,
        normalized_b: str | None,
        model_score: float | None = None,
        threshold: float | None = None,
        model_warning: bool | None = None,
        warning: bool,
        evidence: KnownInteractionEvidence | None,
        message: str,
        limitations: tuple[str, ...] = COMMON_LIMITATIONS,
    ) -> RuntimeDDIResult:
        return RuntimeDDIResult(
            status=status,
            normalized_ingredient_a=normalized_a,
            normalized_ingredient_b=normalized_b,
            model_version=self._model.model_version if self._model is not None else None,
            model_warning_score=model_score,
            selected_threshold=threshold,
            model_warning_triggered=model_warning,
            warning_triggered=warning,
            known_dataset_record_found=evidence is not None,
            known_interaction_descriptions=(
                evidence.descriptions if evidence is not None else ()
            ),
            evidence_source_identifier=(
                self._evidence_index.source_identifier
                if self._evidence_index is not None
                else None
            ),
            evidence_record_identifiers=(
                evidence.record_identifiers if evidence is not None else ()
            ),
            manual_review_required=True,
            message=message,
            limitations=limitations,
            runtime_latency_ms=1000 * (time.perf_counter() - started),
        )

    def predict(self, ingredient_a: object, ingredient_b: object) -> RuntimeDDIResult:
        started = time.perf_counter()
        try:
            normalized_a = self._normalize_input(ingredient_a, "ingredient_a")
            normalized_b = self._normalize_input(ingredient_b, "ingredient_b")
        except RuntimeInputError as exc:
            return self._result(
                started=started,
                status=RuntimeDDIStatus.INVALID_INPUT,
                normalized_a=None,
                normalized_b=None,
                warning=True,
                evidence=None,
                message=str(exc),
            )
        if normalized_a == normalized_b:
            return self._result(
                started=started,
                status=RuntimeDDIStatus.INVALID_INPUT,
                normalized_a=normalized_a,
                normalized_b=normalized_b,
                warning=True,
                evidence=None,
                message="Two distinct active ingredients are required.",
            )

        evidence = self._evidence_for(normalized_a, normalized_b)
        if not self.ready or self._model is None:
            return self._result(
                started=started,
                status=RuntimeDDIStatus.MODEL_UNAVAILABLE,
                normalized_a=normalized_a,
                normalized_b=normalized_b,
                warning=True,
                evidence=evidence,
                message=(
                    "Runtime artifacts are unavailable or corrupt; no model prediction was attempted."
                ),
            )
        try:
            prediction = self._model.predict(normalized_a, normalized_b)
        except UnsupportedDrugError:
            return self._result(
                started=started,
                status=RuntimeDDIStatus.UNSUPPORTED_INGREDIENT,
                normalized_a=normalized_a,
                normalized_b=normalized_b,
                warning=True,
                evidence=evidence,
                message=(
                    "At least one ingredient is outside the approved inference vocabulary; "
                    "no model prediction was attempted."
                ),
                limitations=COMMON_LIMITATIONS
                + ("Unsupported ingredients require deterministic mapping and manual review.",),
            )
        except Exception:
            logger.exception("DDI runtime inference failed")
            return self._result(
                started=started,
                status=RuntimeDDIStatus.MODEL_UNAVAILABLE,
                normalized_a=normalized_a,
                normalized_b=normalized_b,
                warning=True,
                evidence=evidence,
                message="Model inference failed; no speculative result was returned.",
            )

        overall_warning = prediction.warning_triggered or evidence is not None
        if overall_warning:
            if evidence is not None and not prediction.warning_triggered:
                message = (
                    "Exact known-source interaction evidence was found even though the model "
                    "score was below its threshold."
                )
            elif evidence is not None:
                message = "Model warning triggered and exact known-source evidence was found."
            else:
                message = "Model warning triggered; no exact description was found in the source dataset."
            status = RuntimeDDIStatus.INTERACTION_WARNING
        else:
            message = (
                "No model warning at the selected threshold and no exact source row was found. "
                "This does not establish safety or absence of interaction."
            )
            status = RuntimeDDIStatus.NO_MODEL_WARNING
        return self._result(
            started=started,
            status=status,
            normalized_a=normalized_a,
            normalized_b=normalized_b,
            model_score=prediction.warning_score,
            threshold=prediction.selected_threshold,
            model_warning=prediction.warning_triggered,
            warning=overall_warning,
            evidence=evidence,
            message=message,
        )
