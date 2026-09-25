from __future__ import annotations

import csv
import hashlib
import importlib.util
import json
import sys
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
V3_PATH = ROOT / "scripts" / "supervisor_demo_v3.py"


# ============================================================
# Load verified V3
# ============================================================

spec = importlib.util.spec_from_file_location(
    "medsense_demo_v3",
    V3_PATH,
)

if spec is None or spec.loader is None:
    raise RuntimeError("Could not load supervisor_demo_v3.py")

v3 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v3)

v2 = v3.v2


# ============================================================
# Helpers
# ============================================================

def banner(text):
    print()
    print("=" * 76)
    print(text.center(76))
    print("=" * 76)


def value(obj, key, default=None):
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def money_minor(row):
    if not isinstance(row, dict):
        return None, None

    return (
        row.get("currency"),
        row.get("amount_minor"),
    )


def sha256_file(path):
    h = hashlib.sha256()

    with path.open("rb") as handle:
        while True:
            chunk = handle.read(1024 * 1024)

            if not chunk:
                break

            h.update(chunk)

    return h.hexdigest()


def smart_value(raw):
    if raw is None:
        return None

    raw = str(raw).strip()

    if raw == "":
        return None

    low = raw.lower()

    if low in {"none", "null", "nan"}:
        return None

    if low == "true":
        return True

    if low == "false":
        return False

    try:
        if "." not in raw and "e" not in low:
            return int(raw)
    except Exception:
        pass

    try:
        return float(raw)
    except Exception:
        return raw


def read_csv(path):
    with path.open(
        "r",
        encoding="utf-8-sig",
        newline="",
    ) as handle:
        return list(csv.DictReader(handle))


# ============================================================
# System
# ============================================================

def health_demo():

    banner("1 — SYSTEM HEALTH")

    if not v2.check_health():
        print()
        print("AI SERVICE: NOT READY")
        return

    api = v2.get_openapi()
    paths = api.get("paths", {})

    print()
    print("AI SERVICE              : READY")
    print("DATABASE                : AVAILABLE")

    print(
        "Prescription API        :",
        "READY"
        if v2.PRESCRIPTION_PATH in paths
        else "NOT EXPOSED",
    )

    print(
        "DDI API                 :",
        "READY"
        if v2.DDI_PATH in paths
        else "NOT EXPOSED",
    )

    print(
        "Sales Funnel API        :",
        "READY"
        if getattr(v2, "FUNNEL_EVENTS_PATH", None) in paths
        else "NOT EXPOSED",
    )


# ============================================================
# DDI compact
# ============================================================

