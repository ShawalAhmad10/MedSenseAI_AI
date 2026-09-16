"""Point-in-time construction of observed completed-unit product-week examples."""

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import hashlib
import math
from time import perf_counter

from medsense_ai.sales_data import (
    CoverageStream, EventName, MovementKind, ValidationReport, assess_coverage, is_knowable,
)

from .contracts import (
    DAY, FEATURE_NAMES, TARGET_VERSION, TICK, WEEK, BuildConfig, Exclusion,
    FeatureLineage, ForecastExample, ForecastFeatures, InventoryContextStatus,
    Partition, stable_json,
)

TRAIN_END = datetime(2026, 4, 6, tzinfo=timezone.utc)
VALIDATION_START = datetime(2026, 4, 13, tzinfo=timezone.utc)
VALIDATION_END = datetime(2026, 6, 8, tzinfo=timezone.utc)
TEST_START = datetime(2026, 6, 15, tzinfo=timezone.utc)
TEST_END = datetime(2026, 8, 24, tzinfo=timezone.utc)


@dataclass(frozen=True)
class TimedQuantity:
    occurred_at: datetime
    available_at: datetime
    quantity: int
    order_id: str
    event_id: str


@dataclass(frozen=True)
class BuiltForecastDataset:
    examples: tuple[ForecastExample, ...]
    exclusions: tuple[Exclusion, ...]
    config: BuildConfig
    timings: dict[str, float]


@dataclass(frozen=True)
class ForecastFeatureSnapshot:
    """Feature-only point-in-time result shared by dataset construction and runtime."""

    product_id: str
    selling_unit: str
    observation_time: datetime
    features: ForecastFeatures
    lineage: FeatureLineage


def observation_times(config: BuildConfig | None = None) -> tuple[datetime, ...]:
    config = BuildConfig() if config is None else BuildConfig.model_validate(config)
    values, at = [], config.first_observation
    while at <= config.last_observation:
        if at.weekday() != 0 or at.time() != datetime.min.time() or at.tzinfo != timezone.utc:
            raise ValueError("Forecast observations must be Monday 00:00 UTC")
        values.append(at)
        at += WEEK
    return tuple(values)


def partition_at(at: datetime) -> Partition:
    if at <= TRAIN_END:
        return Partition.TRAIN
    if VALIDATION_START <= at <= VALIDATION_END:
        return Partition.VALIDATION
    if TEST_START <= at <= TEST_END:
        return Partition.TEST
    raise ValueError("Observation is outside forecast_temporal_split_v1")


def example_id(dataset_id: str, namespace: str, product_id: str, at: datetime) -> str:
    return hashlib.sha256(stable_json([dataset_id, namespace, product_id, at.isoformat(), TARGET_VERSION])).hexdigest()


