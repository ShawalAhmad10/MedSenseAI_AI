"""Governed partner ingredient bridge, cart policy, and API integration tests."""

from __future__ import annotations

import json
from pathlib import Path
import re
import shutil

from fastapi.testclient import TestClient
import pytest
from pydantic import ValidationError

from medsense_ai.ddi_runtime import RuntimeDDIService
from medsense_ai.ddi_runtime.contracts import RuntimeDDIStatus
from medsense_ai.ddi_model.inference import DDIInferenceModel
from medsense_ai.integrations.amna_medcopy.cart_ddi import (
    CartDDIStatus,
    PartnerCartCheckRequest,
    PartnerCartDDIService,
    request_snapshot,
)
from medsense_ai.integrations.amna_medcopy.contracts import PartnerProductRecord
from medsense_ai.integrations.amna_medcopy.ddi_bridge import (
    DEFAULT_BRIDGE_ARTIFACT,
    DDIBridgeMapping,
    ExactDDIIngredientResolver,
    IngredientIdentityNamespace,
    IngredientResolutionState,
    load_ddi_bridge_artifact,
)
from medsense_ai.integrations.amna_medcopy.ddi_rxcui_sidecar import (
    ExactRxCUIIdentityResolver,
    RxCUIInteractionEvidenceIndex,
    load_rxcui_evidence_artifact,
    load_rxcui_identity_artifact,
)
from medsense_ai.integrations.amna_medcopy.official_label_ddi_evidence import (
    OfficialLabelInteractionEvidenceIndex,
)
from medsense_ai.integrations.amna_medcopy.ddi_supplemental_identity import (
    DEFAULT_SUPPLEMENTAL_IDENTITY_ARTIFACT,
    load_supplemental_identity_artifact,
)


def product(
    product_id: int,
    salt: str | None,
    *,
    requires_rx: bool | None = False,
    status: int = 1,
) -> PartnerProductRecord:
    return PartnerProductRecord(
        product_id=product_id,
        product_title=f"DEMO Product {product_id}",
        product_generic_name=salt,
        product_salt=salt,
        product_requires_rx=requires_rx,
        product_status=status,
    )


@pytest.fixture(scope="module")
def resolver() -> ExactDDIIngredientResolver:
    return ExactDDIIngredientResolver.from_artifact()


@pytest.fixture(scope="module")
def cart_service(resolver: ExactDDIIngredientResolver) -> PartnerCartDDIService:
    runtime = RuntimeDDIService(
        model_dir=Path("artifacts/ddi/model"),
        known_interaction_source=Path("external/db_drug_interactions.csv"),
    )
    assert runtime.ready
    return PartnerCartDDIService(resolver=resolver, runtime_service=runtime)


@pytest.fixture(scope="module")
def frozen_model() -> DDIInferenceModel:
    return DDIInferenceModel(Path("artifacts/ddi/model"))


def test_packaged_bridge_has_deterministic_governed_overlap() -> None:
    first = load_ddi_bridge_artifact()
    second = load_ddi_bridge_artifact()

    assert first == second
    assert len(first.mappings) == 1244
    assert len(first.model_unsupported_lookup_keys) == 6889
    assert len(first.ambiguous_lookup_keys) == 0
    assert len(first.model_vocabulary_unmapped_keys) == 531
    assert first.provenance.rxnorm_release == "2026-08-03"
    assert first.provenance.rxnorm_source_sha256 == (
        "60302315447ddf1411836c4a88c1a6e16fa8e25fcf508b0a9393fca984e3a87a"
    )
    assert first.provenance.frozen_model_version == "med-ddi-binary-1.0.0"
    assert first.payload_sha256 == (
        "5091ec7361b094b1d4fcf9653be30ddaf3f284b9204c96d2f5dc8a0b70df5ed6"
    )


def test_bridge_loader_rejects_payload_tampering(tmp_path: Path) -> None:
    payload = json.loads(DEFAULT_BRIDGE_ARTIFACT.read_text(encoding="utf-8"))
    payload["matching_policy"] = "tampered"
    path = tmp_path / "bridge.json"
    path.write_text(json.dumps(payload), encoding="utf-8")

    with pytest.raises(ValueError, match="checksum mismatch"):
        load_ddi_bridge_artifact(path)


