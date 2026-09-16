"""Source-backed feature/label/split audits and the trainer's positive feature allowlist."""

from collections import Counter
from decimal import Context, Decimal, ROUND_HALF_EVEN, localcontext
import math
import statistics

from medsense_ai.sales_data import EventName, in_future_outcome_window, in_lead_lookback, is_knowable
from .contracts import (
    BUILDER_VERSION, DAY, FEATURE_NAMES, FEATURE_VERSION, TARGET_VERSION, TICK,
    Eligibility, Features, LabelStatus, Partition,
)
from .features import HISTORY_STREAMS, LABEL_STREAMS, LeadIndex
from .dataset import example_id
from .splits import BOUNDARIES, SUPERVISED, label_cutoff, partition_at

PROHIBITED = ["customer_id", "product_id", "source_record_ref", "seed", "segment", "propensity", "affinity", "popularity_rank", "probability", "random_draw", "coefficient", "label", "target", "future", "next_purchase", "lead_score", "order_id"]
WARNING = "Synthetic development results are not evidence of real pharmacy/customer predictive performance."


def feature_manifest() -> dict:
    definitions = {
        "purchase_count": ("Distinct completed orders known by T; count by completion time", ["purchase_completed", "orders"]),
        "session_count": ("Distinct explicitly customer-attributed sessions with view/add/remove activity; no lifecycle-only sessions", ["product_viewed", "cart_item_added", "cart_item_removed"]),
        "product_view_count": ("Count of known, customer-attributed product views", ["product_viewed"]),
        "distinct_products_viewed": ("Distinct products in known, customer-attributed views", ["product_viewed"]),
        "cart_add_count": ("Count of successful known cart-add events", ["cart_item_added"]),
        "cart_add_quantity": ("Sum of units in successful known cart additions", ["cart_item_added"]),
        "cart_remove_count": ("Count of successful known cart-removal events", ["cart_item_removed"]),
        "cart_remove_quantity": ("Sum of units in successful known cart removals", ["cart_item_removed"]),
    }
    rows = []
    for name in FEATURE_NAMES:
        nullable, days = False, 60
        if name == "purchase_recency_days":
            dtype, description, sources = "decimal", "Elapsed microseconds / 86400000000 since most recent known completion", ["purchase_completed", "orders"]
        elif name == "days_since_last_cart_add":
            dtype, description, sources, nullable = "decimal", "Elapsed microseconds / 86400000000 since most recent add in 60 days", ["cart_item_added"], True
        elif name == "no_cart_add_60d":
            dtype, description, sources = "boolean", "True only when complete 60-day telemetry proves no known add", ["cart_item_added"]
        elif name == "purchase_frequency_ratio_30d_60d":
            dtype, description, sources = "decimal", "purchase_count_30d / purchase_count_60d; denominator positive by eligibility", ["purchase_completed", "orders"]
        else:
            stem, suffix = name.rsplit("_", 1)
            days = int(suffix[:-1])
            description, sources = definitions[stem]
            dtype = "integer"
        rows.append(dict(name=name, type=dtype, description=description, lookback_days=days, boundary_semantics="[T-lookback,T] inclusive; event and join availability <= T", nullable=nullable, null_policy="CSV empty only when no_cart_add_60d=true; no imputation" if nullable else "never null on a supervised row; unavailable snapshots have no matrix row", source_streams=sources))
    return dict(feature_version=FEATURE_VERSION, target_version=TARGET_VERSION, sales_contract_version="sales_contract_v1", builder_version=BUILDER_VERSION, feature_count=len(FEATURE_NAMES), feature_allowlist=list(FEATURE_NAMES), features=rows, decimal_arithmetic="28 significant digits, ROUND_HALF_EVEN; exact count ratio reconstructible from its two count features", csv_join_key="example_id (never a feature)", historical_coverage_streams=[s.value for s in HISTORY_STREAMS], prohibited_features=PROHIBITED, preprocessing_fitted=False, trainer_instruction="Select exactly feature_allowlist in its fixed order. Never select all columns except label.")