class ForecastIndex:
    def __init__(self, validated: ValidationReport):
        if not validated.is_valid:
            raise ValueError("Forecast construction requires an accepted canonical dataset")
        self.data = validated.validated_dataset
        self.products = {p.product_id: p for p in self.data.products}
        self.orders = {o.order_id: o for o in self.data.orders}
        self.items = defaultdict(list)
        for item in self.data.order_items:
            self.items[item.order_id].append(item)
        self.sales = defaultdict(list)
        self.cancellations = defaultdict(list)
        events_by_order = defaultdict(list)
        for event in self.data.events:
            if event.order_id:
                events_by_order[event.order_id].append(event)
        for order_id, events in events_by_order.items():
            order = self.orders.get(order_id)
            if order is None:
                continue
            for event in events:
                if event.event_name not in (EventName.PURCHASE_COMPLETED, EventName.ORDER_CANCELLED):
                    continue
                for item in self.items[order_id]:
                    available = max(event.available_at, order.available_at, item.available_at)
                    fact = TimedQuantity(event.occurred_at, available, item.quantity, order_id, event.event_id)
                    target = self.sales if event.event_name == EventName.PURCHASE_COMPLETED else self.cancellations
                    target[item.product_id].append(fact)
        for values in (*self.sales.values(), *self.cancellations.values()):
            values.sort(key=lambda row: (row.occurred_at, row.order_id))
        grouped = defaultdict(lambda: defaultdict(lambda: [0, 0, [], []]))
        for movement in self.data.inventory_movements:
            row = grouped[movement.product_id][movement.occurred_at]
            row[0] += movement.on_hand_delta
            row[1] += movement.reserved_delta
            row[2].append(movement)
            if movement.movement_kind == MovementKind.RECEIPT:
                row[3].append(movement)
        self.inventory = {
            product: tuple((at, values[0], values[1], tuple(values[2]), tuple(values[3])) for at, values in sorted(rows.items()))
            for product, rows in grouped.items()
        }
        self.opening = {
            product: min(m.occurred_at for _, _, _, movements, _ in rows for m in movements if m.movement_kind == MovementKind.OPENING_BALANCE)
            for product, rows in self.inventory.items()
            if any(m.movement_kind == MovementKind.OPENING_BALANCE for _, _, _, movements, _ in rows for m in movements)
        }
        self.coverage_cache = {}

    def covered(self, streams, start, end, cutoff) -> bool:
        key = (tuple(streams), start, end, cutoff)
        if key not in self.coverage_cache:
            closed_end = end - TICK if end > start else end
            self.coverage_cache[key] = all(
                assess_coverage(self.data.manifest, self.data.coverage, stream, start, closed_end,
                                known_by=cutoff).is_complete for stream in streams
            )
        return self.coverage_cache[key]

    @staticmethod
    def _window(rows, start, end, cutoff):
        return [row for row in rows if start <= row.occurred_at < end and row.available_at <= cutoff]

    @staticmethod
    def _blocked(rows, start, end, cutoff):
        return any(start <= row.occurred_at < end and row.available_at > cutoff for row in rows)

    def inventory_metrics(self, product_id, start, end, cutoff):
        rows = self.inventory.get(product_id, ())
        movements = [m for at, _, _, group, _ in rows if at <= cutoff for m in group if m.available_at <= cutoff]
        if not movements or product_id not in self.opening:
            return None
        hand = reserved = 0
        by_time = defaultdict(lambda: [0, 0, [], []])
        for movement in movements:
            entry = by_time[movement.occurred_at]
            entry[0] += movement.on_hand_delta; entry[1] += movement.reserved_delta; entry[2].append(movement)
            if movement.movement_kind == MovementKind.RECEIPT:
                entry[3].append(movement)
        ordered = sorted(by_time.items())
        movement_ids = []
        for at, (dh, dr, group, receipts) in ordered:
            if at <= start:
                hand += dh; reserved += dr
                if at == start:
                    movement_ids.extend(m.movement_id for m in group)
        stock_at_start = hand - reserved
        stockout_start = start if stock_at_start == 0 else None
        stockout_seconds = 0
        for at, (dh, dr, group, _) in ordered:
            if not start < at < end:
                continue
            before = hand - reserved; hand += dh; reserved += dr; after = hand - reserved
            movement_ids.extend(m.movement_id for m in group)
            if before > 0 and after == 0:
                stockout_start = at
            elif before == 0 and after > 0 and stockout_start is not None:
                stockout_seconds += int((at - stockout_start).total_seconds()); stockout_start = None
        if stockout_start is not None:
            stockout_seconds += int((end - stockout_start).total_seconds())
        return stock_at_start, stockout_seconds, tuple(sorted(set(movement_ids)))

    def receipt_quantity(self, product_id, start, end, cutoff):
        return sum(m.on_hand_delta for at, _, _, _, receipts in self.inventory.get(product_id, ())
                   if start <= at < end for m in receipts if m.available_at <= cutoff)


def _mean(value: int, weeks: int) -> Decimal:
    return Decimal(value) / Decimal(weeks)


def _calendar(at):
    iso = at.isocalendar().week
    return (math.sin(2 * math.pi * iso / 53), math.cos(2 * math.pi * iso / 53),
            math.sin(2 * math.pi * at.month / 12), math.cos(2 * math.pi * at.month / 12))


def weekly_completed_units(rows, at, cutoff):
    """Eight exact half-open lag weeks, newest first, using evidence known at cutoff."""
    return tuple(sum(row.quantity for row in ForecastIndex._window(
        rows, at - lag * WEEK, at - (lag - 1) * WEEK, cutoff)) for lag in range(1, 9))


