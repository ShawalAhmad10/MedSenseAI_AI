"""Small reproducible integration cases for the forward commerce simulation."""

from collections import Counter, defaultdict
from datetime import timedelta
import json
import re

import pytest
from pydantic import ValidationError

from medsense_ai.sales_data import ValidationContext, validate_dataset, is_knowable
from medsense_ai.sales_data.synthetic import generate, profile_config, SyntheticConfig
from medsense_ai.sales_data.synthetic.config import DAY, TICK, stream
from medsense_ai.sales_data.synthetic.qa import build_qa, require_default_acceptance
from medsense_ai.sales_data.synthetic.serialization import load_dataset, persist, verify_hashes


@pytest.fixture(scope="module")
def smoke():
    config = profile_config("smoke")
    result = generate(config)
    qa, timing = build_qa(result.dataset, config, result.generator_audit)
    return config, result, qa, timing


def test_default_calendar_scale_and_configuration_hash():
    config = SyntheticConfig()
    assert (config.customers, config.products, config.master_seed) == (2500, 200, 260903)
    assert config.start.isoformat() == "2025-09-01T00:00:00+00:00"
    assert config.end.isoformat() == "2026-09-01T00:00:00+00:00"
    assert SyntheticConfig.model_validate_json(config.model_dump_json()).sha256 == config.sha256
    assert profile_config(master_seed=260904).sha256 != config.sha256
    assert stream(config, "sessions").random() == stream(config, "sessions").random()
    assert stream(config, "sessions").random() != stream(config, "orders").random()


@pytest.mark.parametrize("updates", [
    {"customers": 0}, {"products": True}, {"master_seed": -1}, {"master_seed": 1.5},
    {"start": "2025-09-01T00:00:00"}, {"end": "2025-08-01T00:00:00Z"},
    {"end": "2026-09-01T00:01:00Z"}, {"mixture": (.5, .5, .5)},
    {"probability_min": .95}, {"delay_min_hours": 100}, {"cart_intercept": float("nan")},
    {"staggered_products": 1.},
])
def test_invalid_configuration_is_rejected(updates):
    with pytest.raises(ValidationError):
        SyntheticConfig(**updates)


def test_entity_counts_ids_and_staggered_arrivals(smoke):
    config, result, qa, _ = smoke
    data = result.dataset
    assert len(data.customers) == config.customers and len(data.products) == config.products
    assert len({c.customer_id for c in data.customers}) == config.customers
    assert sum(c.first_seen_at > config.start for c in data.customers) == round(config.customers * .15)
    assert sum(p.available_at > config.start for p in data.products) == round(config.products * .05)
    assert all(p.selling_unit == "unit" and p.merchandising_group.startswith("group_") for p in data.products)
    assert qa["synthetic_process_sanity"]["nonuniform_product_views"]
    assert qa["synthetic_process_sanity"]["nonuniform_customer_activity"]
    assert qa["synthetic_process_sanity"]["nonuniform_order_values"]


def test_full_canonical_cart_inventory_validation_and_amounts(smoke):
    config, result, qa, _ = smoke
    data = result.dataset
    assert validate_dataset(data, context=ValidationContext(cart_history_start=config.start, require_order_items=True, require_inventory=True)).is_valid
    totals = Counter()
    for item in data.order_items:
        totals[item.order_id] += item.line_subtotal_minor
    assert all(totals[o.order_id] == o.item_subtotal_minor for o in data.orders)
    assert qa["inventory"]["conservation_passed"]
    assert qa["inventory"]["negative_state_observations"] == 0
    kinds = Counter(m.movement_kind for m in data.inventory_movements)
    assert kinds["opening_balance"] == config.products
    assert all(kinds[kind] > 0 for kind in ("receipt", "reserve", "fulfill", "release"))
    assert result.generator_audit["opportunities"]["stock_blocked_cart_opportunities"] > 0


def test_event_calendar_and_session_policy(smoke):
    config, result, _, _ = smoke
    data = result.dataset
    for collection in (data.events, data.inventory_movements):
        assert all(config.start <= r.occurred_at <= r.available_at < config.end for r in collection)
    assert all(c.first_seen_at <= c.available_at < config.end for c in data.customers)
    sessions, customers = defaultdict(list), defaultdict(list)
    for event in data.events:
        if event.event_name in ("product_viewed", "cart_item_added", "cart_item_removed"):
            sessions[event.session_id].append(event.occurred_at)
            if event.customer_id:
                customers[event.session_id].append(event.customer_id)
    intervals = defaultdict(list)
    for session, times in sessions.items():
        times.sort()
        assert times[-1] - times[0] < DAY
        assert all(b - a < timedelta(minutes=30) for a, b in zip(times, times[1:]))
        if customers[session]:
            intervals[customers[session][0]].append((times[0], times[-1]))
    for values in intervals.values():
        values.sort()
        assert all(b[0] - a[1] >= timedelta(minutes=30) for a, b in zip(values, values[1:]))


