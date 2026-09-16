"""Typed, fail-closed contracts for runtime DDI warning results."""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, model_validator


class RuntimeDDIStatus(str, Enum):
    INTERACTION_WARNING = "INTERACTION_WARNING"
    NO_MODEL_WARNING = "NO_MODEL_WARNING"
    UNSUPPORTED_INGREDIENT = "UNSUPPORTED_INGREDIENT"
    INVALID_INPUT = "INVALID_INPUT"
    MODEL_UNAVAILABLE = "MODEL_UNAVAILABLE"


class RuntimeDDIResult(BaseModel):
    """One model decision plus independently retrieved exact source evidence."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    status: RuntimeDDIStatus
    normalized_ingredient_a: str | None = Field(default=None, min_length=1, max_length=200)
    normalized_ingredient_b: str | None = Field(default=None, min_length=1, max_length=200)
    model_version: str | None = Field(default=None, min_length=1, max_length=100)
    model_warning_score: float | None = Field(default=None, ge=0, le=1)
    selected_threshold: float | None = Field(default=None, ge=0, le=1)
    model_warning_triggered: bool | None = None
    warning_triggered: bool
    known_dataset_record_found: bool
    known_interaction_descriptions: tuple[str, ...] = ()
    evidence_source_identifier: str | None = Field(default=None, min_length=1, max_length=255)
    evidence_record_identifiers: tuple[str, ...] = ()
    manual_review_required: bool
    message: str = Field(min_length=1, max_length=1000)
    limitations: tuple[str, ...]
    runtime_latency_ms: float = Field(ge=0)
    score_interpretation: str = (
        "Model warning score; not a calibrated clinical probability."
    )

    @model_validator(mode="after")
    def validate_state_consistency(self) -> RuntimeDDIResult:
        model_fields = (
            self.model_warning_score,
            self.selected_threshold,
            self.model_warning_triggered,
        )
        prediction_states = {
            RuntimeDDIStatus.INTERACTION_WARNING,
            RuntimeDDIStatus.NO_MODEL_WARNING,
        }
        if self.status in {
            RuntimeDDIStatus.UNSUPPORTED_INGREDIENT,
            RuntimeDDIStatus.INVALID_INPUT,
            RuntimeDDIStatus.MODEL_UNAVAILABLE,
        }:
            if any(value is not None for value in model_fields):
                raise ValueError("A non-prediction state cannot contain model prediction fields")
            if not self.warning_triggered or not self.manual_review_required:
                raise ValueError("Fail-closed states must block and require manual review")
        if self.status in prediction_states:
            if any(value is None for value in model_fields):
                raise ValueError("A prediction state requires complete model prediction fields")
            assert self.model_warning_score is not None
            assert self.selected_threshold is not None
            if self.model_warning_triggered != (
                self.model_warning_score >= self.selected_threshold
            ):
                raise ValueError("Model warning decision must match score and threshold")
        if self.status is RuntimeDDIStatus.INTERACTION_WARNING:
            if not self.warning_triggered:
                raise ValueError("INTERACTION_WARNING requires warning_triggered")
            if self.model_warning_triggered is not True and not self.known_dataset_record_found:
                raise ValueError("A warning requires model or exact known-source evidence")
        if self.status is RuntimeDDIStatus.NO_MODEL_WARNING:
            if self.model_warning_triggered is not False or self.warning_triggered:
                raise ValueError("NO_MODEL_WARNING requires an explicit below-threshold model result")
            if self.known_dataset_record_found:
                raise ValueError("Exact known-source evidence must elevate the overall warning")
        if self.known_dataset_record_found:
            if (
                not self.known_interaction_descriptions
                or not self.evidence_record_identifiers
                or self.evidence_source_identifier is None
            ):
                raise ValueError(
                    "Known evidence requires source identity, preserved descriptions, and record IDs"
                )
            if len(self.known_interaction_descriptions) != len(
                self.evidence_record_identifiers
            ):
                raise ValueError("Known descriptions and evidence record IDs must align")
        elif self.known_interaction_descriptions or self.evidence_record_identifiers:
            raise ValueError("Absent evidence cannot include descriptions or record IDs")
        if not self.limitations:
            raise ValueError("Runtime results must state their limitations")
        return self