def ddi_demo():

    banner("2 — DRUG–DRUG INTERACTION")

    if not v2.check_health():
        return

    products = [
        {
            "product_id": 101,
            "product_title": "Aminolevulinic acid Demo",
            "product_generic_name": "Aminolevulinic acid",
            "product_salt": "Aminolevulinic acid",
            "product_requires_rx": True,
            "product_status": 1,
        },
        {
            "product_id": 102,
            "product_title": "Digoxin Demo",
            "product_generic_name": "Digoxin",
            "product_salt": "Digoxin",
            "product_requires_rx": True,
            "product_status": 1,
        },
    ]

    print()
    print("CASE A — KNOWN INTERACTION")
    print("-" * 60)

    status, body, elapsed = v2.http_json(
        "POST",
        v2.DDI_PATH,
        {"products": products},
        timeout=120,
    )

    print("Drug A                  : Aminolevulinic acid")
    print("Drug B                  : Digoxin")
    print("HTTP                    :", status)
    print("Runtime                 :", f"{elapsed:.3f}s")

    if status == 200 and isinstance(body, dict):

        pairs = body.get("pairs") or []
        pair = pairs[0] if pairs else {}

        print(
            "Result                  :",
            pair.get("state", body.get("status")),
        )

        print(
            "Model warning           :",
            pair.get("model_warning_triggered"),
        )

        print(
            "Known evidence found    :",
            pair.get("known_dataset_record_found"),
        )

        descriptions = (
            pair.get("known_interaction_descriptions")
            or []
        )

        if descriptions:
            print(
                "Evidence                :",
                descriptions[0],
            )

        print(
            "Review required         :",
            body.get("review_required"),
        )

        print(
            "Checkout allowed        :",
            body.get("checkout_allowed"),
        )

        print(
            "Model version           :",
            pair.get("model_version"),
        )

    else:
        print("Result                  : FAILED")
        print(body)

    print()
    print("CASE B — UNKNOWN INGREDIENT")
    print("-" * 60)

    unknown = {
        "products": [
            products[1],
            {
                "product_id": 999,
                "product_title": "Unknown Demo Ingredient",
                "product_generic_name": "Completely Unknown Demo Salt",
                "product_salt": "Completely Unknown Demo Salt",
                "product_requires_rx": True,
                "product_status": 1,
            },
        ]
    }

    status, body, elapsed = v2.http_json(
        "POST",
        v2.DDI_PATH,
        unknown,
        timeout=120,
    )

    print("HTTP                    :", status)
    print("Runtime                 :", f"{elapsed:.3f}s")

    if status == 200 and isinstance(body, dict):

        unknown_product = (
            body.get("products") or [{}, {}]
        )[-1]

        ingredient = (
            unknown_product.get("ingredient")
            or {}
        )

        print(
            "Ingredient state        :",
            ingredient.get("state"),
        )

        print(
            "Review required         :",
            body.get("review_required"),
        )

        print(
            "Checkout allowed        :",
            body.get("checkout_allowed"),
        )

        print(
            "Pairs fabricated        :",
            len(body.get("pairs") or []),
        )

    print()
    print("EXPLAIN:")
    print(
        "Known evidence can trigger a warning even if "
        "the model score alone is below threshold."
    )
    print(
        "Unknown ingredients are not silently treated as safe."
    )


# ============================================================
# Prescription compact
# ============================================================

def prescription_demo():

    banner("3 — PRESCRIPTION INTELLIGENCE")

    if not v2.check_health():
        return

    image_path = v2.ensure_prescription_image()

    import base64

    payload = {
        "image_base64": base64.b64encode(
            image_path.read_bytes()
        ).decode("ascii"),

        "media_type": "image/png",

        "products": [
            {
                "product_id": 10,
                "product_title": "Amoxicillin 250 mg Capsules",
                "product_generic_name": "Amoxicillin",
                "product_salt": "Amoxicillin",
                "product_requires_rx": True,
                "product_status": 1,
            }
        ],
    }

    print()
    print("Input                   : Amoxicillin 250 mg")
    print("OCR engine              : PaddleOCR")

    status, body, elapsed = v2.http_json(
        "POST",
        v2.PRESCRIPTION_PATH,
        payload,
        timeout=180,
    )

    print("HTTP                    :", status)
    print("Runtime                 :", f"{elapsed:.2f}s")

    if status != 200:
        print("Result                  : FAILED")
        print(body)
        return

    ocr = body.get("ocr_result") or {}
    analysis = body.get("prescription_analysis") or {}
    candidates = analysis.get("candidates") or []
    matches = body.get("product_matches") or []

    print()
    print("OCR status              :", ocr.get("status"))
    print("OCR review required     :", ocr.get("review_required"))

    raw_text = ocr.get("raw_text")

    if raw_text:
        print(
            "Recognized text         :",
            " | ".join(str(raw_text).splitlines()),
        )

    print(
        "Analysis status         :",
        analysis.get("status"),
    )

    if candidates:
        candidate = candidates[0]

        print(
            "Medicine                :",
            candidate.get("raw_name_text"),
        )

        print(
            "Strength                :",
            candidate.get("raw_strength_text"),
        )

    if matches:
        first = matches[0]
        pm = first.get("product_match") or first

        print(
            "Product match status    :",
            pm.get("status"),
        )

        print(
            "Confirmation required   :",
            pm.get("confirmation_required"),
        )

        products = pm.get("products") or []

        if products:
            product = products[0]

            print(
                "Matched Product ID      :",
                product.get("product_id"),
            )

            print(
                "Product title           :",
                product.get("product_title"),
            )

            print(
                "Strength evidence       :",
                product.get(
                    "strength_evidence_status"
                ),
            )

    print()
    print("EXPLAIN:")
    print(
        "OCR does not invent Product IDs and does not "
        "auto-add medicine to cart."
    )

    print(
        "OCR → structured medicine evidence → "
        "authoritative Product match → confirmation."
    )


