from __future__ import annotations

import concurrent.futures
import csv
import json
import statistics
import sys
import time
from collections import Counter
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen


BASE = "http://127.0.0.1:8000"
ENDPOINT = BASE + "/api/v1/integrations/amna/ddi/cart-check"

ROOT = Path(__file__).resolve().parent
PRODUCT_JSON = ROOT / "artifacts" / "ddi" / "live_neon_products.json"
REPORT_DIR = ROOT / "artifacts" / "ddi" / "regression"
REPORT_DIR.mkdir(parents=True, exist_ok=True)

CHECKOUT_CONTRACT = {
    "CLEAR_WITH_LIMITATIONS": True,
    "WARNING_CHECKOUT_ALLOWED": True,
    "WARNING_REVIEW_REQUIRED": False,
    "UNRESOLVED_REVIEW_REQUIRED": False,
    "SERVICE_UNAVAILABLE": False,
}

REVIEW_CONTRACT = {
    "CLEAR_WITH_LIMITATIONS": False,
    "WARNING_CHECKOUT_ALLOWED": False,
    "WARNING_REVIEW_REQUIRED": True,
    "UNRESOLVED_REVIEW_REQUIRED": True,
    "SERVICE_UNAVAILABLE": True,
}

HARD_UNRESOLVED = {
    "SOURCE_UNAVAILABLE",
    "UNMAPPED",
    "AMBIGUOUS",
    "REVIEW_REQUIRED",
    "MODEL_UNSUPPORTED",
}

results = []
passes = 0
fails = 0


def result(name, ok, expected, actual, category):
    global passes, fails

    if ok:
        passes += 1
        print(f"[PASS] {name}")
    else:
        fails += 1
        print(f"[FAIL] {name}")
        print(f"       expected: {expected}")
        print(f"       actual:   {actual}")

    results.append({
        "category": category,
        "test": name,
        "result": "PASS" if ok else "FAIL",
        "expected": str(expected),
        "actual": str(actual),
    })


