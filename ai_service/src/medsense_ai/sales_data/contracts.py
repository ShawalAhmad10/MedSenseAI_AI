"""Implementation-neutral sales_contract_v1 records; no persistence or transport imports."""

from collections.abc import Mapping
from datetime import datetime, timezone
from enum import StrEnum
import re
from types import MappingProxyType
from typing import Annotated, Literal, Self

from pydantic import (
    AfterValidator, BaseModel, BeforeValidator, ConfigDict, Field,
    PlainSerializer, StrictInt, StrictStr, StringConstraints, field_validator,
    model_validator,
)

CONTRACT_VERSION = "sales_contract_v1"
INT64_MAX = 2**63 - 1


def _nonblank(value: str) -> str:
    if not value.strip():
        raise ValueError("Value must not be blank")
    try:
        value.encode("utf-8")
    except UnicodeEncodeError as exc:
        raise ValueError("Value must be valid UTF-8") from exc
    return value


def utc_instant(value: object) -> datetime:
    """Accept aware datetimes or explicit ISO timestamps, never numeric epochs/naive time."""
    if isinstance(value, str):
        if not re.fullmatch(
            r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})",
            value,
        ):
            raise ValueError("Expected an explicit timezone and at most microsecond precision")
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if not isinstance(value, datetime) or value.utcoffset() is None:
        raise ValueError("A timezone-aware timestamp is required")
    return value.astimezone(timezone.utc)


Nonblank = Annotated[StrictStr, AfterValidator(_nonblank)]
OpaqueID = Annotated[Nonblank, StringConstraints(max_length=128)]
Instant = Annotated[datetime, BeforeValidator(utc_instant)]
Int64 = Annotated[StrictInt, Field(ge=-(2**63), le=INT64_MAX)]
Quantity = Annotated[Int64, Field(gt=0)]
Money = Annotated[Int64, Field(ge=0)]
CurrencyCode = Annotated[StrictStr, StringConstraints(pattern=r"^[A-Z]{3}$")]
CurrencyMap = Annotated[
    Mapping[CurrencyCode, Annotated[StrictInt, Field(ge=0)]],
    AfterValidator(lambda value: MappingProxyType(dict(value))),
    PlainSerializer(lambda value: dict(value), return_type=dict),
]


class CanonicalModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid", frozen=True, validate_default=True,
        revalidate_instances="always", hide_input_in_errors=True,
    )


class DataOrigin(StrEnum):
    PARTNER_REAL = "partner_real"
    PUBLIC_EXTERNAL = "public_external"
    SYNTHETIC_DEVELOPMENT = "synthetic_development"


class CoverageStatus(StrEnum):
    COMPLETE = "complete"
    PARTIAL = "partial"
    UNSUPPORTED = "unsupported"
    UNAVAILABLE = "unavailable"


class EventName(StrEnum):
    PRODUCT_VIEWED = "product_viewed"
    CART_ITEM_ADDED = "cart_item_added"
    CART_ITEM_REMOVED = "cart_item_removed"
    ORDER_CREATED = "order_created"
    PURCHASE_COMPLETED = "purchase_completed"
    ORDER_CANCELLED = "order_cancelled"


class CoverageStream(StrEnum):
    CUSTOMERS = "customers"
    PRODUCTS = "products"
    ORDERS = "orders"
    ORDER_ITEMS = "order_items"
    INVENTORY_MOVEMENTS = "inventory_movements"
    PRODUCT_VIEWED = "product_viewed"
    CART_ITEM_ADDED = "cart_item_added"
    CART_ITEM_REMOVED = "cart_item_removed"
    ORDER_CREATED = "order_created"
    PURCHASE_COMPLETED = "purchase_completed"
    ORDER_CANCELLED = "order_cancelled"


class MovementKind(StrEnum):
    OPENING_BALANCE = "opening_balance"
    RECEIPT = "receipt"
    RESERVE = "reserve"
    RELEASE = "release"
    FULFILL = "fulfill"
    ADJUSTMENT = "adjustment"


CART_EVENTS = frozenset((EventName.CART_ITEM_ADDED, EventName.CART_ITEM_REMOVED))
LIFECYCLE_EVENTS = frozenset((
    EventName.ORDER_CREATED, EventName.PURCHASE_COMPLETED, EventName.ORDER_CANCELLED,
))
TERMINAL_EVENTS = LIFECYCLE_EVENTS - {EventName.ORDER_CREATED}


