# MED-SALES-06: Sales analytics and explainable optimization report

## Scope and version

`sales_analytics_v1` is a deterministic, partner-independent descriptive analytics engine over validated `sales_contract_v1` records. It does not forecast demand, train or invoke a lead model, infer causal effects, or automate prices, promotions, purchasing, or inventory changes.

The development demonstration uses the unchanged `med-sales-synthetic-1.0.0` default dataset `synthetic_sales_260903_079a482eb7f58fb0` in source namespace `synthetic_sales`. Every value below is synthetic-development evidence and must not be presented as real pharmacy behavior or performance.

## Report policy

- Reporting interval: `[2026-07-01T00:00:00Z, 2026-08-01T00:00:00Z)`.
- Knowledge cutoff: `2026-08-31T23:59:59.999999Z`.
- Trend buckets: adjacent seven-day UTC buckets, with a final three-day bucket.
- Customer history starts at `2025-09-01T00:00:00Z`; no default history duration is inferred.
- Product high/low lists use caller-supplied `ranking_limit_n=10` and cannot overlap.
- Facts require their metric time in the requested interval and `available_at <= knowledge_cutoff`.
- Missing, partial, unsupported, unavailable, conflicting, gapped, late, or unknown required coverage returns `insufficient_coverage`. A completely covered empty denominator returns `not_applicable`. Only complete covered streams can produce a measured zero.
- Currency amounts remain integer minor units and are never combined across currencies.

Sales are recognized at `purchase_completed.occurred_at`; cancellations are recognized at `order_cancelled.occurred_at`. Merchandise subtotal uses immutable `Order.item_subtotal_minor`. It is not net revenue, profit, margin, cash collected, or post-refund revenue.

## Period sales summary

The covered interval contains 1,037 completed orders, 93 cancelled orders, and 1,796 completed units. All 1,037 completed orders are identified in this synthetic interval; zero are anonymous.

Completed PKR merchandise subtotal is 2,578,587 minor units. Average completed-order PKR merchandise subtotal is 2,486.583413693346190935390550 minor units, retaining exact decimal arithmetic from the integer numerator and 1,037-order denominator.

## Calendar trends

| UTC bucket | Completed | Cancelled | Units | PKR merchandise subtotal |
|---|---:|---:|---:|---:|
| 2026-07-01 to 2026-07-08 | 184 | 12 | 263 | 396,673 |
| 2026-07-08 to 2026-07-15 | 274 | 23 | 497 | 693,172 |
| 2026-07-15 to 2026-07-22 | 227 | 25 | 393 | 565,730 |
| 2026-07-22 to 2026-07-29 | 266 | 28 | 490 | 677,712 |
| 2026-07-29 to 2026-08-01 | 86 | 5 | 153 | 245,300 |

These are calendar terminal-event trends. They do not alter or merge with the separate seven-day order-lifecycle cohort.

## Product rankings

Primary ordering is completed units descending, completed-order count descending, then `product_id` ascending. Monetary ranking is separately currency-scoped and never acts as a hidden unit-ranking tie-break.

Top ten observed sellers: `product_0018`, `product_0081`, `product_0044`, `product_0189`, `product_0144`, `product_0099`, `product_0005`, `product_0187`, `product_0007`, and `product_0184`.

Bottom ten observed sellers, lowest first: `product_0200`, `product_0173`, `product_0167`, `product_0131`, `product_0093`, `product_0075`, `product_0063`, `product_0058`, `product_0038`, and `product_0020`.

A zero is described only as **observed zero completed units** under complete catalog, order-item, order, and completion coverage. It is never called zero demand.

## Repeat-customer contribution

A repeat order belongs to an identified customer with a strictly earlier completed order in the covered history. Same-time completions do not create an artificial prior order. Anonymous orders are reported separately and excluded from the denominator.