def test_exact_supported_salt_resolves_with_full_provenance(
    resolver: ExactDDIIngredientResolver,
) -> None:
    result = resolver.resolve("  WARFARIN ")

    assert result.state is IngredientResolutionState.RESOLVED
    assert result.source_salt == "  WARFARIN "
    assert result.normalized_salt == "warfarin"
    assert result.rxcui == "11289"
    assert result.rxnorm_release == "2026-08-03"
    assert result.frozen_model_token == "Warfarin"
    assert result.frozen_model_version == "med-ddi-binary-1.0.0"
    assert result.review_required is False


def test_aspirin_resolves_through_same_rxcui_model_identity(
    resolver: ExactDDIIngredientResolver,
) -> None:
    result = resolver.resolve("Aspirin")

    assert result.state is IngredientResolutionState.RESOLVED
    assert result.normalized_salt == "aspirin"
    assert result.rxcui == "1191"
    assert result.identity_namespace is IngredientIdentityNamespace.RXNORM
    assert result.identity_id == "1191"
    assert result.frozen_model_token == "Acetylsalicylic acid"
    assert result.review_required is False


@pytest.mark.parametrize(
    ("source_salt", "expected_token"),
    (
        ("Cefoperazone", "Cefoperazone"),
        ("Dydrogesterone", "Dydrogesterone"),
        ("Norethisterone", "Norethisterone"),
        ("Dexketoprofen", "Dexketoprofen"),
        ("Etoricoxib", "Etoricoxib"),
        ("Rupatadine", "Rupatadine"),
        ("Fusidic acid", "Fusidic acid"),
    ),
)
def test_supplemental_model_identities_resolve_and_are_inference_ready(
    resolver: ExactDDIIngredientResolver,
    frozen_model: DDIInferenceModel,
    source_salt: str,
    expected_token: str,
) -> None:
    result = resolver.resolve(source_salt)

    assert result.state is IngredientResolutionState.RESOLVED
    assert result.frozen_model_token == expected_token
    assert result.identity_namespace is IngredientIdentityNamespace.PUBCHEM
    assert result.identity_id
    assert result.rxcui is None
    assert result.review_required is False

    forward = frozen_model.predict(expected_token, "Warfarin")
    reverse = frozen_model.predict("Warfarin", expected_token)
    assert forward.warning_score == reverse.warning_score
    assert forward.warning_triggered == reverse.warning_triggered


@pytest.mark.parametrize(
    ("source_salt", "expected_token"),
    (
        ("Cefoperazone sodium", "Cefoperazone"),
        ("Dexketoprofen trometamol", "Dexketoprofen"),
        ("Rupatadine fumarate", "Rupatadine"),
        ("Fusidic Acid", "Fusidic acid"),
        ("Sterile Cefoperazone sodium Injection", "Cefoperazone"),
        ("Cefoperazone as Sodium", "Cefoperazone"),
        ("Cefoperazone (as sodium", "Cefoperazone"),
        ("equivalent to Cefoperazone", "Cefoperazone"),
        ("eq. to Cefoperazone", "Cefoperazone"),
        ("Cefoperazone Lyophilized Powder", "Cefoperazone"),
        ("Cefoperazone pentahydrate", "Cefoperazone"),
    ),
)
def test_conservative_formulation_candidates_resolve_uniquely(
    resolver: ExactDDIIngredientResolver,
    source_salt: str,
    expected_token: str,
) -> None:
    result = resolver.resolve(source_salt)

    assert result.state is IngredientResolutionState.RESOLVED
    assert result.frozen_model_token == expected_token
    assert result.identity_namespace is IngredientIdentityNamespace.PUBCHEM
    assert result.rxcui is None


@pytest.mark.parametrize(
    ("source_salt", "expected_token"),
    (
        ("amoxycillin", "Amoxicillin"),
        ("sulbactum", "Sulbactam"),
        ("tazobactum", "Tazobactam"),
        ("cefipime", "Cefepime"),
        ("ceflriaxone", "Ceftriaxone"),
        ("fosmomycin", "Fosfomycin"),
        ("slidenafil", "Sildenafil"),
    ),
)
def test_only_versioned_governed_spelling_aliases_are_applied(
    resolver: ExactDDIIngredientResolver,
    source_salt: str,
    expected_token: str,
) -> None:
    result = resolver.resolve(source_salt)

    assert result.state is IngredientResolutionState.RESOLVED
    assert result.frozen_model_token == expected_token
    assert result.identity_namespace is IngredientIdentityNamespace.RXNORM


