import csv
import json
from pathlib import Path

from medsense_ai.integrations.amna_medcopy.runtime_ingredient_normalizer import (
    runtime_ingredient_candidates,
    split_active_ingredients,
)

ROOT = Path(__file__).resolve().parent

products = json.loads(
    (ROOT / "artifacts" / "ddi" / "live_neon_products.json")
    .read_text(encoding="utf-8")
)

bridge_path = (
    ROOT / "src" / "medsense_ai" / "integrations"
    / "amna_medcopy" / "data" / "ddi_bridge_v1.json"
)

bridge = json.loads(
    bridge_path.read_text(encoding="utf-8")
)

bridge_map = {
    str(x["normalized_lookup_key"]): x
    for x in bridge.get("mappings", [])
}

ambiguous = set(
    map(str, bridge.get("ambiguous_lookup_keys", []))
)

unsupported = set(
    map(str, bridge.get("model_unsupported_lookup_keys", []))
)

supp_path = (
    ROOT / "src" / "medsense_ai" / "integrations"
    / "amna_medcopy" / "data" / "ddi_supplemental_identity_v1.json"
)

supp_map = {}
aliases = {}

if supp_path.exists():
    supp = json.loads(
        supp_path.read_text(encoding="utf-8")
    )

    supp_map = {
        str(x["normalized_lookup_key"]): x
        for x in supp.get("mappings", [])
    }

    aliases = {
        str(x["normalized_alias"]):
        str(x["normalized_target"])
        for x in supp.get("governed_aliases", [])
    }


def resolve_component(raw):

    candidates = runtime_ingredient_candidates(raw)

    for candidate in candidates:

        keys = [candidate]

        alias = aliases.get(candidate)
        if alias:
            keys.append(alias)

        for key in keys:

            if key in bridge_map:
                item = bridge_map[key]

                return {
                    "status": "RESOLVED",
                    "source": raw,
                    "normalized": candidate,
                    "canonical":
                        item.get("canonical_display_name"),
                    "token":
                        item.get("frozen_model_token"),
                }

            if key in supp_map:
                item = supp_map[key]

                return {
                    "status": "RESOLVED",
                    "source": raw,
                    "normalized": candidate,
                    "canonical":
                        item.get("canonical_display_name"),
                    "token":
                        item.get("frozen_model_token"),
                }

            if key in ambiguous:
                return {
                    "status": "AMBIGUOUS",
                    "source": raw,
                    "normalized": candidate,
                    "canonical": None,
                    "token": None,
                }

            if key in unsupported:
                return {
                    "status": "MODEL_UNSUPPORTED",
                    "source": raw,
                    "normalized": candidate,
                    "canonical": None,
                    "token": None,
                }

    return {
        "status": "UNMAPPED",
        "source": raw,
        "normalized":
            candidates[-1] if candidates else None,
        "canonical": None,
        "token": None,
    }


rows = []
summary = {}

for product in products:

    raw_salt = product.get("product_salt")

    components = split_active_ingredients(raw_salt)

    if not components:
        component_results = [{
            "status": "SOURCE_UNAVAILABLE",
            "source": None,
            "normalized": None,
            "canonical": None,
            "token": None,
        }]
    else:
        component_results = [
            resolve_component(x)
            for x in components
        ]

    statuses = [
        x["status"]
        for x in component_results
    ]

    if len(component_results) == 1:

        final_status = statuses[0]

    elif all(x == "RESOLVED" for x in statuses):

        final_status = "RESOLVED_COMBINATION"

    elif any(x == "MODEL_UNSUPPORTED" for x in statuses):

        final_status = "PARTIAL_MODEL_UNSUPPORTED"

    elif any(x in {"UNMAPPED", "AMBIGUOUS"} for x in statuses):

        final_status = "PARTIAL_COMBINATION"

    else:

        final_status = "REVIEW_REQUIRED"

    summary[final_status] = (
        summary.get(final_status, 0) + 1
    )

    rows.append({
        "product_id":
            product.get("product_id"),

        "product_title":
            product.get("product_title"),

        "product_salt":
            raw_salt,

        "component_count":
            len(component_results),

        "mapping_status":
            final_status,

        "components":
            " || ".join(
                f'{x["source"]} => '
                f'{x["normalized"]} => '
                f'{x["token"] or x["status"]}'
                for x in component_results
            ),
    })


output = (
    ROOT / "artifacts" / "ddi"
    / "live_neon_mapping_audit_v2.csv"
)

with output.open(
    "w",
    newline="",
    encoding="utf-8-sig"
) as f:

    writer = csv.DictWriter(
        f,
        fieldnames=rows[0].keys()
    )

    writer.writeheader()
    writer.writerows(rows)


print("")
print("======================================")
print(" LIVE NEON DDI AUDIT V2")
print("======================================")

print("TOTAL:", len(rows))

for key in sorted(summary):
    print(f"{key}: {summary[key]}")

print("")
print("NOT FULLY RESOLVED")
print("--------------------------------------")

for row in rows:

    if row["mapping_status"] not in {
        "RESOLVED",
        "RESOLVED_COMBINATION",
    }:

        print(
            row["product_id"],
            "|",
            row["product_title"],
            "|",
            row["mapping_status"],
        )

        print(
            "   ",
            row["components"]
        )

print("")
print("CSV REPORT:", output)
