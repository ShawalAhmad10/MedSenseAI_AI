from __future__ import annotations

import csv
import itertools
import json
import statistics
import sys
import time
from collections import Counter
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


BASE_URL = "http://127.0.0.1:8000"
ENDPOINT = f"{BASE_URL}/api/v1/integrations/amna/ddi/cart-check"

AI_ROOT = Path(__file__).resolve().parent
PRODUCT_FILE = AI_ROOT / "artifacts" / "ddi" / "live_neon_products.json"

REPORT_DIR = AI_ROOT / "artifacts" / "ddi" / "regression"
REPORT_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_STATUS = {
    "CLEAR_WITH_LIMITATIONS",
    "WARNING_CHECKOUT_ALLOWED",
    "WARNING_REVIEW_REQUIRED",
    "UNRESOLVED_REVIEW_REQUIRED",
    "SERVICE_UNAVAILABLE",
}

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

HARD_UNRESOLVED_STATES = {
    "SOURCE_UNAVAILABLE",
    "UNMAPPED",
    "AMBIGUOUS",
    "REVIEW_REQUIRED",
    "MODEL_UNSUPPORTED",
}


def request_ddi(products):
    payload = json.dumps(
        {"products": products},
        ensure_ascii=False,
    ).encode("utf-8")

    req = Request(
        ENDPOINT,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    started = time.perf_counter()

    try:
        with urlopen(req, timeout=30) as response:
            body = response.read().decode("utf-8")
            elapsed = (time.perf_counter() - started) * 1000

            return response.status, json.loads(body), elapsed, None

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
    if not PRODUCT_FILE.exists():
        raise FileNotFoundError(
            f"Product export not found: {PRODUCT_FILE}"
        )

    payload = json.loads(
        PRODUCT_FILE.read_text(encoding="utf-8-sig")
    )

    if isinstance(payload, list):
        products = payload

    elif isinstance(payload, dict):
        for key in (
            "products",
            "rows",
            "data",
            "items",
        ):
            if isinstance(payload.get(key), list):
                products = payload[key]
                break
        else:
            raise ValueError(
                "Could not locate product list in JSON."
            )

    else:
        raise ValueError("Unsupported product JSON structure.")

    required = {
        "product_id",
        "product_title",
        "product_generic_name",
        "product_salt",
        "product_requires_rx",
        "product_status",
    }

    cleaned = []

    for item in products:
        missing = required - set(item)

        if missing:
            raise ValueError(
                f"Product {item.get('product_id')} "
                f"missing fields: {sorted(missing)}"
            )

        cleaned.append({
            "product_id": int(item["product_id"]),
            "product_title": item["product_title"],
            "product_generic_name": item["product_generic_name"],
            "product_salt": item["product_salt"],
            "product_requires_rx": item["product_requires_rx"],
            "product_status": int(item["product_status"]),
        })

    cleaned.sort(
        key=lambda x: x["product_id"]
    )

    return cleaned


def product_resolution_map(response):
    result = {}

    for p in response.get("products", []):
        ing = p.get("ingredient") or {}

        result[int(p["product_id"])] = {
            "state": ing.get("state"),
            "canonical": ing.get(
                "canonical_display_name"
            ),
            "token": ing.get(
                "frozen_model_token"
            ),
            "identity_namespace": ing.get(
                "identity_namespace"
            ),
            "identity_id": ing.get(
                "identity_id"
            ),
        }

    return result


def pair_signature(pair):
    return (
        tuple(sorted(pair.get("product_ids_a") or [])),
        tuple(sorted(pair.get("product_ids_b") or [])),
        pair.get("ingredient_a"),
        pair.get("ingredient_b"),
        pair.get("state"),
        pair.get("interaction_found"),
        pair.get("severity"),
        pair.get("warning_triggered"),
    )


def has_same_product_only_pair(pair):
    ids_a = pair.get("product_ids_a") or []
    ids_b = pair.get("product_ids_b") or []

    if not ids_a or not ids_b:
        return True

    return not any(
        a != b
        for a in ids_a
        for b in ids_b
    )


def percentile(values, p):
    if not values:
        return None

    values = sorted(values)

    index = int(
        round(
            (len(values) - 1)
            * p
        )
    )

    return values[index]


products = load_products()

print()
print("=" * 72)
print(" MEDSENSEAI EXHAUSTIVE DDI REGRESSION")
print("=" * 72)
print(f"Products loaded : {len(products)}")

if len(products) != 117:
    print(
        f"[FAIL] Expected 117 products, "
        f"found {len(products)}"
    )
    sys.exit(1)

expected_pairs = (
    len(products)
    * (len(products) - 1)
    // 2
)

print(f"Unique pairs    : {expected_pairs}")
print()


# ============================================================
# PHASE A — ALL 117 PRODUCTS INDIVIDUALLY
# ============================================================

print(
    "PHASE A — SINGLE PRODUCT BASELINES"
)

single_baseline = {}
single_rows = []
single_failures = []

single_status_counts = Counter()
single_state_counts = Counter()

for index, product in enumerate(products, 1):

    http, response, ms, error = request_ddi(
        [product]
    )

    pid = product["product_id"]

    if http != 200 or response is None:

        single_failures.append({
            "product_id": pid,
            "product_title": product["product_title"],
            "error": (
                error
                or f"HTTP {http}"
            ),
        })

        print(
            f"[FAIL] SINGLE {pid} "
            f"{product['product_title']}"
        )

        continue

    status = response.get("status")

    resolutions = product_resolution_map(
        response
    )

    resolution = resolutions.get(pid, {})

    state = resolution.get("state")

    errors = []

    if status not in ALLOWED_STATUS:
        errors.append(
            f"invalid status={status}"
        )

    if response.get(
        "checkout_allowed"
    ) != CHECKOUT_CONTRACT.get(status):

        errors.append(
            "checkout contract mismatch"
        )

    if response.get(
        "review_required"
    ) != REVIEW_CONTRACT.get(status):

        errors.append(
            "review contract mismatch"
        )

    if len(response.get("products", [])) != 1:
        errors.append(
            "single request did not return one product"
        )

    # Single medicine must never create a cart-level
    # cross-product DDI pair.
    if response.get("pairs"):
        errors.append(
            f"single product returned "
            f"{len(response['pairs'])} DDI pair(s)"
        )

    if state in HARD_UNRESOLVED_STATES:
        if status != "UNRESOLVED_REVIEW_REQUIRED":
            errors.append(
                f"{state} did not force unresolved review"
            )

        if response.get("checkout_allowed"):
            errors.append(
                f"{state} incorrectly allowed checkout"
            )

    single_baseline[pid] = {
        "status": status,
        "state": state,
        "canonical": resolution.get(
            "canonical"
        ),
        "token": resolution.get("token"),
        "checkout": response.get(
            "checkout_allowed"
        ),
        "review": response.get(
            "review_required"
        ),
    }

    single_status_counts[status] += 1
    single_state_counts[state] += 1

    row = {
        "product_id": pid,
        "product_title": product["product_title"],
        "product_salt": product["product_salt"],
        "status": status,
        "state": state,
        "canonical": resolution.get(
            "canonical"
        ),
        "checkout_allowed": response.get(
            "checkout_allowed"
        ),
        "review_required": response.get(
            "review_required"
        ),
        "latency_ms": round(ms, 2),
        "errors": " | ".join(errors),
    }

    single_rows.append(row)

    if errors:
        single_failures.append(row)

    if index % 20 == 0 or index == len(products):
        print(
            f"  {index}/{len(products)} singles tested"
        )


# ============================================================
# PHASE B — ALL 6,786 PRODUCT PAIRS
# ============================================================

print()
print(
    "PHASE B — ALL UNIQUE PRODUCT PAIRS"
)

pair_rows = []
pair_failures = []

status_counts = Counter()
interaction_pair_count = 0
exact_evidence_count = 0
warning_pair_count = 0

latencies = []

pairs = list(
    itertools.combinations(
        products,
        2,
    )
)

for index, (a, b) in enumerate(pairs, 1):

    http, response, ms, error = request_ddi(
        [a, b]
    )

    latencies.append(ms)

    id_a = a["product_id"]
    id_b = b["product_id"]

    errors = []

    if http != 200 or response is None:

        errors.append(
            error or f"HTTP {http}"
        )

        row = {
            "product_id_a": id_a,
            "product_a": a["product_title"],
            "product_id_b": id_b,
            "product_b": b["product_title"],
            "status": "",
            "pair_result_count": "",
            "interaction_count": "",
            "latency_ms": round(ms, 2),
            "errors": " | ".join(errors),
        }

        pair_rows.append(row)
        pair_failures.append(row)

        continue

    status = response.get("status")

    status_counts[status] += 1

    if status not in ALLOWED_STATUS:
        errors.append(
            f"invalid cart status={status}"
        )

    expected_checkout = (
        CHECKOUT_CONTRACT.get(status)
    )

    if (
        response.get("checkout_allowed")
        != expected_checkout
    ):
        errors.append(
            "checkout contract mismatch"
        )

    expected_review = (
        REVIEW_CONTRACT.get(status)
    )

    if (
        response.get("review_required")
        != expected_review
    ):
        errors.append(
            "review contract mismatch"
        )

    returned_products = (
        product_resolution_map(response)
    )

    if set(returned_products) != {
        id_a,
        id_b,
    }:
        errors.append(
            "response product IDs do not "
            "match request"
        )

    # Product resolution should not mutate merely
    # because another medicine was added to cart.
    for pid in (id_a, id_b):

        baseline = single_baseline.get(pid)

        current = returned_products.get(pid)

        if not baseline or not current:
            continue

        if (
            current.get("state")
            != baseline.get("state")
        ):
            errors.append(
                f"product {pid} state changed "
                f"{baseline.get('state')} -> "
                f"{current.get('state')}"
            )

        if (
            current.get("canonical")
            != baseline.get("canonical")
        ):
            errors.append(
                f"product {pid} canonical identity changed"
            )

    baseline_a = single_baseline.get(
        id_a,
        {}
    )

    baseline_b = single_baseline.get(
        id_b,
        {}
    )

    any_hard_unresolved = (
        baseline_a.get("state")
        in HARD_UNRESOLVED_STATES
        or
        baseline_b.get("state")
        in HARD_UNRESOLVED_STATES
    )

    if any_hard_unresolved:

        if (
            status
            != "UNRESOLVED_REVIEW_REQUIRED"
        ):
            errors.append(
                "unresolved ingredient did not "
                "dominate cart workflow"
            )

        if response.get("checkout_allowed"):
            errors.append(
                "unresolved cart allowed checkout"
            )

    response_pairs = response.get(
        "pairs",
        []
    )

    signatures = [
        pair_signature(p)
        for p in response_pairs
    ]

    if len(signatures) != len(
        set(signatures)
    ):
        errors.append(
            "duplicate DDI pair result emitted"
        )

    for pair in response_pairs:

        pair_ids = set(
            (pair.get("product_ids_a") or [])
            +
            (pair.get("product_ids_b") or [])
        )

        if not pair_ids.issubset(
            {id_a, id_b}
        ):
            errors.append(
                "DDI pair references product "
                "outside request"
            )

        if has_same_product_only_pair(pair):
            errors.append(
                "same-product-only DDI pair leaked"
            )

        if pair.get("warning_triggered"):
            warning_pair_count += 1

        if pair.get("interaction_found"):
            interaction_pair_count += 1

        if pair.get(
            "known_dataset_record_found"
        ):
            exact_evidence_count += 1

    interaction_count = sum(
        1
        for p in response_pairs
        if p.get("interaction_found")
    )

    row = {
        "product_id_a": id_a,
        "product_a": a["product_title"],
        "salt_a": a["product_salt"],
        "state_a": returned_products.get(
            id_a,
            {},
        ).get("state"),

        "product_id_b": id_b,
        "product_b": b["product_title"],
        "salt_b": b["product_salt"],
        "state_b": returned_products.get(
            id_b,
            {},
        ).get("state"),

        "status": status,
        "checkout_allowed": response.get(
            "checkout_allowed"
        ),
        "review_required": response.get(
            "review_required"
        ),
        "highest_severity": response.get(
            "highest_severity"
        ),
        "pair_result_count": len(
            response_pairs
        ),
        "interaction_count": interaction_count,
        "latency_ms": round(ms, 2),
        "errors": " | ".join(
            sorted(set(errors))
        ),
    }

    pair_rows.append(row)

    if errors:
        pair_failures.append(row)

    if (
        index % 250 == 0
        or index == expected_pairs
    ):
        print(
            f"  {index}/{expected_pairs} "
            f"pairs tested"
        )


# ============================================================
# PHASE C — CART SIZE / REQUEST BOUNDARIES
# ============================================================

print()
print(
    "PHASE C — REQUEST BOUNDARIES"
)

boundary_rows = []
boundary_failures = []


def boundary(
    name,
    payload,
    expected_http,
):
    http, response, ms, error = request_ddi(
        payload
    )

    ok = http == expected_http

    row = {
        "test": name,
        "expected_http": expected_http,
        "actual_http": http,
        "passed": ok,
        "latency_ms": round(ms, 2),
        "error": error or "",
    }

    boundary_rows.append(row)

    if not ok:
        boundary_failures.append(row)

    print(
        f"  [{'PASS' if ok else 'FAIL'}] "
        f"{name}: HTTP {http}"
    )


# 100 is the contract maximum.
boundary(
    "100 products accepted",
    products[:100],
    200,
)


# For empty/101 we need direct raw POST because
# request_ddi always expects a list but still works.
boundary(
    "empty product array rejected",
    [],
    422,
)

boundary(
    "101 products rejected",
    products[:101],
    422,
)


# ============================================================
# REPORTS
# ============================================================

stamp = time.strftime(
    "%Y%m%d-%H%M%S"
)

single_csv = (
    REPORT_DIR
    / f"ddi_exhaustive_singles_{stamp}.csv"
)

pair_csv = (
    REPORT_DIR
    / f"ddi_exhaustive_pairs_{stamp}.csv"
)

failure_csv = (
    REPORT_DIR
    / f"ddi_exhaustive_failures_{stamp}.csv"
)

summary_json = (
    REPORT_DIR
    / f"ddi_exhaustive_summary_{stamp}.json"
)


def write_csv(path, rows):
    if not rows:
        return

    fields = []

    for row in rows:
        for key in row:
            if key not in fields:
                fields.append(key)

    with path.open(
        "w",
        newline="",
        encoding="utf-8-sig",
    ) as f:

        writer = csv.DictWriter(
            f,
            fieldnames=fields,
        )

        writer.writeheader()
        writer.writerows(rows)


write_csv(
    single_csv,
    single_rows,
)

write_csv(
    pair_csv,
    pair_rows,
)

all_failures = []

for f in single_failures:
    all_failures.append({
        "phase": "SINGLE",
        **f,
    })

for f in pair_failures:
    all_failures.append({
        "phase": "PAIR",
        **f,
    })

for f in boundary_failures:
    all_failures.append({
        "phase": "BOUNDARY",
        **f,
    })

write_csv(
    failure_csv,
    all_failures,
)


summary = {
    "product_count": len(products),
    "unique_pair_count": expected_pairs,

    "single_failures": len(
        single_failures
    ),

    "pair_failures": len(
        pair_failures
    ),

    "boundary_failures": len(
        boundary_failures
    ),

    "single_status_counts": dict(
        single_status_counts
    ),

    "single_state_counts": dict(
        single_state_counts
    ),

    "pair_status_counts": dict(
        status_counts
    ),

    "interaction_pair_rows": (
        interaction_pair_count
    ),

    "known_evidence_rows": (
        exact_evidence_count
    ),

    "warning_pair_rows": (
        warning_pair_count
    ),

    "latency_ms": {
        "average": (
            round(
                statistics.mean(latencies),
                2,
            )
            if latencies
            else None
        ),

        "p50": (
            round(
                percentile(
                    latencies,
                    0.50,
                ),
                2,
            )
            if latencies
            else None
        ),

        "p95": (
            round(
                percentile(
                    latencies,
                    0.95,
                ),
                2,
            )
            if latencies
            else None
        ),

        "max": (
            round(
                max(latencies),
                2,
            )
            if latencies
            else None
        ),
    },

    "reports": {
        "singles": str(single_csv),
        "pairs": str(pair_csv),
        "failures": str(failure_csv),
    },
}

summary_json.write_text(
    json.dumps(
        summary,
        indent=2,
        ensure_ascii=False,
    ),
    encoding="utf-8",
)


total_failures = (
    len(single_failures)
    +
    len(pair_failures)
    +
    len(boundary_failures)
)


print()
print("=" * 72)
print(" EXHAUSTIVE DDI REGRESSION RESULT")
print("=" * 72)

print(
    f"Products tested             : "
    f"{len(products)}/117"
)

print(
    f"Unique product pairs tested : "
    f"{len(pair_rows)}/{expected_pairs}"
)

print(
    f"Single failures             : "
    f"{len(single_failures)}"
)

print(
    f"Pair failures               : "
    f"{len(pair_failures)}"
)

print(
    f"Boundary failures           : "
    f"{len(boundary_failures)}"
)

print()
print(
    "Single states:"
)

for key, value in sorted(
    single_state_counts.items()
):
    print(
        f"  {key}: {value}"
    )

print()
print(
    "Pair workflow statuses:"
)

for key, value in sorted(
    status_counts.items()
):
    print(
        f"  {key}: {value}"
    )

print()
print(
    f"Interaction result rows     : "
    f"{interaction_pair_count}"
)

print(
    f"Exact evidence rows         : "
    f"{exact_evidence_count}"
)

print(
    f"Warning rows                : "
    f"{warning_pair_count}"
)

if latencies:
    print()
    print(
        f"Average latency             : "
        f"{summary['latency_ms']['average']} ms"
    )

    print(
        f"P50 latency                 : "
        f"{summary['latency_ms']['p50']} ms"
    )

    print(
        f"P95 latency                 : "
        f"{summary['latency_ms']['p95']} ms"
    )

    print(
        f"Maximum latency             : "
        f"{summary['latency_ms']['max']} ms"
    )

print()
print(
    f"FAILURES                    : "
    f"{total_failures}"
)

print()
print(
    f"Summary : {summary_json}"
)

print(
    f"Failures: {failure_csv}"
)

print(
    f"Pairs   : {pair_csv}"
)

print()

if total_failures == 0:
    print(
        "ALL EXHAUSTIVE DDI REGRESSION "
        "INVARIANTS PASSED."
    )
    sys.exit(0)

print(
    "EXHAUSTIVE REGRESSION FOUND FAILURES."
)

sys.exit(1)
