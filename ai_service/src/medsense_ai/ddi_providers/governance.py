"""Runtime configuration and production gates for future DDI providers.

These models record engineering and governance state only. They do not grant a
license, clinical approval, Pakistan coverage approval, or regulatory approval.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

from medsense_ai.ddi_providers.contracts import (
    ProviderFailure,
    ProviderFailureCategory,
    ProviderHealth,
    ProviderReadinessStatus,
)


class ProviderEnvironment(str, Enum):
    """Explicit adapter runtime environment."""

    DEVELOPMENT = "development"
    TEST = "test"
    EVALUATION = "evaluation"
    PRODUCTION = "production"


class ProviderApprovalStatus(str, Enum):
    """Independent review state for one production approval gate."""

    NOT_REVIEWED = "not_reviewed"
    IN_PROGRESS = "in_progress"
    PASS = "pass"
    FAIL = "fail"


class ProviderRetryPolicy(BaseModel):
    """Retry boundaries; this model does not execute or schedule retries."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    max_attempts: int = Field(default=1, ge=1, le=5)
    initial_backoff_seconds: float = Field(default=0.25, ge=0.0, le=60.0)
    maximum_backoff_seconds: float = Field(default=5.0, ge=0.0, le=300.0)
    retryable_categories: tuple[ProviderFailureCategory, ...] = (
        ProviderFailureCategory.TIMEOUT,
        ProviderFailureCategory.RATE_LIMIT,
        ProviderFailureCategory.PROVIDER_MAINTENANCE_OR_UNAVAILABLE,
    )

    @model_validator(mode="after")
    def validate_retry_boundaries(self) -> ProviderRetryPolicy:
        allowed = {
            ProviderFailureCategory.TIMEOUT,
            ProviderFailureCategory.RATE_LIMIT,
            ProviderFailureCategory.PROVIDER_MAINTENANCE_OR_UNAVAILABLE,
        }
        if set(self.retryable_categories) - allowed:
            raise ValueError("retry policy may contain only transient technical failures")
        if len(self.retryable_categories) != len(set(self.retryable_categories)):
            raise ValueError("retryable failure categories must be unique")
        if self.maximum_backoff_seconds < self.initial_backoff_seconds:
            raise ValueError("maximum retry backoff cannot be below initial backoff")
        return self


class ProviderAdapterConfig(BaseModel):
    """Secret-free runtime configuration for one provider adapter."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    provider_name: str = Field(min_length=1, max_length=200)
    provider_namespace: str = Field(min_length=1, max_length=100)
    enabled: bool = False
    environment: ProviderEnvironment
    expected_provider_version: str | None = Field(
        default=None, min_length=1, max_length=200
    )
    expected_release_identifier: str | None = Field(
        default=None, min_length=1, max_length=255
    )
    timeout_seconds: float = Field(default=10.0, gt=0.0, le=300.0)
    retry_policy: ProviderRetryPolicy = ProviderRetryPolicy()


class ProviderApprovalGate(BaseModel):
    """One independently reviewed gate with evidence required for a pass."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    status: ProviderApprovalStatus = ProviderApprovalStatus.NOT_REVIEWED
    evidence_identifier: str | None = Field(default=None, min_length=1, max_length=512)
    reviewer_identifier: str | None = Field(default=None, min_length=1, max_length=255)
    reviewed_at: AwareDatetime | None = None

    @model_validator(mode="after")
    def validate_review_evidence(self) -> ProviderApprovalGate:
        evidence = (
            self.evidence_identifier,
            self.reviewer_identifier,
            self.reviewed_at,
        )
        if self.status in {ProviderApprovalStatus.PASS, ProviderApprovalStatus.FAIL}:
            if any(value is None for value in evidence):
                raise ValueError("a completed approval gate requires review evidence")
        elif any(value is not None for value in evidence):
            raise ValueError("an incomplete approval gate cannot claim review evidence")
        return self


