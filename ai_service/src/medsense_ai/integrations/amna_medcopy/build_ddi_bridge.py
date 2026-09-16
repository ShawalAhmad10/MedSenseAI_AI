"""Build the packaged exact RxNorm-to-frozen-model bridge artifact."""

from __future__ import annotations

import argparse
import csv
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import sqlite3

from medsense_ai.integrations.amna_medcopy.ddi_bridge import (
    BRIDGE_SCHEMA_VERSION,
    DEFAULT_BRIDGE_ARTIFACT,
)


MATCHING_POLICY = (
    "NFKC/casefold/whitespace normalization followed by unambiguous exact RxNorm "
    "canonical-or-accepted-alias and exact frozen-model-vocabulary overlap only; "
    "no fuzzy matching, splitting, stripping, or moiety inference."
)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _canonical_json(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode(
        "utf-8"
    )


def build_bridge_payload(
    *,
    validation_database: Path,
    rxnorm_source: Path,
    model_directory: Path,
    evidence_source: Path,
    evidence_provenance: Path,
) -> dict[str, object]:
    input_paths = (
        validation_database,
        rxnorm_source,
        model_directory / "inference_drug_features.csv",
        model_directory / "model_metadata.json",
        model_directory / "selected_model.joblib",
        model_directory / "inference_morgan_fingerprints.npz",
        evidence_source,
        evidence_provenance,
    )
    for path in input_paths:
        if not path.is_file():
            raise FileNotFoundError(f"Required governed bridge input is missing: {path}")

    rxnorm_sha = _sha256(rxnorm_source)
    model_metadata_path = model_directory / "model_metadata.json"
    vocabulary_path = model_directory / "inference_drug_features.csv"
    model_artifact_path = model_directory / "selected_model.joblib"
    fingerprint_path = model_directory / "inference_morgan_fingerprints.npz"
    model_metadata = json.loads(model_metadata_path.read_text(encoding="utf-8"))
    expected_model_hashes = model_metadata.get("artifact_sha256", {})
    for name, path in (
        ("inference_drug_features.csv", vocabulary_path),
        ("selected_model.joblib", model_artifact_path),
        ("inference_morgan_fingerprints.npz", fingerprint_path),
    ):
        if expected_model_hashes.get(name) != _sha256(path):
            raise ValueError(f"Frozen model metadata hash mismatch: {name}")

    evidence_manifest = json.loads(evidence_provenance.read_text(encoding="utf-8"))
    expected_evidence_sha = evidence_manifest.get("source", {}).get("sha256")
    evidence_sha = _sha256(evidence_source)
    if expected_evidence_sha != evidence_sha:
        raise ValueError("Exact evidence source hash does not match its provenance manifest")

    uri = f"file:{validation_database.resolve().as_posix()}?mode=ro"
    connection = sqlite3.connect(uri, uri=True)
    try:
        release_rows = connection.execute(
            "SELECT release_identifier, content_checksum FROM source_releases"
        ).fetchall()
        if len(release_rows) != 1:
            raise ValueError("Validation database must contain exactly one pinned RxNorm release")
        release_identifier, source_checksum = release_rows[0]
        if source_checksum != f"sha256:{rxnorm_sha}":
            raise ValueError("RxNorm validation release hash does not match RXNCONSO.RRF")
        batches = connection.execute(
            "SELECT DISTINCT pipeline_name, pipeline_version FROM ingestion_batches "
            "WHERE status = 'completed' AND input_checksum = ?",
            (source_checksum,),
        ).fetchall()
        if len(batches) != 1:
            raise ValueError("RxNorm identity input lacks one unambiguous completed pipeline version")
        pipeline_name, pipeline_version = batches[0]

        canonical_rows = connection.execute(
            "SELECT ai.canonical_name, ai.normalized_name, ei.identifier_value "
            "FROM active_ingredients ai JOIN external_identifiers ei "
            "ON ei.ingredient_id = ai.id "
            "WHERE ei.identifier_namespace = 'RXCUI' "
            "AND ei.entity_type = 'active_ingredient'"
        ).fetchall()
        alias_rows = connection.execute(
            "SELECT ia.alias, ia.normalized_alias, ai.canonical_name, ei.identifier_value "
            "FROM ingredient_aliases ia JOIN active_ingredients ai "
            "ON ai.id = ia.ingredient_id JOIN external_identifiers ei "
            "ON ei.ingredient_id = ai.id "
            "WHERE ia.mapping_status = 'mapped' "
            "AND ei.identifier_namespace = 'RXCUI' "
            "AND ei.entity_type = 'active_ingredient'"
        ).fetchall()
    finally:
        connection.close()

    candidates: dict[str, dict[str, dict[str, set[str] | str]]] = defaultdict(dict)
    for canonical_name, normalized_name, rxcui in canonical_rows:
        entry = candidates[normalized_name].setdefault(
            rxcui,
            {"canonical_display_name": canonical_name, "canonical": set(), "alias": set()},
        )
        cast_set = entry["canonical"]
        assert isinstance(cast_set, set)
        cast_set.add(canonical_name)
    for alias, normalized_alias, canonical_name, rxcui in alias_rows:
        entry = candidates[normalized_alias].setdefault(
            rxcui,
            {"canonical_display_name": canonical_name, "canonical": set(), "alias": set()},
        )
        cast_set = entry["alias"]
        assert isinstance(cast_set, set)
        cast_set.add(alias)

    with vocabulary_path.open("r", encoding="utf-8-sig", newline="") as handle:
        vocabulary_rows = list(csv.DictReader(handle))
    vocabulary = {row["normalized_name"]: row["original_name"] for row in vocabulary_rows}
    if len(vocabulary) != len(vocabulary_rows):
        raise ValueError("Frozen DDI vocabulary contains duplicate normalized names")

    ambiguous_keys = sorted(key for key, values in candidates.items() if len(values) != 1)
    unambiguous_keys = {key for key, values in candidates.items() if len(values) == 1}
    supported_keys = sorted(unambiguous_keys & vocabulary.keys())
    mappings: list[dict[str, object]] = []
    for key in supported_keys:
        rxcui, identity = next(iter(candidates[key].items()))
        canonical_names = identity["canonical"]
        aliases = identity["alias"]
        assert isinstance(canonical_names, set) and isinstance(aliases, set)
        if canonical_names:
            match_source = "CANONICAL"
            matched_source_text = sorted(canonical_names, key=lambda item: (item.casefold(), item))[0]
        else:
            match_source = "ALIAS"
            matched_source_text = sorted(aliases, key=lambda item: (item.casefold(), item))[0]
        mappings.append(
            {
                "canonical_display_name": identity["canonical_display_name"],
                "frozen_model_token": vocabulary[key],
                "match_source": match_source,
                "matched_source_text": matched_source_text,
                "normalized_lookup_key": key,
                "rxcui": rxcui,
            }
        )

    payload: dict[str, object] = {
        "ambiguous_lookup_keys": ambiguous_keys,
        "mappings": mappings,
        "matching_policy": MATCHING_POLICY,
        "model_unsupported_lookup_keys": sorted(unambiguous_keys - vocabulary.keys()),
        "model_vocabulary_unmapped_keys": sorted(vocabulary.keys() - unambiguous_keys),
        "provenance": {
            "evidence_provenance_sha256": _sha256(evidence_provenance),
            "evidence_source_file": evidence_source.name,
            "evidence_source_sha256": evidence_sha,
            "frozen_model_artifact_sha256": _sha256(model_artifact_path),
            "frozen_model_fingerprint_sha256": _sha256(fingerprint_path),
            "frozen_model_metadata_sha256": _sha256(model_metadata_path),
            "frozen_model_version": model_metadata["model_version"],
            "frozen_model_vocabulary_file": vocabulary_path.name,
            "frozen_model_vocabulary_sha256": _sha256(vocabulary_path),
            "rxnorm_pipeline_name": pipeline_name,
            "rxnorm_pipeline_version": pipeline_version,
            "rxnorm_release": release_identifier,
            "rxnorm_source_file": rxnorm_source.name,
            "rxnorm_source_sha256": rxnorm_sha,
        },
        "schema_version": BRIDGE_SCHEMA_VERSION,
    }
    payload["payload_sha256"] = hashlib.sha256(_canonical_json(payload)).hexdigest()
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--validation-database",
        type=Path,
        default=Path(
            "data/rxnorm-cpc-2026-08-03/validation/"
            "rxnorm-cpc-20260803-validation.sqlite3"
        ),
    )
    parser.add_argument(
        "--rxnorm-source",
        type=Path,
        default=Path("data/rxnorm-cpc-2026-08-03/extracted/rrf/RXNCONSO.RRF"),
    )
    parser.add_argument("--model-directory", type=Path, default=Path("artifacts/ddi/model"))
    parser.add_argument(
        "--evidence-source", type=Path, default=Path("external/db_drug_interactions.csv")
    )
    parser.add_argument(
        "--evidence-provenance",
        type=Path,
        default=Path("artifacts/ddi/provenance_manifest.json"),
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_BRIDGE_ARTIFACT)
    args = parser.parse_args()
    payload = build_bridge_payload(
        validation_database=args.validation_database,
        rxnorm_source=args.rxnorm_source,
        model_directory=args.model_directory,
        evidence_source=args.evidence_source,
        evidence_provenance=args.evidence_provenance,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(_canonical_json(payload) + b"\n")
    print(
        json.dumps(
            {
                "ambiguous": len(payload["ambiguous_lookup_keys"]),
                "mappings": len(payload["mappings"]),
                "model_unsupported": len(payload["model_unsupported_lookup_keys"]),
                "output": str(args.output),
                "payload_sha256": payload["payload_sha256"],
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
