"""Reusable DDI adapter conformance and production-gate tests."""

from __future__ import annotations

import logging

import pytest
from pydantic import ValidationError

from medsense_ai.ddi_providers import (
    ConformanceOutcome,
    ConformanceScenario,
    ConformanceScenarioBlocked,
    ProviderAdapterConfig,
    ProviderApprovalGate,
    ProviderApprovalStatus,
    ProviderEnvironment,
    ProviderFailure,
    ProviderFailureCategory,
    ProviderLifecycleApproval,
    ProviderLookupStatus,
    ProviderRetryPolicy,
    evaluate_production_activation,
    lookup_batch_fail_closed,
    lookup_pair_fail_closed,
    retry_permitted,
    run_adapter_conformance,
)
from synthetic_ddi_provider import (
    SYNTHETIC_CONFIG,
    SYNTHETIC_METADATA,
    SYNTHETIC_TIME,
    SyntheticConformanceProbe,
    SyntheticDDIProvider,
    SyntheticScenario,
)


def _pair_result(scenario: ConformanceScenario):
    probe = SyntheticConformanceProbe()
    return lookup_pair_fail_closed(
        probe.provider_for(scenario), probe.pair_request_for(scenario)
    )


def _passed_gate(suffix: str) -> ProviderApprovalGate:
    return ProviderApprovalGate(
        status=ProviderApprovalStatus.PASS,
        evidence_identifier=f"synthetic_evidence_{suffix}",
        reviewer_identifier=f"synthetic_reviewer_{suffix}",
        reviewed_at=SYNTHETIC_TIME,
    )


def _lifecycle_identity() -> dict[str, str]:
    return {
        "provider_name": SYNTHETIC_METADATA.provider_name,
        "provider_namespace": SYNTHETIC_METADATA.provider_namespace,
        "adapter_version": SYNTHETIC_METADATA.adapter_version,
        "provider_version": SYNTHETIC_METADATA.provider_version,
        "provider_release_identifier": SYNTHETIC_METADATA.release_identifier,
    }


def test_synthetic_adapter_passes_reusable_conformance_harness() -> None:
    report = run_adapter_conformance(SyntheticConformanceProbe())

    assert report.overall_outcome is ConformanceOutcome.PASS
    assert len(report.requirement_results) == 26
    assert report.failed_requirement_ids == ()
    assert report.clinical_use_authorized is False
    assert report.provider_version == SYNTHETIC_METADATA.provider_version
    assert report.provider_release_identifier == SYNTHETIC_METADATA.release_identifier
    assert "pair_lookup" in report.tested_capability_set
    assert "batch_lookup" in report.tested_capability_set


def test_malformed_adapter_fails_the_conformance_harness() -> None:
    class MalformedScenarioProbe(SyntheticConformanceProbe):
        def provider_for(
            self, scenario: ConformanceScenario
        ) -> SyntheticDDIProvider:
            if scenario is ConformanceScenario.MALFORMED_RESPONSE:
                return SyntheticDDIProvider(SyntheticScenario.NO_ASSERTION)
            return super().provider_for(scenario)

    report = run_adapter_conformance(MalformedScenarioProbe())

    assert report.overall_outcome is ConformanceOutcome.FAIL
    assert "DDI-CONF-014-malformed" in report.failed_requirement_ids
    assert report.clinical_use_authorized is False


def test_blocked_conformance_scenario_cannot_produce_a_pass() -> None:
    class BlockedScenarioProbe(SyntheticConformanceProbe):
        def provider_for(
            self, scenario: ConformanceScenario
        ) -> SyntheticDDIProvider:
            if scenario is ConformanceScenario.RATE_LIMIT:
                raise ConformanceScenarioBlocked("authorized_fixture_unavailable")
            return super().provider_for(scenario)

    report = run_adapter_conformance(BlockedScenarioProbe())

    blocked = {
        item.requirement_identifier
        for item in report.requirement_results
        if item.outcome is ConformanceOutcome.BLOCKED
    }
    assert report.overall_outcome is ConformanceOutcome.BLOCKED
    assert "DDI-CONF-018-rate-limit" in blocked
    assert report.clinical_use_authorized is False


