from __future__ import annotations

import hashlib
import json
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, model_validator


SCHEMA_VERSION = "amna-official-label-ddi-evidence-v1"

DATA_DIR = Path(__file__).with_name("data")

DEFAULT_EVIDENCE_ARTIFACT = (
    DATA_DIR / "official_label_ddi_evidence_v1.json"
)
DEFAULT_MANIFEST = (
    DATA_DIR / "official_label_ddi_manifest_v1.json"
)
DEFAULT_BRIDGE = DATA_DIR / "ddi_bridge_v1.json"
DEFAULT_IDENTITY = DATA_DIR / "ddi_rxcui_identity_v1.json"


def _canonical_json(value: object) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class OfficialLabelEvidencePair(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    rxcui_a: str = Field(min_length=1, max_length=64)
    rxcui_b: str = Field(min_length=1, max_length=64)

    ingredient_a: str = Field(min_length=1, max_length=500)
    ingredient_b: str = Field(min_length=1, max_length=500)

    severity: str
    descriptions: tuple[str, ...]
    record_identifiers: tuple[str, ...]

    source_system: str = Field(min_length=1, max_length=200)
    label_set_id: str = Field(min_length=1, max_length=200)
    label_section: str = Field(min_length=1, max_length=200)

    evidence_type: str
    review_required: bool

    @model_validator(mode="after")
    def validate_pair(self) -> "OfficialLabelEvidencePair":
        if self.rxcui_a >= self.rxcui_b:
            raise ValueError(
                "official-label pairs must use canonical RxCUI ordering"
            )

        if self.severity != "Unknown":
            raise ValueError(
                "official-label evidence must not invent "
                "Major/Moderate/Minor severity"
            )

        if self.evidence_type != "OFFICIAL_LABEL_NAMED_INTERACTION":
            raise ValueError(
                "unsupported official-label evidence type"
            )

        if self.review_required is not True:
            raise ValueError(
                "official-label interaction evidence must require review"
            )

        if not self.descriptions or not self.record_identifiers:
            raise ValueError(
                "official-label evidence requires description and record ID"
            )

        if len(self.descriptions) != len(self.record_identifiers):
            raise ValueError(
                "descriptions and record identifiers must align"
            )

        return self


class OfficialLabelExcludedRecord(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    drug_source_text: str = Field(min_length=1, max_length=500)
    drug_rxcui: str = Field(min_length=1, max_length=64)

    partner_source_text: str = Field(min_length=1, max_length=500)
    partner_rxcui: str | None = None

    source_system: str = Field(min_length=1, max_length=200)
    label_set_id: str = Field(min_length=1, max_length=200)
    label_section: str = Field(min_length=1, max_length=200)

    reason: str = Field(min_length=1, max_length=2000)


class OfficialLabelEvidenceProvenance(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    manifest_file: str
    manifest_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")

    bridge_file: str
    bridge_payload_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")

    rxcui_identity_file: str
    rxcui_identity_payload_sha256: str = Field(
        pattern=r"^[0-9a-f]{64}$"
    )

    policy: str = Field(min_length=1)


class OfficialLabelEvidenceArtifact(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    schema_version: str
    provenance: OfficialLabelEvidenceProvenance
    pairs: tuple[OfficialLabelEvidencePair, ...]
    excluded_records: tuple[OfficialLabelExcludedRecord, ...]
    payload_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")

    @model_validator(mode="after")
    def validate_artifact(self) -> "OfficialLabelEvidenceArtifact":
        if self.schema_version != SCHEMA_VERSION:
            raise ValueError(
                f"unsupported official-label evidence schema: "
                f"{self.schema_version}"
            )

        keys = tuple(
            (
                item.rxcui_a,
                item.rxcui_b,
                item.record_identifiers[0],
            )
            for item in self.pairs
        )

        if keys != tuple(sorted(keys)):
            raise ValueError(
                "official-label evidence pairs must be sorted"
            )

        pair_keys = tuple(
            (item.rxcui_a, item.rxcui_b)
            for item in self.pairs
        )

        if len(pair_keys) != len(set(pair_keys)):
            raise ValueError(
                "duplicate official-label RxCUI pair"
            )

        return self


class OfficialLabelInteractionEvidence(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    severity: str
    descriptions: tuple[str, ...]
    record_identifiers: tuple[str, ...]

    source_system: str
    label_set_id: str
    label_section: str

    evidence_type: str
    review_required: bool
    source_identifier: str


class OfficialLabelInteractionEvidenceIndex:
    """Immutable exact unordered RxCUI-pair official-label evidence."""

    def __init__(
        self,
        artifact: OfficialLabelEvidenceArtifact,
        *,
        artifact_name: str = DEFAULT_EVIDENCE_ARTIFACT.name,
    ) -> None:
        self.artifact = artifact

        self.source_identifier = (
            f"{artifact_name}@sha256:"
            f"{artifact.payload_sha256}"
        )

        self._pairs = {
            (item.rxcui_a, item.rxcui_b): item
            for item in artifact.pairs
        }

    @classmethod
    def from_artifact(
        cls,
        path: Path = DEFAULT_EVIDENCE_ARTIFACT,
        *,
        manifest_path: Path = DEFAULT_MANIFEST,
        bridge_path: Path = DEFAULT_BRIDGE,
        identity_path: Path = DEFAULT_IDENTITY,
    ) -> "OfficialLabelInteractionEvidenceIndex":
        artifact = load_official_label_ddi_evidence_artifact(
            path,
            manifest_path=manifest_path,
            bridge_path=bridge_path,
            identity_path=identity_path,
        )

        return cls(
            artifact,
            artifact_name=path.name,
        )

    def lookup(
        self,
        rxcui_a: str,
        rxcui_b: str,
    ) -> OfficialLabelInteractionEvidence | None:
        if str(rxcui_a) == str(rxcui_b):
            return None

        key = tuple(
            sorted(
                (
                    str(rxcui_a),
                    str(rxcui_b),
                )
            )
        )

        record = self._pairs.get(key)

        if record is None:
            return None

        return OfficialLabelInteractionEvidence(
            severity=record.severity,
            descriptions=record.descriptions,
            record_identifiers=record.record_identifiers,
            source_system=record.source_system,
            label_set_id=record.label_set_id,
            label_section=record.label_section,
            evidence_type=record.evidence_type,
            review_required=record.review_required,
            source_identifier=self.source_identifier,
        )

    def __len__(self) -> int:
        return len(self._pairs)


def load_official_label_ddi_evidence_artifact(
    path: Path = DEFAULT_EVIDENCE_ARTIFACT,
    *,
    manifest_path: Path = DEFAULT_MANIFEST,
    bridge_path: Path = DEFAULT_BRIDGE,
    identity_path: Path = DEFAULT_IDENTITY,
) -> OfficialLabelEvidenceArtifact:
    raw = json.loads(
        path.read_text(encoding="utf-8")
    )

    supplied_hash = str(
        raw.get("payload_sha256") or ""
    )

    unsigned = dict(raw)
    unsigned.pop("payload_sha256", None)

    expected_hash = hashlib.sha256(
        _canonical_json(unsigned)
    ).hexdigest()

    if supplied_hash != expected_hash:
        raise ValueError(
            "official-label evidence payload hash mismatch"
        )

    artifact = OfficialLabelEvidenceArtifact.model_validate(
        raw
    )

    provenance = artifact.provenance

    if provenance.manifest_file != manifest_path.name:
        raise ValueError(
            "official-label manifest filename mismatch"
        )

    if provenance.manifest_sha256 != _sha256(manifest_path):
        raise ValueError(
            "official-label manifest hash mismatch"
        )

    bridge = json.loads(
        bridge_path.read_text(encoding="utf-8")
    )

    if provenance.bridge_file != bridge_path.name:
        raise ValueError(
            "official-label bridge filename mismatch"
        )

    if (
        provenance.bridge_payload_sha256
        != bridge.get("payload_sha256")
    ):
        raise ValueError(
            "official-label bridge provenance mismatch"
        )

    identity = json.loads(
        identity_path.read_text(encoding="utf-8")
    )

    if (
        provenance.rxcui_identity_file
        != identity_path.name
    ):
        raise ValueError(
            "official-label RxCUI identity filename mismatch"
        )

    if (
        provenance.rxcui_identity_payload_sha256
        != identity.get("payload_sha256")
    ):
        raise ValueError(
            "official-label RxCUI identity provenance mismatch"
        )

    return artifact