Of 1,037 identified completed orders, 984 are repeat-customer orders. The observed repeat-order contribution is `984 / 1037 = 0.9488910318225650916104146577`. This is a descriptive synthetic-history share, not lifetime value, retention uplift, or evidence that outreach will cause another purchase.

## Inventory and stockout context

Inventory results reuse canonical validation and replay. Available stock is `on_hand - reserved`; reservations therefore reduce available stock. A stockout begins on a valid transition to zero and ends on a later transition above zero. Output retains boundary timestamps and sums only fully bounded durations as integer seconds.

In this report, 110 of 200 products have recorded stockout context. Fully bounded stockout intervals total 98,812,160 product-seconds. This aggregate does not estimate lost sales or unconstrained demand. A current balance alone is never used to infer historical stockout.

Low-ranked product language depends on evidence: recorded stockout yields constrained-availability wording; complete inventory without stockout states only the observed low units; missing inventory states that its effect is unavailable. No rule emits a reorder quantity or supplier conclusion.

## Funnel summary

The engine calls the frozen `analyze_funnel` runtime and summarizes its `funnel_v1` result without reconstructing stages:

- Product View: 5,074
- Cart Addition: 2,092
- Order Creation: 1,088
- Completed Purchase: 967
- Overall conversion: `0.1905794245171462357114702404`
- Largest observed drop-off transition: `view_to_cart`
- Unattributed orders: 22, with the frozen diagnostic reasons retained in the machine-readable report.

The original first-valid-view cohort, seven-day follow-up, immature-session handling, telemetry coverage, and unattributed-order semantics remain unchanged.

## Lead cohort summary

Status is `not_applicable`: no compatible pre-produced `LeadScoringResult` cohort was supplied to the default build. The engine does not load a model, fit a model, or silently rescore customers. When results are supplied, it requires a single source namespace, model version, feature version, target version, and observation time; it ranks scored rows deterministically and preserves the synthetic-development notice. Realized future outcomes are outside v1.

## Explainable insights

The demonstration emitted 22 deterministic insights: one largest-funnel-dropoff observation, ten high-rank product observations, seven low-rank observations with complete no-stockout context, three low-rank constrained-stock observations, and one repeat-contribution observation.

Every insight records its rule ID, analytics version, source, interval, metric references, underlying values, coverage status, limitation code, and cautious fixed text. Unavailable evidence suppresses unsupported rules. No LLM-generated conclusion is authoritative.

## Artifacts, verification, and runtime

The gitignored artifact directory is `artifacts/sales/analytics/v1/default_260903/`. It contains one canonical `analytics_report.json`, a provenance manifest, SHA-256 manifest, and nondeterministic run metadata. The deterministic file hashes were verified after generation.

The measured local run loaded and validated the frozen source in 17.66 seconds and performed analytics in 41.30 seconds. Peak process working set was approximately 1.44 GB while the full synthetic dataset and validation structures were resident. These development-machine measurements are not service latency or production memory guarantees.

Focused SALES-06 plus existing funnel/lifecycle tests cover half-open boundaries, exact availability, late facts, independent coverage gates, empty ratios, currency arithmetic, deterministic product rankings, nonoverlapping high/low lists, repeat identity, inventory replay and stockouts, frozen funnel derivation, supplied lead cohort compatibility, serialization, and deterministic insight limitations.

## Limitations and partner integration

The source is one synthetic seed with simulated behavior and inventory. Observed sales are not unconstrained demand. Returns, refunds, partial fulfillment, multi-location stock, costs, taxes, shipping, discounts, corrected orders, supplier lead times, promotion exposure, and causal intervention outcomes are not represented sufficiently for claims about profit, reorder quantities, promotion effectiveness, or future demand.

Partner adoption requires read-only schema and workflow inspection followed by versioned adapters for source identity, completion states, customer/session linkage, currency scale, historical availability, coverage, inventory locations, returns/refunds, and correction semantics. Core contracts must not acquire guessed partner table, route, status, or order-flow names.