def test_existing_rxnorm_identity_is_preferred_over_supplemental_collision(
    resolver: ExactDDIIngredientResolver,
) -> None:
    assert resolver.supplemental_artifact is not None
    collision = resolver.supplemental_artifact.mappings[0].model_copy(
        update={
            "normalized_lookup_key": "aspirin",
            "normalized_model_name": "aspirin",
        }
    )
    supplemental = resolver.supplemental_artifact.model_copy(
        update={"mappings": (collision, *resolver.supplemental_artifact.mappings)}
    )
    collision_resolver = ExactDDIIngredientResolver(resolver.artifact, supplemental)

    result = collision_resolver.resolve("Aspirin")

    assert result.identity_namespace is IngredientIdentityNamespace.RXNORM
    assert result.rxcui == "1191"
    assert result.frozen_model_token == "Acetylsalicylic acid"


def test_ambiguous_formulation_candidates_fail_closed(
    resolver: ExactDDIIngredientResolver,
) -> None:
    warfarin = next(
        item for item in resolver.artifact.mappings
        if item.normalized_lookup_key == "warfarin"
    )
    amiodarone = next(
        item for item in resolver.artifact.mappings
        if item.normalized_lookup_key == "amiodarone"
    )
    conflicting_candidate = DDIBridgeMapping(
        normalized_lookup_key="warfarin sodium",
        matched_source_text="warfarin sodium",
        canonical_display_name=amiodarone.canonical_display_name,
        rxcui=amiodarone.rxcui,
        match_source=amiodarone.match_source,
        frozen_model_token=amiodarone.frozen_model_token,
    )
    artifact = resolver.artifact.model_copy(
        update={"mappings": (*resolver.artifact.mappings, conflicting_candidate)}
    )
    ambiguous_resolver = ExactDDIIngredientResolver(artifact)

    result = ambiguous_resolver.resolve("Sterile Warfarin sodium")

    assert warfarin.rxcui != conflicting_candidate.rxcui
    assert result.state is IngredientResolutionState.AMBIGUOUS
    assert result.frozen_model_token is None
    assert result.review_required is True


def test_combination_text_requires_separate_active_ingredients(
    resolver: ExactDDIIngredientResolver,
) -> None:
    result = resolver.resolve("Amoxicillin + Clavulanic acid")

    assert result.state is IngredientResolutionState.REVIEW_REQUIRED
    assert result.frozen_model_token is None
    assert result.review_required is True
    assert "separate active ingredients" in result.message


def test_supplemental_loader_rejects_payload_tampering(tmp_path: Path) -> None:
    payload = json.loads(
        DEFAULT_SUPPLEMENTAL_IDENTITY_ARTIFACT.read_text(encoding="utf-8")
    )
    payload["matching_policy"] = "tampered"
    path = tmp_path / "supplemental.json"
    path.write_text(json.dumps(payload), encoding="utf-8")

    with pytest.raises(ValueError, match="payload checksum mismatch"):
        load_supplemental_identity_artifact(path)


def test_supplemental_loader_rejects_model_source_hash_mismatch(
    tmp_path: Path,
) -> None:
    source_model_dir = Path("artifacts/ddi/model")
    copied_model_dir = tmp_path / "model"
    copied_model_dir.mkdir()
    for filename in (
        "model_metadata.json",
        "inference_drug_features.csv",
        "inference_morgan_fingerprints.npz",
    ):
        shutil.copy2(source_model_dir / filename, copied_model_dir / filename)
    with (copied_model_dir / "inference_drug_features.csv").open(
        "a", encoding="utf-8"
    ) as handle:
        handle.write("\n")

    with pytest.raises(ValueError, match="model artifact hash mismatch"):
        load_supplemental_identity_artifact(model_dir=copied_model_dir)


@pytest.mark.parametrize(
    ("source_salt", "expected_token", "expected_rxcui"),
    (
        ("Clavulanic acid", "Clavulanic acid", "21216"),
        ("Rifampin", "Rifampicin", "9384"),
        ("Mesalamine", "Mesalazine", "52582"),
        ("Penicillin G", "Benzylpenicillin", "7980"),
        ("Penicillin V", "Phenoxymethylpenicillin", "7984"),
        ("5-hydroxytryptophan", "Oxitriptan", "94"),
    ),
)
def test_pinned_raw_rxnorm_terms_resolve_to_unique_model_identity(
    resolver: ExactDDIIngredientResolver,
    source_salt: str,
    expected_token: str,
    expected_rxcui: str,
) -> None:
    result = resolver.resolve(source_salt)

    assert result.state is IngredientResolutionState.RESOLVED
    assert result.frozen_model_token == expected_token
    assert result.rxcui == expected_rxcui
    assert result.review_required is False


