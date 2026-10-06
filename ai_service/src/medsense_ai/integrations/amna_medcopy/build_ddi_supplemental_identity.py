"""Build the governed supplemental identity registry from frozen model artifacts."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from pathlib import Path
from typing import Sequence

import numpy as np

from medsense_ai.integrations.amna_medcopy.ddi_supplemental_identity import (
    DEFAULT_MODEL_DIR,
    DEFAULT_SUPPLEMENTAL_IDENTITY_ARTIFACT,
    SUPPLEMENTAL_IDENTITY_SCHEMA_VERSION,
    SupplementalIdentityArtifact,
    _canonical_json,
    _sha256,
    _validate_model_alignment,
)
from medsense_ai.medical_data_ingestion.normalization import normalize_medical_name


TARGET_MODEL_NAMES = (
    "Cefoperazone",
    "Cloxacillin",
    "Dexketoprofen",
    "Dydrogesterone",
    "Etoricoxib",
    "Fusidic acid",
    "Gliclazide",
    "Norethisterone",
    "Rupatadine",
    "Salbutamol",
)

DEFAULT_BRIDGE_ARTIFACT = Path(__file__).with_name("data") / "ddi_bridge_v1.json"

GOVERNED_ALIASES = {
    'amoxycillin': 'amoxicillin',
    'cefipime': 'cefepime',
    'ceflriaxone': 'ceftriaxone',
    'cefoiaxone': 'ceftriaxone',
    'cefriaxone': 'ceftriaxone',
    'ceftriarone': 'ceftriaxone',
    'ceftrizone': 'ceftriaxone',
    'fosmomycin': 'fosfomycin',
    'salbacatam': 'sulbactam',
    'salbactam': 'sulbactam',
    'slidenafil': 'sildenafil',
    'sulbactum': 'sulbactam',
    'tazobactum': 'tazobactam',
}

def build_supplemental_identity_payload(
    model_dir: Path,
    bridge_path: Path = DEFAULT_BRIDGE_ARTIFACT,
) -> dict[str, object]:
    model_dir = model_dir.resolve()
    metadata_path = model_dir / "model_metadata.json"
    features_path = model_dir / "inference_drug_features.csv"
    fingerprints_path = model_dir / "inference_morgan_fingerprints.npz"
    for path in (metadata_path, features_path, fingerprints_path):
        if not path.is_file():
            raise FileNotFoundError(f"Required frozen model artifact is missing: {path}")

    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    actual_features_hash = _sha256(features_path)
    actual_fingerprints_hash = _sha256(fingerprints_path)
    expected_hashes = metadata.get("artifact_sha256", {})
    for filename, actual in (
        (features_path.name, actual_features_hash),
        (fingerprints_path.name, actual_fingerprints_hash),
    ):
        if expected_hashes.get(filename) != actual:
            raise ValueError(f"model feature artifact hash mismatch: {filename}")

    bridge_raw = json.loads(bridge_path.read_text(encoding="utf-8"))
    bridge_checksum = bridge_raw.get("payload_sha256")
    bridge_payload = dict(bridge_raw)
    bridge_payload.pop("payload_sha256", None)
    if bridge_checksum != hashlib.sha256(_canonical_json(bridge_payload)).hexdigest():
        raise ValueError("RxNorm bridge payload checksum mismatch")
    rxnorm_supported = {
        str(item["normalized_lookup_key"])
        for item in bridge_raw.get("mappings", ())
    }
    rxnorm_classified = (
        rxnorm_supported
        | set(bridge_raw.get("model_unsupported_lookup_keys", ()))
        | set(bridge_raw.get("ambiguous_lookup_keys", ()))
    )
    model_unmapped = set(bridge_raw.get("model_vocabulary_unmapped_keys", ()))

    with features_path.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    rows_by_name: dict[str, dict[str, str]] = {}
    for row in rows:
        key = row["normalized_name"]
        if key in rows_by_name:
            raise ValueError(f"duplicate normalized model name: {key}")
        rows_by_name[key] = row

    with np.load(fingerprints_path, allow_pickle=False) as fingerprint_payload:
        stored_ids = tuple(str(value) for value in fingerprint_payload["drug_ids"])
        fingerprint_count = int(fingerprint_payload["fingerprints"].shape[0])
    if stored_ids != tuple(row["drug_id"] for row in rows) or fingerprint_count != len(rows):
        raise ValueError("model feature rows and fingerprints are not aligned")

    mappings: list[dict[str, object]] = []
    seen_keys: set[str] = set()
    tokens_by_key: dict[str, str] = {}
    for target_name in TARGET_MODEL_NAMES:
        key = normalize_medical_name(target_name)
        row = rows_by_name.get(key)
        if row is None:
            raise ValueError(f"target name is absent from model vocabulary: {target_name}")
        if key in rxnorm_classified or key not in model_unmapped:
            raise ValueError(
                "supplemental target is not proven absent from the governed RxNorm bridge: "
                f"{target_name}"
            )
        if not row.get("pubchem_cid", "").strip():
            raise ValueError(f"PubChem CID missing for supplemental target: {target_name}")
        try:
            fingerprint_index = int(row["fingerprint_index"])
        except (KeyError, ValueError) as exc:
            raise ValueError(f"invalid fingerprint_index for: {target_name}") from exc
        if (
            fingerprint_index < 0
            or fingerprint_index >= len(rows)
            or stored_ids[fingerprint_index] != row["drug_id"]
        ):
            raise ValueError(f"invalid fingerprint_index for: {target_name}")
        model_token = row["original_name"].strip()
        if key in seen_keys:
            raise ValueError(f"duplicate normalized supplemental key: {key}")
        if key in tokens_by_key and tokens_by_key[key] != model_token:
            raise ValueError(f"conflicting frozen model token for: {key}")
        seen_keys.add(key)
        tokens_by_key[key] = model_token
        mappings.append(
            {
                "normalized_lookup_key": key,
                "canonical_display_name": model_token,
                "original_model_name": model_token,
                "normalized_model_name": row["normalized_name"],
                "identity_namespace": "PUBCHEM",
                "identity_id": row["pubchem_cid"],
                "pubchem_cid": row["pubchem_cid"],
                "canonical_smiles": row["canonical_smiles"],
                "isomeric_smiles": row["isomeric_smiles"] or None,
                "fingerprint_index": fingerprint_index,
                "frozen_model_token": model_token,
                "match_source": "SUPPLEMENTAL_MODEL_IDENTITY",
            }
        )

    payload: dict[str, object] = {
        "schema_version": SUPPLEMENTAL_IDENTITY_SCHEMA_VERSION,
        "matching_policy": (
            "Exact governed lookup after NFKC/casefold/whitespace normalization; "
            "conservative enumerated formulation candidates and versioned governed aliases "
            "with explicit provenance only; no fuzzy matching or arbitrary prefix inference."
        ),
        "provenance": {
            "source": "PubChem/model feature identity",
            "generated_validated_source_description": (
                "Values copied deterministically from the hash-pinned frozen model feature "
                "table and validated against its aligned Morgan fingerprint artifact."
            ),
            "frozen_model_version": metadata["model_version"],
            "rxnorm_bridge_file": bridge_path.name,
            "rxnorm_bridge_payload_sha256": bridge_checksum,
            "model_metadata_file": metadata_path.name,
            "model_metadata_sha256": _sha256(metadata_path),
            "inference_drug_features_file": features_path.name,
            "inference_drug_features_sha256": actual_features_hash,
            "inference_morgan_fingerprints_file": fingerprints_path.name,
            "inference_morgan_fingerprints_sha256": actual_fingerprints_hash,
        },
        "mappings": sorted(mappings, key=lambda item: str(item["normalized_lookup_key"])),
        "governed_aliases": [
            {
                "normalized_alias": normalize_medical_name(alias),
                "normalized_target": normalize_medical_name(target),
                "source": "DRAP_CORPUS_OBSERVED_ALIAS",
            }
            for alias, target in sorted(GOVERNED_ALIASES.items())
        ],
    }
    payload["payload_sha256"] = hashlib.sha256(_canonical_json(payload)).hexdigest()
    artifact = SupplementalIdentityArtifact.model_validate(payload)
    _validate_model_alignment(artifact, model_dir)
    return payload


def main(argv: Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-dir", type=Path, default=DEFAULT_MODEL_DIR)
    parser.add_argument("--bridge", type=Path, default=DEFAULT_BRIDGE_ARTIFACT)
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_SUPPLEMENTAL_IDENTITY_ARTIFACT,
    )
    args = parser.parse_args(argv)
    payload = build_supplemental_identity_payload(args.model_dir, args.bridge)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )


if __name__ == "__main__":
    main()
