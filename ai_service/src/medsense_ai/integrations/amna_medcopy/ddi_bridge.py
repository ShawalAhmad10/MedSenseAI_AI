"""Deterministic exact-identity bridge into the frozen DDI vocabulary."""

from __future__ import annotations

from enum import Enum
import hashlib
import json
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, model_validator

from medsense_ai.medical_data_ingestion.normalization import normalize_medical_name


BRIDGE_SCHEMA_VERSION = "amna-ddi-bridge-v1"
DEFAULT_BRIDGE_ARTIFACT = Path(__file__).with_name("data") / "ddi_bridge_v1.json"


class IngredientResolutionState(str, Enum):
    RESOLVED = "RESOLVED"
    UNMAPPED = "UNMAPPED"
    AMBIGUOUS = "AMBIGUOUS"
    SOURCE_UNAVAILABLE = "SOURCE_UNAVAILABLE"
    MODEL_UNSUPPORTED = "MODEL_UNSUPPORTED"
    REVIEW_REQUIRED = "REVIEW_REQUIRED"


class BridgeMatchSource(str, Enum):
    CANONICAL = "CANONICAL"
    ALIAS = "ALIAS"


class DDIBridgeMapping(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    normalized_lookup_key: str = Field(min_length=1, max_length=500)
    matched_source_text: str = Field(min_length=1, max_length=500)
    canonical_display_name: str = Field(min_length=1, max_length=500)
    rxcui: str = Field(min_length=1, max_length=512)
    match_source: BridgeMatchSource
    frozen_model_token: str = Field(min_length=1, max_length=200)


class DDIBridgeSourceProvenance(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    rxnorm_release: str = Field(min_length=1, max_length=255)
    rxnorm_source_file: str = Field(min_length=1, max_length=255)
    rxnorm_source_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    rxnorm_pipeline_name: str = Field(min_length=1, max_length=255)
    rxnorm_pipeline_version: str = Field(min_length=1, max_length=100)
    frozen_model_version: str = Field(min_length=1, max_length=100)
    frozen_model_vocabulary_file: str = Field(min_length=1, max_length=255)
    frozen_model_vocabulary_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    frozen_model_metadata_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    frozen_model_artifact_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    frozen_model_fingerprint_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    evidence_source_file: str = Field(min_length=1, max_length=255)
    evidence_source_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    evidence_provenance_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


class DDIBridgeArtifact(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    schema_version: str
    matching_policy: str
    provenance: DDIBridgeSourceProvenance
    mappings: tuple[DDIBridgeMapping, ...]
    model_unsupported_lookup_keys: tuple[str, ...]
    ambiguous_lookup_keys: tuple[str, ...]
    model_vocabulary_unmapped_keys: tuple[str, ...]
    payload_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")

    @model_validator(mode="after")
    def validate_bridge(self) -> DDIBridgeArtifact:
        if self.schema_version != BRIDGE_SCHEMA_VERSION:
            raise ValueError(f"unsupported DDI bridge schema: {self.schema_version}")
        mapping_keys = tuple(item.normalized_lookup_key for item in self.mappings)
        if mapping_keys != tuple(sorted(set(mapping_keys))):
            raise ValueError("DDI bridge mapping keys must be sorted and unique")
        for values, label in (
            (self.model_unsupported_lookup_keys, "model-unsupported"),
            (self.ambiguous_lookup_keys, "ambiguous"),
            (self.model_vocabulary_unmapped_keys, "model-vocabulary-unmapped"),
        ):
            if values != tuple(sorted(set(values))):
                raise ValueError(f"{label} keys must be sorted and unique")
        if set(mapping_keys) & set(self.model_unsupported_lookup_keys):
            raise ValueError("supported and model-unsupported keys overlap")
        if set(mapping_keys) & set(self.ambiguous_lookup_keys):
            raise ValueError("supported and ambiguous keys overlap")
        return self


class ResolvedDDIIngredient(BaseModel):
    """One source salt resolution without claiming clinical equivalence or safety."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    state: IngredientResolutionState
    source_salt: str | None
    normalized_salt: str | None = Field(default=None, min_length=1, max_length=500)
    canonical_display_name: str | None = Field(default=None, min_length=1, max_length=500)
    rxcui: str | None = Field(default=None, min_length=1, max_length=512)
    rxnorm_release: str | None = Field(default=None, min_length=1, max_length=255)
    match_source: BridgeMatchSource | None = None
    frozen_model_token: str | None = Field(default=None, min_length=1, max_length=200)
    frozen_model_version: str | None = Field(default=None, min_length=1, max_length=100)
    bridge_schema_version: str
    bridge_payload_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    review_required: bool
    message: str = Field(min_length=1, max_length=1000)

    @model_validator(mode="after")
    def validate_state(self) -> ResolvedDDIIngredient:
        if self.state is IngredientResolutionState.RESOLVED:
            required = (
                self.normalized_salt,
                self.canonical_display_name,
                self.rxcui,
                self.rxnorm_release,
                self.match_source,
                self.frozen_model_token,
                self.frozen_model_version,
            )
            if any(value is None for value in required) or self.review_required:
                raise ValueError("RESOLVED requires complete governed identity fields")
        elif self.frozen_model_token is not None:
            raise ValueError("only RESOLVED may contain a frozen model token")
        return self


def _canonical_json(value: object) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def load_ddi_bridge_artifact(path: Path = DEFAULT_BRIDGE_ARTIFACT) -> DDIBridgeArtifact:
    raw = json.loads(path.read_text(encoding="utf-8"))
    supplied_checksum = raw.get("payload_sha256")
    payload = dict(raw)
    payload.pop("payload_sha256", None)
    actual_checksum = hashlib.sha256(_canonical_json(payload)).hexdigest()
    if supplied_checksum != actual_checksum:
        raise ValueError("DDI bridge artifact payload checksum mismatch")
    return DDIBridgeArtifact.model_validate(raw)


class ExactDDIIngredientResolver:
    """Immutable exact-key resolver backed only by the packaged bridge artifact."""

    def __init__(self, artifact: DDIBridgeArtifact) -> None:
        self.artifact = artifact
        self._mappings = {item.normalized_lookup_key: item for item in artifact.mappings}
        self._model_unsupported = frozenset(artifact.model_unsupported_lookup_keys)
        self._ambiguous = frozenset(artifact.ambiguous_lookup_keys)

    @classmethod
    def from_artifact(cls, path: Path = DEFAULT_BRIDGE_ARTIFACT) -> ExactDDIIngredientResolver:
        return cls(load_ddi_bridge_artifact(path))

    def resolve(self, source_salt: str | None) -> ResolvedDDIIngredient:
        common = {
            "source_salt": source_salt,
            "bridge_schema_version": self.artifact.schema_version,
            "bridge_payload_sha256": self.artifact.payload_sha256,
        }
        if source_salt is None or not source_salt.strip():
            return ResolvedDDIIngredient(
                state=IngredientResolutionState.SOURCE_UNAVAILABLE,
                normalized_salt=None,
                review_required=True,
                message="Partner product_salt is null or blank; ingredient identity is unavailable.",
                **common,
            )
        try:
            normalized = normalize_medical_name(source_salt)
        except (TypeError, ValueError):
            return ResolvedDDIIngredient(
                state=IngredientResolutionState.REVIEW_REQUIRED,
                normalized_salt=None,
                review_required=True,
                message="Partner product_salt cannot be deterministically normalized.",
                **common,
            )
        mapping = self._mappings.get(normalized)
        if mapping is not None:
            return ResolvedDDIIngredient(
                state=IngredientResolutionState.RESOLVED,
                normalized_salt=normalized,
                canonical_display_name=mapping.canonical_display_name,
                rxcui=mapping.rxcui,
                rxnorm_release=self.artifact.provenance.rxnorm_release,
                match_source=mapping.match_source,
                frozen_model_token=mapping.frozen_model_token,
                frozen_model_version=self.artifact.provenance.frozen_model_version,
                review_required=False,
                message=(
                    "Exact governed identity match found for the frozen DDI vocabulary; "
                    "this is not a clinical safety conclusion."
                ),
                **common,
            )
        if normalized in self._ambiguous:
            state = IngredientResolutionState.AMBIGUOUS
            message = "Exact normalized salt maps to multiple RxNorm identities; no identity was selected."
        elif normalized in self._model_unsupported:
            state = IngredientResolutionState.MODEL_UNSUPPORTED
            message = "Exact RxNorm identity exists but is outside the frozen DDI model vocabulary."
        else:
            state = IngredientResolutionState.UNMAPPED
            message = "No exact governed RxNorm-to-model mapping exists for product_salt."
        return ResolvedDDIIngredient(
            state=state,
            normalized_salt=normalized,
            review_required=True,
            message=message,
            **common,
        )
