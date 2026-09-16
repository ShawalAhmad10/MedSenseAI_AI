"""Pinned simulation parameters and process-independent named random streams."""

from datetime import datetime, timedelta, timezone
import hashlib
import json
import math
import random
from typing import Annotated, Literal, Self

from pydantic import Field, StrictInt, model_validator

from ..contracts import CanonicalModel, Instant

GENERATOR_VERSION = "med-sales-synthetic-1.0.0"
TICK = timedelta(microseconds=1)
DAY = timedelta(days=1)
Probability = Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)]
Positive = Annotated[float, Field(gt=0, allow_inf_nan=False)]


def stable_json(value: object) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False) + "\n").encode("utf-8")


class SyntheticConfig(CanonicalModel):
    generator_version: Literal["med-sales-synthetic-1.0.0"] = GENERATOR_VERSION
    master_seed: Annotated[StrictInt, Field(ge=0, le=2**63 - 1)] = 260903
    start: Instant = datetime(2025, 9, 1, tzinfo=timezone.utc)
    end: Instant = datetime(2026, 9, 1, tzinfo=timezone.utc)
    customers: Annotated[StrictInt, Field(ge=1, le=100_000)] = 2500
    products: Annotated[StrictInt, Field(ge=2, le=10_000)] = 200
    scenario: Literal["clean", "delayed", "outage", "unsupported_views"] = "clean"
    mixture: tuple[Probability, Probability, Probability] = (.55, .30, .15)
    weekly_rates: tuple[Positive, Positive, Positive] = (.1, .5, 1.2)
    rate_gamma_shape: Positive = 1.5
    staggered_customers: Probability = .15
    staggered_products: Probability = .05
    popularity_exponent: Positive = 1.1
    groups: Annotated[StrictInt, Field(ge=1, le=26)] = 6
    price_median_minor: Positive = 1500
    price_log_sigma: Positive = .7
    weekday_factors: tuple[Positive, Positive, Positive, Positive, Positive, Positive, Positive] = (.95, .95, 1., 1., 1.05, 1.10, .95)
    drift_end: Positive = 1.10
    inactive_fraction: Probability = .35
    inactive_days: Annotated[StrictInt, Field(ge=1, le=90)] = 21
    inactive_multiplier: Probability = .12
    burst_daily_probability: Probability = .004
    burst_multiplier: Positive = 1.8
    visit_recent_weight: Probability = .12
    visit_purchase_weight: Probability = .15
    preferred_group_probability: Probability = .65
    view_continue_probability: Annotated[float, Field(gt=0, lt=1)] = .45
    max_views: Annotated[StrictInt, Field(ge=1, le=12)] = 12
    anonymous_view_probability: Probability = .10
    removal_probability: Probability = .18
    extra_unit_probability: Probability = .18
    cart_intercept: float = -1.4
    placement_intercept: float = -.9
    # Positive engagement/history and negative price/inactivity coefficients.
    engagement_weight: Positive = .18
    history_weight: Positive = .5
    affinity_weight: Positive = .45
    price_weight: Positive = .45
    inactivity_weight: Positive = .3
    noise_sigma: Positive = .5
    probability_min: Probability = .02
    probability_max: Probability = .90
    unattributed_order_probability: Probability = .025
    cancellation_probability: Probability = .08
    fulfillment_median_days: Positive = 1.
    fulfillment_log_sigma: Positive = .65
    payment_median_days: Positive = .15
    long_delay_probability: Probability = .04
    opening_cover_days: Positive = 14.
    receipt_cover_days: Positive = 16.
    receipt_interval_days: Annotated[StrictInt, Field(ge=1, le=90)] = 14
    supply_delay_mean_days: Positive = 2.
    supply_log_sigma: Positive = .4
    stock_demand_orders_per_visit: Probability = .20
    stock_units_per_order: Positive = 1.5
    delayed_event_probability: Probability = .02
    delay_min_hours: Positive = 1.
    delay_max_hours: Positive = 48.

    @model_validator(mode="after")
    def coherent(self) -> Self:
        if self.end <= self.start or (self.end - self.start) % DAY:
            raise ValueError("Calendar must contain a positive whole number of UTC days")
        if self.start.time() != datetime.min.time() or self.end.time() != datetime.min.time():
            raise ValueError("Calendar boundaries must be UTC midnight")
        if (self.end - self.start).days > 3660:
            raise ValueError("Simulation calendar exceeds the explicit ten-year resource bound")
        if abs(sum(self.mixture) - 1) > 1e-12 or self.probability_min >= self.probability_max:
            raise ValueError("Invalid mixture or probability bounds")
        if self.delay_min_hours > self.delay_max_hours:
            raise ValueError("Delay bounds reversed")
        if round(self.products * self.staggered_products) >= self.products:
            raise ValueError("At least one product must exist at the calendar start")
        if not all(math.isfinite(x) for x in (self.cart_intercept, self.placement_intercept)):
            raise ValueError("Coefficients must be finite")
        return self

    @property
    def sha256(self) -> str:
        return hashlib.sha256(stable_json(self.model_dump(mode="json"))).hexdigest()

    @property
    def dataset_id(self) -> str:
        return f"synthetic_sales_{self.master_seed}_{self.sha256[:16]}"


def stream(config: SyntheticConfig, component: str) -> random.Random:
    digest = hashlib.sha256(stable_json([config.master_seed, config.generator_version, component])).digest()
    return random.Random(int.from_bytes(digest, "big"))


def profile_config(profile: str = "default", **updates) -> SyntheticConfig:
    options = {
        "default": {},
        "smoke": dict(customers=40, products=12, end=datetime(2025, 10, 31, tzinfo=timezone.utc)),
        "qa": dict(customers=120, products=20, end=datetime(2026, 2, 28, tzinfo=timezone.utc)),
    }
    if profile not in options:
        raise ValueError(f"Unknown simulation profile: {profile}")
    return SyntheticConfig(**{**options[profile], **updates})
