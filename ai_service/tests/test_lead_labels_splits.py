"""Future-outcome and split boundaries, with a separate small raw-record label oracle."""

from datetime import datetime, timezone

import pytest

from medsense_ai.lead_scoring import BuildConfig, Eligibility, LeadIndex, build_dataset, build_features, build_label
from medsense_ai.lead_scoring.contracts import LabelStatus, Partition
from medsense_ai.lead_scoring.splits import BOUNDARIES, SUPERVISED, label_cutoff, mondays, observation_times, partition_at
from lead_dataset_fixtures import DAY, FREEZE, START, T, TICK, accepted, changed, dataset


@pytest.mark.parametrize(("created", "completed", "kind", "positive"), [
    (T+DAY, T+DAY*2, "purchase_completed", 1),
    (T+TICK, T+DAY*30, "purchase_completed", 1),
    (T+DAY*30, T+DAY*30, "purchase_completed", 1),
    (T, T+DAY, "purchase_completed", 0),
    (T-TICK, T+DAY, "purchase_completed", 0),
    (T+DAY, T+DAY*30+TICK, "purchase_completed", 0),
    (T+DAY, T+DAY*2, "order_cancelled", 0),
    (T+DAY, None, None, 0),
])
def test_future_creation_and_completion_rules(created, completed, kind, positive):
    data = dataset([(T-DAY*21,T-DAY*20,"purchase_completed"), (created,completed,kind)])
    index = LeadIndex(accepted(data))
    f = build_features(index,"customer_1",T)
    label = build_label(index,"customer_1",T,FREEZE,f.eligibility)
    assert label.status == LabelStatus.LABELED and label.label == positive
    assert bool(label.qualifying_order_ids) == bool(positive)
    # Deliberately separate direct scan, not the feature/label query implementation.
    raw_orders = {o.order_id:o for o in data.orders}
    oracle = any(e.event_name == "purchase_completed" and e.customer_id == "customer_1" and T < e.occurred_at <= T+DAY*30 and T < raw_orders[e.order_id].created_at <= T+DAY*30 and max(e.available_at,raw_orders[e.order_id].available_at) <= FREEZE for e in data.events)
    assert bool(label.label) == oracle


def test_no_eligible_history_never_becomes_negative():
    index = LeadIndex(accepted(dataset([])))
    features = build_features(index,"customer_1",T)
    label = build_label(index,"customer_1",T,FREEZE,features.eligibility)
    assert features.eligibility == Eligibility.OUT_OF_SCOPE
    assert label.status == LabelStatus.NOT_ELIGIBLE and label.label is None


def test_early_positive_still_waits_for_full_horizon():
    index = LeadIndex(accepted(dataset()))
    label = build_label(index,"customer_1",T,T+DAY*30-TICK,Eligibility.ELIGIBLE)
    assert label.status == LabelStatus.IMMATURE and label.label is None
    label = build_label(index,"customer_1",T,T+DAY*30,Eligibility.ELIGIBLE)
    assert label.status == LabelStatus.LABELED and label.label == 1


@pytest.mark.parametrize("fault", ["missing_coverage", "partial_coverage", "late_completion", "late_header"])
def test_incomplete_followup_is_unlabeled_even_with_observed_positive(fault):
    data = dataset()
    if fault in ("missing_coverage", "partial_coverage"):
        rows = [c for c in data.coverage if c.stream != "purchase_completed" or c.interval_end <= T]
        if fault == "partial_coverage":
            template = data.coverage[0]
            rows.append(changed(template, stream="purchase_completed", interval_start=T+TICK, interval_end=FREEZE, known_at=FREEZE, coverage_status="partial", reason_code="fixture_gap"))
        data = changed(data,coverage=rows)
    elif fault == "late_completion":
        data = changed(data,events=[changed(e,available_at=T+DAY*31) if e.event_id=="order_1_purchase_completed" else e for e in data.events])
    else:
        data = changed(data,orders=[changed(o,available_at=T+DAY*31) if o.order_id=="order_1" else o for o in data.orders])
    index = LeadIndex(accepted(data))
    assert build_features(index,"customer_1",T).eligibility == Eligibility.ELIGIBLE
    label = build_label(index,"customer_1",T,T+DAY*30,Eligibility.ELIGIBLE)
    assert label.status == LabelStatus.INSUFFICIENT_FOLLOWUP and label.label is None


@pytest.mark.parametrize(("boundary", "at_partition", "before_partition"), [
    (0,Partition.WARMUP,Partition.OUTSIDE),
    (1,Partition.TRAIN,Partition.WARMUP),
    (2,Partition.PURGE_1,Partition.TRAIN),
    (3,Partition.VALIDATION,Partition.PURGE_1),
    (4,Partition.PURGE_2,Partition.VALIDATION),
    (5,Partition.TEST,Partition.PURGE_2),
    (6,Partition.TAIL,Partition.TEST),
    (7,Partition.OUTSIDE,Partition.TAIL),
])
def test_exact_split_boundaries(boundary, at_partition, before_partition):
    assert partition_at(BOUNDARIES[boundary]) == at_partition
    assert partition_at(BOUNDARIES[boundary]-TICK) == before_partition


def test_monday_schedule_and_purge_horizon_protection():
    schedule = observation_times(START,FREEZE)
    assert len(schedule) == 30 and len(set(schedule)) == 30
    assert all(t.weekday()==0 and t.hour==t.minute==t.second==t.microsecond==0 for t in schedule)
    assert {part:sum(partition_at(t)==part for t in schedule) for part in SUPERVISED} == {Partition.TRAIN:17,Partition.VALIDATION:4,Partition.TEST:9}
    assert all(t+DAY*30 < BOUNDARIES[3] for t in schedule if partition_at(t)==Partition.TRAIN)
    assert all(t+DAY*30 < BOUNDARIES[5] for t in schedule if partition_at(t)==Partition.VALIDATION)
    assert all(t+DAY*30 <= FREEZE for t in schedule if partition_at(t)==Partition.TEST)
    assert mondays(T+TICK,T+DAY*8) == (T+DAY*7,)
    assert label_cutoff(Partition.TRAIN,FREEZE)==BOUNDARIES[3]
    assert label_cutoff(Partition.VALIDATION,FREEZE)==BOUNDARIES[5]
    assert label_cutoff(Partition.TEST,FREEZE)==FREEZE


def test_split_cutoff_blocks_later_delivered_training_outcome():
    at = datetime(2026,2,23,tzinfo=timezone.utc)
    data = dataset([(at-DAY*10,at-DAY*9,"purchase_completed"),(at+DAY,at+DAY*2,"purchase_completed")])
    data = changed(data, events=[changed(e,available_at=BOUNDARIES[3]+TICK) if e.event_id=="order_1_purchase_completed" else e for e in data.events])
    built = build_dataset(accepted(data),BuildConfig(observation_start=at,observation_end=at+DAY))
    assert len(built.examples)==1
    row=built.examples[0]
    assert row.feature_result.eligibility==Eligibility.ELIGIBLE
    assert row.label_result.status==LabelStatus.INSUFFICIENT_FOLLOWUP
    assert not row.supervised


def test_future_cutoff_beyond_export_is_rejected():
    with pytest.raises(ValueError):
        build_label(LeadIndex(accepted(dataset())),"customer_1",T,FREEZE+TICK,Eligibility.ELIGIBLE)
