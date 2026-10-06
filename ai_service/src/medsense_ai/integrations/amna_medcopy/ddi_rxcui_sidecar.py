"""Governed exact RxCUI identity and DDInter pair-evidence sidecars."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, model_validator

from medsense_ai.medical_data_ingestion.normalization import normalize_medical_name
from medsense_ai.integrations.amna_medcopy.runtime_ingredient_normalizer import (
    runtime_ingredient_candidates,
)


IDENTITY_SCHEMA_VERSION = "amna-ddi-rxcui-identity-v1"
EVIDENCE_SCHEMA_VERSION = "amna-ddinter-rxcui-evidence-v1"

DEFAULT_IDENTITY_ARTIFACT = (
    Path(__file__).with_name("data") / "ddi_rxcui_identity_v1.json"
)
DEFAULT_EVIDENCE_ARTIFACT = (
    Path(__file__).with_name("data") / "ddinter_rxcui_evidence_v1.json"
)


def _canonical_json(value: object) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


class RxCUIIdentityMapping(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    normalized_lookup_key: str = Field(min_length=1, max_length=500)
    canonical_display_name: str = Field(min_length=1, max_length=500)
    rxcui: str = Field(min_length=1, max_length=64)


class RxCUIIdentityArtifact(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    schema_version: str
    rxnorm_release: str
    source_bridge_payload_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    mappings: tuple[RxCUIIdentityMapping, ...]
    payload_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")

    @model_validator(mode="after")
    def validate_artifact(self) -> "RxCUIIdentityArtifact":
        if self.schema_version != IDENTITY_SCHEMA_VERSION:
            raise ValueError(
                f"unsupported RxCUI identity schema: {self.schema_version}"
            )

        keys = tuple(item.normalized_lookup_key for item in self.mappings)

        if keys != tuple(sorted(set(keys))):
            raise ValueError(
                "RxCUI identity mapping keys must be sorted and unique"
            )

        return self


class RxCUIIdentityResolution(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    source_salt: str
    normalized_salt: str
    canonical_display_name: str
    rxcui: str
    rxnorm_release: str


class ExactRxCUIIdentityResolver:
    """Exact lookup used only to retain governed identity outside model support."""

    def __init__(self, artifact: RxCUIIdentityArtifact) -> None:
        self.artifact = artifact
        self._mappings = {
            item.normalized_lookup_key: item
            for item in artifact.mappings
        }

    @classmethod
    def from_artifact(
        cls,
        path: Path = DEFAULT_IDENTITY_ARTIFACT,
    ) -> "ExactRxCUIIdentityResolver":
        return cls(load_rxcui_identity_artifact(path))

    def resolve(
        self,
        source_salt: str | None,
    ) -> RxCUIIdentityResolution | None:
        if source_salt is None or not source_salt.strip():
            return None

        try:
            normalized = normalize_medical_name(source_salt)
        except (TypeError, ValueError):
            return None

        mapping = self._mappings.get(normalized)

        if mapping is None:
            for candidate in runtime_ingredient_candidates(normalized):
                mapping = self._mappings.get(candidate)
                if mapping is not None:
                    normalized = candidate
                    break

        if mapping is None:
            return None

        return RxCUIIdentityResolution(
            source_salt=source_salt,
            normalized_salt=normalized,
            canonical_display_name=mapping.canonical_display_name,
            rxcui=mapping.rxcui,
            rxnorm_release=self.artifact.rxnorm_release,
        )


class RxCUIEvidenceRecord(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    rxcui_a: str
    rxcui_b: str
    levels: tuple[str, ...]
    descriptions: tuple[str, ...]
    record_identifiers: tuple[str, ...]


class RxCUIEvidenceArtifact(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    schema_version: str
    source_name: str
    source_license: str
    source_files_sha256: dict[str, str]
    pairs: tuple[RxCUIEvidenceRecord, ...]
    payload_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")

    @model_validator(mode="after")
    def validate_artifact(self) -> "RxCUIEvidenceArtifact":
        if self.schema_version != EVIDENCE_SCHEMA_VERSION:
            raise ValueError(
                f"unsupported RxCUI evidence schema: {self.schema_version}"
            )

        pairs = tuple(
            (item.rxcui_a, item.rxcui_b)
            for item in self.pairs
        )

        if pairs != tuple(sorted(set(pairs))):
            raise ValueError(
                "RxCUI evidence pairs must be sorted and unique"
            )

        for item in self.pairs:
            if item.rxcui_a >= item.rxcui_b:
                raise ValueError(
                    "RxCUI evidence pairs must use canonical ordering"
                )

            if not item.descriptions or not item.record_identifiers:
                raise ValueError(
                    "RxCUI evidence requires descriptions and record identifiers"
                )

            if len(item.descriptions) != len(item.record_identifiers):
                raise ValueError(
                    "RxCUI evidence descriptions and record IDs must align"
                )

        return self


class RxCUIInteractionEvidence(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    descriptions: tuple[str, ...]
    record_identifiers: tuple[str, ...]
    levels: tuple[str, ...]
    source_identifier: str


class RxCUIInteractionEvidenceIndex:
    """Immutable exact unordered RxCUI-pair evidence lookup."""

    def __init__(self, artifact: RxCUIEvidenceArtifact) -> None:
        self.artifact = artifact
        self.source_identifier = (
            f"{DEFAULT_EVIDENCE_ARTIFACT.name}@sha256:"
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
    ) -> "RxCUIInteractionEvidenceIndex":
        artifact = load_rxcui_evidence_artifact(path)
        instance = cls(artifact)
        instance.source_identifier = (
            f"{path.name}@sha256:{artifact.payload_sha256}"
        )
        return instance

    def lookup(
        self,
        rxcui_a: str,
        rxcui_b: str,
    ) -> RxCUIInteractionEvidence | None:
        if rxcui_a == rxcui_b:
            return None

        key = tuple(sorted((str(rxcui_a), str(rxcui_b))))
        record = self._pairs.get(key)

        if record is None:
            return None

        return RxCUIInteractionEvidence(
            descriptions=record.descriptions,
            record_identifiers=record.record_identifiers,
            levels=record.levels,
            source_identifier=self.source_identifier,
        )

    def __len__(self) -> int:
        return len(self._pairs)


def load_rxcui_identity_artifact(
    path: Path = DEFAULT_IDENTITY_ARTIFACT,
) -> RxCUIIdentityArtifact:
    raw = json.loads(path.read_text(encoding="utf-8"))
    supplied = raw.get("payload_sha256")

    payload = dict(raw)
    payload.pop("payload_sha256", None)

    actual = hashlib.sha256(_canonical_json(payload)).hexdigest()

    if supplied != actual:
        raise ValueError(
            "RxCUI identity artifact payload checksum mismatch"
        )

    return RxCUIIdentityArtifact.model_validate(raw)


def load_rxcui_evidence_artifact(
    path: Path = DEFAULT_EVIDENCE_ARTIFACT,
) -> RxCUIEvidenceArtifact:
    raw = json.loads(path.read_text(encoding="utf-8"))
    supplied = raw.get("payload_sha256")

    payload = dict(raw)
    payload.pop("payload_sha256", None)

    actual = hashlib.sha256(_canonical_json(payload)).hexdigest()

    if supplied != actual:
        raise ValueError(
            "RxCUI evidence artifact payload checksum mismatch"
        )

    return RxCUIEvidenceArtifact.model_validate(raw)

