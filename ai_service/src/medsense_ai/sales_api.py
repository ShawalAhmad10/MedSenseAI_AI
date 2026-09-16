from csv import DictReader
from decimal import Decimal
from pathlib import Path

from fastapi import FastAPI, HTTPException

from medsense_ai.lead_scoring.contracts import FEATURE_NAMES
from medsense_ai.lead_scoring.model.bundle import load_bundle
from medsense_ai.lead_scoring.model.contracts import ScoringInput
from medsense_ai.lead_scoring.model.inference import score_features


ROOT = Path(__file__).resolve().parents[2]

LEAD_BUNDLE_DIR = (
    ROOT / "artifacts" / "sales" / "lead" /
    "model" / "v1" / "default_260903"
)

LEAD_FEATURE_FILE = (
    ROOT / "data" / "processed" / "sales" /
    "lead" / "v1" / "default_260903" /
    "feature_matrix.csv"
)

# Frozen trust anchor already verified in supervisor demo.
LEAD_BUNDLE_MANIFEST_SHA256 = (
    "3b9a1132ab9101bb334859737674d0ddf65c82a3f2ab89298f1428611f2c9df2"
)

app = FastAPI(
    title="MedSenseAI Sales AI Service",
    version="1.0.0",
)


def _feature_value(name: str, raw: str):
    value = raw.strip()

    if name == "no_cart_add_60d":
        return value.lower() == "true"

    if name == "days_since_last_cart_add":
        return None if value == "" else Decimal(value)

    if name in {
        "purchase_recency_days",
        "purchase_frequency_ratio_30d_60d",
    }:
        return Decimal(value)

    return int(value)


def _load_demo_requests(limit: int = 5):
    requests = []

    with LEAD_FEATURE_FILE.open(
        "r",
        encoding="utf-8",
        newline="",
    ) as handle:
        for row in DictReader(handle):
            try:
                features = {
                    name: _feature_value(name, row[name])
                    for name in FEATURE_NAMES
                }

                request = ScoringInput.model_validate({
                    "feature_version": "lead_features_v1",
                    "features": features,
                })

                requests.append(request)

            except Exception:
                continue

            if len(requests) >= limit:
                break

    return requests


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "service": "medsense-sales-ai",
        "data_origin": "synthetic_development",
    }


@app.get("/api/v1/sales/lead/demo")
def lead_demo():
    try:
        bundle = load_bundle(
            LEAD_BUNDLE_DIR,
            LEAD_BUNDLE_MANIFEST_SHA256,
        )

        requests = _load_demo_requests(5)

        if not requests:
            raise HTTPException(
                status_code=503,
                detail="No valid frozen lead demo rows available",
            )

        leads = []

        for index, request in enumerate(requests, start=1):
            result = score_features(bundle, request)

            leads.append({
                "id": f"synthetic-lead-{index:02d}",
                "name": f"Demo Customer {index}",
                "status": result.status.value,
                "score": result.lead_score,
                "probability": result.model_probability,
                "technical_threshold": result.technical_threshold,
                "technical_binary_prediction":
                    result.technical_binary_prediction,
                "model_version": result.model_version,
                "feature_version": result.feature_version,
                "target_version": result.target_version,
                "data_origin": result.model_data_origin,
                "notice": result.synthetic_development_notice,
                "features": {
                    "purchase_count_30d":
                        request.features.purchase_count_30d,
                    "purchase_count_60d":
                        request.features.purchase_count_60d,
                    "purchase_recency_days":
                        float(request.features.purchase_recency_days),
                    "session_count_30d":
                        request.features.session_count_30d,
                    "product_view_count_30d":
                        request.features.product_view_count_30d,
                    "cart_add_count_30d":
                        request.features.cart_add_count_30d,
                },
            })

        return {
            "success": True,
            "data_origin": "synthetic_development",
            "model_version": "med-sales-lead-1.0.0",
            "feature_version": "lead_features_v1",
            "business_bands_defined": False,
            "leads": leads,
        }

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Lead scoring unavailable: {type(exc).__name__}: {exc}",
        ) from exc