@pytest.mark.parametrize("salt", (None, "", "   "))
def test_missing_source_salt_fails_closed(
    resolver: ExactDDIIngredientResolver,
    salt: str | None,
) -> None:
    result = resolver.resolve(salt)

    assert result.state is IngredientResolutionState.SOURCE_UNAVAILABLE
    assert result.frozen_model_token is None
    assert result.review_required is True


def test_exact_rxnorm_identity_outside_model_is_explicitly_unsupported(
    resolver: ExactDDIIngredientResolver,
) -> None:
    key = resolver.artifact.model_unsupported_lookup_keys[0]
    result = resolver.resolve(key)

    assert result.state is IngredientResolutionState.MODEL_UNSUPPORTED
    assert result.frozen_model_token is None
    assert result.review_required is True


def test_unknown_source_text_remains_unmapped(
    resolver: ExactDDIIngredientResolver,
) -> None:
    result = resolver.resolve("not-a-governed-ingredient-identity")

    assert result.state is IngredientResolutionState.UNMAPPED
    assert result.rxcui is None
    assert result.frozen_model_token is None


def test_request_rejects_duplicate_product_identity() -> None:
    with pytest.raises(ValidationError, match="unique authoritative product_id"):
        PartnerCartCheckRequest(products=(product(1, "Warfarin"), product(1, "Warfarin")))


def test_request_snapshot_is_order_invariant() -> None:
    first = PartnerCartCheckRequest(
        products=(product(2, "Amiodarone"), product(1, "Warfarin"))
    )
    second = PartnerCartCheckRequest(
        products=(product(1, "Warfarin"), product(2, "Amiodarone"))
    )

    assert request_snapshot(first) == request_snapshot(second)


def test_known_evidence_pair_requires_review(cart_service: PartnerCartDDIService) -> None:
    result = cart_service.evaluate(
        PartnerCartCheckRequest(
            products=(product(1, "Warfarin"), product(2, "Amiodarone"))
        )
    )

    assert result.status is CartDDIStatus.WARNING_REVIEW_REQUIRED
    assert result.checkout_allowed is False
    assert result.review_required is True
    assert len(result.pairs) == 1
    assert result.pairs[0].warning_triggered is True
    assert result.pairs[0].known_dataset_record_found is True
    assert result.pairs[0].evidence_record_identifiers


def test_supplemental_exact_evidence_has_unknown_severity_and_requires_review(
    cart_service: PartnerCartDDIService,
) -> None:
    result = cart_service.evaluate(
        PartnerCartCheckRequest(
            products=(product(1, "Cefoperazone"), product(2, "Warfarin"))
        )
    )

    pair = result.pairs[0]
    assert result.status is CartDDIStatus.WARNING_REVIEW_REQUIRED
    assert result.checkout_allowed is False
    assert pair.known_dataset_record_found is True
    assert pair.severity == "Unknown"
    assert pair.rxcui_a is None or pair.rxcui_b is None
    assert pair.review_required is True


def test_supplemental_model_only_warning_is_explicitly_potential(
    cart_service: PartnerCartDDIService,
) -> None:
    result = cart_service.evaluate(
        PartnerCartCheckRequest(
            products=(product(1, "Etoricoxib"), product(2, "Metformin"))
        )
    )

    pair = result.pairs[0]
    assert result.status is CartDDIStatus.WARNING_REVIEW_REQUIRED
    assert pair.model_warning_triggered is True
    assert pair.known_dataset_record_found is False
    assert pair.severity is None
    assert "Potential interaction model signal" in pair.message


def test_below_threshold_pair_is_clear_only_with_limitations(
    cart_service: PartnerCartDDIService,
) -> None:
    result = cart_service.evaluate(
        PartnerCartCheckRequest(
            products=(product(1, "Abacavir"), product(2, "Metformin"))
        )
    )

    assert result.status is CartDDIStatus.CLEAR_WITH_LIMITATIONS
    assert result.checkout_allowed is True
    assert result.review_required is False
    assert result.pairs[0].warning_triggered is False
    assert "not a clinical safety guarantee" in result.message
    assert all(
        re.search(r"\bsafe\b", text, flags=re.IGNORECASE) is None
        for text in (result.message, *result.limitations)
    )


