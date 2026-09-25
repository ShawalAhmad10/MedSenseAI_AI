"""Focused tests for the offline runtime DDI prediction service."""

from __future__ import annotations

import csv
import urllib.request
from pathlib import Path

import pytest
from pydantic import ValidationError

from medsense_ai.ddi_model.inference import (
    PredictionResult,
    UnsupportedDrugError,
    apply_threshold,
)
from medsense_ai.ddi_runtime import (
    RuntimeDDIResult,
    RuntimeDDIService,
    RuntimeDDIStatus,
)
from medsense_ai.medical_data_ingestion.normalization import normalize_medical_name


class StubInferenceModel:
    model_version = "synthetic-runtime-model-v1"
    threshold = 0.5

    def __init__(self) -> None:
        self.supported = {"synthetic alpha", "synthetic beta", "synthetic gamma"}
        self.scores = {
            ("synthetic alpha", "synthetic beta"): 0.5,
            ("synthetic alpha", "synthetic gamma"): 0.2,
            ("synthetic beta", "synthetic gamma"): 0.9,
        }

    def predict(self, drug_a: str, drug_b: str) -> PredictionResult:
        normalized_a = normalize_medical_name(drug_a)
        normalized_b = normalize_medical_name(drug_b)
        if normalized_a not in self.supported or normalized_b not in self.supported:
            raise UnsupportedDrugError("synthetic unsupported ingredient")
        score = self.scores[tuple(sorted((normalized_a, normalized_b)))]
        warning = apply_threshold(score, self.threshold)
        return PredictionResult(
            drug_a=drug_a,
            drug_b=drug_b,
            normalized_drug_a=normalized_a,
            normalized_drug_b=normalized_b,
            warning_score=score,
            selected_threshold=self.threshold,
            warning_triggered=warning,
            predicted_research_class=(
                "known_positive_like" if warning else "sampled_unlabeled_like"
            ),
        )


def _write_known_source(path: Path) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(("Drug 1", "Drug 2", "Interaction Description"))
        writer.writerow(
            ("Synthetic Alpha", "Synthetic Beta", "synthetic exact description one")
        )
        writer.writerow(
            ("Synthetic Beta", "Synthetic Alpha", "synthetic exact description two")
        )
        writer.writerow(
            ("Synthetic Beta", "Synthetic Gamma", "synthetic exact description three")
        )


def _service(tmp_path: Path) -> RuntimeDDIService:
    source = tmp_path / "known.csv"
    _write_known_source(source)
    stub = StubInferenceModel()
    return RuntimeDDIService(
        model_dir=tmp_path / "unused-model-dir",
        known_interaction_source=source,
        model_loader=lambda _: stub,  # type: ignore[arg-type,return-value]
    )


def test_known_supported_pair_returns_model_warning_and_exact_descriptions(
    tmp_path: Path,
) -> None:
    result = _service(tmp_path).predict("  SYNTHETIC Alpha ", "synthetic beta")

    assert result.status is RuntimeDDIStatus.INTERACTION_WARNING
    assert result.model_warning_score == 0.5
    assert result.model_warning_triggered is True
    assert result.warning_triggered is True
    assert result.known_dataset_record_found is True
    assert result.known_interaction_descriptions == (
        "synthetic exact description one",
        "synthetic exact description two",
    )
    assert result.evidence_record_identifiers == (
        "known.csv:row:2",
        "known.csv:row:3",
    )


def test_endpoint_swap_produces_identical_score_decision_and_evidence(
    tmp_path: Path,
) -> None:
    service = _service(tmp_path)
    forward = service.predict("Synthetic Alpha", "Synthetic Beta")
    reverse = service.predict("Synthetic Beta", "Synthetic Alpha")

    assert forward.model_warning_score == reverse.model_warning_score
    assert forward.model_warning_triggered == reverse.model_warning_triggered
    assert forward.status == reverse.status
    assert forward.known_interaction_descriptions == reverse.known_interaction_descriptions


def test_supported_pair_without_known_row_is_not_described_as_safe(tmp_path: Path) -> None:
    result = _service(tmp_path).predict("Synthetic Alpha", "Synthetic Gamma")

    assert result.status is RuntimeDDIStatus.NO_MODEL_WARNING
    assert result.model_warning_score == 0.2
    assert result.model_warning_triggered is False
    assert result.warning_triggered is False
    assert result.known_dataset_record_found is False
    assert result.known_interaction_descriptions == ()
    assert "does not establish safety" in result.message


def test_unknown_ingredient_fails_closed_without_model_prediction(tmp_path: Path) -> None:
    result = _service(tmp_path).predict("Synthetic Alpha", "Unknown Ingredient")

    assert result.status is RuntimeDDIStatus.UNSUPPORTED_INGREDIENT
    assert result.model_warning_score is None
    assert result.model_warning_triggered is None
    assert result.warning_triggered is True
    assert result.manual_review_required is True


