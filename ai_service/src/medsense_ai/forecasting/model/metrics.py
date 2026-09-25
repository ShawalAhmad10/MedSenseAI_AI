"""Forecast metrics and bounded product, temporal, sparsity, and stockout diagnostics."""

from collections import defaultdict
import math

import numpy as np


def checked(actual, predicted):
    actual, predicted = np.asarray(actual, dtype=np.float64), np.asarray(predicted, dtype=np.float64)
    if actual.ndim != 1 or predicted.shape != actual.shape or not len(actual):
        raise ValueError("Forecast metrics require nonempty aligned one-dimensional arrays")
    if not np.isfinite(actual).all() or not np.isfinite(predicted).all() or np.any(actual < 0):
        raise ValueError("Forecast metrics require finite nonnegative actuals and finite predictions")
    return actual, predicted


def metrics(actual, predicted) -> dict:
    actual, predicted = checked(actual, predicted)
    error = predicted - actual
    actual_sum, predicted_sum = float(actual.sum()), float(predicted.sum())
    return {
        "rows": len(actual),
        "actual_unit_sum": actual_sum,
        "predicted_unit_sum": predicted_sum,
        "mae": float(np.mean(np.abs(error))),
        "rmse": float(math.sqrt(np.mean(error ** 2))),
        "wape": float(np.abs(error).sum() / actual_sum) if actual_sum else None,
        "signed_bias": float(np.mean(error)),
        "normalized_bias": float(error.sum() / actual_sum) if actual_sum else None,
        "zero_target_rows": int(np.sum(actual == 0)),
        "zero_target_frequency": float(np.mean(actual == 0)),
        "nonnegative_prediction_violations": int(np.sum(predicted < 0)),
    }


def grouped_metrics(actual, predicted, groups) -> dict:
    actual, predicted = checked(actual, predicted)
    if len(groups) != len(actual):
        raise ValueError("Diagnostic groups are not aligned")
    positions = defaultdict(list)
    for index, group in enumerate(groups):
        positions[str(group)].append(index)
    return {group: metrics(actual[idx], predicted[idx]) for group, idx in sorted(positions.items())}


def per_product(actual, predicted, product_ids, bounded: int = 10) -> dict:
    values = grouped_metrics(actual, predicted, product_ids)
    maes = np.asarray([row["mae"] for row in values.values()])
    defined_wape = {key: row["wape"] for key, row in values.items() if row["wape"] is not None}
    ordered = sorted((dict(product_id=key, **row) for key, row in values.items()), key=lambda row: (row["mae"], row["product_id"]))
    return {
        "products": len(values),
        "median_mae": float(np.median(maes)),
        "mae_iqr": {"q25": float(np.quantile(maes, 0.25)), "q75": float(np.quantile(maes, 0.75))},
        "per_product_wape_defined": len(defined_wape),
        "per_product_wape_not_applicable": len(values) - len(defined_wape),
        "median_defined_wape": float(np.median(list(defined_wape.values()))) if defined_wape else None,
        "best_by_mae": ordered[:bounded],
        "worst_by_mae": list(reversed(ordered[-bounded:])),
    }


def weekly(actual, predicted, mondays) -> dict:
    values = grouped_metrics(actual, predicted, mondays)
    rows = [dict(observation_time=key, **value) for key, value in values.items()]
    aggregate_actual = np.asarray([row["actual_unit_sum"] for row in rows])
    aggregate_predicted = np.asarray([row["predicted_unit_sum"] for row in rows])
    return {"weeks": len(rows), "aggregate_week_metrics": metrics(aggregate_actual, aggregate_predicted), "by_week": rows}


def sparsity(actual, predicted) -> dict:
    actual, predicted = checked(actual, predicted)
    zero = actual == 0
    result = {}
    for name, mask in (("zero_target", zero), ("nonzero_target", ~zero)):
        result[name] = metrics(actual[mask], predicted[mask]) if mask.any() else {"rows": 0, "reason": "empty subgroup"}
    quantiles = np.quantile(predicted, [0, .1, .25, .5, .75, .9, .99, 1])
    result["prediction_distribution"] = dict(zip(("min", "p10", "p25", "median", "p75", "p90", "p99", "max"), map(float, quantiles)))
    return result


def train_volume_policy(train) -> dict:
    totals = defaultdict(float)
    for product, value in zip(train.product_ids, train.y):
        totals[product] += float(value)
    product_totals = np.asarray(list(totals.values()))
    low, high = map(float, np.quantile(product_totals, [1 / 3, 2 / 3]))
    bands = {
        product: "low" if total <= low else "high" if total > high else "medium"
        for product, total in totals.items()
    }
    return {
        "basis": "TRAIN completed-unit total by product",
        "low_upper_inclusive": low,
        "high_lower_exclusive": high,
        "product_band_by_id": dict(sorted(bands.items())),
    }


def volume_bands(split, predicted, policy) -> dict:
    bands = policy["product_band_by_id"]
    if any(product not in bands for product in split.product_ids):
        raise ValueError("Split contains a product without a TRAIN-derived volume band")
    return grouped_metrics(split.y, predicted, [bands[product] for product in split.product_ids])


def full_diagnostics(split, predicted, volume_policy) -> dict:
    return {
        "overall": metrics(split.y, predicted),
        "per_product": per_product(split.y, predicted, split.product_ids),
        "weekly": weekly(split.y, predicted, split.mondays),
        "sparsity": sparsity(split.y, predicted),
        "stockout": grouped_metrics(split.y, predicted, split.stockout_categories),
        "train_derived_product_volume_bands": volume_bands(split, predicted, volume_policy),
    }
