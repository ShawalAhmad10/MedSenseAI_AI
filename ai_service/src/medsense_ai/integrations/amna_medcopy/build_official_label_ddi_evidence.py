from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


DATA_DIR = Path(__file__).with_name("data")

DEFAULT_MANIFEST = DATA_DIR / "official_label_ddi_manifest_v1.json"
DEFAULT_OUTPUT = DATA_DIR / "official_label_ddi_evidence_v1.json"
DEFAULT_BRIDGE = DATA_DIR / "ddi_bridge_v1.json"
DEFAULT_IDENTITY = DATA_DIR / "ddi_rxcui_identity_v1.json"

SCHEMA_VERSION = "amna-official-label-ddi-evidence-v1"
MANIFEST_SCHEMA_VERSION = "amna-official-label-ddi-manifest-v1"


def _canonical_json(value: object) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def _pretty_json(value: object) -> bytes:
    return (
        json.dumps(
            value,
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
        + "\n"
    ).encode("utf-8")


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _canonical_pair(
    rxcui_1: str,
    name_1: str,
    rxcui_2: str,
    name_2: str,
) -> tuple[str, str, str, str]:
    left = (str(rxcui_1), str(name_1))
    right = (str(rxcui_2), str(name_2))

    if left[0] == right[0]:
        raise ValueError("official-label evidence pair cannot use the same RxCUI")

    if left[0] < right[0]:
        return left[0], left[1], right[0], right[1]

    return right[0], right[1], left[0], left[1]


def build_payload(
    manifest_path: Path,
    bridge_path: Path,
    identity_path: Path,
) -> dict:
    manifest_bytes = manifest_path.read_bytes()
    manifest = json.loads(manifest_bytes.decode("utf-8"))

    if manifest.get("schema_version") != MANIFEST_SCHEMA_VERSION:
        raise ValueError(
            f"unsupported official-label manifest schema: "
            f"{manifest.get('schema_version')}"
        )

    policy = manifest.get("policy") or {}

    required_policy = {
        "exact_named_interactions_only": True,
        "class_to_pair_expansion": False,
        "fuzzy_identity_matching": False,
        "negative_study_as_positive_evidence": False,
        "invent_clinical_severity": False,
        "default_severity": "Unknown",
        "review_required": True,
    }

    if policy != required_policy:
        raise ValueError("official-label manifest policy changed unexpectedly")

    bridge = _read_json(bridge_path)
    identity = _read_json(identity_path)

    pairs = []
    seen_pairs: set[tuple[str, str]] = set()

    for row in manifest.get("records", []):
        if row.get("evidence_type") != "OFFICIAL_LABEL_NAMED_INTERACTION":
            raise ValueError("unsupported official-label evidence type")

        if row.get("severity") != "Unknown":
            raise ValueError(
                "official-label evidence must not invent DDInter severity"
            )

        if row.get("review_required") is not True:
            raise ValueError(
                "official-label evidence must require review"
            )

        (
            rxcui_a,
            ingredient_a,
            rxcui_b,
            ingredient_b,
        ) = _canonical_pair(
            row["drug_rxcui"],
            row["drug_source_text"],
            row["partner_rxcui"],
            row["partner_source_text"],
        )

        pair_key = (rxcui_a, rxcui_b)

        if pair_key in seen_pairs:
            raise ValueError(
                f"duplicate official-label RxCUI pair: {pair_key}"
            )

        seen_pairs.add(pair_key)

        source_record_identifier = (
            f"DailyMed:{row['label_set_id']}:"
            f"{row['drug_source_text']}:{row['partner_source_text']}"
        )

        pairs.append(
            {
                "rxcui_a": rxcui_a,
                "rxcui_b": rxcui_b,
                "ingredient_a": ingredient_a,
                "ingredient_b": ingredient_b,
                "severity": "Unknown",
                "descriptions": [
                    (
                        "Official product labeling contains explicitly named "
                        "interaction evidence for this exact governed RxCUI pair. "
                        "Consult the cited label section for clinical management."
                    )
                ],
                "record_identifiers": [
                    source_record_identifier
                ],
                "source_system": row["source_system"],
                "label_set_id": row["label_set_id"],
                "label_section": row["label_section"],
                "evidence_type": row["evidence_type"],
                "review_required": True,
            }
        )

    pairs.sort(
        key=lambda item: (
            item["rxcui_a"],
            item["rxcui_b"],
            item["record_identifiers"][0],
        )
    )

    payload = {
        "schema_version": SCHEMA_VERSION,
        "provenance": {
            "manifest_file": manifest_path.name,
            "manifest_sha256": _sha256_bytes(manifest_bytes),
            "bridge_file": bridge_path.name,
            "bridge_payload_sha256": bridge["payload_sha256"],
            "rxcui_identity_file": identity_path.name,
            "rxcui_identity_payload_sha256": identity["payload_sha256"],
            "policy": (
                "Explicitly named official-label interaction evidence only; "
                "no class-to-pair expansion, fuzzy identity inference, "
                "negative-study conversion, or clinical severity invention."
            ),
        },
        "pairs": pairs,
        "excluded_records": manifest.get("excluded_records", []),
    }

    payload["payload_sha256"] = _sha256_bytes(
        _canonical_json(payload)
    )

    return payload


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--manifest",
        type=Path,
        default=DEFAULT_MANIFEST,
    )
    parser.add_argument(
        "--bridge",
        type=Path,
        default=DEFAULT_BRIDGE,
    )
    parser.add_argument(
        "--identity",
        type=Path,
        default=DEFAULT_IDENTITY,
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
    )

    args = parser.parse_args(argv)

    payload = build_payload(
        args.manifest,
        args.bridge,
        args.identity,
    )

    args.output.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    args.output.write_bytes(
        _pretty_json(payload)
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