def post(products, timeout=30):
    data = json.dumps(
        {"products": products},
        ensure_ascii=False,
    ).encode("utf-8")

    req = Request(
        ENDPOINT,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    started = time.perf_counter()

    try:
        with urlopen(req, timeout=timeout) as response:
            elapsed = (time.perf_counter() - started) * 1000

            return (
                response.status,
                json.loads(response.read().decode("utf-8")),
                elapsed,
                None,
            )

    except HTTPError as exc:
        elapsed = (time.perf_counter() - started) * 1000

        try:
            body = exc.read().decode("utf-8")
        except Exception:
            body = ""

        return exc.code, None, elapsed, body

    except Exception as exc:
        elapsed = (time.perf_counter() - started) * 1000

        return None, None, elapsed, repr(exc)


def load_products():
    raw = json.loads(
        PRODUCT_JSON.read_text(encoding="utf-8-sig")
    )

    if isinstance(raw, list):
        products = raw
    else:
        for key in ("products", "rows", "data", "items"):
            if isinstance(raw.get(key), list):
                products = raw[key]
                break
        else:
            raise RuntimeError("Product list not found.")

    clean = []

    for item in products:
        clean.append({
            "product_id": int(item["product_id"]),
            "product_title": item["product_title"],
            "product_generic_name": item["product_generic_name"],
            "product_salt": item["product_salt"],
            "product_requires_rx": item["product_requires_rx"],
            "product_status": int(item["product_status"]),
        })

    return sorted(clean, key=lambda x: x["product_id"])


def synthetic(pid, title, salt, rx=False):
    return {
        "product_id": pid,
        "product_title": title,
        "product_generic_name": salt,
        "product_salt": salt,
        "product_requires_rx": rx,
        "product_status": 1,
    }


def product_map(response):
    output = {}

    for p in response.get("products", []):
        ing = p.get("ingredient") or {}

        output[int(p["product_id"])] = {
            "state": ing.get("state"),
            "canonical": ing.get("canonical_display_name"),
            "token": ing.get("frozen_model_token"),
        }

    return output


def cart_valid(response):
    status = response.get("status")

    if status not in CHECKOUT_CONTRACT:
        return False, f"unknown status {status}"

    if response.get("checkout_allowed") != CHECKOUT_CONTRACT[status]:
        return False, "checkout contract mismatch"

    if response.get("review_required") != REVIEW_CONTRACT[status]:
        return False, "review contract mismatch"

    for pair in response.get("pairs", []):
        a = pair.get("product_ids_a") or []
        b = pair.get("product_ids_b") or []

        if not any(x != y for x in a for y in b):
            return False, "same-product-only pair leaked"

    return True, "valid"


def pair_signature(response):
    rows = []

    for p in response.get("pairs", []):
        rows.append((
            tuple(sorted(p.get("product_ids_a") or [])),
            tuple(sorted(p.get("product_ids_b") or [])),
            p.get("ingredient_a"),
            p.get("ingredient_b"),
            p.get("state"),
            p.get("interaction_found"),
            p.get("severity"),
            p.get("warning_triggered"),
        ))

    return sorted(rows, key=str)


products = load_products()

print()
print("=" * 72)
print(" MEDSENSEAI DDI MUTATION + STRESS REGRESSION")
print("=" * 72)


# ============================================================
# PHASE A — BASELINES
# ============================================================

print()
print("PHASE A — BUILDING BASELINES")

baseline = {}

for p in products:
    http, response, ms, error = post([p])

    if http != 200:
        raise RuntimeError(
            f"Baseline HTTP failure for {p['product_id']}: {http} {error}"
        )

    pm = product_map(response)
    baseline[p["product_id"]] = {
        **pm[p["product_id"]],
        "status": response["status"],
    }

resolved_single = []

resolved_combos = []

for p in products:
    b = baseline[p["product_id"]]

    salt = p.get("product_salt") or ""

    if b["state"] == "RESOLVED":
        if "+" in salt:
            resolved_combos.append(p)
        else:
            resolved_single.append(p)

print(f"Resolved single products : {len(resolved_single)}")
print(f"Resolved combinations    : {len(resolved_combos)}")


# ============================================================
# PHASE B — NEW BRAND / NEW STRENGTH MUTATIONS
# ============================================================

print()
print("PHASE B — RESOLVED INGREDIENT MUTATIONS")

mutations = [
    lambda c: c,
    lambda c: c.upper(),
    lambda c: "   " + c + "   ",
    lambda c: c + " 100mg",
    lambda c: c + " 250 mg",
    lambda c: c + " 5mg/ml",
    lambda c: c + " 100mg/5ml",
    lambda c: c + " 0.5%",
    lambda c: c + " BP 500mg tablet",
]

mutation_names = [
    "canonical",
    "uppercase",
    "whitespace",
    "100mg",
    "250 mg",
    "5mg/ml",
    "100mg/5ml",
    "0.5 percent",
    "BP tablet form",
]

sid = 2000000

for index, p in enumerate(resolved_single, 1):

    original = baseline[p["product_id"]]

    canonical = original["canonical"]
    expected_token = original["token"]

    if not canonical or not expected_token:
        continue

    for name, mutate in zip(
        mutation_names,
        mutations,
    ):
        sid += 1
        salt = mutate(canonical)

        test_product = synthetic(
            sid,
            f"New Brand {sid}",
            salt,
            False,
        )

        http, response, ms, error = post(
            [test_product]
        )

        if http != 200:
            result(
                f"B {p['product_id']} {name}",
                False,
                "HTTP 200 / RESOLVED",
                f"HTTP {http} {error}",
                "single-mutation",
            )
            continue

        ing = response["products"][0]["ingredient"]

        ok = (
            ing.get("state") == "RESOLVED"
            and
            ing.get("frozen_model_token") == expected_token
        )

        result(
            f"B {p['product_id']} {name}",
            ok,
            f"RESOLVED token={expected_token}",
            f"{ing.get('state')} token={ing.get('frozen_model_token')}",
            "single-mutation",
        )

    if index % 10 == 0:
        print(
            f"  processed {index}/{len(resolved_single)} resolved singles"
        )


# ============================================================
# PHASE C — COMBINATION MUTATIONS
# ============================================================

print()
print("PHASE C — FIXED-COMBINATION MUTATIONS")

cid = 3000000

for p in resolved_combos:

    salt = p["product_salt"]

    components = [
        x.strip()
        for x in salt.split("+")
        if x.strip()
    ]

    combo_variants = [
        salt,
        salt.upper(),
        " + ".join(components),
        "+".join(components),
        " + ".join(reversed(components)),
        "   +   ".join(components),
    ]

    for n, variant in enumerate(
        combo_variants,
        1,
    ):
        cid += 1

        test_product = synthetic(
            cid,
            f"New Combo Brand {cid}",
            variant,
            p["product_requires_rx"] or False,
        )

        http, response, ms, error = post(
            [test_product]
        )

        if http != 200:
            result(
                f"C {p['product_id']} variant {n}",
                False,
                "HTTP 200",
                f"HTTP {http}",
                "combo-mutation",
            )
            continue

        state = (
            response["products"][0]
            ["ingredient"]["state"]
        )

        ok = (
            response["status"] == "CLEAR_WITH_LIMITATIONS"
            and
            state == "RESOLVED"
            and
            len(response.get("pairs", [])) == 0
        )

        result(
            f"C {p['product_id']} variant {n}",
            ok,
            "CLEAR / RESOLVED / 0 internal pairs",
            (
                f"{response['status']} / "
                f"{state} / "
                f"{len(response.get('pairs', []))} pairs"
            ),
            "combo-mutation",
        )


# ============================================================
# PHASE D — UNKNOWN / ADVERSARIAL SALTS
# ============================================================

print()
print("PHASE D — UNKNOWN SALT SAFETY")

unknowns = []

for i in range(1, 51):
    unknowns.append(
        f"ZZRegressionUnknownActiveIngredient{i:03d} 100mg"
    )

unknowns += [
    "ZZ Unknown A / ZZ Unknown B",
    "ZZ Unknown A + ZZ Unknown B",
    "Unknown Herbal Mixture Extract",
    "Unknown Ferrous Preparation",
    "Unknown Topical Combination",
]

uid = 4000000

for salt in unknowns:
    uid += 1

    http, response, ms, error = post([
        synthetic(
            uid,
            f"Unknown Product {uid}",
            salt,
        )
    ])

    if http != 200:
        result(
            f"D unknown {salt}",
            False,
            "HTTP 200 safe review",
            f"HTTP {http}",
            "unknown-salt",
        )
        continue

    state = response["products"][0]["ingredient"]["state"]

    ok = (
        response["checkout_allowed"] is False
        and
        response["review_required"] is True
        and
        state in HARD_UNRESOLVED
    )

    result(
        f"D unknown {salt}",
        ok,
        "blocked + review + unresolved state",
        (
            f"{response['status']} / "
            f"{state} / "
            f"checkout={response['checkout_allowed']}"
        ),
        "unknown-salt",
    )


# Blank/null: either API rejects them or safely reviews them.
for value, label in [
    (None, "null"),
    ("", "empty"),
    ("   ", "whitespace"),
]:

    uid += 1

    p = synthetic(
        uid,
        f"Missing Salt {label}",
        value,
    )

    http, response, ms, error = post([p])

    if http == 422:
        ok = True
        actual = "HTTP 422 rejected"

    elif http == 200:
        state = response["products"][0]["ingredient"]["state"]

        ok = (
            response["checkout_allowed"] is False
            and
            response["review_required"] is True
            and
            state in HARD_UNRESOLVED
        )

        actual = (
            f"HTTP 200 {response['status']} / {state}"
        )

    else:
        ok = False
        actual = f"HTTP {http} {error}"

    result(
        f"D missing salt {label}",
        ok,
        "422 OR blocked pharmacist review",
        actual,
        "unknown-salt",
    )


# ============================================================
# PHASE E — LARGE CART STRESS
# ============================================================

print()
print("PHASE E — LARGE CARTS")

for size in [3, 5, 10, 25, 50, 100]:

    payload = products[:size]

    http, response, ms, error = post(
        payload,
        timeout=60,
    )

    if http != 200:
        result(
            f"E cart size {size}",
            False,
            "HTTP 200",
            f"HTTP {http} {error}",
            "large-cart",
        )
        continue

    ok, reason = cart_valid(response)

    returned_ids = {
        int(p["product_id"])
        for p in response.get("products", [])
    }

    requested_ids = {
        int(p["product_id"])
        for p in payload
    }

    ok = (
        ok
        and
        returned_ids == requested_ids
    )

    result(
        f"E cart size {size}",
        ok,
        f"{size} products / valid workflow",
        (
            f"{response['status']} / "
            f"{len(returned_ids)} products / "
            f"{len(response.get('pairs', []))} pair rows / "
            f"{ms:.2f} ms / {reason}"
        ),
        "large-cart",
    )


# ============================================================
# PHASE F — CART ORDER INVARIANCE
# ============================================================

print()
print("PHASE F — ORDER INVARIANCE")

for size in [2, 5, 10, 25]:

    payload = products[:size]

    h1, a, ms1, e1 = post(payload)
    h2, b, ms2, e2 = post(
        list(reversed(payload))
    )

    if h1 != 200 or h2 != 200:
        result(
            f"F order size {size}",
            False,
            "both HTTP 200",
            f"{h1}/{h2}",
            "order-invariance",
        )
        continue

    # Request normalization sorts partner products, so
    # result must be deterministic irrespective of input order.
    ok = (
        a["status"] == b["status"]
        and
        a["checkout_allowed"] == b["checkout_allowed"]
        and
        a["review_required"] == b["review_required"]
        and
        product_map(a) == product_map(b)
        and
        pair_signature(a) == pair_signature(b)
    )

    result(
        f"F order size {size}",
        ok,
        "same normalized DDI result",
        (
            f"{a['status']} vs {b['status']} / "
            f"{len(a.get('pairs', []))} vs "
            f"{len(b.get('pairs', []))} pairs"
        ),
        "order-invariance",
    )


# ============================================================
# PHASE G — REPEATED DETERMINISM
# ============================================================

print()
print("PHASE G — REPEATED DETERMINISM")

known_payload = [
    {
        "product_id": 900128,
        "product_title": "Panadol Extra",
        "product_generic_name": "Paracetamol 500mg + Caffeine 65mg",
        "product_salt": "Paracetamol 500mg + Caffeine 65mg",
        "product_requires_rx": False,
        "product_status": 1,
    },
    {
        "product_id": 900142,
        "product_title": "Risek 20mg",
        "product_generic_name": "Omeprazole 20mg",
        "product_salt": "Omeprazole 20mg",
        "product_requires_rx": True,
        "product_status": 1,
    },
]

http, reference, _, _ = post(
    known_payload
)

reference_signature = (
    reference["status"],
    reference["checkout_allowed"],
    reference["review_required"],
    product_map(reference),
    pair_signature(reference),
)

deterministic = True

for i in range(50):
    http, response, ms, error = post(
        known_payload
    )

    if http != 200:
        deterministic = False
        break

    signature = (
        response["status"],
        response["checkout_allowed"],
        response["review_required"],
        product_map(response),
        pair_signature(response),
    )

    if signature != reference_signature:
        deterministic = False
        break

result(
    "G 50 repeated Panadol Extra + Risek requests",
    deterministic,
    "50 identical semantic responses",
    "identical" if deterministic else "mismatch detected",
    "determinism",
)


# ============================================================
# PHASE H — CONCURRENT REQUEST STRESS
# ============================================================

print()
print("PHASE H — CONCURRENCY STRESS")

concurrent_latencies = []
concurrency_errors = []

def concurrent_job(i):
    started = time.perf_counter()

    http, response, ms, error = post(
        known_payload,
        timeout=30,
    )

    if http != 200:
        return False, ms, f"HTTP {http}: {error}"

    signature = (
        response["status"],
        response["checkout_allowed"],
        response["review_required"],
        product_map(response),
        pair_signature(response),
    )

    return (
        signature == reference_signature,
        ms,
        None,
    )


with concurrent.futures.ThreadPoolExecutor(
    max_workers=20
) as executor:

    futures = [
        executor.submit(
            concurrent_job,
            i,
        )
        for i in range(100)
    ]

    for future in concurrent.futures.as_completed(
        futures
    ):
        ok, ms, error = future.result()

        concurrent_latencies.append(ms)

        if not ok:
            concurrency_errors.append(error or "response mismatch")


p95 = None

if concurrent_latencies:
    ordered = sorted(concurrent_latencies)

    p95 = ordered[
        int(
            round(
                (len(ordered) - 1)
                * 0.95
            )
        )
    ]

result(
    "H 100 requests / 20 concurrent workers",
    len(concurrency_errors) == 0,
    "0 errors / identical semantics",
    (
        f"errors={len(concurrency_errors)}, "
        f"avg={statistics.mean(concurrent_latencies):.2f}ms, "
        f"p95={p95:.2f}ms"
        if concurrent_latencies
        else "no latency data"
    ),
    "concurrency",
)


# ============================================================
# FINAL REPORT
# ============================================================

stamp = time.strftime("%Y%m%d-%H%M%S")

csv_path = (
    REPORT_DIR
    / f"ddi_mutation_stress_{stamp}.csv"
)

with csv_path.open(
    "w",
    newline="",
    encoding="utf-8-sig",
) as f:

    writer = csv.DictWriter(
        f,
        fieldnames=[
            "category",
            "test",
            "result",
            "expected",
            "actual",
        ],
    )

    writer.writeheader()
    writer.writerows(results)


category_counts = Counter(
    row["category"]
    for row in results
)

category_failures = Counter(
    row["category"]
    for row in results
    if row["result"] == "FAIL"
)


print()
print("=" * 72)
print(" MUTATION + STRESS RESULT")
print("=" * 72)

print(f"PASS : {passes}")
print(f"FAIL : {fails}")
print(f"TOTAL: {passes + fails}")

print()
print("Failures by category:")

for category in sorted(category_counts):
    print(
        f"  {category}: "
        f"{category_failures.get(category, 0)} "
        f"/ {category_counts[category]}"
    )

print()
print(f"REPORT: {csv_path}")

if concurrent_latencies:
    print()
    print(
        f"Concurrent average latency: "
        f"{statistics.mean(concurrent_latencies):.2f} ms"
    )

    print(
        f"Concurrent p95 latency: "
        f"{p95:.2f} ms"
    )

print()

if fails == 0:
    print(
        "ALL DDI MUTATION + STRESS TESTS PASSED."
    )
    sys.exit(0)

print(
    "MUTATION/STRESS REGRESSION FOUND FAILURES."
)
sys.exit(1)
