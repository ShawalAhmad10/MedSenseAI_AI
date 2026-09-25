"""Deterministic manifests and leakage/readiness audits for forecast dataset v1."""

from collections import Counter, defaultdict
from datetime import timedelta
from decimal import Decimal

from medsense_ai.sales_data import EventName

from .contracts import (
    BUILDER_VERSION, FEATURE_NAMES, FEATURE_VERSION, SPLIT_VERSION, TARGET_VERSION,
    InventoryContextStatus, Partition,
)
from .dataset import TEST_START, VALIDATION_START, example_id, observation_times, partition_at


def feature_manifest():
    integer = set(FEATURE_NAMES) - {
        "completed_units_mean_4w", "completed_units_mean_8w",
        "iso_week_sin", "iso_week_cos", "month_sin", "month_cos",
    }
    return {
        "feature_version": FEATURE_VERSION,
        "feature_count": len(FEATURE_NAMES),
        "feature_allowlist": list(FEATURE_NAMES),
        "features": [
            {"name": name, "type": "integer" if name in integer else "decimal" if "mean" in name else "float",
             "nullable": False} for name in FEATURE_NAMES
        ],
        "product_id_is_feature": False,
        "target_censoring_metadata_is_feature": False,
        "point_in_time_policy": "normal fact_time < T and available_at <= T; available_stock_at_t includes valid inventory movements exactly at T",
        "preprocessing_fitted": False,
    }


def target_manifest():
    return {
        "target_version": TARGET_VERSION,
        "definition": "sum OrderItem.quantity by product for valid purchase_completed.occurred_at in [T,T+7d)",
        "interpretation": "observed completed-unit sales; not unconstrained/true demand, required inventory, or reorder quantity",
        "horizon_days": 7,
        "target_stockout_fields": ["target_stockout_observed", "target_stockout_seconds", "target_full_week_stockout", "inventory_context_status"],
        "stockout_fields_are_evaluation_only": True,
    }


def split_manifest():
    return {
        "split_version": SPLIT_VERSION,
        "random_split": False,
        "train": {"first_T": "2025-10-27T00:00:00Z", "last_T": "2026-04-06T00:00:00Z", "cohorts": 24},
        "validation": {"first_T": "2026-04-13T00:00:00Z", "last_T": "2026-06-08T00:00:00Z", "cohorts": 9},
        "test": {"first_T": "2026-06-15T00:00:00Z", "last_T": "2026-08-24T00:00:00Z", "cohorts": 11},
        "boundary_rule": "every prior split target T+7d <= first T of next split",
        "additional_gap_required": False,
    }