def test_identical_ingredient_is_invalid(tmp_path: Path) -> None:
    result = _service(tmp_path).predict("Synthetic Alpha", " synthetic alpha ")

    assert result.status is RuntimeDDIStatus.INVALID_INPUT
    assert result.normalized_ingredient_a == result.normalized_ingredient_b
    assert result.model_warning_score is None
    assert result.warning_triggered is True


@pytest.mark.parametrize(
    ("ingredient_a", "ingredient_b"),
    [("", "Synthetic Beta"), ("   ", "Synthetic Beta"), (None, "Synthetic Beta"), ("Bad\nName", "Synthetic Beta")],
)
def test_malformed_or_blank_input_is_invalid(
    tmp_path: Path, ingredient_a: object, ingredient_b: object
) -> None:
    result = _service(tmp_path).predict(ingredient_a, ingredient_b)

    assert result.status is RuntimeDDIStatus.INVALID_INPUT
    assert result.model_warning_score is None
    assert result.warning_triggered is True


@pytest.mark.parametrize("failure", [FileNotFoundError("missing"), ValueError("corrupt")])
def test_missing_or_corrupt_model_returns_model_unavailable(
    tmp_path: Path, failure: Exception
) -> None:
    source = tmp_path / "known.csv"
    _write_known_source(source)

    def failing_loader(_: Path):
        raise failure

    service = RuntimeDDIService(
        model_dir=tmp_path / "model",
        known_interaction_source=source,
        model_loader=failing_loader,
    )
    result = service.predict("Synthetic Alpha", "Synthetic Gamma")

    assert service.ready is False
    assert result.status is RuntimeDDIStatus.MODEL_UNAVAILABLE
    assert result.model_warning_score is None
    assert result.warning_triggered is True
    assert result.manual_review_required is True


def test_threshold_boundary_is_inclusive(tmp_path: Path) -> None:
    result = _service(tmp_path).predict("Synthetic Alpha", "Synthetic Beta")

    assert result.model_warning_score == result.selected_threshold == 0.5
    assert result.model_warning_triggered is True


@pytest.mark.parametrize(
    "overrides",
    [
        {"model_warning_score": None},
        {"selected_threshold": None},
        {"model_warning_triggered": None},
        {"model_warning_score": 0.2, "model_warning_triggered": True},
        {"model_warning_score": 0.8, "model_warning_triggered": False},
    ],
)
def test_prediction_contract_rejects_missing_or_inconsistent_model_decision(
    overrides: dict[str, object],
) -> None:
    values = {
        "status": RuntimeDDIStatus.NO_MODEL_WARNING,
        "normalized_ingredient_a": "synthetic alpha",
        "normalized_ingredient_b": "synthetic gamma",
        "model_version": "synthetic-runtime-model-v1",
        "model_warning_score": 0.2,
        "selected_threshold": 0.5,
        "model_warning_triggered": False,
        "warning_triggered": False,
        "known_dataset_record_found": False,
        "evidence_source_identifier": "known.csv@sha256:" + "0" * 64,
        "manual_review_required": True,
        "message": "Synthetic below-threshold result; not a safety conclusion.",
        "limitations": ("Synthetic limitation.",),
        "runtime_latency_ms": 0.0,
    }
    values.update(overrides)

    with pytest.raises(ValidationError):
        RuntimeDDIResult.model_validate(values)


def test_prediction_contract_requires_source_identity_for_known_evidence() -> None:
    with pytest.raises(ValidationError, match="source identity"):
        RuntimeDDIResult(
            status=RuntimeDDIStatus.INTERACTION_WARNING,
            normalized_ingredient_a="synthetic alpha",
            normalized_ingredient_b="synthetic beta",
            model_version="synthetic-runtime-model-v1",
            model_warning_score=0.5,
            selected_threshold=0.5,
            model_warning_triggered=True,
            warning_triggered=True,
            known_dataset_record_found=True,
            known_interaction_descriptions=("synthetic exact description",),
            evidence_record_identifiers=("known.csv:row:2",),
            manual_review_required=True,
            message="Synthetic interaction warning.",
            limitations=("Synthetic limitation.",),
            runtime_latency_ms=0.0,
        )


def test_repeated_prediction_is_deterministic(tmp_path: Path) -> None:
    service = _service(tmp_path)
    first = service.predict("Synthetic Beta", "Synthetic Gamma")
    second = service.predict("Synthetic Beta", "Synthetic Gamma")

    assert first.model_warning_score == second.model_warning_score
    assert first.status == second.status
    assert first.known_interaction_descriptions == second.known_interaction_descriptions


def test_runtime_does_not_use_network_or_pubchem(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def network_forbidden(*args, **kwargs):
        raise AssertionError("runtime attempted external network access")

    monkeypatch.setattr(urllib.request, "urlopen", network_forbidden)
    result = _service(tmp_path).predict("Synthetic Alpha", "Synthetic Beta")

    assert result.status is RuntimeDDIStatus.INTERACTION_WARNING
