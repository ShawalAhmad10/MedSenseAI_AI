"""
MedSenseAI Supervisor Demo V3
=============================

Reuses the verified V2 live demos for:
- Health / routes
- Prescription OCR + Analysis + Product Match
- DDI
- Sales Funnel

Adds direct frozen-core demos for:
- Lead Scoring
- Sales Analytics
- Sales Forecasting

No fake production results are generated.
Synthetic-development results are explicitly labelled.
"""

from __future__ import annotations

import csv
import hashlib
import importlib.util
import json
import shutil
import subprocess
import sys
import time

from datetime import datetime, timedelta, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
V2_PATH = ROOT / "scripts" / "supervisor_demo.py"

OCR_PYTHON = (
    ROOT
    / ".venv-ocr"
    / "Scripts"
    / "python.exe"
)

if not OCR_PYTHON.exists():
    OCR_PYTHON = Path(sys.executable)


# ============================================================
# Load already-verified V2 without running its menu
# ============================================================

spec = importlib.util.spec_from_file_location(
    "medsense_supervisor_demo_v2",
    V2_PATH,
)

if spec is None or spec.loader is None:
    raise RuntimeError(
        "Unable to load existing supervisor_demo.py"
    )

v2 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v2)


# ============================================================
# Helpers
# ============================================================

def banner(text):
    print()
    print("=" * 78)
    print(text.center(78))
    print("=" * 78)


def pretty(value):
    if hasattr(value, "model_dump"):
        value = value.model_dump(mode="json")

    return json.dumps(
        value,
        indent=2,
        ensure_ascii=False,
        default=str,
    )


def sha256_file(path):
    h = hashlib.sha256()

    with path.open("rb") as handle:
        while True:
            block = handle.read(1024 * 1024)

            if not block:
                break

            h.update(block)

    return h.hexdigest()


def smart_value(value):
    """
    Convert CSV string values to sensible Python scalar values.
    Frozen Pydantic contracts perform final strict validation.
    """

    if value is None:
        return None

    value = str(value).strip()

    if value == "":
        return None

    lower = value.lower()

    if lower in {
        "none",
        "null",
        "nan",
        "na",
    }:
        return None

    if lower == "true":
        return True

    if lower == "false":
        return False

    try:
        if (
            "." not in value
            and "e" not in lower
        ):
            return int(value)
    except Exception:
        pass

    try:
        return float(value)
    except Exception:
        return value


def read_csv(path):
    with path.open(
        "r",
        encoding="utf-8-sig",
        newline="",
    ) as handle:

        return list(
            csv.DictReader(handle)
        )


def run_pytest(label, targets):
    existing = [
        ROOT / target
        for target in targets
        if (ROOT / target).exists()
    ]

    print()
    print(label)
    print("-" * len(label))

    if not existing:
        print("[WARN] Test files not found.")
        return False

    temp = ROOT / ".pytest-supervisor-v3"

    shutil.rmtree(
        temp,
        ignore_errors=True,
    )

    command = [
        str(OCR_PYTHON),
        "-m",
        "pytest",
        "-q",
        *[
            str(path.relative_to(ROOT))
            for path in existing
        ],
        f"--basetemp={temp}",
    ]

    started = time.perf_counter()

    result = subprocess.run(
        command,
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        encoding="utf-8",
        errors="replace",
    )

    elapsed = time.perf_counter() - started

    print(result.stdout.rstrip())
    print()
    print(f"Runtime: {elapsed:.2f}s")

    if result.returncode == 0:
        print("[PASS]")
        return True

    print("[FAIL]")
    return False


# ============================================================
# Lead Scoring
# ============================================================

