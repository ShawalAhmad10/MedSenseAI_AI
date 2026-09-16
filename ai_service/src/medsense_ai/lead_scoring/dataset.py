"""Monday snapshots with separate eligibility, labels and chronological assignment."""

from collections import Counter
from dataclasses import dataclass
import hashlib
from time import perf_counter

from medsense_ai.sales_data import ValidationReport, is_knowable
from .contracts import BuildConfig, Example, TARGET_VERSION, stable_json, TICK
from .features import LeadIndex, build_features
from .labels import build_label
from .splits import BOUNDARIES, SUPERVISED, label_cutoff, mondays, observation_times, partition_at


@dataclass(frozen=True)
class BuiltDataset:
    examples: tuple[Example, ...]
    config: BuildConfig
    skipped_schedule: dict[str, int]
    timings: dict[str, float]


def example_id(dataset_id, namespace, customer_id, at) -> str:
    return hashlib.sha256(stable_json([dataset_id, namespace, customer_id, at.isoformat(), TARGET_VERSION])).hexdigest()


def build_dataset(validated: ValidationReport, config: BuildConfig | None = None) -> BuiltDataset:
    config = BuildConfig() if config is None else BuildConfig.model_validate(config)
    begin = perf_counter()
    index = LeadIndex(validated)
    manifest = index.data.manifest
    customers = sorted(index.customers.values(), key=lambda c: c.customer_id)
    if config.customer_limit is not None:
        customers = customers[:config.customer_limit]
    indexed_seconds = perf_counter() - begin
    feature_seconds = label_seconds = 0.
    examples = []
    at_end = min(config.observation_end, manifest.extracted_at + TICK)
    for at in observation_times(config.observation_start, at_end):
        partition = partition_at(at)
        cutoff = label_cutoff(partition, manifest.extracted_at)
        for customer in customers:
            if not is_knowable(customer, at):
                continue
            begin = perf_counter()
            features = build_features(index, customer.customer_id, at)
            feature_seconds += perf_counter() - begin
            begin = perf_counter()
            label = build_label(index, customer.customer_id, at, cutoff, features.eligibility)
            label_seconds += perf_counter() - begin
            examples.append(Example(
                example_id=example_id(manifest.dataset_id, manifest.source_namespace, customer.customer_id, at),
                dataset_id=manifest.dataset_id, source_namespace=manifest.source_namespace,
                customer_id=customer.customer_id, observation_time=at, data_origin=manifest.data_origin,
                partition=partition, feature_result=features, label_result=label,
            ))
    skipped = Counter()
    for at in mondays(BOUNDARIES[0], min(BOUNDARIES[-1], manifest.extracted_at + TICK)):
        part = partition_at(at)
        if part not in SUPERVISED:
            skipped[part.value] += sum(is_knowable(c, at) for c in customers)
    return BuiltDataset(tuple(sorted(examples, key=lambda e: e.example_id)), config, dict(sorted(skipped.items())), dict(index_seconds=indexed_seconds, snapshot_feature_seconds=feature_seconds, label_seconds=label_seconds))
