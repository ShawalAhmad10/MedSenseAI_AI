from __future__ import annotations

import json
from pathlib import Path

import pytest

from medsense_ai.integrations.amna_medcopy.official_label_ddi_evidence import (
    DEFAULT_EVIDENCE_ARTIFACT,
    DEFAULT_MANIFEST,
    OfficialLabelInteractionEvidenceIndex,
    load_official_label_ddi_evidence_artifact,
)


def test_official_label_artifact_loads_with_expected_scope() -> None:
    artifact = load_official_label_ddi_evidence_artifact()

    assert artifact.schema_version == (
        "amna-official-label-ddi-evidence-v1"
    )

    assert len(artifact.pairs) == 63
    assert len(artifact.excluded_records) == 1

    excluded = artifact.excluded_records[0]

    assert excluded.partner_source_text.casefold() == "mycophenolate"
    assert excluded.partner_rxcui is None
    assert "must not be inferred" in excluded.reason


def test_official_label_lookup_is_exact_and_order_independent() -> None:
    index = OfficialLabelInteractionEvidenceIndex.from_artifact()

    # Sotagliflozin <-> digoxin
    forward = index.lookup("2638675", "3407")
    reverse = index.lookup("3407", "2638675")

    assert forward is not None
    assert reverse is not None
    assert forward == reverse

    assert forward.severity == "Unknown"
    assert forward.review_required is True
    assert forward.evidence_type == (
        "OFFICIAL_LABEL_NAMED_INTERACTION"
    )
    assert forward.model_dump()["record_identifiers"]
    assert forward.source_identifier.startswith(
        "official_label_ddi_evidence_v1.json@sha256:"
    )


def test_official_label_lookup_does_not_infer_absent_pair() -> None:
    index = OfficialLabelInteractionEvidenceIndex.from_artifact()

    # Same source drug, but a pair not present in the governed manifest.
    assert index.lookup("2638675", "1191") is None


def test_official_label_loader_rejects_payload_tampering(
    tmp_path: Path,
) -> None:
    payload = json.loads(
        DEFAULT_EVIDENCE_ARTIFACT.read_text(
            encoding="utf-8"
        )
    )

    payload["pairs"][0]["descriptions"] = [
        "tampered evidence"
    ]

    tampered = tmp_path / "official_label_tampered.json"

    tampered.write_text(
        json.dumps(
            payload,
            indent=2,
            ensure_ascii=False,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
        newline="\n",
    )

    with pytest.raises(
        ValueError,
        match="payload hash mismatch",
    ):
        load_official_label_ddi_evidence_artifact(
            tampered
        )


def test_official_label_loader_rejects_manifest_drift(
    tmp_path: Path,
) -> None:
    manifest = tmp_path / DEFAULT_MANIFEST.name

    manifest.write_bytes(
        DEFAULT_MANIFEST.read_bytes()
        + b"\n"
    )

    with pytest.raises(
        ValueError,
        match="manifest hash mismatch",
    ):
        load_official_label_ddi_evidence_artifact(
            manifest_path=manifest
        )


def test_official_label_ema_pair_preserves_source_provenance() -> None:
    index = OfficialLabelInteractionEvidenceIndex.from_artifact()

    # Linzagolix <-> paclitaxel
    evidence = index.lookup(
        "2621019",
        "56946",
    )

    assert evidence is not None
    assert evidence.severity == "Unknown"
    assert evidence.review_required is True
    assert evidence.source_system == "EMA"
    assert evidence.label_set_id == "Yselty-EPAR"

    assert evidence.record_identifiers == (
        "EMA:Yselty-EPAR:linzagolix:paclitaxel",
    )


def test_tirzepatide_warfarin_official_label_pair_is_governed() -> None:
    index = OfficialLabelInteractionEvidenceIndex.from_artifact()

    evidence = index.lookup(
        "2601723",
        "11289",
    )

    assert evidence is not None
    assert evidence.severity == "Unknown"
    assert evidence.review_required is True
    assert evidence.source_system == "DailyMed/FDA"

    assert evidence.record_identifiers == (
        "DailyMed:487cd7e7-434c-4925-99fa-aa80b1cc776b:"
        "tirzepatide:warfarin",
    )


def test_fosfomycin_metoclopramide_official_label_pair_is_governed() -> None:
    index = OfficialLabelInteractionEvidenceIndex.from_artifact()

    evidence = index.lookup("4550", "6915")

    assert evidence is not None
    assert evidence.severity == "Unknown"
    assert evidence.review_required is True
    assert evidence.source_system == "DailyMed/FDA"
    assert evidence.record_identifiers == (
        "DailyMed:f44b79d0-a789-46cb-ab70-7eb33a7debaf:"
        "fosfomycin:metoclopramide",
    )


def test_etrasimod_exact_official_label_pairs_are_governed() -> None:
    index = OfficialLabelInteractionEvidenceIndex.from_artifact()

    fluconazole = index.lookup("2668045", "4450")
    rifampin = index.lookup("2668045", "9384")

    assert fluconazole is not None
    assert rifampin is not None

    assert fluconazole.severity == "Unknown"
    assert rifampin.severity == "Unknown"

    assert fluconazole.review_required is True
    assert rifampin.review_required is True

    assert fluconazole.record_identifiers == (
        "DailyMed:65171e4a-d136-4abc-b08c-c40c1b486ff6:"
        "etrasimod:fluconazole",
    )

    assert rifampin.record_identifiers == (
        "DailyMed:65171e4a-d136-4abc-b08c-c40c1b486ff6:"
        "etrasimod:rifampin",
    )