def test_version_mismatch_fails_before_provider_interpretation() -> None:
    result = _pair_result(ConformanceScenario.VERSION_MISMATCH)

    assert result.status is ProviderLookupStatus.PROVIDER_ERROR
    assert result.failure is not None
    assert result.failure.category is ProviderFailureCategory.VERSION_MISMATCH
    assert result.assertions == ()


def test_ambiguous_mapping_fails_closed() -> None:
    result = _pair_result(ConformanceScenario.AMBIGUOUS_MAPPING)

    assert result.status is ProviderLookupStatus.AMBIGUOUS_MAPPING
    assert result.mapping_a is not None
    assert result.mapping_a.human_review_required is True
    assert result.assertions == ()


def test_provider_unavailable_stays_unavailable() -> None:
    result = _pair_result(ConformanceScenario.PROVIDER_UNAVAILABLE)

    assert result.status is ProviderLookupStatus.PROVIDER_UNAVAILABLE
    assert result.failure is not None
    assert result.failure.category is (
        ProviderFailureCategory.PROVIDER_MAINTENANCE_OR_UNAVAILABLE
    )
    assert result.assertions == ()


def test_authorization_failure_remains_distinct_from_authentication() -> None:
    authorization = _pair_result(ConformanceScenario.AUTHORIZATION_FAILURE)
    authentication = _pair_result(ConformanceScenario.PROVIDER_ERROR)

    assert authorization.failure is not None
    assert authentication.failure is not None
    assert authorization.failure.category is (
        ProviderFailureCategory.AUTHORIZATION_OR_LICENSE_FAILURE
    )
    assert authentication.failure.category is ProviderFailureCategory.AUTHENTICATION_FAILURE


@pytest.mark.parametrize(
    ("scenario", "expected_category"),
    [
        (ConformanceScenario.TIMEOUT, ProviderFailureCategory.TIMEOUT),
        (ConformanceScenario.RATE_LIMIT, ProviderFailureCategory.RATE_LIMIT),
    ],
)
def test_timeout_and_rate_limit_translation(
    scenario: ConformanceScenario,
    expected_category: ProviderFailureCategory,
) -> None:
    result = _pair_result(scenario)

    assert result.status is ProviderLookupStatus.PROVIDER_UNAVAILABLE
    assert result.failure is not None
    assert result.failure.category is expected_category


def test_unexpected_exception_is_sanitized_and_fails_closed(
    caplog: pytest.LogCaptureFixture,
) -> None:
    with caplog.at_level(logging.ERROR):
        result = _pair_result(ConformanceScenario.UNEXPECTED_EXCEPTION)

    assert result.status is ProviderLookupStatus.PROVIDER_ERROR
    assert result.failure is not None
    assert result.failure.category is ProviderFailureCategory.UNEXPECTED_PROVIDER_ERROR
    assert result.failure.message == "unexpected provider adapter failure"
    assert "synthetic_unexpected_failure" not in caplog.text


def test_technical_readiness_and_conformance_cannot_imply_production_use() -> None:
    production_config = ProviderAdapterConfig.model_validate(
        {
            **SYNTHETIC_CONFIG.model_dump(),
            "environment": ProviderEnvironment.PRODUCTION,
        }
    )
    lifecycle = ProviderLifecycleApproval(
        **_lifecycle_identity(),
        technically_integrated=_passed_gate("technical"),
        conformance_tested=_passed_gate("conformance"),
    )
    health = SyntheticDDIProvider(SyntheticScenario.FOUND).health()

    decision = evaluate_production_activation(
        production_config,
        lifecycle,
        health,
        evaluated_at=SYNTHETIC_TIME,
    )

    assert health.readiness.value == "ready"
    assert decision.production_usable is False
    assert "approval_licensed_and_authorized_not_passed" in decision.blocker_codes
    assert "approval_clinically_accepted_not_passed" in decision.blocker_codes
    assert "approval_pakistan_coverage_validated_not_passed" in decision.blocker_codes
    assert "approval_production_enabled_not_passed" in decision.blocker_codes


