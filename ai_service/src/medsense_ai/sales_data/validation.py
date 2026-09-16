"""Batch validation with explicit failure reports and source-scope isolation."""

from collections import defaultdict
from datetime import datetime, timedelta, timezone
import logging
from typing import Self

from pydantic import StrictBool, ValidationError, model_validator

from .contracts import (
    CART_EVENTS, LIFECYCLE_EVENTS, TERMINAL_EVENTS, CanonicalModel, CommerceEvent,
    CoverageStream, EventName, Instant, SalesDataset, ValidationCode, ValidationIssue,
    ValidationReport, ValidationSeverity,
)
from .replay import require_coverage, validate_cart_replay, validate_inventory_replay
from .temporal import coverage_conflicts, fact_time

logger = logging.getLogger(__name__)


class ValidationContext(CanonicalModel):
    """Requested validation profile, never guessed source capabilities.

    cart_history_start is an adapter assertion of complete cart origins, not the
    first observed event in a truncated lookback. Timestamp precision comes from
    the producer policy; default microseconds conservatively detects any gap.
    replay_carts=False supports fact-of-addition analytics without claiming a
    reconstructed cart balance. Structural, identity and lifecycle checks remain.
    """

    require_lifecycle: StrictBool = True
    require_order_items: StrictBool = False
    require_authenticated_carts: StrictBool = True
    replay_carts: StrictBool = True
    cart_history_start: Instant | None = None
    require_inventory: StrictBool = False
    coverage_resolution: timedelta = timedelta(microseconds=1)

    @model_validator(mode="after")
    def consistent_profile(self) -> Self:
        if self.coverage_resolution <= timedelta(0):
            raise ValueError("Coverage resolution must be positive")
        if self.require_inventory and not self.require_lifecycle:
            raise ValueError("Inventory profile requires lifecycle validation")
        return self


def _report(data: SalesDataset | None, issues: list[ValidationIssue], duplicates: int = 0) -> ValidationReport:
    for issue in issues:
        # Do not log input payloads, customer IDs, timestamps, or Pydantic error input.
        logger.log(
            logging.ERROR if issue.severity == ValidationSeverity.ERROR else logging.WARNING,
            "Sales validation issue code=%s entity=%s", issue.code.value, issue.entity,
        )
    return ValidationReport(
        issues=tuple(issues), identical_duplicate_count=duplicates,
        # Quarantine the entire rejected batch rather than retaining a misleading
        # complete declaration on any consumer path. Source records stay immutable.
        invalidated_streams=tuple(CoverageStream) if issues else (),
        validated_dataset=data if not issues else None,
    )


def _issue(
    code: ValidationCode, entity: str, key: str | None, message: str,
    *, field: str | None = None,
) -> ValidationIssue:
    return ValidationIssue(code=code, entity=entity, record_id=key, field=field, message=message)


