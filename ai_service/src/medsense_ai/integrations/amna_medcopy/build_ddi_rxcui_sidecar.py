"""Build additive governed RxCUI identity and DDInter evidence sidecars."""

from __future__ import annotations

import argparse
import csv
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import sqlite3

from medsense_ai.integrations.amna_medcopy.ddi_rxcui_sidecar import (
    DEFAULT_EVIDENCE_ARTIFACT,
    DEFAULT_IDENTITY_ARTIFACT,
    EVIDENCE_SCHEMA_VERSION,
    IDENTITY_SCHEMA_VERSION,
)
from medsense_ai.medical_data_ingestion.normalization import normalize_medical_name


DDINTER_CODES = ("A", "B", "D", "H", "L", "P", "R", "V")


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
        for chunk in iter(
            lambda: handle.read(1024 * 1024),
            b"",
        ):
            digest.update(chunk)

    return digest.hexdigest()


def _finish(payload: dict[str, object]) -> dict[str, object]:
    payload["payload_sha256"] = hashlib.sha256(
        _canonical_json(payload)
    ).hexdigest()

    return payload


def build_sidecars(
    *,
    validation_database: Path,
    bridge_artifact: Path,
    ddinter_directory: Path,
) -> tuple[dict[str, object], dict[str, object]]:
    if not validation_database.is_file():
        raise FileNotFoundError(validation_database)

    if not bridge_artifact.is_file():
        raise FileNotFoundError(bridge_artifact)

    ddinter_files = {
        code: ddinter_directory / f"ddinter_downloads_code_{code}.csv"
        for code in DDINTER_CODES
    }

    for path in ddinter_files.values():
        if not path.is_file():
            raise FileNotFoundError(
                f"Missing DDInter source bundle: {path}"
            )

    bridge = json.loads(
        bridge_artifact.read_text(encoding="utf-8")
    )

    unsupported_keys = set(
        bridge["model_unsupported_lookup_keys"]
    )

    supported_rxcuis = {
        str(item["rxcui"])
        for item in bridge["mappings"]
    }

    uri = (
        f"file:{validation_database.resolve().as_posix()}?mode=ro"
    )

    connection = sqlite3.connect(uri, uri=True)

    try:
        releases = connection.execute(
            "SELECT release_identifier FROM source_releases"
        ).fetchall()

        if len(releases) != 1:
            raise ValueError(
                "Validation DB must contain one RxNorm release"
            )

        rxnorm_release = str(releases[0][0])

        canonical_rows = connection.execute(
            "SELECT ai.canonical_name, ai.normalized_name, "
            "ei.identifier_value "
            "FROM active_ingredients ai "
            "JOIN external_identifiers ei "
            "ON ei.ingredient_id = ai.id "
            "WHERE ei.identifier_namespace = 'RXCUI' "
            "AND ei.entity_type = 'active_ingredient'"
        ).fetchall()

        alias_rows = connection.execute(
            "SELECT ia.alias, ia.normalized_alias, "
            "ai.canonical_name, ei.identifier_value "
            "FROM ingredient_aliases ia "
            "JOIN active_ingredients ai "
            "ON ai.id = ia.ingredient_id "
            "JOIN external_identifiers ei "
            "ON ei.ingredient_id = ai.id "
            "WHERE ia.mapping_status = 'mapped' "
            "AND ei.identifier_namespace = 'RXCUI' "
            "AND ei.entity_type = 'active_ingredient'"
        ).fetchall()

    finally:
        connection.close()

    identities: dict[
        str,
        dict[str, tuple[str, str]],
    ] = defaultdict(dict)

    all_names: dict[str, set[str]] = defaultdict(set)

    for canonical, normalized, rxcui in canonical_rows:
        rxcui = str(rxcui)

        identities[normalized][rxcui] = (
            str(canonical),
            str(normalized),
        )

        all_names[str(normalized)].add(rxcui)

        try:
            all_names[
                normalize_medical_name(str(canonical))
            ].add(rxcui)
        except ValueError:
            pass

    for alias, normalized_alias, canonical, rxcui in alias_rows:
        rxcui = str(rxcui)

        identities[normalized_alias][rxcui] = (
            str(canonical),
            str(alias),
        )

        all_names[str(normalized_alias)].add(rxcui)

    for item in bridge["mappings"]:
        all_names[
            str(item["normalized_lookup_key"])
        ].add(str(item["rxcui"]))

    identity_mappings = []

    unsupported_rxcuis = set()

    for key in sorted(unsupported_keys):
        possibilities = identities.get(key, {})

        if len(possibilities) != 1:
            raise ValueError(
                f"Unsupported key lacks one governed RxCUI: {key}"
            )

        rxcui, (canonical, _source) = next(
            iter(possibilities.items())
        )

        unsupported_rxcuis.add(rxcui)

        identity_mappings.append(
            {
                "normalized_lookup_key": key,
                "canonical_display_name": canonical,
                "rxcui": rxcui,
            }
        )

    identity_payload = _finish(
        {
            "schema_version": IDENTITY_SCHEMA_VERSION,
            "rxnorm_release": rxnorm_release,
            "source_bridge_payload_sha256":
                bridge["payload_sha256"],
            "mappings": identity_mappings,
        }
    )

    unique_name_to_rxcui = {
        name: next(iter(rxcuis))
        for name, rxcuis in all_names.items()
        if len(rxcuis) == 1
    }

    evidence_rows: dict[
        tuple[str, str],
        list[dict[str, str]],
    ] = defaultdict(list)

    source_hashes = {}

    for code in DDINTER_CODES:
        path = ddinter_files[code]
        source_hashes[path.name] = _sha256(path)

        with path.open(
            "r",
            encoding="utf-8-sig",
            newline="",
        ) as handle:
            reader = csv.DictReader(handle)

            required = {
                "DDInterID_A",
                "Drug_A",
                "DDInterID_B",
                "Drug_B",
                "Level",
            }

            if not required.issubset(
                set(reader.fieldnames or ())
            ):
                raise ValueError(
                    f"Unexpected DDInter schema: {path}"
                )

            for row in reader:
                try:
                    name_a = normalize_medical_name(
                        row["Drug_A"]
                    )
                    name_b = normalize_medical_name(
                        row["Drug_B"]
                    )
                except ValueError:
                    continue

                rxcui_a = unique_name_to_rxcui.get(name_a)
                rxcui_b = unique_name_to_rxcui.get(name_b)

                if not rxcui_a or not rxcui_b:
                    continue

                if rxcui_a == rxcui_b:
                    continue

                if (
                    rxcui_a not in unsupported_rxcuis
                    and rxcui_b not in unsupported_rxcuis
                ):
                    continue

                pair = tuple(
                    sorted((rxcui_a, rxcui_b))
                )

                evidence_rows[pair].append(
                    {
                        "id_a": row["DDInterID_A"].strip(),
                        "id_b": row["DDInterID_B"].strip(),
                        "drug_a": row["Drug_A"].strip(),
                        "drug_b": row["Drug_B"].strip(),
                        "level": row["Level"].strip()
                        or "Unknown",
                    }
                )

    pair_payloads = []

    unsupported_to_supported_pairs = 0
    unsupported_to_unsupported_pairs = 0

    for pair in sorted(evidence_rows):
        rows = evidence_rows[pair]

        dedup = {}

        for row in rows:
            record_id = (
                f"DDInter:{row['id_a']}:{row['id_b']}"
            )

            description = (
                "DDInter 2.0 exact interaction record "
                f"({row['drug_a']} ? {row['drug_b']}); "
                f"severity={row['level']}."
            )

            dedup[record_id] = (
                description,
                row["level"],
            )

        ordered = sorted(dedup.items())

        levels = tuple(
            sorted({
                level
                for _, (_, level) in ordered
            })
        )

        pair_payloads.append(
            {
                "rxcui_a": pair[0],
                "rxcui_b": pair[1],
                "levels": levels,
                "descriptions": [
                    description
                    for _, (description, _) in ordered
                ],
                "record_identifiers": [
                    record_id
                    for record_id, _ in ordered
                ],
            }
        )

        unsupported_count = sum(
            rxcui in unsupported_rxcuis
            for rxcui in pair
        )

        if unsupported_count == 2:
            unsupported_to_unsupported_pairs += 1

        if (
            unsupported_count == 1
            and any(
                rxcui in supported_rxcuis
                for rxcui in pair
            )
        ):
            unsupported_to_supported_pairs += 1

    evidence_payload = _finish(
        {
            "schema_version": EVIDENCE_SCHEMA_VERSION,
            "source_name": "DDInter 2.0",
            "source_license": "CC BY-NC-SA 4.0",
            "source_files_sha256": source_hashes,
            "pairs": pair_payloads,
        }
    )

    print(
        json.dumps(
            {
                "identity_lookup_keys":
                    len(identity_mappings),
                "identity_unique_rxcuis":
                    len(unsupported_rxcuis),
                "evidence_pairs":
                    len(pair_payloads),
                "unsupported_to_supported_pairs":
                    unsupported_to_supported_pairs,
                "unsupported_to_unsupported_pairs":
                    unsupported_to_unsupported_pairs,
            },
            indent=2,
            sort_keys=True,
        )
    )

    return identity_payload, evidence_payload


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
        "--bridge-artifact",
        type=Path,
        default=Path(
            "src/medsense_ai/integrations/"
            "amna_medcopy/data/ddi_bridge_v1.json"
        ),
    )

    parser.add_argument(
        "--ddinter-directory",
        type=Path,
        required=True,
    )

    parser.add_argument(
        "--identity-output",
        type=Path,
        default=DEFAULT_IDENTITY_ARTIFACT,
    )

    parser.add_argument(
        "--evidence-output",
        type=Path,
        default=DEFAULT_EVIDENCE_ARTIFACT,
    )

    args = parser.parse_args()

    identity, evidence = build_sidecars(
        validation_database=args.validation_database,
        bridge_artifact=args.bridge_artifact,
        ddinter_directory=args.ddinter_directory,
    )

    args.identity_output.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    args.evidence_output.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    args.identity_output.write_bytes(
        _canonical_json(identity) + b"\n"
    )

    args.evidence_output.write_bytes(
        _canonical_json(evidence) + b"\n"
    )

    print(
        "IDENTITY:",
        args.identity_output,
        identity["payload_sha256"],
    )

    print(
        "EVIDENCE:",
        args.evidence_output,
        evidence["payload_sha256"],
    )


if __name__ == "__main__":
    main()