def test_production_enablement_cannot_pass_with_incomplete_prerequisites() -> None:
    with pytest.raises(ValidationError):
        ProviderLifecycleApproval(
            **_lifecycle_identity(),
            production_enabled=_passed_gate("production"),
        )


def test_lifecycle_approval_cannot_be_reused_for_another_provider_release() -> None:
    production_config = ProviderAdapterConfig.model_validate(
        {
            **SYNTHETIC_CONFIG.model_dump(),
            "environment": ProviderEnvironment.PRODUCTION,
        }
    )
    all_passed = {
        "technically_integrated": _passed_gate("technical"),
        "conformance_tested": _passed_gate("conformance"),
        "licensed_and_authorized": _passed_gate("license"),
        "clinically_accepted": _passed_gate("clinical"),
        "pakistan_coverage_validated": _passed_gate("pakistan"),
        "production_enabled": _passed_gate("production"),
    }
    lifecycle = ProviderLifecycleApproval(
        **{
            **_lifecycle_identity(),
            "provider_release_identifier": "synthetic_other_provider_release",
        },
        **all_passed,
    )

    decision = evaluate_production_activation(
        production_config,
        lifecycle,
        SyntheticDDIProvider(SyntheticScenario.FOUND).health(),
        evaluated_at=SYNTHETIC_TIME,
    )

    assert decision.production_usable is False
    assert "lifecycle_provider_release_identifier_mismatch" in decision.blocker_codes


def test_batch_correlation_preserves_each_request_identity() -> None:
    probe = SyntheticConformanceProbe()
    scenario = ConformanceScenario.BATCH_PARTIAL_FAILURE
    request = probe.batch_request_for(scenario)

    result = lookup_batch_fail_closed(probe.provider_for(scenario), request)

    assert tuple(item.request for item in result.results) == request.requests
    assert tuple(item.request.request_identifier for item in result.results) == tuple(
        item.request_identifier for item in request.requests
    )


def test_partial_batch_failure_remains_pair_specific() -> None:
    probe = SyntheticConformanceProbe()
    scenario = ConformanceScenario.BATCH_PARTIAL_FAILURE
    result = lookup_batch_fail_closed(
        probe.provider_for(scenario), probe.batch_request_for(scenario)
    )

    assert result.results[0].status is ProviderLookupStatus.NO_ASSERTION_RETURNED
    assert result.results[1].status is ProviderLookupStatus.PROVIDER_UNAVAILABLE
    assert result.results[1].failure is not None
    assert result.results[1].failure.category is ProviderFailureCategory.TIMEOUT


def test_missing_batch_result_fails_only_missing_pair_closed() -> None:
    probe = SyntheticConformanceProbe()
    scenario = ConformanceScenario.BATCH_MISSING_RESULT
    result = lookup_batch_fail_closed(
        probe.provider_for(scenario), probe.batch_request_for(scenario)
    )

    assert result.results[0].status is ProviderLookupStatus.NO_ASSERTION_RETURNED
    assert result.results[1].status is ProviderLookupStatus.PROVIDER_ERROR
    assert result.results[1].failure is not None
    assert result.results[1].failure.category is (
        ProviderFailureCategory.MALFORMED_PROVIDER_RESPONSE
    )
    assert result.results[1].assertions == ()


def test_duplicate_pairs_are_independently_correlated() -> None:
    probe = SyntheticConformanceProbe()
    scenario = ConformanceScenario.BATCH_DUPLICATE_PAIR
    request = probe.batch_request_for(scenario)
    result = lookup_batch_fail_closed(probe.provider_for(scenario), request)

    assert request.requests[0].ingredient_a == request.requests[1].ingredient_a
    assert request.requests[0].ingredient_b == request.requests[1].ingredient_b
    assert request.requests[0].request_identifier != request.requests[1].request_identifier
    assert tuple(item.request for item in result.results) == request.requests


