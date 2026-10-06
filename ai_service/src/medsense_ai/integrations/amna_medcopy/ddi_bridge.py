"""Deterministic exact-identity bridge into the frozen DDI vocabulary."""

from __future__ import annotations

from enum import Enum
import hashlib
import json
from pathlib import Path
import re

from pydantic import BaseModel, ConfigDict, Field, model_validator

from medsense_ai.medical_data_ingestion.normalization import normalize_medical_name
from medsense_ai.integrations.amna_medcopy.runtime_ingredient_normalizer import (
    runtime_ingredient_candidates,
)
from medsense_ai.integrations.amna_medcopy.ddi_supplemental_identity import (
    DEFAULT_MODEL_DIR,
    DEFAULT_SUPPLEMENTAL_IDENTITY_ARTIFACT,
    SupplementalIdentityArtifact,
    SupplementalIdentityMapping,
    load_supplemental_identity_artifact,
)


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
    SUPPLEMENTAL_MODEL_IDENTITY = "SUPPLEMENTAL_MODEL_IDENTITY"


class IngredientIdentityNamespace(str, Enum):
    RXNORM = "RXNORM"
    PUBCHEM = "PUBCHEM"


class IngredientIdentitySource(str, Enum):
    RXNORM_BRIDGE = "RXNORM_BRIDGE"
    SUPPLEMENTAL_MODEL_IDENTITY = "SUPPLEMENTAL_MODEL_IDENTITY"


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
    identity_namespace: IngredientIdentityNamespace | None = None
    identity_id: str | None = Field(default=None, min_length=1, max_length=512)
    identity_source: IngredientIdentitySource | None = None
    rxcui: str | None = Field(default=None, min_length=1, max_length=512)
    rxnorm_release: str | None = Field(default=None, min_length=1, max_length=255)
    match_source: BridgeMatchSource | None = None
    frozen_model_token: str | None = Field(default=None, min_length=1, max_length=200)
    frozen_model_version: str | None = Field(default=None, min_length=1, max_length=100)
    bridge_schema_version: str
    bridge_payload_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    supplemental_identity_schema_version: str | None = None
    supplemental_identity_payload_sha256: str | None = Field(
        default=None,
        pattern=r"^[0-9a-f]{64}$",
    )
    review_required: bool
    message: str = Field(min_length=1, max_length=1000)

    @model_validator(mode="after")
    def validate_state(self) -> ResolvedDDIIngredient:
        if self.state is IngredientResolutionState.RESOLVED:
            required = (
                self.normalized_salt,
                self.canonical_display_name,
                self.identity_namespace,
                self.identity_id,
                self.identity_source,
                self.match_source,
                self.frozen_model_token,
                self.frozen_model_version,
            )
            if any(value is None for value in required) or self.review_required:
                raise ValueError("RESOLVED requires complete governed identity fields")
            if self.identity_namespace is IngredientIdentityNamespace.RXNORM:
                if (
                    self.rxcui is None
                    or self.rxnorm_release is None
                    or self.identity_id != self.rxcui
                    or self.identity_source is not IngredientIdentitySource.RXNORM_BRIDGE
                ):
                    raise ValueError("RxNorm resolution requires aligned RxCUI provenance")
            elif self.identity_namespace is IngredientIdentityNamespace.PUBCHEM:
                if (
                    self.rxcui is not None
                    or self.rxnorm_release is not None
                    or self.identity_source
                    is not IngredientIdentitySource.SUPPLEMENTAL_MODEL_IDENTITY
                    or self.supplemental_identity_schema_version is None
                    or self.supplemental_identity_payload_sha256 is None
                ):
                    raise ValueError(
                        "supplemental resolution must be PubChem-backed without an RxCUI"
                    )
        elif any(
            value is not None
            for value in (
                self.identity_namespace,
                self.identity_id,
                self.identity_source,
                self.rxcui,
                self.rxnorm_release,
                self.match_source,
                self.frozen_model_token,
                self.frozen_model_version,
                self.supplemental_identity_schema_version,
                self.supplemental_identity_payload_sha256,
            )
        ):
            raise ValueError("only RESOLVED may contain governed identity fields")
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


_COMBINATION_PATTERN = re.compile(r"(?:\s+(?:and|with)\s+|[+/&;])")
_AS_DESCRIPTOR_PATTERN = re.compile(
    r"\s+\(?as\s+(?:sodium|hydrochloride|hcl|fumarate|citrate|besylate|besilate|"
    r"trometamol|tromethamine|(?:mono|di|tri|penta)?hydrate)\)?$"
)
_EQUIVALENT_PATTERN = re.compile(r"(?:equivalent\s+to|eq\.?\s+to)\s+(.+)$")
_DOSAGE_FORM_PATTERN = re.compile(r"\s+(?:injection|lyophilized\s+powder)$")
_SALT_PATTERN = re.compile(
    r"\s+(?:sodium|hydrochloride|hcl|fumarate|citrate|besylate|besilate|"
    r"trometamol|tromethamine|(?:mono|di|tri|penta)?hydrate)$"
)


