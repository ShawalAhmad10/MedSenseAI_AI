"""Isolated, declared observation defects; never alter the clean main simulation."""

from datetime import timedelta

from .. import CoverageInterval, SalesDataset
from .config import DAY, TICK, SyntheticConfig, stream


def _replace(row, **updates):
    return type(row).model_validate({**row.model_dump(), **updates})


def apply_scenario(data: SalesDataset, config: SyntheticConfig) -> SalesDataset:
    events, rows = list(data.events), []
    if config.scenario == "delayed":
        rng = stream(config, "telemetry")
        late_by_stream = {}
        for i, event in enumerate(events):
            if event.event_name not in ("product_viewed", "cart_item_added"):
                continue
            if rng.random() < config.delayed_event_probability:
                available = event.occurred_at + timedelta(hours=rng.uniform(config.delay_min_hours, config.delay_max_hours))
                if available <= data.manifest.extracted_at:
                    events[i] = _replace(event, available_at=available)
                    late_by_stream.setdefault(event.event_name.value, []).append(events[i])
        for row in data.coverage:
            # A watermark cannot certify an undelivered event. Keep source event
            # times, postpone only its affected assertion until reconciliation.
            known = max([row.known_at] + [e.available_at for e in late_by_stream.get(row.stream.value, ()) if row.interval_start <= e.occurred_at <= row.interval_end])
            rows.append(_replace(row, known_at=known))
    elif config.scenario in ("outage", "unsupported_views"):
        left = config.start + min(DAY * 14, (config.end - config.start) / 3)
        right = min(config.end - TICK, left + DAY * 2)
        if config.scenario == "unsupported_views":
            left, right = config.start, config.end - TICK
        events = [e for e in events if not (e.event_name == "product_viewed" and left <= e.occurred_at <= right)]
        for row in data.coverage:
            if row.stream != "product_viewed" or row.interval_end < left or row.interval_start > right:
                rows.append(row)
                continue
            if row.interval_start < left:
                rows.append(_replace(row, interval_end=left - TICK))
            if row.interval_end > right:
                rows.append(_replace(row, interval_start=right + TICK))
        rows.append(CoverageInterval(dataset_id=config.dataset_id, stream="product_viewed", interval_start=left, interval_end=right, known_at=right, coverage_status="unsupported" if config.scenario == "unsupported_views" else "unavailable", reason_code=f"synthetic_{config.scenario}"))
    else:
        raise ValueError("Perturbation requires an explicitly named scenario")
    return SalesDataset(manifest=data.manifest, coverage=tuple(rows), customers=data.customers, products=data.products, events=tuple(events), orders=data.orders, order_items=data.order_items, inventory_movements=data.inventory_movements)