def test_logging_excludes_failure_message_and_source_payload(
    caplog: pytest.LogCaptureFixture,
) -> None:
    probe = SyntheticConformanceProbe()
    with caplog.at_level(logging.WARNING):
        timeout_result = _pair_result(ConformanceScenario.TIMEOUT)
        found_result = _pair_result(ConformanceScenario.ASSERTION_FOUND)

    assert timeout_result.failure is not None
    assert timeout_result.failure.message not in caplog.text
    assert found_result.assertions[0].source_native_description not in caplog.text
    assert "synthetic_citation_text_alpha" not in caplog.text


def test_conformance_report_and_adapter_outputs_are_immutable() -> None:
    report = run_adapter_conformance(SyntheticConformanceProbe())
    result = _pair_result(ConformanceScenario.ASSERTION_FOUND)

    with pytest.raises(ValidationError):
        report.overall_outcome = ConformanceOutcome.FAIL
    with pytest.raises(ValidationError):
        result.status = ProviderLookupStatus.NO_ASSERTION_RETURNED
    assert isinstance(report.requirement_results, tuple)
    assert isinstance(result.assertions, tuple)


def test_synthetic_fixture_contains_no_clinical_approval_or_real_source_claim() -> None:
    result = _pair_result(ConformanceScenario.ASSERTION_FOUND)
    report = run_adapter_conformance(SyntheticConformanceProbe())
    assertion = result.assertions[0]

    assert assertion.provider_name.startswith("synthetic_")
    assert assertion.provider_ingredient_a_identifier == "provider_concept_alpha"
    assert assertion.provider_ingredient_b_identifier == "provider_concept_beta"
    assert assertion.source_native_classification_code.startswith("synthetic_")
    assert assertion.source_native_classification_label.startswith("synthetic_")
    assert report.clinical_use_authorized is False
    assert all("clinical" not in status.value for status in ProviderLookupStatus)


def test_configuration_rejects_secret_fields_and_retry_policy_is_transient_only() -> None:
    config_payload = SYNTHETIC_CONFIG.model_dump()
    config_payload["synthetic_api_key"] = "synthetic_forbidden_value"
    with pytest.raises(ValidationError):
        ProviderAdapterConfig.model_validate(config_payload)

    policy = ProviderRetryPolicy(max_attempts=3)
    timeout = ProviderFailure(
        category=ProviderFailureCategory.TIMEOUT,
        message="synthetic_timeout",
        retryable=True,
    )
    authorization = ProviderFailure(
        category=ProviderFailureCategory.AUTHORIZATION_OR_LICENSE_FAILURE,
        message="synthetic_authorization_failure",
        retryable=True,
    )
    malformed = ProviderFailure(
        category=ProviderFailureCategory.MALFORMED_PROVIDER_RESPONSE,
        message="synthetic_malformed_response",
        retryable=True,
    )

    assert retry_permitted(timeout, policy, attempts_completed=1) is True
    assert retry_permitted(timeout, policy, attempts_completed=3) is False
    assert retry_permitted(authorization, policy, attempts_completed=1) is False
    assert retry_permitted(malformed, policy, attempts_completed=1) is False


def test_adapter_configuration_is_pinned_to_metadata() -> None:
    payload = SYNTHETIC_CONFIG.model_dump()
    payload["expected_release_identifier"] = "synthetic_release_mismatch"
    mismatched = ProviderAdapterConfig.model_validate(payload)

    with pytest.raises(ValueError):
        SyntheticDDIProvider(SyntheticScenario.FOUND, config=mismatched)

    assert SYNTHETIC_METADATA.release_identifier == (
        SYNTHETIC_CONFIG.expected_release_identifier
    )