def lead_demo():

    banner(
        "LIVE FROZEN LEAD SCORING DEMO"
    )

    from medsense_ai.lead_scoring.contracts import (
        FEATURE_NAMES,
    )

    from medsense_ai.lead_scoring.model.bundle import (
        load_bundle,
    )

    from medsense_ai.lead_scoring.model.contracts import (
        ScoringInput,
    )

    from medsense_ai.lead_scoring.model.inference import (
        score_features,
        score_local,
    )

    bundle_dir = (
        ROOT
        / "artifacts"
        / "sales"
        / "lead"
        / "model"
        / "v1"
        / "default_260903"
    )

    feature_file = (
        ROOT
        / "data"
        / "processed"
        / "sales"
        / "lead"
        / "v1"
        / "default_260903"
        / "feature_matrix.csv"
    )

    manifest = (
        bundle_dir
        / "bundle_hashes.json"
    )

    for required in [
        bundle_dir,
        feature_file,
        manifest,
    ]:
        if not required.exists():
            print(
                "[FAIL] Missing:",
                required,
            )
            return

    expected_hash = sha256_file(
        manifest
    )

    rows = read_csv(
        feature_file
    )

    request = None
    selected_row = None

    for row in rows:

        candidate_features = {
            name: smart_value(
                row.get(name)
            )
            for name in FEATURE_NAMES
        }

        try:

            candidate = (
                ScoringInput.model_validate(
                    {
                        "feature_version":
                            "lead_features_v1",

                        "features":
                            candidate_features,
                    }
                )
            )

        except Exception:
            continue

        request = candidate
        selected_row = row
        break

    if request is None:
        print(
            "[FAIL] No valid frozen "
            "feature row could be loaded."
        )
        return

    print()
    print("MODEL ARTIFACT")
    print("-" * 60)

    print(
        "Bundle:",
        bundle_dir,
    )

    print(
        "Manifest SHA256:",
        expected_hash,
    )

    print()

    print(
        "DATA ORIGIN:"
    )

    print(
        "synthetic_development"
    )

    print()
    print(
        "Loading integrity-pinned "
        "frozen lead model..."
    )

    started = time.perf_counter()

    bundle = load_bundle(
        bundle_dir,
        expected_hash,
    )

    result = score_features(
        bundle,
        request,
    )

    elapsed = (
        time.perf_counter()
        - started
    )

    print()
    print("LEAD RESULT")
    print("-" * 60)

    print(
        "Status:",
        result.status,
    )

    print(
        "Model version:",
        result.model_version,
    )

    print(
        "Feature version:",
        result.feature_version,
    )

    print(
        "Target:",
        result.target_version,
    )

    print(
        "Probability:",
        result.model_probability,
    )

    print(
        "Lead score:",
        result.lead_score,
    )

    print(
        "Technical threshold:",
        result.technical_threshold,
    )

    print(
        "Technical binary prediction:",
        result.technical_binary_prediction,
    )

    print(
        "Runtime:",
        f"{elapsed:.4f}s",
    )

    if selected_row:

        interesting = [
            "purchase_count_7d",
            "purchase_count_30d",
            "purchase_count_60d",
            "purchase_recency_days",
            "session_count_30d",
            "product_view_count_30d",
            "cart_add_count_30d",
        ]

        print()
        print("SAMPLE INPUT FEATURES")
        print("-" * 60)

        for field in interesting:

            if field in selected_row:
                print(
                    f"{field:32}: "
                    f"{selected_row[field]}"
                )

    print()
    print("FAIL-CLOSED INPUT TEST")
    print("-" * 60)

    invalid = (
        request.model_dump(
            mode="python"
        )
    )

    invalid[
        "features"
    ][
        "customer_id"
    ] = "not-an-approved-feature"

    invalid_result = score_local(
        bundle_dir,
        expected_hash,
        invalid,
    )

    print(
        "Invalid payload status:",
        invalid_result.status,
    )

    print(
        "Lead score returned:",
        invalid_result.lead_score,
    )

    print(
        "Reason:",
        invalid_result.reason,
    )

    print()
    print("WHAT TO EXPLAIN")
    print("-" * 60)

    print(
        "Lead Scoring uses a frozen "
        "feature contract and frozen model."
    )

    print(
        "The score is 100 x model probability."
    )

    print(
        "Unknown or unapproved features are "
        "rejected instead of silently used."
    )

    print(
        "Current model was trained on "
        "synthetic-development data."
    )

    print(
        "It is NOT being claimed as a "
        "validated real-customer conversion probability."
    )