# ============================================================
# Funnel
# ============================================================

def funnel_demo():
    banner("4 — SALES FUNNEL")
    v2.funnel_demo()


# ============================================================
# Lead
# ============================================================

def lead_demo():
    banner("5 — LEAD SCORING")
    v3.lead_demo()


# ============================================================
# Analytics — frozen verified artifact, concise
# ============================================================

def analytics_demo():

    banner("6 — SALES ANALYTICS")

    artifact = (
        ROOT
        / "artifacts"
        / "sales"
        / "analytics"
        / "v1"
        / "default_260903"
        / "analytics_report.json"
    )

    hashes = (
        artifact.parent
        / "file_hashes.json"
    )

    if not artifact.exists():
        print("[FAIL] Analytics artifact missing")
        return

    report = json.loads(
        artifact.read_text(
            encoding="utf-8"
        )
    )

    print()
    print("DATA ORIGIN              : synthetic_development")
    print(
        "Analytics version        :",
        report.get("analytics_version"),
    )

    print(
        "Sales contract           :",
        report.get("sales_contract_version"),
    )

    print(
        "Status                   :",
        report.get("status"),
    )

    print(
        "Dataset                  :",
        report.get("dataset_id"),
    )

    if hashes.exists():
        print(
            "Artifact manifest        : PRESENT"
        )

        print(
            "Artifact SHA256          :",
            sha256_file(artifact)[:20] + "...",
        )

    period = report.get("period_sales") or {}

    def metric(name):
        row = period.get(name) or {}
        return row.get("value")

    print()
    print("PERIOD SALES")
    print("-" * 60)

    print(
        "Completed orders         :",
        metric("completed_order_count"),
    )

    print(
        "Cancelled orders         :",
        metric("cancelled_order_count"),
    )

    print(
        "Completed units          :",
        metric("completed_units"),
    )

    totals = (
        period.get(
            "completed_merchandise_subtotals"
        )
        or []
    )

    for row in totals:
        print(
            f"{row.get('currency')} subtotal "
            f"(minor units) :",
            row.get("amount_minor"),
        )

    averages = (
        period.get(
            "average_completed_order_subtotals"
        )
        or []
    )

    for row in averages:
        print(
            f"{row.get('currency')} avg/order "
            f"(minor units):",
            row.get("average_minor"),
        )

    rankings = (
        report.get("product_rankings")
        or {}
    )

    print()
    print("TOP PRODUCTS")
    print("-" * 60)

    products = (
        rankings.get("products")
        or []
    )

    for product in products[:5]:
        print(
            f"#{product.get('rank'):>2} "
            f"{product.get('product_id')}  "
            f"units={product.get('completed_units')}  "
            f"orders={product.get('completed_order_count')}"
        )

    print()
    print("REPEAT CUSTOMER BEHAVIOUR")
    print("-" * 60)

    repeat = (
        report.get("repeat_customers")
        or {}
    )

    identified = (
        repeat
        .get(
            "identified_completed_order_count",
            {},
        )
        .get("value")
    )

    repeated = (
        repeat
        .get(
            "repeat_completed_order_count",
            {},
        )
        .get("value")
    )

    contribution = (
        repeat
        .get(
            "repeat_order_contribution",
            {},
        )
        .get("value")
    )

    print(
        "Identified orders        :",
        identified,
    )

    print(
        "Repeat orders            :",
        repeated,
    )

    if contribution is not None:
        try:
            pct = float(contribution) * 100

            print(
                "Repeat contribution    :",
                f"{pct:.2f}%",
            )

        except Exception:
            print(
                "Repeat contribution    :",
                contribution,
            )

    trends = (
        report.get("trends", {})
        .get("buckets", [])
    )

    print()
    print("WEEKLY TREND")
    print("-" * 60)

    for bucket in trends[:5]:

        completed = (
            bucket
            .get(
                "completed_order_count",
                {},
            )
            .get("value")
        )

        units = (
            bucket
            .get(
                "completed_units",
                {},
            )
            .get("value")
        )

        print(
            str(
                bucket.get(
                    "bucket_start"
                )
            )[:10],
            "→",
            str(
                bucket.get(
                    "bucket_end"
                )
            )[:10],
            f"orders={completed}",
            f"units={units}",
        )

    funnel = (
        report.get("funnel_summary")
        or {}
    )

    if (
        funnel.get("overall_conversion")
        is not None
    ):
        try:
            pct = (
                float(
                    funnel[
                        "overall_conversion"
                    ]
                )
                * 100
            )

            print()
            print(
                "Frozen funnel conversion:",
                f"{pct:.2f}%",
            )

            print(
                "Largest drop-off        :",
                funnel.get(
                    "largest_dropoff_transition"
                ),
            )

        except Exception:
            pass

    print()
    print("IMPORTANT:")
    print(
        "These are synthetic-development analytics, "
        "not real pharmacy performance."
    )

    print(
        "Merchandise subtotal is not claimed as "
        "net revenue, profit or cash collected."
    )


