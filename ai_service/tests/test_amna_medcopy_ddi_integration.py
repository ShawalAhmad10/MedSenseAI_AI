"""Governed partner ingredient bridge, cart policy, and API integration tests."""

from __future__ import annotations

import json
from pathlib import Path
import re

from fastapi.testclient import TestClient
import pytest
from pydantic import ValidationError

from medsense_ai.ddi_runtime import RuntimeDDIService
from medsense_ai.ddi_runtime.contracts import RuntimeDDIStatus
from medsense_ai.integrations.amna_medcopy.cart_ddi import (
    CartDDIStatus,
    PartnerCartCheckRequest,
    PartnerCartDDIService,
    request_snapshot,
)
from medsense_ai.integrations.amna_medcopy.contracts import PartnerProductRecord
from medsense_ai.integrations.amna_medcopy.ddi_bridge import (
    DEFAULT_BRIDGE_ARTIFACT,
    ExactDDIIngredientResolver,
    IngredientResolutionState,
    load_ddi_bridge_artifact,
)
from medsense_ai.integrations.amna_medcopy.ddi_rxcui_sidecar import (
    ExactRxCUIIdentityResolver,
    RxCUIInteractionEvidenceIndex,
    load_rxcui_evidence_artifact,
    load_rxcui_identity_artifact,
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
    assert result.frozen_model_token == "Acetylsalicylic acid"
    assert result.review_required is False


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

    assert result.status is CartDDIStatus.UNRESOLVED_REVIEW_REQUIRED
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
