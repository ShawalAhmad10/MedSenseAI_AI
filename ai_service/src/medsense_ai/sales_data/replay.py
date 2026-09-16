"""Validation-only cart and atomic inventory replay over canonical facts."""

from collections import defaultdict
from datetime import datetime, timedelta
from itertools import groupby

from .contracts import (
    CART_EVENTS, INT64_MAX, CommerceEvent, CoverageStream, DataOrigin, EventName,
    InventoryMovement, MovementKind, SalesDataset, ValidationCode, ValidationIssue,
    ValidationSeverity,
)
from .temporal import assess_coverage


def _issue(code: ValidationCode, entity: str, key: str | None, message: str) -> ValidationIssue:
    return ValidationIssue(code=code, entity=entity, record_id=key, message=message)


def require_coverage(
    data: SalesDataset, streams: tuple[CoverageStream, ...], start: datetime,
    end: datetime, resolution: timedelta,
) -> list[ValidationIssue]:
    issues = []
    for stream in streams:
        try:
            result = assess_coverage(data.manifest, data.coverage, stream, start, end, resolution=resolution)
        except ValueError:
            issues.append(ValidationIssue(
                code=ValidationCode.INVALID_TIMESTAMP, entity="coverage", stream=stream,
                message="Replay boundaries do not match the supplied coverage policy",
            ))
            continue
        if not result.is_complete:
            issues.append(ValidationIssue(
                code=ValidationCode.INSUFFICIENT_COVERAGE,
                severity=ValidationSeverity.WARNING, entity="coverage", stream=stream,
                message=f"Requested replay coverage is {result.state.value}; history cannot be inferred",
            ))
    return issues


def validate_cart_replay(
    data: SalesDataset, *, history_start: datetime | None, resolution: timedelta,
) -> tuple[ValidationIssue, ...]:
    """history_start must cover the supplied cart attempts' authoritative origin.

    An event-only lookback does not prove an empty initial cart. Missing origin or
    missing complete coverage returns an incomplete result, not an assumed zero.
    """
    events = [event for event in data.events if event.event_name in CART_EVENTS]
    orders = [order for order in data.orders if order.cart_id is not None]
    if not events and not orders:
        return ()
    earliest = min([event.occurred_at for event in events] + [order.created_at for order in orders])
    if history_start is None or history_start > earliest:
        return (ValidationIssue(
            code=ValidationCode.INSUFFICIENT_COVERAGE, severity=ValidationSeverity.WARNING,
            entity="cart", message="Cart replay requires a declared complete-history origin",
        ),)
    issues = require_coverage(data, (
        CoverageStream.CART_ITEM_ADDED, CoverageStream.CART_ITEM_REMOVED, CoverageStream.ORDER_CREATED,
    ), history_start, data.manifest.extracted_at, resolution)
    if orders and data.manifest.data_origin == DataOrigin.SYNTHETIC_DEVELOPMENT:
        issues += require_coverage(data, (CoverageStream.ORDER_ITEMS,), history_start, data.manifest.extracted_at, resolution)
    if issues:
        return tuple(issues)
    cart_events: dict[str, list[CommerceEvent]] = defaultdict(list)
    for event in events:
        cart_events[event.cart_id].append(event)
    cart_orders = {order.cart_id: order for order in orders}
    items_by_order: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for item in data.order_items:
        items_by_order[item.order_id][item.product_id] += item.quantity
    for cart_id in sorted(set(cart_events) | set(cart_orders)):
        ordered = sorted(cart_events[cart_id], key=lambda event: event.occurred_at)
        order = cart_orders.get(cart_id)
        owners = {event.customer_id for event in ordered if event.customer_id is not None}
        if order and order.customer_id is not None:
            owners.add(order.customer_id)
        if len(owners) > 1:
            issues.append(_issue(ValidationCode.REFERENCE_MISMATCH, "cart", cart_id, "Cart attempt has conflicting customer identities"))
        quantities: dict[str, int] = defaultdict(int)
        at_placement: dict[str, int] | None = None
        for occurred, same_time_iter in groupby(ordered, key=lambda event: event.occurred_at):
            same_time = list(same_time_iter)
            if order and occurred > order.created_at:
                issues.append(_issue(ValidationCode.CART_CONFLICT, "cart", cart_id, "Cart changed after its order was placed"))
                break
            additions: dict[str, int] = defaultdict(int)
            removals: dict[str, int] = defaultdict(int)
            for event in same_time:
                target = additions if event.event_name == EventName.CART_ITEM_ADDED else removals
                target[event.product_id] += event.quantity
            for product in sorted(set(additions) | set(removals)):
                final = quantities[product] + additions[product] - removals[product]
                if final < 0 or final > INT64_MAX:
                    issues.append(_issue(ValidationCode.CART_CONFLICT, "cart", cart_id, "Cart quantity would be negative or exceed int64"))
                elif removals[product] > quantities[product] or quantities[product] + additions[product] > INT64_MAX:
                    issues.append(_issue(ValidationCode.AMBIGUOUS_REPLAY, "cart", cart_id, "Same-time add/remove needs an unprovided ordering"))
                quantities[product] = final
            at_placement = dict(quantities)
        if order and data.manifest.data_origin == DataOrigin.SYNTHETIC_DEVELOPMENT:
            expected = items_by_order[order.order_id]
            actual = {key: value for key, value in (at_placement or {}).items() if value}
            if not expected or dict(expected) != actual:
                issues.append(_issue(ValidationCode.CART_CONFLICT, "order", order.order_id, "Synthetic order items do not equal its cart at placement"))
    return tuple(issues)