# ============================================================
# Sales Analytics
# ============================================================

_ANALYTICS_CACHE = None


def build_demo_sales_dataset():

    global _ANALYTICS_CACHE

    if _ANALYTICS_CACHE is not None:
        return _ANALYTICS_CACHE

    from medsense_ai.sales_data.synthetic import (
        generate,
        profile_config,
    )

    end = datetime(
        2026,
        9,
        1,
        tzinfo=timezone.utc,
    )

    start = (
        end
        - timedelta(
            days=120
        )
    )

    config = profile_config(
        "default",
        master_seed=260903,
        start=start,
        end=end,
        customers=120,
        products=20,
        scenario="clean",
    )

    print(
        "Generating deterministic "
        "controlled sales dataset..."
    )

    generated = generate(
        config
    )

    _ANALYTICS_CACHE = (
        config,
        generated,
    )

    return _ANALYTICS_CACHE


def show_currency_rows(
    rows,
    label,
):

    print()
    print(label)
    print("-" * 60)

    if not rows:
        print("(none)")
        return

    for row in rows:

        print(
            f"{row.currency}: "
            f"status={row.status}, "
            f"amount_minor={row.amount_minor}, "
            f"average_minor={row.average_minor}"
        )


def analytics_demo():

    banner(
        "LIVE DETERMINISTIC SALES ANALYTICS DEMO"
    )

    from medsense_ai.sales_analytics import (
        SalesAnalyticsRequest,
        analyze_sales,
    )

    try:

        (
            config,
            generated,
        ) = build_demo_sales_dataset()

        data = generated.dataset

        extracted_at = (
            data.manifest.extracted_at
        )

        request = SalesAnalyticsRequest(

            source_namespace=(
                data.manifest.source_namespace
            ),

            dataset_id=(
                data.manifest.dataset_id
            ),

            report_start=(
                config.start
            ),

            report_end=(
                config.end
            ),

            knowledge_cutoff=(
                extracted_at
            ),

            customer_history_start=(
                config.start
            ),

            bucket_granularity="month",

            ranking_limit_n=5,
        )

        started = time.perf_counter()

        report = analyze_sales(
            data,
            request,
        )

        elapsed = (
            time.perf_counter()
            - started
        )

    except Exception as exc:

        print()
        print(
            "[WARN] Live analytics "
            "recomputation failed:"
        )

        print(
            type(exc).__name__,
            exc,
        )

        print()
        print(
            "Loading frozen analytics "
            "artifact as fallback."
        )

        artifact = (
            ROOT
            / "artifacts"
            / "sales"
            / "analytics"
            / "v1"
            / "default_260903"
            / "analytics_report.json"
        )

        if not artifact.exists():
            print(
                "[FAIL] Frozen analytics "
                "artifact also missing."
            )
            return

        payload = json.loads(
            artifact.read_text(
                encoding="utf-8"
            )
        )

        print(
            pretty(payload)
        )

        return

    print()
    print("REPORT IDENTITY")
    print("-" * 60)

    print(
        "Analytics version:",
        report.analytics_version,
    )

    print(
        "Sales contract:",
        report.sales_contract_version,
    )

    print(
        "Source:",
        report.source_namespace,
    )

    print(
        "Dataset:",
        report.dataset_id,
    )

    print(
        "Status:",
        report.status,
    )

    print(
        "Analytics runtime:",
        f"{elapsed:.4f}s",
    )

    print()

    print("PERIOD SALES")
    print("-" * 60)

    period = report.period_sales

    print(
        "Completed orders:",
        period.completed_order_count.value,
    )

    print(
        "Cancelled orders:",
        period.cancelled_order_count.value,
    )

    print(
        "Completed units:",
        period.completed_units.value,
    )

    print(
        "Identified completed orders:",
        period.identified_completed_order_count.value,
    )

    print(
        "Anonymous completed orders:",
        period.anonymous_completed_order_count.value,
    )

    show_currency_rows(
        period.completed_merchandise_subtotals,
        "COMPLETED MERCHANDISE SUBTOTALS",
    )

    show_currency_rows(
        period.average_completed_order_subtotals,
        "AVERAGE COMPLETED ORDER SUBTOTALS",
    )

    print()
    print("PRODUCT PERFORMANCE")
    print("-" * 60)

    rankings = report.product_rankings

    print(
        "Status:",
        rankings.status,
    )

    print(
        "High sellers:",
        list(
            rankings.high_seller_product_ids
        ),
    )

    print(
        "Low sellers:",
        list(
            rankings.low_seller_product_ids
        ),
    )

    for product in (
        rankings.products[:5]
    ):

        print(
            f"#{product.rank} "
            f"{product.product_id}: "
            f"units={product.completed_units}, "
            f"orders={product.completed_order_count}"
        )

    print()
    print("REPEAT CUSTOMERS")
    print("-" * 60)

    repeat = report.repeat_customers

    print(
        "Status:",
        repeat.status,
    )

    print(
        "Identified completed orders:",
        repeat.identified_completed_order_count.value,
    )

    print(
        "Repeat completed orders:",
        repeat.repeat_completed_order_count.value,
    )

    print(
        "Repeat contribution:",
        repeat.repeat_order_contribution.value,
    )

    print()
    print("TREND BUCKETS")
    print("-" * 60)

    for bucket in (
        report.trends.buckets[:6]
    ):

        print(
            bucket.bucket_start,
            "→",
            bucket.bucket_end,
            "| orders:",
            bucket.completed_order_count.value,
            "| units:",
            bucket.completed_units.value,
        )

    print()
    print("DETERMINISTIC INSIGHTS")
    print("-" * 60)

    if not report.insights:
        print("(none)")

    for insight in (
        report.insights[:8]
    ):

        print(
            f"[{insight.rule_id}] "
            f"{insight.text}"
        )

    print()
    print("WHAT TO EXPLAIN")
    print("-" * 60)

    print(
        "Sales Analytics is deterministic "
        "business analytics; it does not fit "
        "a model during this request."
    )

    print(
        "It separately gates sales, trends, "
        "product rankings, repeat customers, "
        "inventory context and insights."
    )

    print(
        "Unavailable coverage is not converted "
        "into a fake numeric zero."
    )

    print(
        "Current standalone demo uses "
        "controlled synthetic-development data."
    )

    print(
        "Final production adapter will consume "
        "real partner Invoice/InvoiceItem records."
    )