def test_generated_funnel_uses_existing_engine_and_maturity(smoke):
    _, _, qa, _ = smoke
    funnel = qa["funnel_v1"]
    counts = [s["stage_count"] for s in funnel["stages"]]
    assert counts == sorted(counts, reverse=True)
    assert all(n > 0 for n in counts)
    assert funnel["diagnostics"]["eligible_mature_sessions"] == counts[0]
    assert funnel["diagnostics"]["immature_sessions"] > 0
    # Tiny stochastic runs need not contain every low-probability path.
    assert funnel["diagnostics"]["unattributed_orders"] >= 0
    assert counts[3] <= qa["order_outcomes"]["completed"]
    assert qa["lead_readiness"]["insufficient_data"] > 0
    # A 60-day smoke calendar cannot provide a 60-day lookback plus 30-day label.
    assert qa["lead_readiness"]["eligible_mature"] == 0


def test_smoke_byte_reproduction_roundtrip_and_hash_tampering(smoke, tmp_path):
    config, first, qa, timing = smoke
    second = generate(config)
    assert first.dataset == second.dataset
    assert first.generator_audit == second.generator_audit
    qa2, timing2 = build_qa(second.dataset, config, second.generator_audit)
    assert qa == qa2
    for name, result, report, seconds in (("a", first, qa, timing), ("b", second, qa2, timing2)):
        persist(result, config, report, seconds, tmp_path / name / "data", tmp_path / name / "artifacts")
    first_hashes = verify_hashes(tmp_path / "a/data", tmp_path / "a/artifacts")
    assert first_hashes == verify_hashes(tmp_path / "b/data", tmp_path / "b/artifacts")
    assert load_dataset(tmp_path / "a/data", config) == first.dataset
    assert first_hashes["row_counts"]["events.jsonl"] == len(first.dataset.events)
    assert (tmp_path / "a/artifacts/generation_report.json").read_bytes() != (tmp_path / "b/artifacts/generation_report.json").read_bytes()
    with pytest.raises(FileExistsError):
        persist(first, config, qa, timing, tmp_path / "a/data", tmp_path / "a/artifacts")
    with (tmp_path / "a/data/events.jsonl").open("ab") as handle:
        handle.write(b"\n")
    with pytest.raises(ValueError, match="hash mismatch"):
        verify_hashes(tmp_path / "a/data", tmp_path / "a/artifacts")


def test_robustness_seed_changes_observed_content(smoke):
    config, first, _, _ = smoke
    second = generate(profile_config("smoke", master_seed=260904))
    assert len(first.dataset.events) != len(second.dataset.events)
    assert second.dataset.manifest.generation_seed == 260904
    assert second.dataset.manifest.generation_config_hash != config.sha256


@pytest.mark.parametrize("scenario", ["delayed", "outage", "unsupported_views"])
def test_separate_observation_scenarios_are_honest(smoke, scenario):
    config = profile_config("smoke", scenario=scenario)
    result = generate(config)
    qa, _ = build_qa(result.dataset, config, result.generator_audit)
    assert result.dataset.manifest.dataset_id != smoke[1].dataset.manifest.dataset_id
    assert qa["qa_passed"]
    if scenario == "delayed":
        delayed = [e for e in result.dataset.events if e.available_at > e.occurred_at]
        assert delayed
        for event in delayed:
            assert not is_knowable(event, event.occurred_at)
            assert is_knowable(event, event.available_at)
            for row in result.dataset.coverage:
                if row.stream.value == event.event_name.value and row.interval_start <= event.occurred_at <= row.interval_end:
                    assert row.known_at >= event.available_at
        assert qa["funnel_v1"]["diagnostics"]["coverage_unavailable_sessions"] == 0
    else:
        assert qa["funnel_v1"]["status"] == "insufficient_coverage"
        if scenario == "unsupported_views":
            assert qa["funnel_v1"]["stages"][0]["stage_count"] is None