def _formulation_candidates(normalized: str) -> tuple[str, ...]:
    """Return a bounded deterministic set of conservative candidate identities."""

    candidates = {normalized}
    frontier = {normalized}
    for _ in range(4):
        generated: set[str] = set()
        for value in frontier:
            transformations = {
                _AS_DESCRIPTOR_PATTERN.sub("", value),
                _DOSAGE_FORM_PATTERN.sub("", value),
                _SALT_PATTERN.sub("", value),
            }
            if value.startswith("sterile "):
                transformations.add(value.removeprefix("sterile ").strip())
            equivalent = _EQUIVALENT_PATTERN.search(value)
            if equivalent is not None:
                transformations.add(equivalent.group(1).strip())
            generated.update(item for item in transformations if item and item != value)
        frontier = generated - candidates
        if not frontier:
            break
        candidates.update(frontier)
    candidates.discard(normalized)
    return tuple(sorted(candidates))


class ExactDDIIngredientResolver:
    """RxNorm-first resolver with a hash-pinned supplemental identity fallback."""

    def __init__(
        self,
        artifact: DDIBridgeArtifact,
        supplemental_artifact: SupplementalIdentityArtifact | None = None,
    ) -> None:
        self.artifact = artifact
        self.supplemental_artifact = supplemental_artifact
        if (
            supplemental_artifact is not None
            and supplemental_artifact.provenance.rxnorm_bridge_payload_sha256
            != artifact.payload_sha256
        ):
            raise ValueError("supplemental identity registry RxNorm bridge mismatch")
        self._mappings = {item.normalized_lookup_key: item for item in artifact.mappings}
        self._model_unsupported = frozenset(artifact.model_unsupported_lookup_keys)
        self._ambiguous = frozenset(artifact.ambiguous_lookup_keys)
        self._supplemental_mappings = {
            item.normalized_lookup_key: item
            for item in (supplemental_artifact.mappings if supplemental_artifact else ())
        }
        self._aliases = {
            item.normalized_alias: item.normalized_target
            for item in (supplemental_artifact.governed_aliases if supplemental_artifact else ())
        }
        for alias, target in self._aliases.items():
            if alias == target or self._mapping_for_key(target) is None:
                raise ValueError(
                    f"governed formulation alias has no unique supported target: {alias}"
                )

    @classmethod
    def from_artifact(
        cls,
        path: Path = DEFAULT_BRIDGE_ARTIFACT,
        *,
        supplemental_path: Path = DEFAULT_SUPPLEMENTAL_IDENTITY_ARTIFACT,
        model_dir: Path = DEFAULT_MODEL_DIR,
    ) -> ExactDDIIngredientResolver:
        return cls(
            load_ddi_bridge_artifact(path),
            load_supplemental_identity_artifact(
                supplemental_path,
                model_dir=model_dir,
            ),
        )

    def _mapping_for_key(
        self,
        key: str,
    ) -> DDIBridgeMapping | SupplementalIdentityMapping | None:
        return self._mappings.get(key) or self._supplemental_mappings.get(key)

    def _resolved(
        self,
        mapping: DDIBridgeMapping | SupplementalIdentityMapping,
        *,
        source_salt: str,
        normalized_salt: str,
        candidate_used: bool = False,
        alias_used: bool = False,
    ) -> ResolvedDDIIngredient:
        common = {
            "source_salt": source_salt,
            "normalized_salt": normalized_salt,
            "canonical_display_name": mapping.canonical_display_name,
            "frozen_model_token": mapping.frozen_model_token,
            "frozen_model_version": self.artifact.provenance.frozen_model_version,
            "bridge_schema_version": self.artifact.schema_version,
            "bridge_payload_sha256": self.artifact.payload_sha256,
            "review_required": False,
        }
        if isinstance(mapping, DDIBridgeMapping):
            return ResolvedDDIIngredient(
                state=IngredientResolutionState.RESOLVED,
                identity_namespace=IngredientIdentityNamespace.RXNORM,
                identity_id=mapping.rxcui,
                identity_source=IngredientIdentitySource.RXNORM_BRIDGE,
                rxcui=mapping.rxcui,
                rxnorm_release=self.artifact.provenance.rxnorm_release,
                match_source=(
                    BridgeMatchSource.ALIAS if alias_used else mapping.match_source
                ),
                message=(
                    "A conservative governed formulation candidate resolved to one exact "
                    "RxNorm-backed frozen-model identity; this is not a clinical safety conclusion."
                    if candidate_used or alias_used
                    else "Exact governed RxNorm identity match found for the frozen DDI vocabulary; "
                    "this is not a clinical safety conclusion."
                ),
                **common,
            )
        if self.supplemental_artifact is None:
            raise ValueError("supplemental mapping cannot resolve without its registry")
        return ResolvedDDIIngredient(
            state=IngredientResolutionState.RESOLVED,
            identity_namespace=IngredientIdentityNamespace.PUBCHEM,
            identity_id=mapping.identity_id,
            identity_source=IngredientIdentitySource.SUPPLEMENTAL_MODEL_IDENTITY,
            rxcui=None,
            rxnorm_release=None,
            match_source=BridgeMatchSource.SUPPLEMENTAL_MODEL_IDENTITY,
            supplemental_identity_schema_version=self.supplemental_artifact.schema_version,
            supplemental_identity_payload_sha256=self.supplemental_artifact.payload_sha256,
            message=(
                "A conservative governed formulation candidate resolved to one exact "
                "PubChem-backed identity already present in the frozen model; no RxCUI is claimed."
                if candidate_used or alias_used
                else "Exact governed supplemental PubChem identity found in the frozen model; "
                "no RxCUI is claimed and this is not a clinical safety conclusion."
            ),
            **common,
        )

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
        # Only "+" is treated as an explicit multi-ingredient delimiter.
        #
        # "/" must NOT be treated as a combination separator because it is
        # also used in pharmaceutical concentrations such as 100mg/5ml and
        # may appear in vague source descriptions such as
        # "Iron / Ferrous preparation".
        #
        # Actual fixed-combination products are split on "+" by the cart
        # integration layer before individual ingredient resolution.
        if "+" in normalized:
            return ResolvedDDIIngredient(
                state=IngredientResolutionState.REVIEW_REQUIRED,
                normalized_salt=normalized,
                review_required=True,
                message=(
                    "Plus-separated combination ingredient text must be split into "
                    "separate active ingredients before DDI pair generation."
                ),
                **common,
            )

        mapping = self._mappings.get(normalized)
        if mapping is not None:
            return self._resolved(
                mapping,
                source_salt=source_salt,
                normalized_salt=normalized,
            )

        supplemental_mapping = self._supplemental_mappings.get(normalized)
        if supplemental_mapping is not None:
            return self._resolved(
                supplemental_mapping,
                source_salt=source_salt,
                normalized_salt=normalized,
            )

        if normalized in self._ambiguous:
            state = IngredientResolutionState.AMBIGUOUS
            message = "Exact normalized salt maps to multiple RxNorm identities; no identity was selected."
        elif normalized in self._model_unsupported:
            state = IngredientResolutionState.MODEL_UNSUPPORTED
            message = "Exact RxNorm identity exists but is outside the frozen DDI model vocabulary."
        else:
            resolved_candidates: dict[
                tuple[IngredientIdentityNamespace, str, str],
                tuple[DDIBridgeMapping | SupplementalIdentityMapping, bool],
            ] = {}
            for candidate in dict.fromkeys(
                (*_formulation_candidates(normalized), *runtime_ingredient_candidates(normalized))
            ):
                alias_target = self._aliases.get(candidate)
                for lookup_key, alias_used in (
                    (candidate, False),
                    *(
                        ((alias_target, True),)
                        if alias_target is not None
                        else ()
                    ),
                ):
                    candidate_mapping = self._mapping_for_key(lookup_key)
                    if candidate_mapping is None:
                        continue
                    if isinstance(candidate_mapping, DDIBridgeMapping):
                        signature = (
                            IngredientIdentityNamespace.RXNORM,
                            candidate_mapping.rxcui,
                            candidate_mapping.frozen_model_token,
                        )
                    else:
                        signature = (
                            IngredientIdentityNamespace.PUBCHEM,
                            candidate_mapping.identity_id,
                            candidate_mapping.frozen_model_token,
                        )
                    resolved_candidates[signature] = (candidate_mapping, alias_used)

            raw_alias_target = self._aliases.get(normalized)
            if raw_alias_target is not None:
                alias_mapping = self._mapping_for_key(raw_alias_target)
                if isinstance(alias_mapping, DDIBridgeMapping):
                    resolved_candidates[
                        (
                            IngredientIdentityNamespace.RXNORM,
                            alias_mapping.rxcui,
                            alias_mapping.frozen_model_token,
                        )
                    ] = (alias_mapping, True)
                elif isinstance(alias_mapping, SupplementalIdentityMapping):
                    resolved_candidates[
                        (
                            IngredientIdentityNamespace.PUBCHEM,
                            alias_mapping.identity_id,
                            alias_mapping.frozen_model_token,
                        )
                    ] = (alias_mapping, True)

            if len(resolved_candidates) == 1:
                candidate_mapping, alias_used = next(iter(resolved_candidates.values()))
                return self._resolved(
                    candidate_mapping,
                    source_salt=source_salt,
                    normalized_salt=normalized,
                    candidate_used=True,
                    alias_used=alias_used,
                )
            if len(resolved_candidates) > 1:
                state = IngredientResolutionState.AMBIGUOUS
                message = (
                    "Conservative formulation candidates resolved to multiple governed "
                    "identities; no identity was selected."
                )
            else:
                state = IngredientResolutionState.UNMAPPED
                message = (
                    "No exact governed RxNorm or supplemental model identity mapping exists "
                    "for product_salt."
                )
        return ResolvedDDIIngredient(
            state=state,
            normalized_salt=normalized,
            review_required=True,
            message=message,
            **common,
        )