# ============================================================
# Forecasting
# ============================================================

def forecast_demo():

    banner(
        "LIVE FROZEN SALES FORECAST DEMO"
    )

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

    feature_file = (
        ROOT
        / "data"
        / "processed"
        / "sales"
        / "forecast"
        / "v1"
        / "default_260903"
        / "feature_matrix.csv"
    )

    index_file = (
        ROOT
        / "data"
        / "processed"
        / "sales"
        / "forecast"
        / "v1"
        / "default_260903"
        / "example_index.csv"
    )

    manifest = (
        bundle_dir
        / "bundle_hashes.json"
    )

    for required in [
        bundle_dir,
        feature_file,
        manifest,
    ]:
        if not required.exists():
            print(
                "[FAIL] Missing:",
                required,
            )
            return

    expected_hash = sha256_file(
        manifest
    )

    rows = read_csv(
        feature_file
    )

    feature_names = list(
        ForecastFeatures.model_fields.keys()
    )

    request = None
    selected_index = None

    index_rows = (
        read_csv(index_file)
        if index_file.exists()
        else []
    )

    for number, row in enumerate(
        rows
    ):

        values = {
            name: smart_value(
                row.get(name)
            )
            for name in feature_names
        }

        try:

            features = (
                ForecastFeatures.model_validate(
                    values
                )
            )

            candidate = (
                ForecastInput.model_validate(
                    {
                        "feature_version":
                            "forecast_features_v1",

                        "features":
                            features,
                    }
                )
            )

        except Exception:
            continue

        request = candidate

        if number < len(
            index_rows
        ):
            selected_index = (
                index_rows[number]
            )

        break

    if request is None:

        print(
            "[FAIL] No valid frozen forecast "
            "feature row could be loaded."
        )

        return

    print()
    print("MODEL ARTIFACT")
    print("-" * 60)

    print(
        "Bundle:",
        bundle_dir,
    )

    print(
        "Manifest SHA256:",
        expected_hash,
    )

    print()

    print(
        "DATA ORIGIN:"
    )

    print(
        "synthetic_development"
    )

    bundle = load_bundle(
        bundle_dir,
        expected_hash,
    )

    started = time.perf_counter()

    result = score_features(
        bundle,
        request,
    )

    elapsed = (
        time.perf_counter()
        - started
    )

    if selected_index:

        print()
        print("FROZEN EXAMPLE CONTEXT")
        print("-" * 60)

        useful_keys = [
            "example_id",
            "product_id",
            "observation_time",
            "split",
            "partition",
        ]

        printed = False

        for key in useful_keys:

            if (
                key
                in selected_index
            ):

                print(
                    f"{key:20}: "
                    f"{selected_index[key]}"
                )

                printed = True

        if not printed:

            for (
                key,
                value,
            ) in list(
                selected_index.items()
            )[:6]:

                print(
                    f"{key:20}: {value}"
                )

    print()
    print("FORECAST RESULT")
    print("-" * 60)

    print(
        pretty(result)
    )

    print(
        "Inference runtime:",
        f"{elapsed:.4f}s",
    )

    print()
    print("ARTIFACT INTEGRITY TEST")
    print("-" * 60)

    try:

        load_bundle(
            bundle_dir,
            "0" * 64,
        )

        print(
            "[FAIL] Wrong checksum "
            "was unexpectedly accepted."
        )

    except BundleError as exc:

        print(
            "[PASS] Wrong bundle pin rejected."
        )

        print(
            "Reason:",
            str(exc),
        )

    print()
    print("WHAT TO EXPLAIN")
    print("-" * 60)

    print(
        "Forecast model estimates observed "
        "completed units for the next 7 days."
    )

    print(
        "The model artifact is checksum-pinned "
        "before inference."
    )

    print(
        "Model/version/feature contracts are frozen."
    )

    print(
        "The prediction is NOT automatically "
        "a reorder quantity or procurement instruction."
    )

    print(
        "Full ForecastRuntime additionally handles "
        "unknown products, insufficient history, "
        "insufficient coverage and unavailable models "
        "with explicit non-numeric failure states."
    )


