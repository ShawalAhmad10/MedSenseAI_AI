"""Frozen chronological policy; partition assignment depends exclusively on T."""

from datetime import datetime

from medsense_ai.sales_data.contracts import utc_instant
from .contracts import DAY, Partition

BOUNDARIES = tuple(utc_instant(value + "T00:00:00Z") for value in (
    "2025-09-01", "2025-11-01", "2026-03-01", "2026-04-01",
    "2026-05-01", "2026-06-01", "2026-08-02", "2026-09-01",
))
PERIODS = tuple(zip(tuple(Partition)[:7], BOUNDARIES, BOUNDARIES[1:]))
SUPERVISED = (Partition.TRAIN, Partition.VALIDATION, Partition.TEST)


def partition_at(at: datetime) -> Partition:
    at = utc_instant(at)
    return next((part for part, start, end in PERIODS if start <= at < end), Partition.OUTSIDE)


def mondays(start: datetime, end: datetime) -> tuple[datetime, ...]:
    start, end = utc_instant(start), utc_instant(end)
    if end <= start:
        return ()
    at = start.replace(hour=0, minute=0, second=0, microsecond=0)
    at += DAY * ((7 - at.weekday()) % 7)
    if at < start:
        at += DAY * 7
    result = []
    while at < end:
        result.append(at)
        at += DAY * 7
    return tuple(result)


def observation_times(start: datetime, end: datetime) -> tuple[datetime, ...]:
    return tuple(at for at in mondays(start, end) if partition_at(at) in SUPERVISED)


def label_cutoff(partition: Partition, freeze: datetime) -> datetime:
    freeze = utc_instant(freeze)
    planned = {Partition.TRAIN: BOUNDARIES[3], Partition.VALIDATION: BOUNDARIES[5], Partition.TEST: freeze}
    if partition not in planned:
        raise ValueError("History/purge/tail periods cannot receive supervised labels")
    return min(planned[partition], freeze)


def split_manifest() -> dict:
    return {"split_policy_version": "lead_temporal_split_v1", "boundary_semantics": "[start,end); Monday 00:00 UTC only", "periods": [{"partition": p.value, "start": a.isoformat(), "end": b.isoformat(), "supervised": p in SUPERVISED} for p, a, b in PERIODS], "train_label_cutoff": BOUNDARIES[3].isoformat(), "validation_label_cutoff": BOUNDARIES[5].isoformat(), "test_label_cutoff": "canonical manifest.extracted_at", "customer_overlap": "allowed; returning-customer prediction; IDs are audit/join keys only", "assignment_inputs": ["observation_time"], "preprocessing_fitted": False}