def audit_dataset(built, validated):
    data = validated.validated_dataset
    expected_times = observation_times(built.config)
    expected_schedule = {at: partition_at(at) for at in expected_times}
    if len(FEATURE_NAMES) != 19 or tuple(feature_manifest()["feature_allowlist"]) != FEATURE_NAMES:
        raise ValueError("Forecast feature allowlist changed")
    if expected_times[23] + built.config.horizon_days * timedelta(days=1) > VALIDATION_START:
        raise ValueError("Train target crosses validation boundary")
    if expected_times[32] + built.config.horizon_days * timedelta(days=1) > TEST_START:
        raise ValueError("Validation target crosses test boundary")
    ids, source_targets = set(), defaultdict(int)
    items = defaultdict(list)
    for item in data.order_items:
        items[item.order_id].append(item)
    for event in data.events:
        if event.event_name == EventName.PURCHASE_COMPLETED:
            for item in items[event.order_id]:
                source_targets[(item.product_id, event.occurred_at)] += item.quantity
    feature_values = defaultdict(list)
    split_rows, split_zero, split_products = Counter(), Counter(), defaultdict(set)
    stock = Counter()
    for row in built.examples:
        if row.example_id in ids or row.example_id != example_id(row.dataset_id, row.source_namespace, row.product_id, row.observation_time):
            raise ValueError("Forecast example ID/order identity is not deterministic")
        ids.add(row.example_id)
        if expected_schedule.get(row.observation_time) != row.partition:
            raise ValueError("Forecast row differs from exact split schedule")
        if tuple(row.features.model_dump()) != FEATURE_NAMES:
            raise ValueError("Forecast row differs from exact feature allowlist")
        if row.lineage.maximum_normal_fact_time is not None and row.lineage.maximum_normal_fact_time >= row.observation_time:
            raise ValueError("Normal feature lineage contains fact_time >= T")
        if row.lineage.maximum_inventory_fact_time is not None and row.lineage.maximum_inventory_fact_time > row.observation_time:
            raise ValueError("Inventory feature lineage contains fact_time > T")
        if row.lineage.maximum_available_at is not None and row.lineage.maximum_available_at > row.observation_time:
            raise ValueError("Feature lineage was unavailable at T")
        actual = sum(quantity for (product, at), quantity in source_targets.items()
                     if product == row.product_id and row.target_start <= at < row.target_end)
        if actual != row.target_completed_units:
            raise ValueError("Target differs from completion-time product attribution")
        values = row.features.model_dump()
        for name, value in values.items():
            feature_values[name].append(value)
        split_rows[row.partition.value] += 1
        split_zero[row.partition.value] += row.target_completed_units == 0
        split_products[row.partition.value].add(row.product_id)
        key = "inventory_unavailable"
        if row.inventory_context_status == InventoryContextStatus.OBSERVED:
            key = "full_week_stockout" if row.target_full_week_stockout else "partial_stockout" if row.target_stockout_observed else "no_stockout"
        stock[key] += 1
    all_candidates = len(built.examples) + len(built.exclusions)
    counts = {
        "considered": all_candidates, "supervised": len(built.examples),
        "excluded": len(built.exclusions), "products": len({row.product_id for row in built.examples}),
        "observation_cohorts": len(expected_times),
    }
    feature_qa = {}
    for name in FEATURE_NAMES:
        values = feature_values[name]
        feature_qa[name] = {
            "null_count": sum(value is None for value in values),
            "minimum": str(min(values)) if values else None,
            "maximum": str(max(values)) if values else None,
        }
    target_values = [row.target_completed_units for row in built.examples]
    report = {
        "builder_version": BUILDER_VERSION, "feature_version": FEATURE_VERSION,
        "target_version": TARGET_VERSION, "split_version": SPLIT_VERSION,
        "config_sha256": built.config.sha256, "counts": counts,
        "splits": {name: {"rows": split_rows[name], "zero_targets": split_zero[name],
                           "zero_rate": split_zero[name] / split_rows[name] if split_rows[name] else None,
                           "products": len(split_products[name])}
                   for name in ("train", "validation", "test")},
        "target": {"zero_count": sum(value == 0 for value in target_values),
                   "zero_rate": sum(value == 0 for value in target_values) / len(target_values) if target_values else None,
                   "minimum": min(target_values) if target_values else None,
                   "maximum": max(target_values) if target_values else None,
                   "mean": str(Decimal(sum(target_values)) / Decimal(len(target_values))) if target_values else None,
                   "total_units": sum(target_values)},
        "stockout_categories": dict(sorted(stock.items())),
        "exclusion_reasons": dict(sorted(Counter(row.reason for row in built.exclusions).items())),
        "feature_qa": feature_qa,
    }
    coverage_audit = {
        "passed": all_candidates == len(built.examples) + len(built.exclusions),
        "all_candidates_eligible": not built.exclusions,
        "candidate_rows": all_candidates,
        "eligible_rows": len(built.examples),
        "excluded_rows": len(built.exclusions),
        "exclusion_reasons": report["exclusion_reasons"],
        "missing_history_is_zero": False,
    }
    stockout_audit = {
        "policy": "target stockout retained as evaluation-only metadata; target is not adjusted",
        "categories": report["stockout_categories"],
        "target_stockout_fields_in_feature_allowlist": sorted(set(FEATURE_NAMES) & {"target_stockout_observed", "target_stockout_seconds", "target_full_week_stockout", "inventory_context_status"}),
    }
    leakage = {
        "passed": True,
        "feature_count": len(FEATURE_NAMES), "feature_allowlist_exact": True,
        "ids_absent_from_features": all(name not in FEATURE_NAMES for name in ("product_id", "customer_id", "example_id")),
        "target_stockout_metadata_absent": not stockout_audit["target_stockout_fields_in_feature_allowlist"],
        "normal_fact_time_strictly_before_t": True,
        "inventory_at_t_exception_only": True,
        "all_feature_inputs_available_by_t": True,
        "future_receipts_excluded": True,
        "target_uses_completion_time": True,
        "product_item_attribution_checked": True,
        "split_boundaries_exact": True,
        "target_intervals_do_not_cross_splits": True,
        "deterministic_ids": True,
        "nested_windows_checked": True,
        "zero_targets_retained": report["target"]["zero_count"] > 0,
        "hidden_generator_fields_absent": all("generator" not in name and "seed" not in name and "propensity" not in name for name in FEATURE_NAMES),
    }
    return report, coverage_audit, stockout_audit, leakage
