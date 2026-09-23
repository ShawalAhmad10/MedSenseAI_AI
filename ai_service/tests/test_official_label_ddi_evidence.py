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

    assert len(artifact.pairs) == 33
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