class ProviderLifecycleApproval(BaseModel):
    """Independent lifecycle gates; technical success cannot imply production use."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    provider_name: str = Field(min_length=1, max_length=200)
    provider_namespace: str = Field(min_length=1, max_length=100)
    adapter_version: str = Field(min_length=1, max_length=100)
    provider_version: str = Field(min_length=1, max_length=200)
    provider_release_identifier: str = Field(min_length=1, max_length=255)
    technically_integrated: ProviderApprovalGate = ProviderApprovalGate()
    conformance_tested: ProviderApprovalGate = ProviderApprovalGate()
    licensed_and_authorized: ProviderApprovalGate = ProviderApprovalGate()
    clinically_accepted: ProviderApprovalGate = ProviderApprovalGate()
    pakistan_coverage_validated: ProviderApprovalGate = ProviderApprovalGate()
    production_enabled: ProviderApprovalGate = ProviderApprovalGate()

    @model_validator(mode="after")
    def validate_gate_dependencies(self) -> ProviderLifecycleApproval:
        if (
            self.conformance_tested.status is ProviderApprovalStatus.PASS
            and self.technically_integrated.status is not ProviderApprovalStatus.PASS
        ):
            raise ValueError("conformance cannot pass before technical integration passes")
        prerequisite_gates = (
            self.technically_integrated,
            self.conformance_tested,
            self.licensed_and_authorized,
            self.clinically_accepted,
            self.pakistan_coverage_validated,
        )
        if self.production_enabled.status is ProviderApprovalStatus.PASS and any(
            gate.status is not ProviderApprovalStatus.PASS for gate in prerequisite_gates
        ):
            raise ValueError("production enablement requires every prior gate to pass")
        return self


class ProviderActivationDecision(BaseModel):
    """Deterministic production gate decision, not an approval source."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    provider_namespace: str = Field(min_length=1, max_length=100)
    provider_release_identifier: str = Field(min_length=1, max_length=255)
    production_usable: bool
    blocker_codes: tuple[str, ...]
    evaluated_at: AwareDatetime

    @model_validator(mode="after")
    def validate_decision(self) -> ProviderActivationDecision:
        if self.production_usable == bool(self.blocker_codes):
            raise ValueError("production usability must be the inverse of blocker presence")
        if len(self.blocker_codes) != len(set(self.blocker_codes)):
            raise ValueError("production blocker codes must be unique")
        return self


_GATE_NAMES = (
    "technically_integrated",
    "conformance_tested",
    "licensed_and_authorized",
    "clinically_accepted",
    "pakistan_coverage_validated",
    "production_enabled",
)


def retry_permitted(
    failure: ProviderFailure,
    policy: ProviderRetryPolicy,
    *,
    attempts_completed: int,
) -> bool:
    """Return whether a later caller may schedule another technical attempt."""

    if attempts_completed < 1:
        raise ValueError("attempts_completed must include the failed attempt")
    return (
        attempts_completed < policy.max_attempts
        and failure.retryable
        and failure.category in policy.retryable_categories
    )


def evaluate_production_activation(
    config: ProviderAdapterConfig,
    lifecycle: ProviderLifecycleApproval,
    health: ProviderHealth,
    *,
    evaluated_at: datetime,
) -> ProviderActivationDecision:
    """Fail closed unless runtime and every externally reviewed gate pass."""

    blockers: list[str] = []
    if not config.enabled:
        blockers.append("provider_disabled")
    if config.environment is not ProviderEnvironment.PRODUCTION:
        blockers.append("not_production_environment")
    if health.metadata.provider_name != config.provider_name:
        blockers.append("provider_name_mismatch")
    if health.metadata.provider_namespace != config.provider_namespace:
        blockers.append("provider_namespace_mismatch")
    lifecycle_identity = (
        ("provider_name", health.metadata.provider_name),
        ("provider_namespace", health.metadata.provider_namespace),
        ("adapter_version", health.metadata.adapter_version),
        ("provider_version", health.metadata.provider_version),
        ("provider_release_identifier", health.metadata.release_identifier),
    )
    for field_name, expected_value in lifecycle_identity:
        if getattr(lifecycle, field_name) != expected_value:
            blockers.append(f"lifecycle_{field_name}_mismatch")
    if health.readiness is not ProviderReadinessStatus.READY:
        blockers.append("provider_not_ready")
    if (
        config.expected_provider_version is not None
        and health.metadata.provider_version != config.expected_provider_version
    ):
        blockers.append("provider_version_mismatch")
    if (
        config.expected_release_identifier is not None
        and health.metadata.release_identifier != config.expected_release_identifier
    ):
        blockers.append("provider_release_mismatch")
    for gate_name in _GATE_NAMES:
        gate = getattr(lifecycle, gate_name)
        if gate.status is not ProviderApprovalStatus.PASS:
            blockers.append(f"approval_{gate_name}_not_passed")
    return ProviderActivationDecision(
        provider_namespace=config.provider_namespace,
        provider_release_identifier=health.metadata.release_identifier,
        production_usable=not blockers,
        blocker_codes=tuple(blockers),
        evaluated_at=evaluated_at,
    )
