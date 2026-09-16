"""Forward discrete-event simulation. All latent state stays in this module's memory."""

from collections import Counter, deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta
import heapq
import logging
import math
from time import perf_counter

from .. import (
    CommerceEvent, CoverageInterval, CoverageStream, Customer, DatasetManifest,
    InventoryMovement, Order, OrderItem, Product, SalesDataset, ValidationContext,
    validate_dataset,
)
from .config import DAY, TICK, SyntheticConfig, stream

logger = logging.getLogger(__name__)


@dataclass
class _CustomerState:
    record: Customer
    segment: int
    weekly_rate: float
    affinity: int
    sensitivity: float
    propensity: float
    inactive_start: datetime
    inactive_end: datetime
    visits: deque = field(default_factory=deque)
    purchases: deque = field(default_factory=deque)
    busy_until: datetime | None = None
    burst_until: datetime | None = None
    sessions: int = 0
    completed: int = 0


@dataclass
class _ProductState:
    record: Product
    group: int
    popularity: float
    price: int
    daily_demand: float
    on_hand: int = 0
    reserved: int = 0


@dataclass
class _Session:
    customer: _CustomerState
    session_id: str
    cart_id: str
    remaining_views: int
    recent_visits: int
    recent_purchases: int
    inactive: bool
    cart: dict[str, int] = field(default_factory=dict)


@dataclass(frozen=True)
class GenerationResult:
    dataset: SalesDataset
    # Aggregate diagnostic evidence only; no customer IDs or per-row latent values.
    generator_audit: dict
    generation_seconds: float
    validation_seconds: float


def validation_context(config: SyntheticConfig) -> ValidationContext:
    return ValidationContext(cart_history_start=config.start, require_order_items=True, require_inventory=True)


def _poisson(rng, mean: float) -> int:
    # Exponential interarrival construction, bounded-memory for skewed intensities.
    count, elapsed = 0, rng.expovariate(1)
    while elapsed < mean:
        count += 1
        elapsed += rng.expovariate(1)
    return count


def _probability(value: float, config: SyntheticConfig) -> float:
    value = max(-40., min(40., value))
    return min(config.probability_max, max(config.probability_min, 1 / (1 + math.exp(-value))))


def main_coverage(config: SyntheticConfig) -> tuple[CoverageInterval, ...]:
    """Weekly closed blocks plus exact Monday checkpoints: evidenced knowledge at T.

    The stream is on-time; checkpoints are a deliberately finite audit schedule.
    Arbitrary earlier intraday cutoffs are not certified by later assertions.
    """
    points = {config.start, config.end}
    at = config.start
    while at < config.end:
        if at.weekday() == 0:
            points.add(at)
        at += DAY
    points = sorted(points)
    rows = []
    for stream_name in CoverageStream:
        for left, right in zip(points, points[1:]):
            rows.append(CoverageInterval(dataset_id=config.dataset_id, stream=stream_name, interval_start=left, interval_end=right - TICK, known_at=right - TICK, coverage_status="complete"))
        for point in points[:-1]:
            rows.append(CoverageInterval(dataset_id=config.dataset_id, stream=stream_name, interval_start=point, interval_end=point, known_at=point, coverage_status="complete"))
    return tuple(rows)


