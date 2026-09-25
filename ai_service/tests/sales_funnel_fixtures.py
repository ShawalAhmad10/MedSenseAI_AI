"""Hand-authored abstract journeys for funnel arithmetic, never real commerce data."""

from datetime import timedelta

from medsense_ai.sales_analytics import FunnelRequest
from medsense_ai.sales_data import CoverageStream, Customer, Order, Product, SalesDataset

from tests.sales_data_fixtures import START, changed, coverage, envelope, event, manifest

HISTORY = START - timedelta(days=1)
FREEZE = START + timedelta(days=20)
TICK = timedelta(microseconds=1)


def request(**updates):
    return FunnelRequest(**{
        "report_start": START, "report_end": START + timedelta(days=1),
        "knowledge_cutoff": FREEZE, "session_history_start": HISTORY, **updates,
    })


def journey(key, level=4, *, view_at=START, terminal="purchase_completed", completion_at=None):
    """One session/cart/order, with one minute between active stages."""
    session, cart, order_id = f"session_{key}", f"cart_{key}", f"order_{key}"
    rows, orders = [], []
    names = ["product_viewed", "cart_item_added", "order_created"][:level]
    if level == 4 and terminal:
        names.append(terminal)
    for index, name in enumerate(names):
        at = view_at + timedelta(minutes=index)
        if index == 3 and completion_at is not None:
            at = completion_at
        values = dict(event_id=f"{key}_{name}", source_record_ref=f"{key}_{name}", session_id=session)
        if index > 0:
            values["cart_id"] = cart
        if index > 1:
            values["order_id"] = order_id
        rows.append(event(name, at, **values))
        if name == "order_created":
            orders.append(Order(
                **envelope(order_id, at), order_id=order_id, created_at=at,
                customer_id="customer_001", session_id=session, cart_id=cart,
            ))
    return tuple(rows), tuple(orders)


def batch(*journeys, cutoff=FREEZE):
    return SalesDataset(
        manifest=manifest(extracted_at=cutoff),
        coverage=tuple(coverage(stream, interval_start=HISTORY, interval_end=cutoff, known_at=cutoff) for stream in CoverageStream),
        customers=(Customer(**envelope("customer_001", HISTORY), customer_id="customer_001", first_seen_at=HISTORY),),
        products=(Product(**envelope("product_001", HISTORY), product_id="product_001", selling_unit="unit"),),
        events=tuple(row for events, _ in journeys for row in events),
        orders=tuple(row for _, orders in journeys for row in orders),
    )


def feed(data, stream, status=None, **updates):
    """Replace one declaration; None removes it entirely (unknown)."""
    rows = tuple(row for row in data.coverage if row.stream != stream)
    if status is not None:
        rows += (coverage(
            stream, interval_start=HISTORY, interval_end=data.manifest.extracted_at,
            known_at=data.manifest.extracted_at, coverage_status=status,
            reason_code=None if status == "complete" else "artificial_outage", **updates,
        ),)
    return changed(data, coverage=rows)