def validate_dataset(
    value: SalesDataset | dict, *, context: ValidationContext | None = None,
) -> ValidationReport:
    """Return a deduplicated batch only after requested checks pass.

    A valid structural batch is not implicit proof of telemetry completeness:
    consumers must request coverage for their own metrics/windows. Replay and
    item-profile checks here explicitly gate their required coverage.
    """
    try:
        data = SalesDataset.model_validate(value)
        options = ValidationContext.model_validate(context) if context is not None else ValidationContext()
    except ValidationError as exc:
        issues = []
        for error in exc.errors(include_input=False, include_context=False, include_url=False):
            location = ".".join(str(part) for part in error["loc"]) or "record"
            if error["type"] == "missing":
                code = ValidationCode.MISSING_REQUIRED_FIELD
            elif any(part in location for part in ("_at", "interval_start", "interval_end", "known_at")):
                code = ValidationCode.INVALID_TIMESTAMP
            else:
                code = ValidationCode.INVALID_RECORD
            # The path is useful in the returned report, but never goes to logs.
            issues.append(_issue(code, "batch", None, "Canonical structure rejected", field=location))
        return _report(None, issues)

    issues: list[ValidationIssue] = []
    duplicates = 0
    deduplicated: dict[str, tuple] = {}
    for collection, id_field in (
        ("customers", "customer_id"), ("products", "product_id"),
        ("events", "event_id"), ("orders", "order_id"),
        ("order_items", "order_item_id"), ("inventory_movements", "movement_id"),
    ):
        indexed = {}
        for record in getattr(data, collection):
            key = getattr(record, id_field)
            if record.dataset_id != data.manifest.dataset_id:
                issues.append(_issue(ValidationCode.DATASET_MISMATCH, collection, key, "Record belongs to another dataset/source scope"))
            if record.available_at > data.manifest.extracted_at:
                issues.append(_issue(ValidationCode.INVALID_TIMESTAMP, collection, key, "Record was not available at dataset freeze"))
            if key in indexed:
                if indexed[key] == record:
                    duplicates += 1
                else:
                    issues.append(_issue(ValidationCode.CONFLICTING_DUPLICATE, collection, key, "Logical ID has conflicting immutable facts"))
            else:
                indexed[key] = record
        deduplicated[collection] = tuple(indexed[key] for key in sorted(indexed))
    coverage = []
    epoch = datetime(1970, 1, 1, tzinfo=timezone.utc)
    for row in data.coverage:
        if row.dataset_id != data.manifest.dataset_id:
            issues.append(_issue(ValidationCode.DATASET_MISMATCH, "coverage", None, "Coverage belongs to another dataset/source scope"))
        if row.known_at > data.manifest.extracted_at:
            issues.append(_issue(ValidationCode.INVALID_TIMESTAMP, "coverage", None, "Coverage was not known at dataset freeze"))
        if any((instant - epoch) % options.coverage_resolution for instant in (row.interval_start, row.interval_end)):
            issues.append(_issue(ValidationCode.INVALID_TIMESTAMP, "coverage", None, "Coverage boundary does not align to producer timestamp precision"))
        if row in coverage:
            duplicates += 1
        else:
            coverage.append(row)
    if coverage_conflicts(coverage):
        issues.append(_issue(ValidationCode.COVERAGE_CONFLICT, "coverage", None, "Overlapping coverage declarations contradict one another"))
    if issues:
        return _report(None, issues, duplicates)
    data = SalesDataset(
        manifest=data.manifest, coverage=tuple(sorted(coverage, key=lambda row: (row.stream, row.interval_start, row.known_at))),
        **deduplicated,
    )

    customers = {row.customer_id: row for row in data.customers}
    products = {row.product_id: row for row in data.products}
    orders = {row.order_id: row for row in data.orders}
    items = {row.order_item_id: row for row in data.order_items}
    events = {row.event_id: row for row in data.events}

    def reference(record, field: str, index: dict, entity: str, key: str) -> bool:
        target = getattr(record, field)
        if target is not None and target not in index:
            issues.append(_issue(ValidationCode.UNRESOLVED_REFERENCE, entity, key, "Foreign key does not resolve within this dataset", field=field))
            return False
        return True

    for order in data.orders:
        reference(order, "customer_id", customers, "order", order.order_id)
        if order.currency is not None and order.currency not in data.manifest.currency_minor_units:
            issues.append(_issue(ValidationCode.REFERENCE_MISMATCH, "order", order.order_id, "Currency is not declared in the manifest"))
    for event in data.events:
        reference(event, "customer_id", customers, "event", event.event_id)
        reference(event, "product_id", products, "event", event.event_id)
        reference(event, "order_id", orders, "event", event.event_id)
        if options.require_authenticated_carts and event.event_name in CART_EVENTS and event.customer_id is None:
            issues.append(_issue(ValidationCode.MISSING_REQUIRED_FIELD, "event", event.event_id, "Authenticated-cart profile requires customer attribution", field="customer_id"))
    for item in data.order_items:
        reference(item, "product_id", products, "order_item", item.order_item_id)
        if reference(item, "order_id", orders, "order_item", item.order_item_id):
            if orders[item.order_id].created_at > item.available_at:
                issues.append(_issue(ValidationCode.INVALID_TIMESTAMP, "order_item", item.order_item_id, "Item availability precedes its inherited placement fact time"))
            if orders[item.order_id].currency is None:
                issues.append(_issue(ValidationCode.MISSING_REQUIRED_FIELD, "order_item", item.order_item_id, "Order items require the parent monetary profile"))
    for movement in data.inventory_movements:
        reference(movement, "product_id", products, "inventory_movement", movement.movement_id)
        reference(movement, "order_item_id", items, "inventory_movement", movement.movement_id)
        reference(movement, "trigger_event_id", events, "inventory_movement", movement.movement_id)
    if issues:
        return _report(None, issues, duplicates)

    events_by_order: dict[str, list[CommerceEvent]] = defaultdict(list)
    for event in data.events:
        if event.event_name in LIFECYCLE_EVENTS:
            events_by_order[event.order_id].append(event)
            order = orders[event.order_id]
            for field in ("customer_id", "session_id", "cart_id"):
                # Frozen v1 requires exact references, including copied nulls;
                # missing source linkage must not become invented attribution.
                if getattr(event, field) != getattr(order, field):
                    issues.append(_issue(ValidationCode.REFERENCE_MISMATCH, "event", event.event_id, "Lifecycle references must agree with the immutable order", field=field))
            if event.occurred_at < order.created_at:
                issues.append(_issue(ValidationCode.LIFECYCLE_CONFLICT, "event", event.event_id, "Lifecycle event precedes order creation"))
            if event.event_name == EventName.ORDER_CREATED and event.occurred_at != order.created_at:
                issues.append(_issue(ValidationCode.LIFECYCLE_CONFLICT, "event", event.event_id, "Creation event time differs from immutable placement"))
    for order in data.orders:
        lifecycle = events_by_order[order.order_id]
        creations = [event for event in lifecycle if event.event_name == EventName.ORDER_CREATED]
        terminals = [event for event in lifecycle if event.event_name in TERMINAL_EVENTS]
        if len(creations) > 1 or (options.require_lifecycle and len(creations) != 1) or len(terminals) > 1:
            issues.append(_issue(ValidationCode.LIFECYCLE_CONFLICT, "order", order.order_id, "Order requires one creation and at most one distinct terminal event"))
    carts: dict[str, str] = {}
    cart_owners: dict[str, set[str]] = defaultdict(set)
    for event in data.events:
        if event.event_name in CART_EVENTS and event.customer_id is not None:
            cart_owners[event.cart_id].add(event.customer_id)
    for order in data.orders:
        if order.cart_id:
            if order.cart_id in carts:
                issues.append(_issue(ValidationCode.CART_CONFLICT, "order", order.order_id, "Cart attempt is linked to more than one order"))
            carts[order.cart_id] = order.order_id
            if order.customer_id is not None:
                cart_owners[order.cart_id].add(order.customer_id)
    for cart_id, owners in cart_owners.items():
        if len(owners) > 1:
            issues.append(_issue(ValidationCode.REFERENCE_MISMATCH, "cart", cart_id, "Cart attempt has conflicting customer identities"))
    for event in data.events:
        if event.event_name in CART_EVENTS and event.cart_id in carts:
            if event.occurred_at > orders[carts[event.cart_id]].created_at:
                issues.append(_issue(ValidationCode.CART_CONFLICT, "cart", event.cart_id, "Cart changed after its order was placed"))
    if any(event.event_name == EventName.PURCHASE_COMPLETED for event in data.events) and data.manifest.completion_policy_version is None:
        issues.append(_issue(ValidationCode.MISSING_POLICY, "manifest", None, "Completed purchases require a declared completion policy"))
    for record in (*data.events, *data.orders):
        if record.customer_id and customers[record.customer_id].first_seen_at > fact_time(record):
            key = record.event_id if isinstance(record, CommerceEvent) else record.order_id
            issues.append(_issue(ValidationCode.INVALID_TIMESTAMP, "customer_reference", key, "Attributed behavior predates the customer's evidenced existence"))
    if issues:
        return _report(None, issues, duplicates)

    # A partial item feed cannot validate a total by summing only the visible lines.
    if data.orders and (data.order_items or options.require_order_items or options.require_inventory or data.inventory_movements):
        item_coverage = require_coverage(
            data, (CoverageStream.ORDER_ITEMS,), min(order.created_at for order in data.orders),
            data.manifest.extracted_at, options.coverage_resolution,
        )
        issues.extend(item_coverage)
        if not item_coverage:
            by_order = defaultdict(list)
            for item in data.order_items:
                by_order[item.order_id].append(item)
            for order in data.orders:
                lines = by_order[order.order_id]
                if not lines:
                    issues.append(_issue(ValidationCode.MISSING_REQUIRED_FIELD, "order", order.order_id, "Complete item profile requires at least one item per order"))
                elif order.item_subtotal_minor != sum(item.line_subtotal_minor for item in lines):
                    issues.append(_issue(ValidationCode.AMOUNT_MISMATCH, "order", order.order_id, "Item sum differs from immutable order subtotal"))
    if any(issue.severity == ValidationSeverity.ERROR for issue in issues):
        return _report(None, issues, duplicates)
    if options.replay_carts:
        issues.extend(validate_cart_replay(
            data, history_start=options.cart_history_start, resolution=options.coverage_resolution,
        ))
    if options.require_inventory or data.inventory_movements:
        issues.extend(validate_inventory_replay(data, resolution=options.coverage_resolution))
    return _report(data, issues, duplicates)