@app.get("/api/v1/sales/analytics/demo")
def analytics_demo_api():
    import hashlib
    import json

    artifact = (
        ROOT / "artifacts" / "sales" / "analytics" /
        "v1" / "default_260903" / "analytics_report.json"
    )

    if not artifact.exists():
        raise HTTPException(
            status_code=503,
            detail="Frozen analytics artifact unavailable",
        )

    try:
        raw = artifact.read_bytes()
        report = json.loads(raw.decode("utf-8"))

        period = report.get("period_sales") or {}
        rankings = report.get("product_rankings") or {}
        repeat = report.get("repeat_customers") or {}
        funnel = report.get("funnel_summary") or {}
        trend_report = report.get("trends") or {}
        request = report.get("request") or {}

        def metric(container, name):
            row = container.get(name) or {}
            return row.get("value")

        subtotal_rows = (
            period.get("completed_merchandise_subtotals") or []
        )

        avg_rows = (
            period.get("average_completed_order_subtotals") or []
        )

        subtotal = subtotal_rows[0] if subtotal_rows else {}
        average = avg_rows[0] if avg_rows else {}

        products = []

        for row in (rankings.get("products") or [])[:10]:
            products.append({
                "rank": row.get("rank"),
                "product_id": row.get("product_id"),
                "completed_units": row.get("completed_units"),
                "completed_order_count":
                    row.get("completed_order_count"),
            })

        trends = []

        for row in (trend_report.get("buckets") or []):
            monetary = (
                row.get("completed_merchandise_subtotals") or []
            )

            money = monetary[0] if monetary else {}

            trends.append({
                "bucket_start": row.get("bucket_start"),
                "bucket_end": row.get("bucket_end"),
                "completed_orders":
                    metric(row, "completed_order_count"),
                "cancelled_orders":
                    metric(row, "cancelled_order_count"),
                "completed_units":
                    metric(row, "completed_units"),
                "currency": money.get("currency"),
                "merchandise_subtotal_minor":
                    money.get("amount_minor"),
            })

        repeat_value = (
            (repeat.get("repeat_order_contribution") or {})
            .get("value")
        )

        return {
            "success": True,
            "data_origin": "synthetic_development",
            "analytics_version":
                report.get("analytics_version"),
            "sales_contract_version":
                report.get("sales_contract_version"),
            "dataset_id": report.get("dataset_id"),
            "status": report.get("status"),
            "artifact_sha256":
                hashlib.sha256(raw).hexdigest(),
            "report_window": {
                "start": request.get("report_start"),
                "end": request.get("report_end"),
                "timezone":
                    trend_report.get("timezone", "UTC"),
                "granularity":
                    trend_report.get("granularity"),
            },
            "summary": {
                "completed_orders":
                    metric(period, "completed_order_count"),
                "cancelled_orders":
                    metric(period, "cancelled_order_count"),
                "completed_units":
                    metric(period, "completed_units"),
                "currency": subtotal.get("currency"),
                "merchandise_subtotal_minor":
                    subtotal.get("amount_minor"),
                "average_order_subtotal_minor":
                    average.get("average_minor"),
            },
            "repeat_customers": {
                "identified_completed_orders":
                    metric(
                        repeat,
                        "identified_completed_order_count",
                    ),
                "repeat_completed_orders":
                    metric(
                        repeat,
                        "repeat_completed_order_count",
                    ),
                "contribution":
                    repeat_value,
            },
            "top_products": products,
            "funnel": {
                "product_views":
                    (funnel.get("stage_counts") or {})
                    .get("product_view"),
                "cart_additions":
                    (funnel.get("stage_counts") or {})
                    .get("cart_addition"),
                "orders_created":
                    (funnel.get("stage_counts") or {})
                    .get("order_creation"),
                "completed_purchases":
                    (funnel.get("stage_counts") or {})
                    .get("completed_purchase"),
                "overall_conversion":
                    funnel.get("overall_conversion"),
                "largest_dropoff":
                    funnel.get(
                        "largest_dropoff_transition"
                    ),
            },
            "trends": trends,
            "notice": (
                "Synthetic-development analytics. "
                "Observed sales are not unconstrained demand. "
                "Merchandise subtotal is not net revenue, "
                "profit or cash collected."
            ),
        }

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "Analytics unavailable: "
                f"{type(exc).__name__}: {exc}"
            ),
        ) from exc