def _feature_precheck(index: ForecastIndex, product, at):
    history_start = at - 8 * WEEK
    sales_rows, cancel_rows = index.sales[product.product_id], index.cancellations[product.product_id]
    base_streams = (CoverageStream.PRODUCTS, CoverageStream.ORDERS, CoverageStream.ORDER_ITEMS, CoverageStream.PURCHASE_COMPLETED)
    history_streams = (*base_streams, CoverageStream.ORDER_CANCELLED)
    if not is_knowable(product, at):
        return "product_not_known_at_t"
    if not index.covered(history_streams, history_start, at, at):
        return "insufficient_historical_coverage"
    return None


def _compute_feature_snapshot(index: ForecastIndex, product, at):
    history_start = at - 8 * WEEK
    sales_rows, cancel_rows = index.sales[product.product_id], index.cancellations[product.product_id]
    if index._blocked(sales_rows, history_start, at, at) or index._blocked(cancel_rows, history_start, at, at):
        return None, "late_historical_fact"
    origin = index.opening.get(product.product_id)
    if origin is None or not index.covered((CoverageStream.INVENTORY_MOVEMENTS,), origin, at + TICK, at):
        return None, "insufficient_pre_t_inventory"
    weekly = weekly_completed_units(sales_rows, at, at)
    completion_evidence = [row.event_id for row in index._window(sales_rows, history_start, at, at)]
    cancellations_1 = index._window(cancel_rows, at - WEEK, at, at)
    cancellations_4 = index._window(cancel_rows, at - 4 * WEEK, at, at)
    inv_1 = index.inventory_metrics(product.product_id, at - WEEK, at, at)
    inv_4 = index.inventory_metrics(product.product_id, at - 4 * WEEK, at, at)
    state_t = index.inventory_metrics(product.product_id, at, at + TICK, at)
    if inv_1 is None or inv_4 is None or state_t is None:
        return None, "insufficient_pre_t_inventory"
    week_sin, week_cos, month_sin, month_cos = _calendar(at)
    sum4, sum8 = sum(weekly[:4]), sum(weekly)
    features = ForecastFeatures(
        completed_units_lag_1w=weekly[0], completed_units_lag_2w=weekly[1],
        completed_units_lag_4w=weekly[3], completed_units_lag_8w=weekly[7],
        completed_units_sum_4w=sum4, completed_units_mean_4w=_mean(sum4, 4),
        completed_units_sum_8w=sum8, completed_units_mean_8w=_mean(sum8, 8),
        nonzero_sales_weeks_8w=sum(value > 0 for value in weekly),
        cancellation_count_1w=len({row.order_id for row in cancellations_1}),
        cancellation_count_4w=len({row.order_id for row in cancellations_4}),
        available_stock_at_t=state_t[0], stockout_seconds_1w=inv_1[1],
        stockout_seconds_4w=inv_4[1],
        receipt_quantity_4w=index.receipt_quantity(product.product_id, at - 4 * WEEK, at, at),
        iso_week_sin=week_sin, iso_week_cos=week_cos, month_sin=month_sin, month_cos=month_cos,
    )
    historical_sales = index._window(sales_rows, history_start, at, at)
    historical_cancellations = index._window(cancel_rows, history_start, at, at)
    normal_times = [row.occurred_at for row in (*historical_sales, *historical_cancellations)]
    normal_available = [row.available_at for row in (*historical_sales, *historical_cancellations)]
    inventory_ids = tuple(sorted(set((*inv_4[2], *state_t[2]))))
    inventory_records = {m.movement_id: m for _, _, _, group, _ in index.inventory[product.product_id] for m in group}
    inventory_times = [inventory_records[key].occurred_at for key in inventory_ids]
    inventory_available = [inventory_records[key].available_at for key in inventory_ids]
    lineage = FeatureLineage(
        maximum_normal_fact_time=max(normal_times) if normal_times else None,
        maximum_inventory_fact_time=max(inventory_times) if inventory_times else None,
        maximum_available_at=max((*normal_available, *inventory_available), default=None),
        completion_event_ids=tuple(sorted(set(completion_evidence))),
        cancellation_event_ids=tuple(sorted({row.event_id for row in cancellations_4})),
        inventory_movement_ids=inventory_ids,
    )
    return ForecastFeatureSnapshot(
        product_id=product.product_id, selling_unit=product.selling_unit,
        observation_time=at, features=features, lineage=lineage,
    ), None