def target_manifest(freeze) -> dict:
    return dict(target_version=TARGET_VERSION, observation_unit=["source_namespace", "customer_id", "observation_time"], observation_schedule="Monday 00:00 UTC in approved supervised periods only", eligibility="Known customer, complete known-at-T 60-day required history, and >=1 known completed purchase", historical_window="[T-60 days,T]", outcome_window="(T,T+30 days]", positive="At least one matching NEW order created and completed inside outcome_window; order/customer/event known by the split label cutoff", negative="No qualifying new completed order under mature, entirely covered follow-up; partial positives also remain unlabeled", label_evidence_cutoff="Recorded cutoff used for evidence; not an estimate of the earliest possible label availability", train_cutoff=BOUNDARIES[3].isoformat(), validation_cutoff=BOUNDARIES[5].isoformat(), test_cutoff=freeze.isoformat(), future_coverage_streams=[s.value for s in LABEL_STREAMS], excluded_observations="Out-of-scope, insufficient-data and not-known are not negatives", audit_order_references="label_audit.jsonl only; never model inputs")


def audit_dataset(built, validated) -> tuple[dict, dict]:
    index = LeadIndex(validated)
    examples = built.examples
    if len({e.example_id for e in examples}) != len(examples):
        raise ValueError("Duplicate example identifiers")
    if any(token in name for token in PROHIBITED for name in FEATURE_NAMES):
        raise ValueError("Forbidden identifier in the positive feature allowlist")
    counts = Counter(considered=len(examples), eligible=0, out_of_scope=0, insufficient_data=0, not_known=0, immature=0, insufficient_followup=0, supervised=0)
    split_rows = {part: [] for part in SUPERVISED}
    event_checks = join_checks = negative_checks = positive_checks = 0
    for example in examples:
        at, features, label = example.observation_time, example.feature_result, example.label_result
        if at.weekday() != 0 or any((at.hour, at.minute, at.second, at.microsecond)) or partition_at(at) != example.partition or example.partition not in SUPERVISED:
            raise ValueError("Example violates the frozen observation/partition schedule")
        if example.dataset_id != index.data.manifest.dataset_id or example.source_namespace != index.data.manifest.source_namespace or example.data_origin != index.data.manifest.data_origin:
            raise ValueError("Example source provenance mismatch")
        if example.example_id != example_id(example.dataset_id, example.source_namespace, example.customer_id, at):
            raise ValueError("Example identifier does not match its stable source components")
        if not is_knowable(index.customers[example.customer_id], at):
            raise ValueError("Example uses a customer not known at observation")
        if label.horizon_end != at + DAY * 30 or label.evidence_cutoff != label_cutoff(example.partition, index.data.manifest.extracted_at):
            raise ValueError("Label horizon/cutoff violates policy")
        counts[features.eligibility.value] += 1
        if label.status in (LabelStatus.IMMATURE, LabelStatus.INSUFFICIENT_FOLLOWUP):
            counts[label.status.value] += 1
        if features.features is not None:
            Features.model_validate(features.features)
            if index.coverage_failures(HISTORY_STREAMS, at-DAY*60, at, at):
                raise ValueError("Features have insufficient history coverage")
            evidence = features.evidence
            used = [index.events[key] for key in evidence.event_ids]
            if not used or len(set(evidence.event_ids)) != len(used):
                raise ValueError("Feature evidence is empty or duplicated")
            if evidence.order_ids != tuple(sorted({f.event.order_id for f in used if f.event.order_id})) or evidence.product_ids != tuple(sorted({f.event.product_id for f in used if f.event.product_id})):
                raise ValueError("Feature join evidence does not match source events")
            for fact in used:
                if fact.event.customer_id != example.customer_id or not in_lead_lookback(fact.event.occurred_at, at) or not fact.knowable(at):
                    raise ValueError("Feature event or join was not knowable within the lookback")
                if fact.event.event_name not in (EventName.PRODUCT_VIEWED, EventName.CART_ITEM_ADDED, EventName.CART_ITEM_REMOVED, EventName.PURCHASE_COMPLETED):
                    raise ValueError("Feature evidence includes an unapproved event kind")
                event_checks += 1
                join_checks += len(fact.joins)
            if evidence.maximum_fact_time != max(f.event.occurred_at for f in used) or evidence.maximum_available_at != max(index.customers[example.customer_id].available_at, *(f.known_at for f in used)):
                raise ValueError("Feature evidence maxima do not match actual sources")
        if label.status == LabelStatus.LABELED:
            if not example.supervised or label.horizon_end > label.evidence_cutoff or index.coverage_failures(LABEL_STREAMS, at+TICK, label.horizon_end, label.evidence_cutoff):
                raise ValueError("Labeled example lacks eligible mature complete follow-up")
            observed = index.window(example.customer_id, EventName.PURCHASE_COMPLETED, at, label.horizon_end, label.evidence_cutoff, left_open=True)
            qualifying = tuple(sorted({f.event.order_id for f in observed if in_future_outcome_window(index.orders[f.event.order_id].created_at, at)}))
            if qualifying != label.qualifying_order_ids or bool(qualifying) != bool(label.label):
                raise ValueError("Label is inconsistent with actual future source records")
            for order_id in qualifying:
                if index.orders[order_id].customer_id != example.customer_id:
                    raise ValueError("Positive order reference belongs to another customer")
            positive_checks += label.label == 1
            negative_checks += label.label == 0
            if example.partition == Partition.TRAIN and label.horizon_end >= BOUNDARIES[3]:
                raise ValueError("Training outcome crosses validation observations")
            if example.partition == Partition.VALIDATION and label.horizon_end >= BOUNDARIES[5]:
                raise ValueError("Validation outcome crosses test observations")
            counts["supervised"] += 1
            split_rows[example.partition].append(example)
    summary, customers = {}, {}
    for part, rows in split_rows.items():
        customers[part] = {r.customer_id for r in rows}
        labels = [r.label_result.label for r in rows]
        observations, horizons = [r.observation_time for r in rows], [r.label_result.horizon_end for r in rows]
        summary[part.value] = dict(rows=len(rows), distinct_customers=len(customers[part]), positives=sum(labels), negatives=len(labels)-sum(labels), prevalence=sum(labels)/len(labels) if labels else None, observation_min=min(observations).isoformat() if rows else None, observation_max=max(observations).isoformat() if rows else None, horizon_min=min(horizons).isoformat() if rows else None, horizon_max=max(horizons).isoformat() if rows else None)
    feature_qa = {}
    supervised = [e for rows in split_rows.values() for e in rows]
    manifest = feature_manifest()
    for description in manifest["features"]:
        name = description["name"]
        values = [getattr(e.feature_result.features, name) for e in supervised]
        present = [v for v in values if v is not None]
        if any(not math.isfinite(float(v)) for v in present):
            raise ValueError("Non-finite feature")
        def serial(value):
            return str(value) if isinstance(value, Decimal) else value
        with localcontext(Context(prec=28, rounding=ROUND_HALF_EVEN)):
            median = serial(statistics.median(present)) if present else None
        feature_qa[name] = dict(type=description["type"], null_count=len(values)-len(present), min=serial(min(present)) if present else None, median=median, mean=statistics.fmean(present) if present else None, max=serial(max(present)) if present else None, finite=True)
    report = dict(warning=WARNING, data_origin=index.data.manifest.data_origin.value, feature_version=FEATURE_VERSION, target_version=TARGET_VERSION, builder_version=BUILDER_VERSION, config_sha256=built.config.sha256, counts=dict(counts), skipped_schedule_known_customer_snapshots=built.skipped_schedule, splits=summary, customer_overlap={"train_validation": len(customers[Partition.TRAIN]&customers[Partition.VALIDATION]), "train_test": len(customers[Partition.TRAIN]&customers[Partition.TEST]), "validation_test": len(customers[Partition.VALIDATION]&customers[Partition.TEST])}, feature_qa=feature_qa, temporal_coverage_qa="passed", no_resampling=True, preprocessing_fitted=False, all_splits_have_both_classes=all(v["positives"] > 0 and v["negatives"] > 0 for v in summary.values()))
    leakage = dict(passed=True, approved_feature_count=len(FEATURE_NAMES), fixed_feature_allowlist=list(FEATURE_NAMES), matrix_join_key_excluded_from_features="example_id", feature_event_provenance_checks=event_checks, feature_join_availability_checks=join_checks, positive_label_source_checks=positive_checks, negative_complete_followup_checks=negative_checks, source_hashes_required=True, chronological_assignment_verified=True, horizon_purge_checks_passed=True, fitted_preprocessing=False, estimators_fitted=False, generator_internals_accessed=False, raw_customer_product_ids_in_matrix=False, future_order_refs_in_matrix=False, audit_refs_location="feature_lineage.jsonl and label_audit.jsonl only")
    return report, leakage