class DatasetManifest(CanonicalModel):
    dataset_id: OpaqueID
    contract_version: Literal["sales_contract_v1"]
    source_namespace: OpaqueID
    data_origin: DataOrigin
    producer_version: Nonblank
    extracted_at: Instant
    source_timezone: Nonblank
    currency_minor_units: CurrencyMap
    completion_policy_version: Nonblank | None = None
    session_policy_version: Nonblank | None = None
    identity_policy_version: Nonblank | None = None
    generation_seed: Int64 | None = None
    generation_config_hash: Annotated[StrictStr, StringConstraints(pattern=r"^[a-fA-F0-9]{64}$")] | None = None

    @field_validator("source_timezone")
    @classmethod
    def valid_timezone(cls, value: str) -> str:
        # This is adapter-supplied provenance, not a conversion instruction. All
        # canonical timestamps already contain offsets. Do not depend on an OS
        # timezone database (absent on some Windows hosts) to accept UTC records.
        # Resolving actual source-zone rules is the adapter's responsibility.
        if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_+-]*(?:/[A-Za-z0-9_+-]+)*", value):
            raise ValueError("Expected a timezone identifier, not a raw offset/path")
        return value

    @model_validator(mode="after")
    def generation_provenance(self) -> Self:
        supplied = (self.generation_seed is not None, self.generation_config_hash is not None)
        if self.data_origin == DataOrigin.SYNTHETIC_DEVELOPMENT:
            if not all(supplied):
                raise ValueError("Synthetic origin requires seed and configuration SHA-256")
        elif any(supplied):
            raise ValueError("Real/public origin cannot contain synthetic generation metadata")
        return self


class CoverageInterval(CanonicalModel):
    dataset_id: OpaqueID
    stream: CoverageStream
    interval_start: Instant
    interval_end: Instant
    coverage_status: CoverageStatus
    known_at: Instant
    reason_code: OpaqueID | None = None

    @model_validator(mode="after")
    def interval_semantics(self) -> Self:
        if self.interval_end < self.interval_start:
            raise ValueError("Coverage end precedes start")
        if self.coverage_status == CoverageStatus.COMPLETE:
            if self.interval_end > self.known_at:
                raise ValueError("Complete coverage cannot certify future facts")
        elif self.reason_code is None:
            raise ValueError("Non-complete coverage requires a reason_code")
        return self


class Record(CanonicalModel):
    dataset_id: OpaqueID
    source_record_ref: OpaqueID
    available_at: Instant


class Customer(Record):
    customer_id: OpaqueID
    first_seen_at: Instant

    @model_validator(mode="after")
    def availability(self) -> Self:
        if self.first_seen_at > self.available_at:
            raise ValueError("Customer first_seen_at exceeds available_at")
        return self


class Product(Record):
    product_id: OpaqueID
    selling_unit: Nonblank
    merchandising_group: Nonblank | None = None


class CommerceEvent(Record):
    event_id: OpaqueID
    event_name: EventName
    occurred_at: Instant
    customer_id: OpaqueID | None = None
    session_id: OpaqueID | None = None
    cart_id: OpaqueID | None = None
    product_id: OpaqueID | None = None
    order_id: OpaqueID | None = None
    quantity: Quantity | None = None

    @model_validator(mode="after")
    def variant(self) -> Self:
        if self.occurred_at > self.available_at:
            raise ValueError("Event occurred_at exceeds available_at")
        if self.event_name == EventName.PRODUCT_VIEWED:
            required, forbidden = ("session_id", "product_id"), ("cart_id", "order_id", "quantity")
        elif self.event_name in CART_EVENTS:
            required, forbidden = ("session_id", "cart_id", "product_id", "quantity"), ("order_id",)
        else:
            required, forbidden = ("order_id",), ("product_id", "quantity")
        for field in required:
            if getattr(self, field) is None:
                raise ValueError(f"Event variant requires {field}")
        for field in forbidden:
            if getattr(self, field) is not None:
                raise ValueError(f"Event variant forbids {field}")
        return self


class Order(Record):
    order_id: OpaqueID
    customer_id: OpaqueID | None = None
    created_at: Instant
    session_id: OpaqueID | None = None
    cart_id: OpaqueID | None = None
    currency: CurrencyCode | None = None
    item_subtotal_minor: Money | None = None

    @model_validator(mode="after")
    def placement(self) -> Self:
        if self.created_at > self.available_at:
            raise ValueError("Order created_at exceeds available_at")
        if (self.currency is None) != (self.item_subtotal_minor is None):
            raise ValueError("Currency and item subtotal must be jointly present or absent")
        return self