# ============================================================
# Evaluation evidence
# ============================================================

def engineering_evidence():

    banner(
        "MEDSENSEAI — ENGINEERING EVIDENCE"
    )

    run_pytest(
        "DDI Integration",
        [
            "tests/test_amna_medcopy_ddi_integration.py",
        ],
    )

    run_pytest(
        "Prescription AI",
        [
            "tests/test_amna_prescription_api.py",
            "tests/test_prescription_orchestration.py",
        ],
    )

    run_pytest(
        "Lead Scoring",
        [
            "tests/test_lead_model.py",
        ],
    )

    run_pytest(
        "Sales Analytics",
        [
            "tests/test_sales_analytics_v1.py",
        ],
    )

    run_pytest(
        "Forecast Runtime",
        [
            "tests/test_forecast_runtime.py",
        ],
    )

    run_pytest(
        "Sales Funnel",
        [
            "tests/test_sales_funnel.py",
            "tests/test_sales_funnel_coverage.py",
        ],
    )


# ============================================================
# Full Demo
# ============================================================

def full_demo():

    banner(
        "MEDSENSEAI — FULL SUPERVISOR AI DEMO"
    )

    print(
        "Live APIs + frozen AI cores + "
        "deterministic business intelligence"
    )

    input(
        "\nENTER → System Health"
    )

    v2.route_inventory()

    input(
        "\nENTER → DDI"
    )

    v2.ddi_demo()

    input(
        "\nENTER → Prescription Intelligence"
    )

    v2.prescription_demo()

    input(
        "\nENTER → Sales Funnel"
    )

    v2.funnel_demo()

    input(
        "\nENTER → Lead Scoring"
    )

    lead_demo()

    input(
        "\nENTER → Sales Analytics"
    )

    analytics_demo()

    input(
        "\nENTER → Sales Forecast"
    )

    forecast_demo()

    banner(
        "FULL AI DEMO COMPLETE"
    )

    print()
    print(
        "Closing statement:"
    )

    print()

    print(
        "MedSenseAI separates safety-critical "
        "and business-intelligence modules into "
        "versioned, governed components."
    )

    print(
        "DDI and Prescription Intelligence are "
        "available through live FastAPI integration."
    )

    print(
        "Funnel events are live and idempotent."
    )

    print(
        "Lead and Forecast use frozen integrity-pinned "
        "models, while Sales Analytics is deterministic."
    )

    print(
        "Uncertain or unsupported states fail explicitly "
        "rather than silently fabricating a result."
    )

    print(
        "Current sales-model demonstrations are clearly "
        "labelled synthetic-development."
    )

    print(
        "Final partner integration will connect these "
        "same governed modules to authoritative "
        "PostgreSQL Products, cart/checkout and "
        "Invoice/InvoiceItem history."
    )