def test_latent_state_is_absent_and_qa_has_no_customer_label_rows(smoke):
    _, result, qa, _ = smoke
    prohibited = {"segment", "propensity", "affinity", "lead_score", "target", "label", "next_purchase_at", "placement_probability", "latent_score", "random_draw"}
    for collection in (result.dataset.customers, result.dataset.products, result.dataset.events, result.dataset.orders, result.dataset.order_items, result.dataset.inventory_movements):
        for row in collection:
            assert not prohibited & set(row.model_dump())
    assert qa["leakage_audit"]["passed"]
    assert not re.search(r"customer_\d+", json.dumps(qa["lead_readiness"]))
    assert all("customer_id" not in week for week in qa["lead_readiness"]["weekly"])
    assert result.dataset.manifest.data_origin == "synthetic_development"


def test_bounded_qa_profile_has_both_mature_classes_and_pending_orders():
    config = profile_config("qa")
    result = generate(config)
    qa, _ = build_qa(result.dataset, config, result.generator_audit)
    require_default_acceptance(qa)
    assert qa["lead_readiness"]["positives"] > 0
    assert qa["lead_readiness"]["negatives"] > 0
    assert qa["lead_readiness"]["immature"] > 0
    assert qa["order_outcomes"]["pending"] > 0
    assert qa["funnel_v1"]["diagnostics"]["unattributed_orders"] > 0
    assert qa["order_outcomes"]["completed"] + qa["order_outcomes"]["cancelled"] + qa["order_outcomes"]["pending"] == len(result.dataset.orders)


def test_explicit_unattributed_path_never_fabricates_order_stage():
    config = profile_config("smoke", unattributed_order_probability=1.)
    result = generate(config)
    qa, _ = build_qa(result.dataset, config, result.generator_audit)
    assert all(o.session_id is None and o.cart_id for o in result.dataset.orders)
    assert qa["funnel_v1"]["stages"][2]["stage_count"] == 0
    assert qa["funnel_v1"]["diagnostics"]["unattributed_orders"] == len(result.dataset.orders)


@pytest.mark.parametrize("fault", ["orphan", "naive", "terminal_conflict", "over_removal", "conflicting_duplicate", "negative_stock", "impossible_reserve", "impossible_release", "unknown_coverage"])
def test_qa_rejects_isolated_corrupt_conformance_inputs(smoke, fault):
    config, result, _, _ = smoke
    data = result.dataset.model_dump(mode="json")
    if fault == "orphan":
        data["events"][0]["product_id"] = "missing_product"
    elif fault == "naive":
        data["events"][0]["occurred_at"] = "2025-09-01T01:00:00"
    elif fault == "terminal_conflict":
        terminal = next(e for e in data["events"] if e["event_name"] == "purchase_completed")
        data["events"].append({**terminal, "event_name": "order_cancelled", "event_id": "conflicting_terminal", "source_record_ref": "conflicting_terminal"})
    elif fault == "over_removal":
        next(e for e in data["events"] if e["event_name"] == "cart_item_removed")["quantity"] = 1_000_000
    elif fault == "conflicting_duplicate":
        addition = next(e for e in data["events"] if e["event_name"] == "cart_item_added")
        data["events"].append({**addition, "quantity": addition["quantity"] + 1})
    elif fault == "negative_stock":
        data["inventory_movements"][0]["on_hand_delta"] = -1
    elif fault == "impossible_reserve":
        next(m for m in data["inventory_movements"] if m["movement_kind"] == "reserve")["reserved_delta"] += 1
    elif fault == "impossible_release":
        next(m for m in data["inventory_movements"] if m["movement_kind"] == "release")["reserved_delta"] -= 1
    else:
        data["coverage"] = [c for c in data["coverage"] if c["stream"] != "purchase_completed"]
    with pytest.raises(ValueError, match="QA requires"):
        build_qa(data, config)


def test_successful_additions_are_stock_supported_at_their_event_time(smoke):
    _, result, _, _ = smoke
    data = result.dataset
    inventory, carts = defaultdict(int), defaultdict(Counter)
    timeline = [(m.occurred_at, 0, m) for m in data.inventory_movements]
    timeline += [(e.occurred_at, 1, e) for e in data.events if e.event_name in ("cart_item_added", "cart_item_removed")]
    for _, kind, row in sorted(timeline, key=lambda item: (item[0], item[1])):
        if kind == 0:
            inventory[row.product_id] += row.on_hand_delta - row.reserved_delta
        else:
            cart = carts[row.cart_id]
            if row.event_name == "cart_item_added":
                assert cart[row.product_id] + row.quantity <= inventory[row.product_id]
                cart[row.product_id] += row.quantity
            else:
                cart[row.product_id] -= row.quantity
                assert cart[row.product_id] >= 0