def test_unresolved_salt_blocks_even_when_another_product_resolves(
    cart_service: PartnerCartDDIService,
) -> None:
    result = cart_service.evaluate(
        PartnerCartCheckRequest(products=(product(1, "Warfarin"), product(2, None)))
    )

    assert result.status is CartDDIStatus.UNRESOLVED_REVIEW_REQUIRED
    assert result.checkout_allowed is False
    assert result.products[1].ingredient.state is IngredientResolutionState.SOURCE_UNAVAILABLE


def test_requires_rx_does_not_change_ddi_result(cart_service: PartnerCartDDIService) -> None:
    without_rx = cart_service.evaluate(
        PartnerCartCheckRequest(
            products=(product(1, "Abacavir"), product(2, "Metformin"))
        )
    )
    with_rx = cart_service.evaluate(
        PartnerCartCheckRequest(
            products=(
                product(1, "Abacavir", requires_rx=True),
                product(2, "Metformin", requires_rx=True),
            )
        )
    )

    assert without_rx.status is with_rx.status
    assert without_rx.pairs == with_rx.pairs


def test_inactive_product_fails_closed_without_skipping_pair_evaluation(
    cart_service: PartnerCartDDIService,
) -> None:
    result = cart_service.evaluate(
        PartnerCartCheckRequest(
            products=(product(1, "Warfarin", status=0), product(2, "Amiodarone"))
        )
    )

    assert result.status is CartDDIStatus.UNRESOLVED_REVIEW_REQUIRED
    assert len(result.pairs) == 1
    assert result.pairs[0].warning_triggered is True


def test_bridge_and_runtime_artifact_version_mismatch_fails_closed(
    resolver: ExactDDIIngredientResolver,
) -> None:
    mismatched_provenance = resolver.artifact.provenance.model_copy(
        update={"frozen_model_version": "different-pinned-model-version"}
    )
    mismatched_artifact = resolver.artifact.model_copy(
        update={"provenance": mismatched_provenance}
    )
    service = PartnerCartDDIService(
        resolver=ExactDDIIngredientResolver(mismatched_artifact),
        runtime_service=RuntimeDDIService(
            model_dir=Path("artifacts/ddi/model"),
            known_interaction_source=Path("external/db_drug_interactions.csv"),
        ),
    )

    result = service.evaluate(
        PartnerCartCheckRequest(
            products=(product(1, "Abacavir"), product(2, "Metformin"))
        )
    )

    assert result.status is CartDDIStatus.SERVICE_UNAVAILABLE
    assert result.checkout_allowed is False