# ============================================================
# Menu
# ============================================================

def menu():

    while True:

        banner(
            "MEDSENSEAI — SUPERVISOR AI DEMO V3"
        )

        print(
            f"Repository: {ROOT}"
        )

        print()

        print(
            "1. System Health + AI Routes"
        )

        print(
            "2. LIVE Drug–Drug Interaction"
        )

        print(
            "3. LIVE Prescription Intelligence"
        )

        print(
            "4. LIVE Sales Funnel"
        )

        print(
            "5. LIVE Frozen Lead Scoring"
        )

        print(
            "6. LIVE Sales Analytics"
        )

        print(
            "7. LIVE Frozen Sales Forecast"
        )

        print(
            "8. Engineering / Evaluation Evidence"
        )

        print(
            "9. FULL Supervisor Demo"
        )

        print(
            "0. Exit"
        )

        choice = input(
            "\nSelect option: "
        ).strip()

        try:

            if choice == "1":
                v2.route_inventory()

            elif choice == "2":
                v2.ddi_demo()

            elif choice == "3":
                v2.prescription_demo()

            elif choice == "4":
                v2.funnel_demo()

            elif choice == "5":
                lead_demo()

            elif choice == "6":
                analytics_demo()

            elif choice == "7":
                forecast_demo()

            elif choice == "8":
                engineering_evidence()

            elif choice == "9":
                full_demo()

            elif choice == "0":
                break

            else:
                print(
                    "Invalid option."
                )

        except KeyboardInterrupt:

            print(
                "\nCancelled."
            )

        except Exception as exc:

            print()
            print(
                "[DEMO ERROR]"
            )

            print(
                type(exc).__name__,
                exc,
            )

        input(
            "\nPress ENTER to return to menu..."
        )


if __name__ == "__main__":
    menu()
