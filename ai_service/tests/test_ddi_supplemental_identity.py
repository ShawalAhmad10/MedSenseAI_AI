"""Builder and provenance checks for supplemental frozen-model identities."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from medsense_ai.integrations.amna_medcopy import build_ddi_supplemental_identity
from medsense_ai.integrations.amna_medcopy.build_ddi_supplemental_identity import (
    build_supplemental_identity_payload,
)
from medsense_ai.integrations.amna_medcopy.ddi_supplemental_identity import (
    DEFAULT_SUPPLEMENTAL_IDENTITY_ARTIFACT,
)


def test_builder_reproduces_packaged_registry() -> None:
    built = build_supplemental_identity_payload(Path("artifacts/ddi/model"))
    packaged = json.loads(
        DEFAULT_SUPPLEMENTAL_IDENTITY_ARTIFACT.read_text(encoding="utf-8")
    )

    assert built == packaged
    assert len(built["mappings"]) == 7
    assert all(
        mapping["match_source"] == "SUPPLEMENTAL_MODEL_IDENTITY"
        for mapping in built["mappings"]
    )


def test_builder_rejects_absent_model_target(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        build_ddi_supplemental_identity,
        "TARGET_MODEL_NAMES",
        (*build_ddi_supplemental_identity.TARGET_MODEL_NAMES, "Absent Drug"),
    )

    with pytest.raises(ValueError, match="absent from model vocabulary"):
        build_supplemental_identity_payload(Path("artifacts/ddi/model"))


def test_builder_rejects_duplicate_normalized_target(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        build_ddi_supplemental_identity,
        "TARGET_MODEL_NAMES",
        ("Cefoperazone", "Cefoperazone"),
    )

    with pytest.raises(ValueError, match="duplicate normalized supplemental key"):
        build_supplemental_identity_payload(Path("artifacts/ddi/model"))


def test_builder_rejects_target_not_proven_rxnorm_absent(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        build_ddi_supplemental_identity,
        "TARGET_MODEL_NAMES",
        ("Warfarin",),
    )

    with pytest.raises(ValueError, match="not proven absent"):
        build_supplemental_identity_payload(Path("artifacts/ddi/model"))