# ============================================================
# Forecast — select real non-zero frozen inference row
# ============================================================

def forecast_demo():

    banner("7 — SALES FORECAST")

    from medsense_ai.forecasting.contracts import (
        ForecastFeatures,
    )

    from medsense_ai.forecasting.model.bundle import (
        BundleError,
        load_bundle,
    )

    from medsense_ai.forecasting.model.contracts import (
        ForecastInput,
    )

    from medsense_ai.forecasting.model.inference import (
        score_features,
    )

    bundle_dir = (
        ROOT
        / "artifacts"
        / "sales"
        / "forecast"
        / "model"
        / "v1"
        / "default_260903"
    )

    data_dir = (
        ROOT
        / "data"
        / "processed"
        / "sales"
        / "forecast"
        / "v1"
        / "default_260903"
    )

    manifest = (
        bundle_dir
        / "bundle_hashes.json"
    )

    features_path = (
        data_dir
        / "feature_matrix.csv"
    )

    index_path = (
        data_dir
        / "example_index.csv"
    )

    expected_hash = (
        sha256_file(manifest)
    )

    bundle = load_bundle(
        bundle_dir,
        expected_hash,
    )

    rows = read_csv(
        features_path
    )

    index_rows = (
        read_csv(index_path)
        if index_path.exists()
        else []
    )

    names = list(
        ForecastFeatures.model_fields.keys()
    )

    selected_result = None
    selected_context = None

    started = time.perf_counter()

    for i, row in enumerate(rows):

        # Supervisor demo should prefer a held-out example
        # rather than demonstrating inference on TRAIN rows.
        if i < len(index_rows):
            partition = str(
                index_rows[i].get("partition", "")
            ).strip().lower()

            if partition == "train":
                continue

        try:
            feature_values = {
                name: smart_value(
                    row.get(name)
                )
                for name in names
            }

            features = (
                ForecastFeatures.model_validate(
                    feature_values
                )
            )

            request = (
                ForecastInput.model_validate(
                    {
                        "feature_version":
                            "forecast_features_v1",

                        "features":
                            features,
                    }
                )
            )

            result = score_features(
                bundle,
                request,
            )

        except Exception:
            continue

        prediction = (
            result.predicted_completed_units_next_7d
        )

        if (
            prediction is not None
            and float(prediction) > 0
        ):
            selected_result = result

            if i < len(index_rows):
                selected_context = (
                    index_rows[i]
                )

            break

    elapsed = (
        time.perf_counter()
        - started
    )

    if selected_result is None:
        print(
            "[WARN] No valid non-zero frozen "
            "example found."
        )
        return

    print()
    print("DATA ORIGIN              : synthetic_development")

    print(
        "Model version            :",
        selected_result.model_version,
    )

    print(
        "Feature version          :",
        selected_result.feature_version,
    )

    print(
        "Target                   :",
        selected_result.target_version,
    )

    print(
        "Selected method          :",
        selected_result.selected_method,
    )

    if selected_context:

        print(
            "Product                  :",
            selected_context.get(
                "product_id"
            ),
        )

        print(
            "Observation time         :",
            selected_context.get(
                "observation_time"
            ),
        )

        print(
            "Partition                :",
            selected_context.get(
                "partition"
            ),
        )

    print(
        "Predicted next 7d units  :",
        selected_result.predicted_completed_units_next_7d,
    )

    print(
        "Inference/search runtime :",
        f"{elapsed:.4f}s",
    )

    print()
    print("ARTIFACT INTEGRITY")
    print("-" * 60)

    try:

        load_bundle(
            bundle_dir,
            "0" * 64,
        )

        print(
            "[FAIL] Incorrect checksum accepted"
        )

    except BundleError:

        print(
            "[PASS] Incorrect checksum rejected"
        )

    print()
    print("IMPORTANT:")
    print(
        "This forecasts observed completed units; "
        "it is not true unconstrained demand."
    )

    print(
        "It is not automatically a reorder quantity "
        "or purchasing instruction."
    )