class OrderItem(Record):
    order_item_id: OpaqueID
    order_id: OpaqueID
    product_id: OpaqueID
    quantity: Quantity
    line_subtotal_minor: Money


class InventoryMovement(Record):
    movement_id: OpaqueID
    product_id: OpaqueID
    occurred_at: Instant
    movement_kind: MovementKind
    on_hand_delta: Int64
    reserved_delta: Int64
    order_item_id: OpaqueID | None = None
    trigger_event_id: OpaqueID | None = None

    @model_validator(mode="after")
    def movement_semantics(self) -> Self:
        if self.occurred_at > self.available_at:
            raise ValueError("Movement occurred_at exceeds available_at")
        kind, hand, reserved = self.movement_kind, self.on_hand_delta, self.reserved_delta
        linked = kind in (MovementKind.RESERVE, MovementKind.RELEASE, MovementKind.FULFILL)
        if linked and (self.order_item_id is None or self.trigger_event_id is None):
            raise ValueError("Transactional movement requires item and trigger event")
        if not linked and (self.order_item_id is not None or self.trigger_event_id is not None):
            raise ValueError("Non-transactional movement forbids order/event references")
        valid = {
            MovementKind.OPENING_BALANCE: hand >= 0 and reserved == 0,
            MovementKind.RECEIPT: hand > 0 and reserved == 0,
            MovementKind.RESERVE: hand == 0 and reserved > 0,
            MovementKind.RELEASE: hand == 0 and reserved < 0,
            MovementKind.FULFILL: hand < 0 and reserved == hand,
            MovementKind.ADJUSTMENT: hand != 0 and reserved == 0,
        }[kind]
        if not valid:
            raise ValueError("Movement deltas do not match its kind")
        return self


SalesRecord = Customer | Product | CommerceEvent | Order | OrderItem | InventoryMovement


class SalesDataset(CanonicalModel):
    """One source-scoped batch, not a partner database schema."""

    manifest: DatasetManifest
    coverage: tuple[CoverageInterval, ...] = ()
    customers: tuple[Customer, ...] = ()
    products: tuple[Product, ...] = ()
    events: tuple[CommerceEvent, ...] = ()
    orders: tuple[Order, ...] = ()
    order_items: tuple[OrderItem, ...] = ()
    inventory_movements: tuple[InventoryMovement, ...] = ()


class ValidationSeverity(StrEnum):
    ERROR = "error"
    WARNING = "warning"


class ValidationCode(StrEnum):
    INVALID_RECORD = "invalid_record"
    INVALID_TIMESTAMP = "invalid_timestamp"
    MISSING_REQUIRED_FIELD = "missing_required_field"
    DATASET_MISMATCH = "dataset_mismatch"
    CONFLICTING_DUPLICATE = "conflicting_duplicate"
    UNRESOLVED_REFERENCE = "unresolved_reference"
    REFERENCE_MISMATCH = "reference_mismatch"
    LIFECYCLE_CONFLICT = "lifecycle_conflict"
    AMOUNT_MISMATCH = "amount_mismatch"
    COVERAGE_CONFLICT = "coverage_conflict"
    INSUFFICIENT_COVERAGE = "insufficient_coverage"
    MISSING_POLICY = "missing_policy"
    CART_CONFLICT = "cart_conflict"
    INVENTORY_CONSERVATION_FAILURE = "inventory_conservation_failure"
    AMBIGUOUS_REPLAY = "ambiguous_replay"


class ValidationIssue(CanonicalModel):
    code: ValidationCode
    severity: ValidationSeverity = ValidationSeverity.ERROR
    entity: Nonblank
    record_id: OpaqueID | None = None
    field: Nonblank | None = None
    stream: CoverageStream | None = None
    message: Nonblank


class ValidationReport(CanonicalModel):
    """Only an entirely accepted, deduplicated batch is exposed to downstream callers."""

    issues: tuple[ValidationIssue, ...] = ()
    identical_duplicate_count: Annotated[StrictInt, Field(ge=0)] = 0
    invalidated_streams: tuple[CoverageStream, ...] = ()
    validated_dataset: SalesDataset | None = None

    @property
    def status(self) -> Literal["valid", "incomplete", "invalid"]:
        if any(issue.severity == ValidationSeverity.ERROR for issue in self.issues):
            return "invalid"
        return "incomplete" if self.issues else "valid"

    @property
    def is_valid(self) -> bool:
        return self.status == "valid" and self.validated_dataset is not None
