"""Regression tests for additive governed RxCUI/DDInter sidecars."""

from medsense_ai.integrations.amna_medcopy.ddi_rxcui_sidecar import (
    ExactRxCUIIdentityResolver,
    RxCUIInteractionEvidenceIndex,
    load_rxcui_evidence_artifact,
    load_rxcui_identity_artifact,
)


def test_packaged_rxcui_identity_sidecar_is_deterministic() -> None:
    first = load_rxcui_identity_artifact()
    second = load_rxcui_identity_artifact()

    assert first == second
    assert len(first.mappings) == 6889
    assert len({item.rxcui for item in first.mappings}) == 4730


def test_model_unsupported_identity_can_retain_exact_rxcui() -> None:
    resolver = ExactRxCUIIdentityResolver.from_artifact()

    result = resolver.resolve(
        resolver.artifact.mappings[0].normalized_lookup_key
    )

    assert result is not None
    assert result.rxcui
    assert result.normalized_salt


def test_unknown_identity_is_not_inferred() -> None:
    resolver = ExactRxCUIIdentityResolver.from_artifact()

    assert resolver.resolve(
        "definitely-not-a-governed-rxnorm-identity"
    ) is None


def test_packaged_ddinter_evidence_is_nonempty_and_order_invariant() -> None:
    artifact = load_rxcui_evidence_artifact()
    index = RxCUIInteractionEvidenceIndex(artifact)

    assert len(index) > 0

    record = artifact.pairs[0]

    forward = index.lookup(
        record.rxcui_a,
        record.rxcui_b,
    )

    reverse = index.lookup(
        record.rxcui_b,
        record.rxcui_a,
    )

    assert forward is not None
    assert forward == reverse
    assert forward.descriptions
    assert forward.record_identifiers
    assert forward.source_identifier


def test_absent_rxcui_pair_does_not_claim_no_interaction() -> None:
    index = RxCUIInteractionEvidenceIndex.from_artifact()

    assert index.lookup(
        "999999991",
        "999999992",
    ) is None
