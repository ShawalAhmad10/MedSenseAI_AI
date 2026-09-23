"""Governed non-RxNorm identities already present in the frozen DDI model."""

from __future__ import annotations

import csv
import hashlib
import json
from pathlib import Path

import numpy as np
from pydantic import BaseModel, ConfigDict, Field, model_validator


SUPPLEMENTAL_IDENTITY_SCHEMA_VERSION = "amna-ddi-supplemental-identity-v1"
DEFAULT_SUPPLEMENTAL_IDENTITY_ARTIFACT = (
    Path(__file__).with_name("data") / "ddi_supplemental_identity_v1.json"
)
DEFAULT_MODEL_DIR = Path(__file__).resolve().parents[4] / "artifacts" / "ddi" / "model"


class SupplementalIdentityMapping(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    normalized_lookup_key: str = Field(min_length=1, max_length=500)
    canonical_display_name: str = Field(min_length=1, max_length=500)
    original_model_name: str = Field(min_length=1, max_length=500)
    normalized_model_name: str = Field(min_length=1, max_length=500)
    identity_namespace: str = Field(pattern=r"^PUBCHEM$")
    identity_id: str = Field(pattern=r"^[1-9][0-9]*$")
    pubchem_cid: str = Field(pattern=r"^[1-9][0-9]*$")
    canonical_smiles: str = Field(min_length=1)
    isomeric_smiles: str | None = None
    fingerprint_index: int = Field(ge=0)
    frozen_model_token: str = Field(min_length=1, max_length=200)
    match_source: str = Field(pattern=r"^SUPPLEMENTAL_MODEL_IDENTITY$")

    @model_validator(mode="after")
    def validate_identity(self) -> SupplementalIdentityMapping:
        if self.canonical_display_name != self.original_model_name:
            raise ValueError(
                "supplemental display name must equal the original frozen model name"
            )
        if self.identity_id != self.pubchem_cid:
            raise ValueError("supplemental identity_id must equal the model-row PubChem CID")
        if self.normalized_lookup_key != self.normalized_model_name:
            raise ValueError("supplemental lookup key must equal the normalized model name")
        if self.frozen_model_token != self.original_model_name:
            raise ValueError("supplemental model token must equal the original frozen model name")
        return self


class GovernedIngredientAlias(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    normalized_alias: str = Field(min_length=1, max_length=500)
    normalized_target: str = Field(min_length=1, max_length=500)
    source: str = Field(pattern=r"^DRAP_CORPUS_OBSERVED_ALIAS$")


class SupplementalIdentityProvenance(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    source: str = Field(pattern=r"^PubChem/model feature identity$")
    generated_validated_source_description: str = Field(min_length=1, max_length=1000)
    frozen_model_version: str = Field(min_length=1, max_length=100)
    rxnorm_bridge_file: str = Field(pattern=r"^ddi_bridge_v1\.json$")
    rxnorm_bridge_payload_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    model_metadata_file: str = Field(pattern=r"^model_metadata\.json$")
    model_metadata_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    inference_drug_features_file: str = Field(
        pattern=r"^inference_drug_features\.csv$"
    )
    inference_drug_features_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    inference_morgan_fingerprints_file: str = Field(
        pattern=r"^inference_morgan_fingerprints\.npz$"
    )
    inference_morgan_fingerprints_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


class SupplementalIdentityArtifact(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    schema_version: str
    matching_policy: str
    provenance: SupplementalIdentityProvenance
    mappings: tuple[SupplementalIdentityMapping, ...]
    governed_aliases: tuple[GovernedIngredientAlias, ...]
    payload_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")

    @model_validator(mode="after")
    def validate_registry(self) -> SupplementalIdentityArtifact:
        if self.schema_version != SUPPLEMENTAL_IDENTITY_SCHEMA_VERSION:
            raise ValueError(
                f"unsupported supplemental identity schema: {self.schema_version}"
            )
        keys = tuple(item.normalized_lookup_key for item in self.mappings)
        if keys != tuple(sorted(set(keys))):
            raise ValueError("supplemental identity keys must be sorted and unique")
        aliases = tuple(item.normalized_alias for item in self.governed_aliases)
        if aliases != tuple(sorted(set(aliases))):
            raise ValueError("governed alias keys must be sorted and unique")
        return self


def _canonical_json(value: object) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _validate_model_alignment(
    artifact: SupplementalIdentityArtifact,
    model_dir: Path,
) -> None:
    model_dir = model_dir.resolve()
    metadata_path = model_dir / artifact.provenance.model_metadata_file
    features_path = model_dir / artifact.provenance.inference_drug_features_file
    fingerprints_path = (
        model_dir / artifact.provenance.inference_morgan_fingerprints_file
    )
    for path in (metadata_path, features_path, fingerprints_path):
        if not path.is_file():
            raise FileNotFoundError(f"Required supplemental identity source is missing: {path}")

    actual_hashes = {
        metadata_path.name: _sha256(metadata_path),
        features_path.name: _sha256(features_path),
        fingerprints_path.name: _sha256(fingerprints_path),
    }
    expected_hashes = {
        metadata_path.name: artifact.provenance.model_metadata_sha256,
        features_path.name: artifact.provenance.inference_drug_features_sha256,
        fingerprints_path.name: artifact.provenance.inference_morgan_fingerprints_sha256,
    }
    for filename, expected in expected_hashes.items():
        if actual_hashes[filename] != expected:
            raise ValueError(
                f"supplemental identity model artifact hash mismatch: {filename}"
            )

    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    if metadata.get("model_version") != artifact.provenance.frozen_model_version:
        raise ValueError("supplemental identity frozen model version mismatch")
    metadata_hashes = metadata.get("artifact_sha256", {})
    for filename in (features_path.name, fingerprints_path.name):
        if metadata_hashes.get(filename) != actual_hashes[filename]:
            raise ValueError(
                f"model metadata hash mismatch for supplemental identity source: {filename}"
            )

    with features_path.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    rows_by_name = {row["normalized_name"]: row for row in rows}
    if len(rows_by_name) != len(rows):
        raise ValueError("duplicate normalized model names in supplemental identity source")

    with np.load(fingerprints_path, allow_pickle=False) as payload:
        fingerprints = payload["fingerprints"]
        stored_ids = tuple(str(value) for value in payload["drug_ids"])
    feature_ids = tuple(row["drug_id"] for row in rows)
    if stored_ids != feature_ids or fingerprints.shape[0] != len(rows):
        raise ValueError("model feature rows and fingerprints are not aligned")

    for mapping in artifact.mappings:
        row = rows_by_name.get(mapping.normalized_lookup_key)
        if row is None:
            raise ValueError(
                "supplemental target is absent from frozen model vocabulary: "
                f"{mapping.normalized_lookup_key}"
            )
        expected_values = {
            "original_name": mapping.original_model_name,
            "normalized_name": mapping.normalized_model_name,
            "pubchem_cid": mapping.pubchem_cid,
            "canonical_smiles": mapping.canonical_smiles,
            "isomeric_smiles": mapping.isomeric_smiles or "",
            "fingerprint_index": str(mapping.fingerprint_index),
        }
        for field, expected in expected_values.items():
            if row.get(field, "") != expected:
                raise ValueError(
                    f"supplemental identity conflicts with model row field {field}: "
                    f"{mapping.normalized_lookup_key}"
                )
        index = mapping.fingerprint_index
        if index >= len(rows) or stored_ids[index] != row["drug_id"]:
            raise ValueError(
                "invalid supplemental fingerprint_index for "
                f"{mapping.normalized_lookup_key}"
            )


def load_supplemental_identity_artifact(
    path: Path = DEFAULT_SUPPLEMENTAL_IDENTITY_ARTIFACT,
    *,
    model_dir: Path = DEFAULT_MODEL_DIR,
) -> SupplementalIdentityArtifact:
    raw = json.loads(path.read_text(encoding="utf-8"))
    supplied_checksum = raw.get("payload_sha256")
    payload = dict(raw)
    payload.pop("payload_sha256", None)
    actual_checksum = hashlib.sha256(_canonical_json(payload)).hexdigest()
    if supplied_checksum != actual_checksum:
        raise ValueError("supplemental identity artifact payload checksum mismatch")
    artifact = SupplementalIdentityArtifact.model_validate(raw)
    _validate_model_alignment(artifact, model_dir)
    return artifact