class _Simulation:
    def __init__(self, config: SyntheticConfig):
        self.c = config
        self.rng = {name: stream(config, name) for name in ("customers", "products", "sessions", "views", "carts", "orders", "supply", "outcomes")}
        self.queue, self.sequence = [], 0
        self.last_time = config.start - TICK
        self.events, self.orders, self.items, self.movements = [], [], [], []
        self.customers, self.products = [], {}
        self.counters = Counter()
        self.serials = Counter()
        self.choices = {}

    def key(self, kind: str) -> str:
        self.serials[kind] += 1
        return f"{kind}_{self.serials[kind]:09d}"

    def envelope(self, key, at):
        return dict(dataset_id=self.c.dataset_id, source_record_ref=key, available_at=at)

    def schedule(self, at, kind, value):
        if at < self.c.end:
            self.sequence += 1
            heapq.heappush(self.queue, (at, self.sequence, kind, value))

    def emit(self, name, at, **fields):
        key = self.key("event")
        row = CommerceEvent(**self.envelope(key, at), event_id=key, event_name=name, occurred_at=at, **fields)
        self.events.append(row)
        return row

    def movement(self, product, kind, at, hand, reserved, item=None, trigger=None):
        key = self.key("movement")
        product.on_hand += hand
        product.reserved += reserved
        if min(product.on_hand, product.reserved, product.on_hand - product.reserved) < 0:
            raise ValueError("Synthetic inventory transaction would violate conservation")
        self.movements.append(InventoryMovement(
            **self.envelope(key, at), movement_id=key, product_id=product.record.product_id,
            occurred_at=at, movement_kind=kind, on_hand_delta=hand, reserved_delta=reserved,
            order_item_id=item, trigger_event_id=trigger,
        ))

    def entities(self):
        c, rng = self.c, self.rng["customers"]
        days = (c.end - c.start).days
        staggered = set(rng.sample(range(c.customers), round(c.customers * c.staggered_customers))) if days > 1 else set()
        for i in range(c.customers):
            at = c.start + DAY * rng.randrange(1, days) if i in staggered else c.start
            key = f"customer_{i + 1:06d}"
            segment = rng.choices(range(3), weights=c.mixture)[0]
            quiet_start = at + DAY * rng.randrange(max(1, (c.end - at).days))
            quiet_end = quiet_start + DAY * c.inactive_days if rng.random() < c.inactive_fraction else quiet_start
            self.customers.append(_CustomerState(
                Customer(**self.envelope(key, at), customer_id=key, first_seen_at=at), segment,
                rng.gammavariate(c.rate_gamma_shape, c.weekly_rates[segment] / c.rate_gamma_shape),
                rng.randrange(c.groups), rng.lognormvariate(0, .35), rng.normalvariate(0, .6), quiet_start, quiet_end,
            ))
        rng = self.rng["products"]
        ranks = list(range(1, c.products + 1))
        rng.shuffle(ranks)
        weights = [rank ** -c.popularity_exponent for rank in ranks]
        staggered = set(rng.sample(range(c.products), round(c.products * c.staggered_products))) if days > 2 else set()
        daily_orders = c.customers * sum(a * b for a, b in zip(c.mixture, c.weekly_rates)) / 7 * c.stock_demand_orders_per_visit
        for i, weight in enumerate(weights):
            at = c.start + DAY * rng.randrange(1, max(2, days // 2)) if i in staggered else c.start
            key, group = f"product_{i + 1:04d}", rng.randrange(c.groups)
            product = _ProductState(
                Product(**self.envelope(key, at), product_id=key, selling_unit="unit", merchandising_group=f"group_{chr(65 + group)}"),
                group, weight, max(1, round(rng.lognormvariate(math.log(c.price_median_minor), c.price_log_sigma))),
                daily_orders * c.stock_units_per_order * weight / sum(weights),
            )
            self.products[key] = product
            self.schedule(at, "opening", product)
            due = at + DAY * c.receipt_interval_days
            while due < c.end:
                delay = min(7., self.rng["supply"].expovariate(1 / c.supply_delay_mean_days))
                self.schedule(due + DAY * delay, "receipt", product)
                due += DAY * c.receipt_interval_days

    def start_session(self, customer, at):
        c = self.c
        if customer.busy_until and at < customer.busy_until:
            self.counters["suppressed_overlapping_session_opportunities"] += 1
            return
        for history, days in ((customer.visits, 7), (customer.purchases, 60)):
            while history and history[0] < at - DAY * days:
                history.popleft()
        count = 1
        for _ in range(2):
            while count < c.max_views and self.rng["views"].random() < c.view_continue_probability:
                count += 1
        session = _Session(customer, self.key("session"), self.key("cart"), count, len(customer.visits), len(customer.purchases), customer.inactive_start <= at < customer.inactive_end)
        customer.visits.append(at)
        customer.sessions += 1
        customer.busy_until = at + timedelta(minutes=30)
        self.schedule(at, "view", session)

    def view(self, session, at):
        c, rng = self.c, self.rng["views"]
        group = session.customer.affinity if rng.random() < c.preferred_group_probability else None
        values, weights = self.choices.get(group, self.choices[None])
        product = rng.choices(values, weights=weights)[0]
        self.emit("product_viewed", at, customer_id=None if rng.random() < c.anonymous_view_probability else session.customer.record.customer_id, session_id=session.session_id, product_id=product.record.product_id)
        session.remaining_views -= 1
        self.schedule(at + timedelta(seconds=rng.randrange(10, 40)), "consider_cart", (session, product))

    def consider_cart(self, session, product, at):
        c, customer, rng = self.c, session.customer, self.rng["carts"]
        friction = customer.sensitivity * math.log1p(product.price / c.price_median_minor)
        tendency = c.cart_intercept + customer.propensity + c.engagement_weight * min(session.recent_visits, 5) + c.history_weight * math.log1p(session.recent_purchases) + c.affinity_weight * (customer.affinity == product.group) - c.price_weight * friction + rng.normalvariate(0, c.noise_sigma)
        if rng.random() < _probability(tendency, c):
            quantity = 1 + (rng.random() < c.extra_unit_probability)
            key = product.record.product_id
            if product.on_hand - product.reserved >= session.cart.get(key, 0) + quantity:
                session.cart[key] = session.cart.get(key, 0) + quantity
                self.emit("cart_item_added", at, customer_id=customer.record.customer_id, session_id=session.session_id, cart_id=session.cart_id, product_id=key, quantity=quantity)
            else:
                self.counters["stock_blocked_cart_opportunities"] += 1
        delay = timedelta(seconds=self.rng["views"].randrange(30, 180))
        self.schedule(at + delay, "view" if session.remaining_views else "review_cart", session)

    def review_cart(self, session, at):
        rng = self.rng["carts"]
        if session.cart and rng.random() < self.c.removal_probability:
            key = rng.choice(sorted(session.cart))
            quantity = rng.randint(1, session.cart[key])
            session.cart[key] -= quantity
            if not session.cart[key]:
                del session.cart[key]
            self.emit("cart_item_removed", at, customer_id=session.customer.record.customer_id, session_id=session.session_id, cart_id=session.cart_id, product_id=key, quantity=quantity)
        self.schedule(at + timedelta(seconds=rng.randrange(15, 120)), "place", session)

    def place(self, session, at):
        c, customer, rng = self.c, session.customer, self.rng["orders"]
        if not session.cart:
            return
        subtotal = sum(self.products[key].price * quantity for key, quantity in session.cart.items())
        affinity = sum(self.products[key].group == customer.affinity for key in session.cart) / len(session.cart)
        tendency = c.placement_intercept + customer.propensity + c.engagement_weight * min(session.recent_visits + len(session.cart), 6) + c.history_weight * math.log1p(session.recent_purchases) + c.affinity_weight * affinity - c.price_weight * customer.sensitivity * math.log1p(subtotal / c.price_median_minor) - c.inactivity_weight * session.inactive + rng.normalvariate(0, c.noise_sigma)
        if rng.random() >= _probability(tendency, c):
            return
        if any(self.products[key].on_hand - self.products[key].reserved < quantity for key, quantity in session.cart.items()):
            self.counters["stock_blocked_order_opportunities"] += 1
            return
        key = self.key("order")
        order = Order(**self.envelope(key, at), order_id=key, customer_id=customer.record.customer_id, created_at=at, session_id=None if rng.random() < c.unattributed_order_probability else session.session_id, cart_id=session.cart_id, currency="PKR", item_subtotal_minor=subtotal)
        self.orders.append(order)
        event = self.emit("order_created", at, order_id=key, customer_id=order.customer_id, session_id=order.session_id, cart_id=order.cart_id)
        items = []
        for product_key, quantity in sorted(session.cart.items()):
            item_key, product = self.key("item"), self.products[product_key]
            item = OrderItem(**self.envelope(item_key, at), order_item_id=item_key, order_id=key, product_id=product_key, quantity=quantity, line_subtotal_minor=product.price * quantity)
            self.items.append(item)
            items.append(item)
            self.movement(product, "reserve", at, 0, quantity, item_key, event.event_id)
        rng = self.rng["outcomes"]
        cancelled = rng.random() < c.cancellation_probability
        if cancelled:
            delay = rng.expovariate(2)
        else:
            fulfillment = rng.lognormvariate(math.log(c.fulfillment_median_days), c.fulfillment_log_sigma)
            if rng.random() < c.long_delay_probability:
                fulfillment += rng.uniform(7, 14)
            payment = rng.lognormvariate(math.log(c.payment_median_days), .6)
            delay = max(fulfillment, payment)
        self.schedule(at + max(timedelta(minutes=1), DAY * delay), "terminal", (order, items, customer, cancelled))

    def terminal(self, payload, at):
        order, items, customer, cancelled = payload
        event = self.emit("order_cancelled" if cancelled else "purchase_completed", at, order_id=order.order_id, customer_id=order.customer_id, session_id=order.session_id, cart_id=order.cart_id)
        for item in items:
            self.movement(self.products[item.product_id], "release" if cancelled else "fulfill", at, 0 if cancelled else -item.quantity, -item.quantity, item.order_item_id, event.event_id)
        if not cancelled:
            customer.purchases.append(at)
            customer.completed += 1

    def run(self):
        self.entities()
        c, rng = self.c, self.rng["sessions"]
        day = c.start
        while day < c.end:
            active = [p for p in self.products.values() if p.record.available_at <= day]
            self.choices = {None: (active, [p.popularity for p in active])}
            for group in range(c.groups):
                members = [p for p in active if p.group == group]
                if members:
                    self.choices[group] = (members, [p.popularity for p in members])
            for customer in self.customers:
                if customer.record.first_seen_at > day:
                    continue
                if rng.random() < c.burst_daily_probability:
                    customer.burst_until = day + DAY * rng.randint(3, 7)
                factor = c.weekday_factors[day.weekday()] * (1 + (c.drift_end - 1) * (day - c.start) / (c.end - c.start))
                if customer.inactive_start <= day < customer.inactive_end:
                    factor *= c.inactive_multiplier
                if customer.burst_until and day < customer.burst_until:
                    factor *= c.burst_multiplier
                if customer.visits:
                    factor *= 1 + c.visit_recent_weight * math.exp(-(day - customer.visits[-1]).total_seconds() / (14 * 86400))
                if customer.purchases:
                    factor *= 1 + c.visit_purchase_weight * math.exp(-(day - customer.purchases[-1]).total_seconds() / (30 * 86400))
                for _ in range(_poisson(rng, customer.weekly_rate * factor / 7)):
                    self.schedule(day + timedelta(seconds=rng.randrange(60, 86400)), "session", customer)
            while self.queue and self.queue[0][0] < min(c.end, day + DAY):
                scheduled, _, kind, value = heapq.heappop(self.queue)
                at = max(scheduled, self.last_time + TICK)
                if at >= c.end:
                    break
                self.last_time = at
                session = value[0] if kind == "consider_cart" else value
                if isinstance(session, _Session):
                    session.customer.busy_until = at + timedelta(minutes=30)
                if kind in ("opening", "receipt"):
                    cover = c.opening_cover_days if kind == "opening" else c.receipt_cover_days
                    amount = max(2 if kind == "opening" else 1, round(value.daily_demand * cover * self.rng["supply"].lognormvariate(0, c.supply_log_sigma)))
                    self.movement(value, "opening_balance" if kind == "opening" else "receipt", at, amount, 0)
                elif kind == "session":
                    self.start_session(value, at)
                elif kind == "consider_cart":
                    self.consider_cart(*value, at)
                else:
                    getattr(self, kind)(value, at)
            day += DAY
        freeze = c.end - TICK
        data = SalesDataset(
            manifest=DatasetManifest(dataset_id=c.dataset_id, contract_version="sales_contract_v1", source_namespace="synthetic_sales", data_origin="synthetic_development", producer_version=c.generator_version, extracted_at=freeze, source_timezone="UTC", currency_minor_units={"PKR": 2}, completion_policy_version="simulated_fulfilled_and_paid_v1", session_policy_version="simulated_30m_inactivity_24h_cap_v1", identity_policy_version="simulated_observed_identity_v1", generation_seed=c.master_seed, generation_config_hash=c.sha256),
            coverage=main_coverage(c), customers=tuple(x.record for x in self.customers), products=tuple(x.record for x in self.products.values()),
            events=tuple(self.events), orders=tuple(self.orders), order_items=tuple(self.items), inventory_movements=tuple(self.movements),
        )
        groups = {}
        for index, name in enumerate(("occasional", "regular", "highly_engaged")):
            members = [x for x in self.customers if x.segment == index]
            groups[name] = dict(customers=len(members), purchasers=sum(x.completed > 0 for x in members), non_purchasers=sum(x.completed == 0 for x in members), sessions=sum(x.sessions for x in members))
        return data, {"generator_only_aggregate_diagnostics": True, "behavior_groups": groups, "opportunities": dict(sorted(self.counters.items()))}


def generate(config: SyntheticConfig) -> GenerationResult:
    """Generate and fully validate; invalid simulations never become accepted datasets."""
    config = SyntheticConfig.model_validate(config)
    begin = perf_counter()
    data, audit = _Simulation(config).run()
    if config.scenario != "clean":
        from .perturbations import apply_scenario
        data = apply_scenario(data, config)
    generated = perf_counter() - begin
    begin = perf_counter()
    validation = validate_dataset(data, context=validation_context(config))
    if not validation.is_valid:
        logger.error("Synthetic validation failed: %s", sorted({x.code.value for x in validation.issues}))
        raise ValueError("Synthetic dataset did not pass canonical validation")
    return GenerationResult(validation.validated_dataset, audit, generated, perf_counter() - begin)
