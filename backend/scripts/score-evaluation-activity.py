"""Seeded, explicitly synthetic activity; existing canonical validation/features/model only."""
import hashlib
import json
from pathlib import Path
import random
import sys
from datetime import datetime, timedelta, timezone

root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / "ai_service" / "src"))
from medsense_ai.sales_data.contracts import SalesDataset, CoverageStream
from medsense_ai.sales_data.validation import ValidationContext, validate_dataset
from medsense_ai.lead_scoring.features import LeadIndex, build_features
from medsense_ai.lead_scoring.model.bundle import load_bundle
from medsense_ai.lead_scoring.model.inference import score_canonical
from medsense_ai.integrations.amna_medcopy.lead_scoring import PRODUCTION_BUNDLE_DIR, PRODUCTION_BUNDLE_MANIFEST_SHA256

def iso(value):
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")

def instant(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))

def score_dataset(dataset, observation):
    start = datetime(2026, 7, 1, tzinfo=timezone.utc)
    report = validate_dataset(dataset, context=ValidationContext(require_lifecycle=True,require_order_items=False,require_authenticated_carts=True,
                                                                replay_carts=True,require_inventory=False,cart_history_start=start))
    if not report.is_valid:
        raise ValueError("Synthetic evaluation dataset validation failed: " + str(report.issues[:5]))
    index = LeadIndex(report)
    bundle = load_bundle(PRODUCTION_BUNDLE_DIR, PRODUCTION_BUNDLE_MANIFEST_SHA256)
    scores = []
    for customer in dataset.customers:
        result = score_canonical(index,customer.customer_id,observation,bundle)
        feature = build_features(index,customer.customer_id,observation)
        scores.append(dict(customer_id=int(customer.customer_id),scoring=result.model_dump(mode="json"),
                           features=feature.features.model_dump(mode="json") if feature.features else None))
    return dict(dataset=dataset.model_dump(mode="json"),scores=scores,event_count=len(dataset.events))

def main():
    source = json.load(sys.stdin)
    if "dataset" in source:
        dataset = SalesDataset.model_validate(source["dataset"])
        if dataset.manifest.data_origin != "synthetic_development":
            raise ValueError("Evaluation scoring accepts explicitly synthetic datasets only")
        print(json.dumps(score_dataset(dataset,instant(source["observation"]))))
        return
    seed = 20261003
    rng = random.Random(seed)
    observation = instant(source["observation"])
    start = datetime(2026, 7, 1, tzinfo=timezone.utc)
    dataset_id = "medsense-evaluation-50-orders-v1"
    config_hash = hashlib.sha256(json.dumps(source, sort_keys=True).encode()).hexdigest()
    base = lambda ref, at: dict(dataset_id=dataset_id, source_record_ref=ref, available_at=iso(at))
    customers = [dict(**base("customer:" + str(c["id"]), instant(c["created_at"])), customer_id=str(c["id"]), first_seen_at=c["created_at"]) for c in source["customers"]]
    products = [dict(**base("product:" + str(p["id"]), instant(p["available_at"])), product_id=str(p["id"]), selling_unit="saleable_unit") for p in source["products"]]
    events = []
    orders = []
    order_items = []
    def event(name, at, customer, session, cart=None, product=None, quantity=None, order=None):
        ident = "evaluation-event-" + str(len(events)+1).zfill(4)
        events.append(dict(**base(ident,at),event_id=ident,event_name=name,occurred_at=iso(at),customer_id=str(customer),session_id=session,
                           **({"cart_id":cart} if cart else {}), **({"product_id":str(product)} if product else {}),
                           **({"quantity":quantity} if quantity else {}), **({"order_id":str(order)} if order else {})))
    for position, customer in enumerate(source["customers"]):
        day = start
        while day < observation:
            at = day + timedelta(hours=8, minutes=position*7)
            if at < observation and (day-start).days % (position+1) == 0:
                available = [p for p in source["products"] if instant(p["available_at"]) <= at]
                product = rng.choice(available)["id"]
                session = f"evaluation-browse-{customer['id']}-{day:%Y%m%d}"
                event("product_viewed",at,customer["id"],session,product=product)
                if (day-start).days % 4 == position:
                    cart = session + "-cart"
                    event("cart_item_added",at+timedelta(seconds=10),customer["id"],session,cart,product,1)
                    event("cart_item_removed",at+timedelta(seconds=20),customer["id"],session,cart,product,1)
            day += timedelta(days=1)
    for order in source["orders"]:
        at = instant(order["created_at"])
        session = "evaluation-order-session-" + str(order["id"])
        cart = "evaluation-order-cart-" + str(order["id"])
        for n, item in enumerate(order["items"]):
            viewed = at-timedelta(seconds=120-n*10)
            event("product_viewed",viewed,order["customer_id"],session,product=item["product_id"])
            event("cart_item_added",viewed+timedelta(seconds=5),order["customer_id"],session,cart,item["product_id"],item["quantity"])
            order_items.append(dict(**base("item:"+str(item["item_id"]),at),order_item_id=str(item["item_id"]),order_id=str(order["id"]),
                                    product_id=str(item["product_id"]),quantity=item["quantity"],line_subtotal_minor=item["total_minor"]))
        orders.append(dict(**base("invoice:"+str(order["id"]),at),order_id=str(order["id"]),customer_id=str(order["customer_id"]),
                           created_at=iso(at),session_id=session,cart_id=cart,currency="PKR",item_subtotal_minor=sum(i["total_minor"] for i in order["items"])))
        event("order_created",at,order["customer_id"],session,cart,order=order["id"])
        event("purchase_completed",at+timedelta(seconds=30),order["customer_id"],session,cart,order=order["id"])
    dataset = SalesDataset.model_validate(dict(manifest=dict(dataset_id=dataset_id,contract_version="sales_contract_v1",
        source_namespace="medsense_evaluation_simulated",data_origin="synthetic_development",producer_version="evaluation-activity-v1",
        extracted_at=iso(observation),source_timezone="UTC",currency_minor_units={"PKR":2},generation_seed=seed,generation_config_hash=config_hash,
        completion_policy_version="evaluation-delivered-paid-v1",session_policy_version="evaluation-session-v1",identity_policy_version="evaluation-customer-v1"),
        coverage=[dict(dataset_id=dataset_id,stream=stream.value,interval_start=iso(start),interval_end=iso(observation),
                       coverage_status="complete",known_at=iso(observation)) for stream in CoverageStream],
        customers=customers,products=products,events=events,orders=orders,order_items=order_items))
    print(json.dumps(score_dataset(dataset,observation)))

if __name__ == "__main__":
    main()