def test_model_unsupported_pair_can_preserve_exact_ddinter_evidence() -> None:
    bridge = load_ddi_bridge_artifact()
    identity_artifact = load_rxcui_identity_artifact()
    evidence_artifact = load_rxcui_evidence_artifact()

    supported_by_rxcui: dict[str, str] = {}

    for item in bridge.mappings:
        supported_by_rxcui.setdefault(
            item.rxcui,
            item.normalized_lookup_key,
        )

    unsupported_by_rxcui: dict[str, str] = {}

    for item in identity_artifact.mappings:
        unsupported_by_rxcui.setdefault(
            item.rxcui,
            item.normalized_lookup_key,
        )

    selected = None

    for record in evidence_artifact.pairs:
        if (
            record.rxcui_a in unsupported_by_rxcui
            and record.rxcui_b in supported_by_rxcui
        ):
            selected = (
                record.rxcui_a,
                unsupported_by_rxcui[record.rxcui_a],
                record.rxcui_b,
                supported_by_rxcui[record.rxcui_b],
            )
            break

        if (
            record.rxcui_b in unsupported_by_rxcui
            and record.rxcui_a in supported_by_rxcui
        ):
            selected = (
                record.rxcui_b,
                unsupported_by_rxcui[record.rxcui_b],
                record.rxcui_a,
                supported_by_rxcui[record.rxcui_a],
            )
            break

    assert selected is not None

    (
        unsupported_rxcui,
        unsupported_salt,
        supported_rxcui,
        supported_salt,
    ) = selected

    service = PartnerCartDDIService(
        resolver=ExactDDIIngredientResolver.from_artifact(),
        rxcui_identity_resolver=(
            ExactRxCUIIdentityResolver.from_artifact()
        ),
        rxcui_evidence_index=(
            RxCUIInteractionEvidenceIndex.from_artifact()
        ),
        runtime_service=RuntimeDDIService(
            model_dir=Path("artifacts/ddi/model"),
            known_interaction_source=Path(
                "external/db_drug_interactions.csv"
            ),
        ),
    )

    result = service.evaluate(
        PartnerCartCheckRequest(
            products=(
                product(1, unsupported_salt),
                product(2, supported_salt),
            )
        )
    )

    assert result.status is CartDDIStatus.WARNING_REVIEW_REQUIRED

    # Lock the exact-evidence behavior independently of ML support.
    source_record = next(
        record
        for record in evidence_artifact.pairs
        if {
            record.rxcui_a,
            record.rxcui_b,
        }
        == {
            unsupported_rxcui,
            supported_rxcui,
        }
    )

    payload = result.model_dump()
    pair_rows = (
        payload.get("pairs")
        or payload.get("pair_results")
        or []
    )

    matching_pairs = [
        pair
        for pair in pair_rows
        if {
            str(pair.get("rxcui_a") or ""),
            str(pair.get("rxcui_b") or ""),
        }
        == {
            unsupported_rxcui,
            supported_rxcui,
        }
        and pair.get("known_dataset_record_found") is True
    ]

    assert matching_pairs

    evidence_pair = matching_pairs[0]

    normalized_levels = {
        str(level).strip().casefold()
        for level in source_record.levels
        if str(level).strip()
    }

    severity_map = {
        "minor": "Minor",
        "moderate": "Moderate",
        "major": "Major",
        "unknown": "Unknown",
    }

    if (
        len(normalized_levels) == 1
        and next(iter(normalized_levels)) in severity_map
    ):
        expected_severity = severity_map[
            next(iter(normalized_levels))
        ]
    else:
        expected_severity = "Unknown"

    assert evidence_pair["severity"] == expected_severity
    assert evidence_pair["model_version"] is None
    assert evidence_pair["model_warning_score"] is None
    assert evidence_pair["model_warning_triggered"] is None
    assert evidence_pair["warning_triggered"] is True
    assert evidence_pair["known_dataset_record_found"] is True
    assert evidence_pair["review_required"] is True

    assert set(
        evidence_pair["evidence_record_identifiers"]
    ) == set(
        source_record.record_identifiers
    )
    assert result.checkout_allowed is False
    assert result.review_required is True

    matching_pairs = [
        pair
        for pair in result.pairs
        if {pair.rxcui_a, pair.rxcui_b}
        == {unsupported_rxcui, supported_rxcui}
    ]

    assert len(matching_pairs) == 1

    pair = matching_pairs[0]

    assert pair.state is RuntimeDDIStatus.INTERACTION_WARNING
    assert pair.warning_triggered is True
    assert pair.known_dataset_record_found is True
    assert pair.model_warning_score is None
    assert pair.model_warning_triggered is None
    assert pair.evidence_record_identifiers
    assert pair.known_interaction_descriptions
    assert (
        "ddinter_rxcui_evidence_v1.json@sha256:"
        in pair.evidence_source_identifier
    )



def test_official_label_exact_pair_fills_ddinter_coverage_gap() -> None:
    service = PartnerCartDDIService(
        resolver=ExactDDIIngredientResolver.from_artifact(),
        rxcui_identity_resolver=(
            ExactRxCUIIdentityResolver.from_artifact()
        ),
        rxcui_evidence_index=(
            RxCUIInteractionEvidenceIndex.from_artifact()
        ),
        official_label_evidence_index=(
            OfficialLabelInteractionEvidenceIndex.from_artifact()
        ),
        runtime_service=RuntimeDDIService(
            model_dir=Path("artifacts/ddi/model"),
            known_interaction_source=Path(
                "external/db_drug_interactions.csv"
            ),
        ),
    )

    result = service.evaluate(
        PartnerCartCheckRequest(
            products=(
                product(1, "Sotagliflozin"),
                product(2, "Digoxin"),
            )
        )
    )

    assert result.status is (
        CartDDIStatus.WARNING_REVIEW_REQUIRED
    )
    assert result.checkout_allowed is False
    assert result.review_required is True

    matching = [
        pair
        for pair in result.pairs
        if {
            str(pair.rxcui_a or ""),
            str(pair.rxcui_b or ""),
        }
        == {
            "2638675",
            "3407",
        }
    ]

    assert len(matching) == 1

    pair = matching[0]

    assert pair.state is RuntimeDDIStatus.INTERACTION_WARNING
    assert pair.warning_triggered is True

    assert pair.known_dataset_record_found is True
    assert pair.severity == "Unknown"

    assert pair.model_version is None
    assert pair.model_warning_score is None
    assert pair.model_warning_triggered is None

    assert pair.review_required is True

    assert pair.evidence_source_identifier is not None
    assert pair.evidence_source_identifier.startswith(
        "official_label_ddi_evidence_v1.json@sha256:"
    )

    assert any(
        identifier.startswith("DailyMed:")
        for identifier in pair.evidence_record_identifiers
    )

    assert "official product-label" in pair.message




