import itertools
import json
import sys
from pathlib import Path
from urllib.request import Request, urlopen

AI = Path(__file__).resolve().parent
PRODUCT_FILE = AI / "artifacts" / "ddi" / "live_neon_products.json"
URL = "http://127.0.0.1:8000/api/v1/integrations/amna/ddi/cart-check"

raw = json.loads(PRODUCT_FILE.read_text(encoding="utf-8-sig"))

if isinstance(raw, list):
    products = raw
else:
    for key in ("products", "rows", "data", "items"):
        if isinstance(raw.get(key), list):
            products = raw[key]
            break
    else:
        raise RuntimeError("Product list not found")

products = sorted(products, key=lambda x: int(x["product_id"]))

failures = []
checked_pairs = 0
result_rows = 0
exact_rows = 0
model_signal_rows = 0


def post(items):
    payload = json.dumps({"products": items}).encode()

    req = Request(
        URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


for index, (a, b) in enumerate(itertools.combinations(products, 2), 1):

    response = post([a, b])

    checked_pairs += 1

    for pair in response.get("pairs", []):
        result_rows += 1

        interaction = pair.get("interaction_found") is True
        known = pair.get("known_dataset_record_found") is True
        descriptions = pair.get("known_interaction_descriptions") or []
        source = pair.get("evidence_source_identifier")
        records = pair.get("evidence_record_identifiers") or []
        severity = pair.get("severity")
        action = pair.get("workflow_action")

        ids_a = pair.get("product_ids_a") or []
        ids_b = pair.get("product_ids_b") or []

        # -----------------------------------------------------
        # 1. Every exact interaction must have governed evidence
        # -----------------------------------------------------

        if interaction:
            exact_rows += 1

            if not known:
                failures.append(
                    f"{a['product_id']}+{b['product_id']}: "
                    "interaction_found without known_dataset_record_found"
                )

            if not descriptions:
                failures.append(
                    f"{a['product_id']}+{b['product_id']}: "
                    "exact interaction missing description"
                )

            if not source:
                failures.append(
                    f"{a['product_id']}+{b['product_id']}: "
                    "exact interaction missing evidence source"
                )

            if not records:
                failures.append(
                    f"{a['product_id']}+{b['product_id']}: "
                    "exact interaction missing evidence record ID"
                )

        # -----------------------------------------------------
        # 2. Governed evidence must not exist without exact flag
        # -----------------------------------------------------

        if known and not interaction:
            failures.append(
                f"{a['product_id']}+{b['product_id']}: "
                "known evidence exists but interaction_found=false"
            )

        # -----------------------------------------------------
        # 3. Model-only signal must not masquerade as severity
        # -----------------------------------------------------

        if action == "FLAG_MODEL_SIGNAL":
            model_signal_rows += 1

            if severity is not None:
                failures.append(
                    f"{a['product_id']}+{b['product_id']}: "
                    f"model-only signal has clinical severity={severity}"
                )

            if known:
                failures.append(
                    f"{a['product_id']}+{b['product_id']}: "
                    "model-only signal also marked exact evidence"
                )

        # -----------------------------------------------------
        # 4. Severity must be governed values only
        # -----------------------------------------------------

        if severity not in (None, "Unknown", "Minor", "Moderate", "Major"):
            failures.append(
                f"{a['product_id']}+{b['product_id']}: "
                f"invalid severity={severity}"
            )

        # -----------------------------------------------------
        # 5. No same-product-only cart interaction
        # -----------------------------------------------------

        cross_product = any(
            x != y
            for x in ids_a
            for y in ids_b
        )

        if not cross_product:
            failures.append(
                f"{a['product_id']}+{b['product_id']}: "
                "same-product-only pair leaked"
            )

    if index % 500 == 0 or index == 6786:
        print(f"{index}/6786 carts checked")


print()
print("=" * 68)
print(" DDI EVIDENCE INTEGRITY RESULT")
print("=" * 68)
print(f"Catalog products        : {len(products)}")
print(f"Product pairs checked   : {checked_pairs}")
print(f"Pair-result rows        : {result_rows}")
print(f"Exact interaction rows  : {exact_rows}")
print(f"Model-signal rows       : {model_signal_rows}")
print(f"Failures                : {len(failures)}")

if failures:
    print()
    for failure in failures[:100]:
        print("[FAIL]", failure)

    if len(failures) > 100:
        print(f"... plus {len(failures)-100} more")

    sys.exit(1)

print()
print("ALL DDI EVIDENCE INTEGRITY CHECKS PASSED.")
sys.exit(0)
