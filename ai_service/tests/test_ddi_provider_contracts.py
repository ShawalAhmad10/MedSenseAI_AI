"""Vendor-neutral DDI provider contract tests with synthetic data only."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from medsense_ai.ddi_providers import (
    BatchDDIProvider,
    DDIProvider,
    ProviderBatchLookupRequest,
    ProviderBatchLookupResult,
    ProviderCoverageStatus,
    ProviderFailureCategory,
    ProviderIngredientMapping,
    ProviderLookupStatus,
    ProviderMappingConfidence,
    ProviderMappingMethod,
    ProviderMappingStatus,
    ProviderPairLookupResult,
    lookup_pair_fail_closed,
)
from synthetic_ddi_provider import (
    SYNTHETIC_METADATA,
    SYNTHETIC_TIME,
    SyntheticDDIProvider,
    SyntheticScenario,
    synthetic_ingredient,
    synthetic_request,
)


def test_provider_metadata_and_capability_declaration_are_typed() -> None:
    provider = SyntheticDDIProvider(SyntheticScenario.NO_ASSERTION)

    assert isinstance(provider, DDIProvider)
    assert isinstance(provider, BatchDDIProvider)
    assert provider.metadata == SYNTHETIC_METADATA
    assert provider.metadata.capabilities.pair_lookup is True
    assert provider.metadata.capabilities.batch_lookup is True
    assert provider.metadata.capabilities.source_native_classification is True
    assert provider.metadata.capabilities.offline_database is False


def test_provider_health_reports_readiness_without_clinical_meaning() -> None:
    health = SyntheticDDIProvider(SyntheticScenario.NO_ASSERTION).health()

    assert health.readiness.value == "ready"
    assert health.failure is None
    assert health.metadata.release_identifier == "synthetic_provider_release_alpha"


def test_failure_category_vocabulary_covers_provider_boundary_failures() -> None:
    categories = {category.value for category in ProviderFailureCategory}

    assert {
        "authentication_failure",
        "authorization_or_license_failure",
        "timeout",
        "rate_limit",
        "malformed_provider_response",
        "unsupported_concept",
        "mapping_failure",
        "provider_maintenance_or_unavailable",
        "version_mismatch",
    } <= categories


def test_typed_success_preserves_source_native_classification_and_provenance() -> None:
    result = lookup_pair_fail_closed(
        SyntheticDDIProvider(SyntheticScenario.FOUND), synthetic_request()
    )

    assert result.status is ProviderLookupStatus.INTERACTION_ASSERTION_FOUND
    assert len(result.assertions) == 1
    assertion = result.assertions[0]
    assert assertion.source_native_classification_code == "synthetic_classification_code_alpha"
    assert assertion.source_native_classification_label == (
        "synthetic_classification_label_alpha"
    )
    assert assertion.provider_release_identifier == "synthetic_provider_release_alpha"
    assert assertion.ingredient_a_mapping.mapping_identifier == (
        result.mapping_a.mapping_identifier if result.mapping_a else None
    )
    assert assertion.ingredient_b_mapping.mapping_identifier == (
        result.mapping_b.mapping_identifier if result.mapping_b else None
    )
    assert assertion.evidence_references[0].identifier == (
        "synthetic_evidence_reference_alpha"
    )
    assert assertion.source_native_effect == "synthetic_effect_alpha"
    assert assertion.source_native_management == "synthetic_management_alpha"
    assert assertion.source_native_evidence_code == "synthetic_evidence_code_alpha"
    assert assertion.provider_endpoint_order_significant is True
    assert assertion.source_native_directionality_code == (
        "synthetic_directionality_code_alpha"
    )
    assert assertion.source_contexts[0].provider_context_type == (
        "synthetic_context_type_alpha"
    )
    assert assertion.group_expansion_provenance[0].provider_group_identifier == (
        "synthetic_group_identifier_alpha"
    )
    assert assertion.group_expansion_provenance[0].expansion_release_identifier == (
        "synthetic_group_expansion_release_alpha"
    )


def test_explicit_no_assertion_is_not_a_safety_result() -> None:
    result = lookup_pair_fail_closed(
        SyntheticDDIProvider(SyntheticScenario.NO_ASSERTION), synthetic_request()
    )

    assert result.status is ProviderLookupStatus.NO_ASSERTION_RETURNED
    assert result.assertions == ()
    assert result.coverage is not None
    assert result.coverage.status is ProviderCoverageStatus.IN_SCOPE
    assert "safe" not in {status.value for status in ProviderLookupStatus}
    assert "severity" not in type(result).model_fields


@pytest.mark.parametrize(
    ("scenario", "expected_status"),
    [
        (
            SyntheticScenario.INGREDIENT_A_UNMAPPED,
            ProviderLookupStatus.INGREDIENT_A_UNMAPPED,
        ),
        (
            SyntheticScenario.INGREDIENT_B_UNMAPPED,
            ProviderLookupStatus.INGREDIENT_B_UNMAPPED,
        ),
        (
            SyntheticScenario.BOTH_UNMAPPED,
            ProviderLookupStatus.BOTH_INGREDIENTS_UNMAPPED,
        ),
    ],
)
def test_unmapped_outcomes_remain_distinct(
    scenario: SyntheticScenario, expected_status: ProviderLookupStatus
) -> None:
    result = lookup_pair_fail_closed(SyntheticDDIProvider(scenario), synthetic_request())

    assert result.status is expected_status
    assert result.assertions == ()
    assert result.failure is None


def test_ambiguous_mapping_requires_review_and_returns_no_assertion() -> None:
    result = lookup_pair_fail_closed(
        SyntheticDDIProvider(SyntheticScenario.AMBIGUOUS), synthetic_request()
    )

    assert result.status is ProviderLookupStatus.AMBIGUOUS_MAPPING
    assert result.mapping_a is not None
    assert result.mapping_a.status is ProviderMappingStatus.AMBIGUOUS
    assert result.mapping_a.human_review_required is True
    assert len(result.mapping_a.candidate_provider_concept_identifiers) == 2
    assert result.assertions == ()


def test_insufficient_coverage_is_not_no_assertion_or_safe() -> None:
    result = lookup_pair_fail_closed(
        SyntheticDDIProvider(SyntheticScenario.INSUFFICIENT_COVERAGE),
        synthetic_request(),
    )

    assert result.status is ProviderLookupStatus.INSUFFICIENT_PROVIDER_COVERAGE
    assert result.status is not ProviderLookupStatus.NO_ASSERTION_RETURNED
    assert result.coverage is not None
    assert result.coverage.status is ProviderCoverageStatus.OUT_OF_SCOPE
    assert result.assertions == ()


@pytest.mark.parametrize(
    ("scenario", "category"),
    [
        (SyntheticScenario.TIMEOUT, ProviderFailureCategory.TIMEOUT),
        (SyntheticScenario.RATE_LIMIT, ProviderFailureCategory.RATE_LIMIT),
    ],
)
def test_timeout_and_rate_limit_translate_to_provider_unavailable(
    scenario: SyntheticScenario,
    category: ProviderFailureCategory,
    caplog: pytest.LogCaptureFixture,
) -> None:
    with caplog.at_level(logging.WARNING):
        result = lookup_pair_fail_closed(SyntheticDDIProvider(scenario), synthetic_request())

    assert result.status is ProviderLookupStatus.PROVIDER_UNAVAILABLE
    assert result.failure is not None
    assert result.failure.category is category
    assert result.assertions == ()
    assert "DDI provider adapter failure" in caplog.text
    assert result.failure.message not in caplog.text


def test_authorization_failure_translates_to_provider_error() -> None:
    result = lookup_pair_fail_closed(
        SyntheticDDIProvider(SyntheticScenario.AUTHORIZATION_FAILURE),
        synthetic_request(),
    )

    assert result.status is ProviderLookupStatus.PROVIDER_ERROR
    assert result.failure is not None
    assert result.failure.category is (
        ProviderFailureCategory.AUTHORIZATION_OR_LICENSE_FAILURE
    )
    assert result.assertions == ()


def test_unexpected_exception_is_logged_and_translated_fail_closed(
    caplog: pytest.LogCaptureFixture,
) -> None:
    with caplog.at_level(logging.ERROR):
        result = lookup_pair_fail_closed(
            SyntheticDDIProvider(SyntheticScenario.UNEXPECTED_EXCEPTION),
            synthetic_request(),
        )

    assert result.status is ProviderLookupStatus.PROVIDER_ERROR
    assert result.failure is not None
    assert result.failure.category is ProviderFailureCategory.UNEXPECTED_PROVIDER_ERROR
    assert result.failure.message == "unexpected provider adapter failure"
    assert result.assertions == ()
    assert "Unexpected DDI provider failure" in caplog.text
    assert "synthetic_unexpected_failure" not in caplog.text


def test_malformed_adapter_result_is_translated_fail_closed() -> None:
    result = lookup_pair_fail_closed(
        SyntheticDDIProvider(SyntheticScenario.MALFORMED_RESULT), synthetic_request()
    )

    assert result.status is ProviderLookupStatus.PROVIDER_ERROR
    assert result.failure is not None
    assert result.failure.category is ProviderFailureCategory.MALFORMED_PROVIDER_RESPONSE
    assert result.assertions == ()


def test_provider_response_validation_error_is_classified_as_malformed() -> None:
    result = lookup_pair_fail_closed(
        SyntheticDDIProvider(SyntheticScenario.MALFORMED_VALIDATION_ERROR),
        synthetic_request(),
    )

    assert result.status is ProviderLookupStatus.PROVIDER_ERROR
    assert result.failure is not None
    assert result.failure.category is ProviderFailureCategory.MALFORMED_PROVIDER_RESPONSE
    assert result.failure.message == "provider response failed contract validation"
    assert result.assertions == ()


def test_required_provider_release_mismatch_fails_before_lookup() -> None:
    result = lookup_pair_fail_closed(
        SyntheticDDIProvider(SyntheticScenario.FOUND),
        synthetic_request(required_release="synthetic_provider_release_mismatch"),
    )

    assert result.status is ProviderLookupStatus.PROVIDER_ERROR
    assert result.failure is not None
    assert result.failure.category is ProviderFailureCategory.VERSION_MISMATCH
    assert result.assertions == ()


def test_result_rejects_mixed_provider_release_provenance() -> None:
    result = SyntheticDDIProvider(SyntheticScenario.FOUND).lookup_pair(synthetic_request())
    payload = result.model_dump()
    payload["mapping_a"]["provider_release_identifier"] = (
        "synthetic_provider_release_mismatch"
    )

    with pytest.raises(ValidationError):
        ProviderPairLookupResult.model_validate(payload)


def test_versioned_mapping_representation_preserves_rxnorm_and_source_provenance() -> None:
    provider = SyntheticDDIProvider(SyntheticScenario.NO_ASSERTION)
    ingredient = synthetic_ingredient("alpha")
    mapping = provider.map_ingredient(ingredient)

    assert mapping.ingredient == ingredient
    assert mapping.ingredient.rxnorm_release_identifier == (
        "synthetic_rxnorm_release_alpha"
    )
    assert mapping.provider_release_identifier == "synthetic_provider_release_alpha"
    assert mapping.mapping_method is ProviderMappingMethod.PROVIDER_CROSSWALK
    assert mapping.mapping_confidence is ProviderMappingConfidence.PROVIDER_ASSERTED
    assert mapping.provenance.source_record_identifier == "synthetic_mapping_record_alpha"
    assert mapping.mapped_at == SYNTHETIC_TIME


def test_superseded_mapping_requires_lifecycle_provenance() -> None:
    mapped = SyntheticDDIProvider(SyntheticScenario.NO_ASSERTION).map_ingredient(
        synthetic_ingredient("alpha")
    )
    payload = mapped.model_dump()
    payload.update(
        {
            "status": ProviderMappingStatus.SUPERSEDED,
            "deprecated_at": SYNTHETIC_TIME,
            "superseded_by_mapping_identifier": "synthetic_mapping_alpha_replacement",
        }
    )

    superseded = ProviderIngredientMapping.model_validate(payload)

    assert superseded.status is ProviderMappingStatus.SUPERSEDED
    assert superseded.deprecated_at == SYNTHETIC_TIME
    assert superseded.superseded_by_mapping_identifier == (
        "synthetic_mapping_alpha_replacement"
    )


def test_mapping_contract_rejects_fuzzy_or_inconsistent_mapping_states() -> None:
    provider = SyntheticDDIProvider(SyntheticScenario.NO_ASSERTION)
    mapped = provider.map_ingredient(synthetic_ingredient("alpha"))
    payload = mapped.model_dump()
    payload["mapping_method"] = "fuzzy_name"

    with pytest.raises(ValidationError):
        ProviderIngredientMapping.model_validate(payload)

    payload = mapped.model_dump()
    payload["provider_concept_identifier"] = None
    with pytest.raises(ValidationError):
        ProviderIngredientMapping.model_validate(payload)

    ambiguous = SyntheticDDIProvider(SyntheticScenario.AMBIGUOUS).lookup_pair(
        synthetic_request()
    ).mapping_a
    assert ambiguous is not None
    payload = ambiguous.model_dump()
    payload["candidate_provider_concept_identifiers"] = (
        "synthetic_candidate_alpha",
        " ",
    )
    with pytest.raises(ValidationError):
        ProviderIngredientMapping.model_validate(payload)


def test_pair_request_rejects_distinct_internal_ids_with_the_same_rxcui() -> None:
    request = synthetic_request()
    ingredient_b = request.ingredient_b.model_copy(
        update={"rxnorm_rxcui": request.ingredient_a.rxnorm_rxcui}
    )
    payload = request.model_dump()
    payload["ingredient_b"] = ingredient_b

    with pytest.raises(ValidationError):
        type(request).model_validate(payload)


def test_no_assertion_result_requires_resolved_mappings() -> None:
    provider = SyntheticDDIProvider(SyntheticScenario.NO_ASSERTION)
    request = synthetic_request()
    mapped_a = provider.map_ingredient(request.ingredient_a)
    unmapped_b_payload = provider.map_ingredient(request.ingredient_b).model_dump()
    unmapped_b_payload.update(
        {
            "provider_concept_identifier": None,
            "mapping_method": ProviderMappingMethod.NO_MATCH,
            "mapping_confidence": ProviderMappingConfidence.NONE,
            "status": ProviderMappingStatus.UNMAPPED,
            "human_review_required": True,
        }
    )
    unmapped_b = ProviderIngredientMapping.model_validate(unmapped_b_payload)

    with pytest.raises(ValidationError):
        ProviderPairLookupResult(
            status=ProviderLookupStatus.NO_ASSERTION_RETURNED,
            request=request,
            provider_metadata=provider.metadata,
            mapping_a=mapped_a,
            mapping_b=unmapped_b,
            completed_at=datetime.now(timezone.utc),
        )


def test_no_assertion_result_requires_explicit_in_scope_coverage() -> None:
    provider = SyntheticDDIProvider(SyntheticScenario.NO_ASSERTION)
    valid_result = provider.lookup_pair(synthetic_request())
    payload = valid_result.model_dump()
    payload["coverage"] = None

    with pytest.raises(ValidationError):
        ProviderPairLookupResult.model_validate(payload)


def test_source_assertion_has_no_universal_severity_conversion() -> None:
    result = SyntheticDDIProvider(SyntheticScenario.FOUND).lookup_pair(synthetic_request())
    assertion = result.assertions[0]

    assert assertion.source_native_classification_label == (
        "synthetic_classification_label_alpha"
    )
    assert "severity" not in type(assertion).model_fields
    assert "normalized_classification" not in type(assertion).model_fields


def test_assertion_source_fields_must_match_declared_capabilities() -> None:
    result = SyntheticDDIProvider(SyntheticScenario.FOUND).lookup_pair(synthetic_request())
    payload = result.model_dump()
    payload["provider_metadata"]["capabilities"]["source_native_effect"] = False

    with pytest.raises(ValidationError):
        ProviderPairLookupResult.model_validate(payload)


def test_lookup_rejects_assertion_with_mutated_embedded_mapping_provenance() -> None:
    result = SyntheticDDIProvider(SyntheticScenario.FOUND).lookup_pair(synthetic_request())
    payload = result.model_dump()
    payload["assertions"][0]["ingredient_a_mapping"]["provenance"]["source_version"] = (
        "synthetic_mutated_mapping_source_version"
    )

    with pytest.raises(ValidationError):
        ProviderPairLookupResult.model_validate(payload)


def test_synthetic_fixture_contains_only_explicitly_synthetic_source_content() -> None:
    result = SyntheticDDIProvider(SyntheticScenario.FOUND).lookup_pair(synthetic_request())
    assertion = result.assertions[0]

    source_content = (
        assertion.provider_name,
        assertion.provider_interaction_identifier,
        assertion.source_native_classification_code,
        assertion.source_native_classification_label,
        assertion.source_native_description,
        assertion.source_native_effect,
        assertion.source_native_management,
        assertion.source_native_evidence_code,
        assertion.source_native_evidence_label,
        assertion.source_native_directionality_code,
        assertion.source_native_directionality_label,
        assertion.source_contexts[0].provider_context_type,
        assertion.source_contexts[0].source_native_code,
        assertion.group_expansion_provenance[0].provider_group_identifier,
        assertion.group_expansion_provenance[0].provider_group_label,
        assertion.evidence_references[0].identifier,
        assertion.evidence_references[0].citation_text,
        assertion.use_restrictions.restriction_summary,
    )
    assert all(value is not None and value.startswith("synthetic_") for value in source_content)


def test_batch_contract_preserves_request_order_and_typed_results() -> None:
    provider = SyntheticDDIProvider(SyntheticScenario.NO_ASSERTION)
    first = synthetic_request()
    second = first.model_copy(update={"request_identifier": "synthetic_lookup_request_beta"})
    batch = provider.lookup_pairs(ProviderBatchLookupRequest(requests=(first, second)))

    assert [result.request.request_identifier for result in batch.results] == [
        "synthetic_lookup_request_alpha",
        "synthetic_lookup_request_beta",
    ]
    assert all(
        result.status is ProviderLookupStatus.NO_ASSERTION_RETURNED
        for result in batch.results
    )


def test_batch_contract_preserves_independent_partial_failure_statuses() -> None:
    first = synthetic_request()
    second = first.model_copy(update={"request_identifier": "synthetic_lookup_request_beta"})
    batch_request = ProviderBatchLookupRequest(requests=(first, second))
    first_result = SyntheticDDIProvider(SyntheticScenario.NO_ASSERTION).lookup_pair(first)
    second_result = SyntheticDDIProvider(SyntheticScenario.INSUFFICIENT_COVERAGE).lookup_pair(
        second
    )

    batch = ProviderBatchLookupResult(
        provider_metadata=SYNTHETIC_METADATA,
        request=batch_request,
        results=(first_result, second_result),
    )

    assert [result.status for result in batch.results] == [
        ProviderLookupStatus.NO_ASSERTION_RETURNED,
        ProviderLookupStatus.INSUFFICIENT_PROVIDER_COVERAGE,
    ]


def test_provider_boundary_rejects_undocumented_request_fields() -> None:
    payload = synthetic_request().model_dump()
    payload["synthetic_undocumented_field"] = "synthetic_value_alpha"

    with pytest.raises(ValidationError):
        type(synthetic_request()).model_validate(payload)


def test_provider_boundary_rejects_undocumented_result_fields() -> None:
    result = SyntheticDDIProvider(SyntheticScenario.NO_ASSERTION).lookup_pair(
        synthetic_request()
    )
    payload = result.model_dump()
    payload["synthetic_undocumented_field"] = "synthetic_value_alpha"

    with pytest.raises(ValidationError):
        ProviderPairLookupResult.model_validate(payload)


def test_contract_models_are_frozen_and_use_immutable_collections() -> None:
    result = SyntheticDDIProvider(SyntheticScenario.FOUND).lookup_pair(synthetic_request())

    with pytest.raises(ValidationError):
        result.status = ProviderLookupStatus.NO_ASSERTION_RETURNED
    assert isinstance(result.assertions, tuple)
    assert isinstance(result.assertions[0].evidence_references, tuple)
    assert isinstance(result.assertions[0].source_contexts, tuple)