@app.get("/api/v1/sales/forecast/demo")
def forecast_demo_api():
    import csv
    import hashlib
    import time

    from medsense_ai.forecasting.contracts import ForecastFeatures
    from medsense_ai.forecasting.model.bundle import (
        BundleError,
        load_bundle,
    )
    from medsense_ai.forecasting.model.contracts import ForecastInput
    from medsense_ai.forecasting.model.inference import score_features

    bundle_dir = (
        ROOT / "artifacts" / "sales" / "forecast" /
        "model" / "v1" / "default_260903"
    )

    data_dir = (
        ROOT / "data" / "processed" / "sales" /
        "forecast" / "v1" / "default_260903"
    )

    manifest = bundle_dir / "bundle_hashes.json"
    features_path = data_dir / "feature_matrix.csv"
    index_path = data_dir / "example_index.csv"

    required = [
        manifest,
        features_path,
        index_path,
    ]

    if not all(p.exists() for p in required):
        raise HTTPException(
            status_code=503,
            detail="Frozen forecast artifacts unavailable",
        )

    def sha256_file(path):
        h = hashlib.sha256()

        with path.open("rb") as handle:
            for block in iter(
                lambda: handle.read(1024 * 1024),
                b"",
            ):
                h.update(block)

        return h.hexdigest()

    def smart_value(value):
        if value is None:
            return None

        value = str(value).strip()

        if value == "":
            return None

        lowered = value.lower()

        if lowered == "true":
            return True

        if lowered == "false":
            return False

        try:
            if "." in value:
                return float(value)

            return int(value)

        except ValueError:
            return value

    try:
        expected_hash = sha256_file(manifest)

        bundle = load_bundle(
            bundle_dir,
            expected_hash,
        )

        with features_path.open(
            "r",
            encoding="utf-8",
            newline="",
        ) as handle:
            rows = list(csv.DictReader(handle))

        with index_path.open(
            "r",
            encoding="utf-8",
            newline="",
        ) as handle:
            index_rows = list(csv.DictReader(handle))

        names = list(
            ForecastFeatures.model_fields.keys()
        )

        selected_result = None
        selected_context = None
        selected_features = None

        started = time.perf_counter()

        for i, row in enumerate(rows):

            if i < len(index_rows):
                partition = str(
                    index_rows[i].get(
                        "partition",
                        "",
                    )
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
                selected_features = features

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
            raise HTTPException(
                status_code=503,
                detail=(
                    "No valid held-out non-zero "
                    "forecast example available"
                ),
            )

        return {
            "success": True,
            "data_origin":
                "synthetic_development",
            "model_version":
                selected_result.model_version,
            "feature_version":
                selected_result.feature_version,
            "target_version":
                selected_result.target_version,
            "selected_method":
                selected_result.selected_method,
            "product_id":
                (
                    selected_context or {}
                ).get("product_id"),
            "observation_time":
                (
                    selected_context or {}
                ).get("observation_time"),
            "partition":
                (
                    selected_context or {}
                ).get("partition"),
            "predicted_completed_units_next_7d":
                selected_result
                .predicted_completed_units_next_7d,
            "runtime_seconds":
                elapsed,
            "artifact_manifest_sha256":
                expected_hash,
            "feature_count":
                len(names),
            "notice": (
                "Synthetic-development forecast of "
                "observed completed units. "
                "This is not unconstrained demand "
                "and is not an automatic reorder instruction."
            ),
        }

    except HTTPException:
        raise

    except BundleError as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "Forecast bundle unavailable: "
                f"{exc}"
            ),
        ) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "Forecast unavailable: "
                f"{type(exc).__name__}: {exc}"
            ),
        ) from exc