def test_ddinter_precedes_official_label_overlap_without_duplicate_lookup() -> None:
    bridge = load_ddi_bridge_artifact()
    identity_artifact = load_rxcui_identity_artifact()
    ddinter = load_rxcui_evidence_artifact()

    governed_name_by_rxcui: dict[str, str] = {}

    # Main bridge identities.
    for item in bridge.mappings:
        governed_name_by_rxcui.setdefault(
            item.rxcui,
            item.normalized_lookup_key,
        )

    # RxCUI sidecar identities retain governed identity even when
    # the frozen ML model does not support the drug.
    for item in identity_artifact.mappings:
        governed_name_by_rxcui.setdefault(
            item.rxcui,
            item.normalized_lookup_key,
        )

    selected = None

    for record in ddinter.pairs:
        if (
            record.rxcui_a in governed_name_by_rxcui
            and record.rxcui_b in governed_name_by_rxcui
        ):
            selected = (
                record.rxcui_a,
                governed_name_by_rxcui[record.rxcui_a],
                record.rxcui_b,
                governed_name_by_rxcui[record.rxcui_b],
            )
            break

    assert selected is not None

    rxcui_a, salt_a, rxcui_b, salt_b = selected

    class OfficialLabelMustNotBeCalled:
        def lookup(
            self,
            left_rxcui: str,
            right_rxcui: str,
        ):
            raise AssertionError(
                "Official-label fallback must not be queried "
                "when DDInter already has exact pair evidence."
            )

    service = PartnerCartDDIService(
        resolver=ExactDDIIngredientResolver.from_artifact(),
        rxcui_identity_resolver=(
            ExactRxCUIIdentityResolver.from_artifact()
        ),
        rxcui_evidence_index=(
            RxCUIInteractionEvidenceIndex.from_artifact()
        ),
        official_label_evidence_index=(
            OfficialLabelMustNotBeCalled()
        ),
        runtime_service=RuntimeDDIService(
            model_dir=Path("artifacts/ddi/model"),
            known_interaction_source=Path(
                "external/db_drug_interactions.csv"
            ),
        ),
    )

    result = service.evaluate(
        PartnerCartCheckRequest(
            products=(
                product(1, salt_a),
                product(2, salt_b),
            )
        )
    )

    matching = [
        pair
        for pair in result.pairs
        if {
            str(pair.rxcui_a or ""),
            str(pair.rxcui_b or ""),
        }
        == {
            rxcui_a,
            rxcui_b,
        }
        and pair.evidence_source_identifier is not None
        and pair.evidence_source_identifier.startswith(
            "ddinter_rxcui_evidence_v1.json@sha256:"
        )
    ]

    assert len(matching) == 1

    pair = matching[0]

    assert pair.state is RuntimeDDIStatus.INTERACTION_WARNING
    assert pair.known_dataset_record_found is True
    assert pair.warning_triggered is True
    assert pair.review_required is True
    assert result.checkout_allowed is False




