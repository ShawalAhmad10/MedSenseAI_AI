"""Tests for deterministic ingestion contracts without medical facts."""

import pytest
from pydantic import ValidationError

from medsense_ai.domain.enums import InteractionAssessmentStatus
from medsense_ai.medical_data_ingestion import (
    ExtractedRecord,
    RecordDisposition,
    ValidatedRecord,
    normalize_medical_name,
)


def test_extracted_record_and_validation_disposition_are_typed() -> None:
    extracted = ExtractedRecord(
        source_record_identifier="record_alpha",
        source_record_type="synthetic_record",
        source_record_checksum="checksum_alpha",
        payload={"synthetic_key": "synthetic_value"},
    )
    validated = ValidatedRecord(
        extracted=extracted,
        disposition=RecordDisposition.REVIEW_REQUIRED,
        validation_messages=("synthetic_review_message",),
    )

    assert validated.disposition is RecordDisposition.REVIEW_REQUIRED
    assert validated.extracted.payload == {"synthetic_key": "synthetic_value"}


def test_ingestion_contract_rejects_invalid_external_input() -> None:
    with pytest.raises(ValidationError):
        ExtractedRecord(source_record_type="", payload={}, unexpected_field="not_allowed")


def test_name_normalization_is_deterministic_and_rejects_empty_values() -> None:
    assert normalize_medical_name("  INGREDIENT_ALPHA  ") == "ingredient_alpha"
    with pytest.raises(ValueError):
        normalize_medical_name("   ")


def test_future_interaction_outcomes_keep_missing_data_distinct_from_safety() -> None:
    assert InteractionAssessmentStatus.NO_ASSERTION_AVAILABLE.value == "no_assertion_available"
    assert InteractionAssessmentStatus.UNRESOLVED_DRUG.value == "unresolved_drug"
    assert InteractionAssessmentStatus.INSUFFICIENT_DATA.value == "insufficient_data"