def validate_inventory_replay(data: SalesDataset, *, resolution: timedelta) -> tuple[ValidationIssue, ...]:
    """Validate the whole supplied inventory profile, without choosing ambiguous stock order."""
    issues: list[ValidationIssue] = []
    by_product: dict[str, list[InventoryMovement]] = defaultdict(list)
    by_item: dict[str, list[InventoryMovement]] = defaultdict(list)
    events = {event.event_id: event for event in data.events}
    order_events: dict[str, list[CommerceEvent]] = defaultdict(list)
    for event in data.events:
        if event.order_id:
            order_events[event.order_id].append(event)
    items = {item.order_item_id: item for item in data.order_items}
    opening: dict[str, InventoryMovement] = {}
    for movement in data.inventory_movements:
        by_product[movement.product_id].append(movement)
        if movement.order_item_id:
            by_item[movement.order_item_id].append(movement)
    for product in data.products:
        candidates = [row for row in by_product[product.product_id] if row.movement_kind == MovementKind.OPENING_BALANCE]
        if len(candidates) != 1:
            issues.append(_issue(ValidationCode.INVENTORY_CONSERVATION_FAILURE, "product", product.product_id, "Inventory profile requires exactly one opening balance per product"))
        else:
            opening[product.product_id] = candidates[0]
    for movement in data.inventory_movements:
        if movement.trigger_event_id is None:
            continue
        trigger = events[movement.trigger_event_id]
        item = items[movement.order_item_id]
        expected_event = {
            MovementKind.RESERVE: EventName.ORDER_CREATED,
            MovementKind.RELEASE: EventName.ORDER_CANCELLED,
            MovementKind.FULFILL: EventName.PURCHASE_COMPLETED,
        }[movement.movement_kind]
        expected_deltas = {
            MovementKind.RESERVE: (0, item.quantity),
            MovementKind.RELEASE: (0, -item.quantity),
            MovementKind.FULFILL: (-item.quantity, -item.quantity),
        }[movement.movement_kind]
        if (
            movement.product_id != item.product_id or trigger.order_id != item.order_id
            or trigger.event_name != expected_event or trigger.occurred_at != movement.occurred_at
            or (movement.on_hand_delta, movement.reserved_delta) != expected_deltas
        ):
            issues.append(_issue(ValidationCode.INVENTORY_CONSERVATION_FAILURE, "inventory_movement", movement.movement_id, "Movement quantity, product, order, time or trigger does not match its item/lifecycle"))
    for item in data.order_items:
        expected_kinds = [MovementKind.RESERVE]
        for event in order_events[item.order_id]:
            if event.event_name == EventName.PURCHASE_COMPLETED:
                expected_kinds.append(MovementKind.FULFILL)
            elif event.event_name == EventName.ORDER_CANCELLED:
                expected_kinds.append(MovementKind.RELEASE)
        actual_kinds = [row.movement_kind for row in by_item[item.order_item_id]]
        if sorted(actual_kinds) != sorted(expected_kinds):
            issues.append(_issue(ValidationCode.INVENTORY_CONSERVATION_FAILURE, "order_item", item.order_item_id, "Item requires exactly one reservation and its matching terminal movement, if any"))
    if issues:
        return tuple(issues)
    if not opening:
        return ()
    start = min(row.occurred_at for row in opening.values())
    issues += require_coverage(data, (
        CoverageStream.INVENTORY_MOVEMENTS, CoverageStream.ORDERS, CoverageStream.ORDER_ITEMS,
        CoverageStream.ORDER_CREATED, CoverageStream.PURCHASE_COMPLETED, CoverageStream.ORDER_CANCELLED,
    ), start, data.manifest.extracted_at, resolution)
    if issues:
        return tuple(issues)

    # Each lifecycle event groups all item movements into one atomic transaction.
    transactions: dict[tuple[str, str], list[InventoryMovement]] = defaultdict(list)
    for movement in data.inventory_movements:
        key = ("event", movement.trigger_event_id) if movement.trigger_event_id else ("movement", movement.movement_id)
        transactions[key].append(movement)
    dependencies: dict[tuple[str, str], set[tuple[str, str]]] = defaultdict(set)
    for key, rows in transactions.items():
        for row in rows:
            if row.movement_kind != MovementKind.OPENING_BALANCE:
                dependencies[key].add(("movement", opening[row.product_id].movement_id))
            if row.movement_kind in (MovementKind.FULFILL, MovementKind.RELEASE):
                reserve = next(m for m in by_item[row.order_item_id] if m.movement_kind == MovementKind.RESERVE)
                dependencies[key].add(("event", reserve.trigger_event_id))
    balances = {product: (0, 0) for product in opening}
    processed: set[tuple[str, str]] = set()
    timed = sorted(transactions, key=lambda key: transactions[key][0].occurred_at)
    for _, timed_keys in groupby(timed, key=lambda key: transactions[key][0].occurred_at):
        pending = set(timed_keys)
        while pending:
            ready = sorted(key for key in pending if dependencies[key] <= processed)
            if not ready:
                issues.append(_issue(ValidationCode.INVENTORY_CONSERVATION_FAILURE, "inventory", None, "Movement precedes its opening balance or reservation"))
                return tuple(issues)
            effects: dict[str, list[tuple[int, int]]] = defaultdict(list)
            for key in ready:
                totals: dict[str, tuple[int, int]] = {}
                for row in transactions[key]:
                    hand, reserved = totals.get(row.product_id, (0, 0))
                    totals[row.product_id] = (hand + row.on_hand_delta, reserved + row.reserved_delta)
                for product, delta in totals.items():
                    effects[product].append(delta)
            for product, deltas in effects.items():
                hand, reserved = balances[product]
                final_hand = hand + sum(delta[0] for delta in deltas)
                final_reserved = reserved + sum(delta[1] for delta in deltas)
                final = (final_hand, final_reserved, final_hand - final_reserved)
                if any(value < 0 or value > INT64_MAX for value in final):
                    issues.append(_issue(ValidationCode.INVENTORY_CONSERVATION_FAILURE, "product", product, "Atomic transactions violate physical/reserved/available stock bounds"))
                    return tuple(issues)
                # All permutations of independent transactions must be safe. Causal
                # reserve -> terminal and opening -> later movements are ordered above.
                for initial, changes in (
                    (hand, [d[0] for d in deltas]),
                    (reserved, [d[1] for d in deltas]),
                    (hand - reserved, [d[0] - d[1] for d in deltas]),
                ):
                    if initial + sum(min(0, change) for change in changes) < 0 or initial + sum(max(0, change) for change in changes) > INT64_MAX:
                        issues.append(_issue(ValidationCode.AMBIGUOUS_REPLAY, "product", product, "Independent same-time transactions need an unprovided stock ordering"))
                        return tuple(issues)
                balances[product] = (final_hand, final_reserved)
            processed.update(ready)
            pending.difference_update(ready)
    return tuple(issues)