def build_feature_snapshot(index: ForecastIndex, source_namespace: str, product_id: str, at: datetime):
    """Build frozen features using only facts available at T; no target-window facts are read."""
    if source_namespace != index.data.manifest.source_namespace:
        return None, "source_namespace_mismatch"
    if at.tzinfo is None or at.utcoffset() != timedelta(0) or at.weekday() != 0 or any((at.hour, at.minute, at.second, at.microsecond)):
        return None, "invalid_observation_time"
    product = index.products.get(product_id)
    if product is None:
        return None, "unknown_product"
    reason = _feature_precheck(index, product, at)
    if reason:
        return None, reason
    return _compute_feature_snapshot(index, product, at)


def _build_one(index: ForecastIndex, product, at, partition):
    history_start, target_end = at - 8 * WEEK, at + WEEK
    sales_rows = index.sales[product.product_id]
    base_streams = (CoverageStream.PRODUCTS, CoverageStream.ORDERS, CoverageStream.ORDER_ITEMS, CoverageStream.PURCHASE_COMPLETED)
    reason = _feature_precheck(index, product, at)
    if reason:
        return None, reason
    if not index.covered(base_streams, at, target_end, target_end):
        return None, "insufficient_target_coverage"
    if index._blocked(sales_rows, history_start, at, at) or index._blocked(index.cancellations[product.product_id], history_start, at, at):
        return None, "late_historical_fact"
    if index._blocked(sales_rows, at, target_end, target_end):
        return None, "late_target_fact"
    snapshot, reason = _compute_feature_snapshot(index, product, at)
    if snapshot is None:
        return None, reason
    features, lineage = snapshot.features, snapshot.lineage
    targets = index._window(sales_rows, at, target_end, target_end)
    target = sum(row.quantity for row in targets)
    origin = index.opening[product.product_id]
    target_inventory_ok = index.covered((CoverageStream.INVENTORY_MOVEMENTS,), origin, target_end, target_end)
    target_inv = index.inventory_metrics(product.product_id, at, target_end, target_end) if target_inventory_ok else None
    if target_inv is None:
        context, observed, seconds, full = InventoryContextStatus.INSUFFICIENT_COVERAGE, None, None, None
    else:
        context, seconds = InventoryContextStatus.OBSERVED, target_inv[1]
        observed, full = seconds > 0, seconds == 7 * 86400
    return ForecastExample(
        example_id=example_id(index.data.manifest.dataset_id, index.data.manifest.source_namespace, product.product_id, at),
        dataset_id=index.data.manifest.dataset_id, source_namespace=index.data.manifest.source_namespace,
        product_id=product.product_id, selling_unit=product.selling_unit, observation_time=at,
        partition=partition, data_origin=index.data.manifest.data_origin, features=features,
        target_completed_units=target, target_start=at, target_end=target_end,
        target_stockout_observed=observed, target_stockout_seconds=seconds,
        target_full_week_stockout=full, inventory_context_status=context, lineage=lineage,
    ), None


def build_dataset(validated: ValidationReport, config: BuildConfig | None = None) -> BuiltForecastDataset:
    config = BuildConfig() if config is None else BuildConfig.model_validate(config)
    begin = perf_counter(); index = ForecastIndex(validated); index_seconds = perf_counter() - begin
    examples, exclusions = [], []
    begin = perf_counter()
    products = sorted(index.products.values(), key=lambda row: row.product_id)
    if config.product_limit is not None:
        products = products[:config.product_limit]
    for at in observation_times(config):
        part = partition_at(at)
        for product in products:
            row, reason = _build_one(index, product, at, part)
            if row is None:
                exclusions.append(Exclusion(product_id=product.product_id, observation_time=at, partition=part, reason=reason))
            else:
                examples.append(row)
    build_seconds = perf_counter() - begin
    return BuiltForecastDataset(tuple(sorted(examples, key=lambda row: row.example_id)),
                                tuple(sorted(exclusions, key=lambda row: (row.observation_time, row.product_id))),
                                config, {"index_seconds": index_seconds, "build_seconds": build_seconds})
