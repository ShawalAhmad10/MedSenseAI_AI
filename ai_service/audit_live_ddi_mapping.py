import csv
import json
from pathlib import Path

from medsense_ai.integrations.amna_medcopy.runtime_ingredient_normalizer import (
    runtime_ingredient_candidates,
)

ROOT = Path(__file__).resolve().parent

products_path = ROOT / "artifacts" / "ddi" / "live_neon_products.json"

bridge_path = (
    ROOT
    / "src"
    / "medsense_ai"
    / "integrations"
    / "amna_medcopy"
    / "data"
    / "ddi_bridge_v1.json"
)

supp_path = (
    ROOT
    / "src"
    / "medsense_ai"
    / "integrations"
    / "amna_medcopy"
    / "data"
    / "ddi_supplemental_identity_v1.json"
)

products = json.loads(products_path.read_text(encoding="utf-8"))
bridge = json.loads(bridge_path.read_text(encoding="utf-8"))

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


def resolve(raw):

    if raw is None or not str(raw).strip():
        return (
            "SOURCE_UNAVAILABLE",
            None,
            None,
            None
        )

    candidates = runtime_ingredient_candidates(str(raw))

    for candidate in candidates:

        lookup_keys = [candidate]

        alias = aliases.get(candidate)

        if alias:
            lookup_keys.append(alias)

        for key in lookup_keys:

            if key in bridge_map:
                item = bridge_map[key]

                return (
                    "RESOLVED",
                    candidate,
                    item.get("canonical_display_name"),
                    item.get("frozen_model_token"),
                )

            if key in supp_map:
                item = supp_map[key]

                return (
                    "RESOLVED_SUPPLEMENTAL",
                    candidate,
                    item.get("canonical_display_name"),
                    item.get("frozen_model_token"),
                )

            if key in ambiguous:
                return (
                    "AMBIGUOUS",
                    candidate,
                    None,
                    None
                )

            if key in unsupported:
                return (
                    "MODEL_UNSUPPORTED",
                    candidate,
                    None,
                    None
                )

    return (
        "UNMAPPED",
        candidates[-1] if candidates else None,
        None,
        None
    )


rows = []
summary = {}

for product in products:

    status, candidate, canonical, token = resolve(
        product.get("product_salt")
    )

    summary[status] = summary.get(status, 0) + 1

    rows.append({
        "product_id":
            product.get("product_id"),

        "product_title":
            product.get("product_title"),

        "product_generic_name":
            product.get("product_generic_name"),

        "product_salt":
            product.get("product_salt"),

        "normalized_candidate":
            candidate,

        "mapping_status":
            status,

        "canonical_ingredient":
            canonical,

        "frozen_model_token":
            token,

        "product_requires_rx":
            product.get("product_requires_rx"),

        "product_status":
            product.get("product_status"),
    })


output = (
    ROOT
    / "artifacts"
    / "ddi"
    / "live_neon_mapping_audit.csv"
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
print(" LIVE NEON DDI MAPPING AUDIT")
print("======================================")

print("TOTAL:", len(rows))

for key in sorted(summary):
    print(f"{key}: {summary[key]}")

print("")
print("UNRESOLVED PRODUCTS")
print("--------------------------------------")

unresolved = [
    x for x in rows
    if x["mapping_status"]
    not in {"RESOLVED", "RESOLVED_SUPPLEMENTAL"}
]

if not unresolved:
    print("NONE - ALL PRODUCTS RESOLVED")
else:
    for x in unresolved:
        print(
            x["product_id"],
            "|",
            x["product_title"],
            "| SALT:",
            x["product_salt"],
            "| NORMALIZED:",
            x["normalized_candidate"],
            "|",
            x["mapping_status"],
        )

print("")
print("CSV REPORT:", output)