def test_official_exact_evidence_merges_into_existing_model_pair() -> None:
    service = PartnerCartDDIService(
        resolver=ExactDDIIngredientResolver.from_artifact(),
        rxcui_identity_resolver=(
            ExactRxCUIIdentityResolver.from_artifact()
        ),
        rxcui_evidence_index=(
            RxCUIInteractionEvidenceIndex.from_artifact()
        ),
        official_label_evidence_index=(
            OfficialLabelInteractionEvidenceIndex.from_artifact()
        ),
        runtime_service=RuntimeDDIService(
            model_dir=Path("artifacts/ddi/model"),
            known_interaction_source=Path(
                "external/db_drug_interactions.csv"
            ),
        ),
    )

    result = service.evaluate(
        PartnerCartCheckRequest(
            products=(
                product(1, "Fosfomycin"),
                product(2, "Metoclopramide"),
            )
        )
    )

    matching = [
        pair
        for pair in result.pairs
        if {
            str(pair.rxcui_a or ""),
            str(pair.rxcui_b or ""),
        }
        == {"4550", "6915"}
    ]

    assert len(matching) == 1

    pair = matching[0]

    assert result.status is (
        CartDDIStatus.WARNING_REVIEW_REQUIRED
    )
    assert result.checkout_allowed is False
    assert result.review_required is True

    assert pair.state is RuntimeDDIStatus.INTERACTION_WARNING

    # Frozen-model metadata is retained.
    assert pair.model_version == "med-ddi-binary-1.0.0"
    assert pair.model_warning_score is not None
    assert pair.selected_threshold is not None
    assert pair.model_warning_triggered is False

    # Exact official evidence independently upgrades the pair.
    assert pair.warning_triggered is True
    assert pair.known_dataset_record_found is True
    assert pair.severity == "Unknown"
    assert pair.review_required is True

    assert pair.evidence_source_identifier is not None
    assert pair.evidence_source_identifier.startswith(
        "official_label_ddi_evidence_v1.json@sha256:"
    )

    assert pair.evidence_record_identifiers == (
        "DailyMed:f44b79d0-a789-46cb-ab70-7eb33a7debaf:"
        "fosfomycin:metoclopramide",
    )


def test_etrasimod_official_exact_evidence_creates_single_warning_pair() -> None:
    service = PartnerCartDDIService(
        resolver=ExactDDIIngredientResolver.from_artifact(),
        rxcui_identity_resolver=(
            ExactRxCUIIdentityResolver.from_artifact()
        ),
        rxcui_evidence_index=(
            RxCUIInteractionEvidenceIndex.from_artifact()
        ),
        official_label_evidence_index=(
            OfficialLabelInteractionEvidenceIndex.from_artifact()
        ),
        runtime_service=RuntimeDDIService(
            model_dir=Path("artifacts/ddi/model"),
            known_interaction_source=Path(
                "external/db_drug_interactions.csv"
            ),
        ),
    )

    for partner, partner_rxcui in (
        ("Fluconazole", "4450"),
        ("Rifampin", "9384"),
    ):
        result = service.evaluate(
            PartnerCartCheckRequest(
                products=(
                    product(1, "Etrasimod"),
                    product(2, partner),
                )
            )
        )

        matching = [
            pair
            for pair in result.pairs
            if {
                str(pair.rxcui_a or ""),
                str(pair.rxcui_b or ""),
            }
            == {"2668045", partner_rxcui}
        ]

        assert len(matching) == 1

        pair = matching[0]

        assert result.status is (
            CartDDIStatus.WARNING_REVIEW_REQUIRED
        )
        assert result.checkout_allowed is False

        assert pair.state is (
            RuntimeDDIStatus.INTERACTION_WARNING
        )
        assert pair.model_version is None
        assert pair.model_warning_score is None
        assert pair.model_warning_triggered is None

        assert pair.warning_triggered is True
        assert pair.known_dataset_record_found is True
        assert pair.severity == "Unknown"
        assert pair.review_required is True

        assert pair.evidence_source_identifier is not None
        assert pair.evidence_source_identifier.startswith(
            "official_label_ddi_evidence_v1.json@sha256:"
        )


def test_cart_api_returns_typed_authoritative_result(client: TestClient) -> None:
    response = client.post(
        "/api/v1/integrations/amna/ddi/cart-check",
        json={
            "products": [
                product(1, "Abacavir").model_dump(mode="json"),
                product(2, "Metformin").model_dump(mode="json"),
            ]
        },
    )

    assert response.status_code == 200
    assert response.json()["status"] == "CLEAR_WITH_LIMITATIONS"
    assert response.json()["checkout_allowed"] is True


def test_cart_api_fails_closed_when_service_is_unavailable(client: TestClient) -> None:
    client.app.state.amna_cart_ddi_service = None

    response = client.post(
        "/api/v1/integrations/amna/ddi/cart-check",
        json={"products": [product(1, "Warfarin").model_dump(mode="json")]},
    )

    assert response.status_code == 503
    assert response.json()["status"] == "SERVICE_UNAVAILABLE"
    assert response.json()["checkout_allowed"] is False