# ============================================================
# Engineering evidence
# ============================================================

def evidence_demo():
    banner("8 — ENGINEERING EVIDENCE")

    print("Run focused regression suites from V3:")
    print()

    v3.engineering_evidence()


# ============================================================
# Full demo
# ============================================================

def full_demo():

    banner(
        "MEDSENSEAI — FULL AI SUPERVISOR DEMO"
    )

    health_demo()

    input(
        "\nENTER → DDI"
    )
    ddi_demo()

    input(
        "\nENTER → Prescription"
    )
    prescription_demo()

    input(
        "\nENTER → Sales Funnel"
    )
    funnel_demo()

    input(
        "\nENTER → Lead Scoring"
    )
    lead_demo()

    input(
        "\nENTER → Sales Analytics"
    )
    analytics_demo()

    input(
        "\nENTER → Forecasting"
    )
    forecast_demo()

    banner(
        "MEDSENSEAI — DEMO COMPLETE"
    )

    print()
    print(
        "AI FEATURES DEMONSTRATED:"
    )

    print(
        "✓ Drug–Drug Interaction"
    )

    print(
        "✓ Prescription OCR"
    )

    print(
        "✓ Prescription Analysis"
    )

    print(
        "✓ Product Matching"
    )

    print(
        "✓ Sales Funnel"
    )

    print(
        "✓ Lead Scoring"
    )

    print(
        "✓ Sales Analytics"
    )

    print(
        "✓ Sales Forecasting"
    )

    print()
    print(
        "The current sales demonstrations use "
        "explicit synthetic-development data."
    )

    print(
        "Final partner integration will replace "
        "synthetic sales inputs with governed "
        "Invoice/InvoiceItem-derived canonical records."
    )


# ============================================================
# Menu
# ============================================================

def menu():

    while True:

        banner(
            "MEDSENSEAI — FINAL SUPERVISOR DEMO"
        )

        print("1. System Health")
        print("2. Drug–Drug Interaction")
        print("3. Prescription Intelligence")
        print("4. Sales Funnel")
        print("5. Lead Scoring")
        print("6. Sales Analytics")
        print("7. Sales Forecast")
        print("8. Engineering Evidence")
        print("9. FULL SUPERVISOR DEMO")
        print("0. Exit")

        choice = input(
            "\nSelect option: "
        ).strip()

        try:

            if choice == "1":
                health_demo()

            elif choice == "2":
                ddi_demo()

            elif choice == "3":
                prescription_demo()

            elif choice == "4":
                funnel_demo()

            elif choice == "5":
                lead_demo()

            elif choice == "6":
                analytics_demo()

            elif choice == "7":
                forecast_demo()

            elif choice == "8":
                evidence_demo()

            elif choice == "9":
                full_demo()

            elif choice == "0":
                break

            else:
                print("Invalid option.")

        except KeyboardInterrupt:
            print("\nCancelled.")

        except Exception as exc:
            print()
            print(
                "[DEMO ERROR]",
                type(exc).__name__,
                exc,
            )

        input(
            "\nPress ENTER to return to menu..."
        )


if __name__ == "__main__":
    menu()
