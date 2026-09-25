# MED-SALES-00: Canonical sales data contract

Date: 2026-09-03. Contract design version: `sales_contract_v1`. This is a documentation specification for later implementation, not an existing schema, database migration, API or generated dataset. Its requirements and assumption classifications are traced in [SALES_AI_FOUNDATION.md](SALES_AI_FOUNDATION.md).

The SRS establishes customer purchasing/lead scoring (3.2.8, EUC-12), products/carts (EUC-03), orders (EUC-11, Figure 16), inventory (EUC-10), sales analytics (3.2.7-3.2.10), and funnel/drop-offs (Figure 12). **All exact canonical field names, event names, types, temporal windows and simulation rules below are B: SUPPORTING_ENGINEERING choices.** They are not asserted partner table/column names. The profile restrictions and deferred mappings are explicit so unsupported source data cannot silently acquire invented meaning.

## 1. Canonical entities and profiles

| Entity | Reason to retain | Used by |
|---|---|---|
| Customer | Stable pseudonymous subject for repeat history and lead ranking, SRS EUC-12 | Lead scoring; customer aggregates |
| Product | Stable commerce item, cart/order joins and product performance, EUC-03/EUC-13 | Funnel attribution context; sales; later stock analysis |
| CommerceEvent | Timestamped successful behaviors and order lifecycle; EUC-03/EUC-11 and funnel Figure 12 | Funnel; lead features/labels; deterministic sales |
| Order | Immutable placement fact and its originating customer/cart/session | Funnel; lead features/labels; sales |
| OrderItem | Quantity and order-time merchandise amount per product; SRS Figure 32 shows order items | Sales; inventory consistency; later product analysis |
| InventoryMovement | Explicit stock and reservation deltas; EUC-10 justifies stock, ledger mechanics are B | Synthetic consistency; later stock-aware analytics, not a required lead feature |

DatasetManifest and CoverageInterval are supporting metadata, not customer-domain entities. Cart additions/removals are event variants, not a second cart-event table. `session_id` and `cart_id` are opaque correlation identifiers; no separate Session or Cart snapshot entity is needed in v1. Existing partner sessions/carts can map into these identifiers. No Recommendation, Prescription, diagnosis, DDI, marketing campaign, address or payment-instrument entity is introduced.

Profiles are capability declarations, not assumptions that all feeds are complete:

- **Funnel profile:** product-view, cart-add and order-created/completed events plus referenced products/orders. Customer identity can be absent for session counting, although the main SRS cart flow is authenticated. Cart removal is needed for cart-state/quantity checks, not for the fact of having added something.
- **Lead v1 profile:** customers, orders, product/view/cart/session event references and complete required event histories. Requires identifiable customers and at least one known completed order in the 60-day lookback. Inventory and monetary inputs are not required for the minimal feature set.
- **Sales profile:** orders, order items, products and complete order-lifecycle feeds. Without items, only order-level counts are supported; no invented product/amount breakdown.
- **Inventory profile:** product references, ordered inventory deltas and matching order items/lifecycle for transactional reconciliation. Optional to real lead/funnel ingestion; required for the planned synthetic consistency profile.

Each dataset/stream declares support and completeness. An adapter may provide an order-only dataset; consumers then expose only supported metrics. It cannot manufacture behavior or stock history to satisfy a profile.

## 2. Field-level schema

### Conventions

`ID` means a nonblank opaque UTF-8 string of at most 128 characters. Its format does not imply an integer, UUID, SKU, customer name, medical identifier or partner primary key. Identifiers are stable across exports within a `source_namespace`; joins never cross namespaces or synthetic/real datasets without an explicit authorized mapping. Composite business identity is `(source_namespace, entity_type, entity_id)`. Per-export uniqueness additionally includes `dataset_id`. IDs are correlations, never model features.

`Instant` is an unambiguous timezone-aware timestamp normalized to UTC and serialized with `Z`; reject naive timestamps without an explicit source-timezone mapping. `int64` is a bounded integer, `Money` a nonnegative int64 in declared currency minor units (never binary float), and `string` nonblank unless nullable. `Yes` in Null means missing is permitted, not equivalent to zero. Conditional requirements override nullability.

Module abbreviations: **F** funnel, **L** lead scoring, **S** sales analytics, **I** inventory consistency/stock analytics, **All** all consumers. Sensitivity: **P** potentially customer-linked/personal, **B** commercial metadata, **N** no direct customer detail. Pseudonymous P fields remain potentially sensitive. Product combinations linked to a person can disclose health-related behavior even when no drug names are stored.

The **At T** column specifies availability for inference, not permission to use a field as a model feature: `Gate` = operational metadata only; `Known` = can describe the past only if both event/fact time and availability are <= T; `Join` = known-only linkage, prohibited as model input; `No` = outcomes after T are labels/reporting only. All records must also pass coverage and profile checks.

### DatasetManifest (one immutable export/simulation version)

| Field | Type | Null | Description/source concept | Module | At T | Sensitive |
|---|---|---|---|---|---|---|
| dataset_id | ID | No | Immutable export identifier; producer-assigned, retained on every record. | All | Gate | N |
| contract_version | string | No | Exact schema version, initially `sales_contract_v1`. | All | Gate | N |
| source_namespace | ID | No | Adapter-owned source/privacy boundary; separates applications/shops where relevant without assuming their tenant schema. | All | Gate | B |
| data_origin | enum | No | `partner_real`, `public_external` or `synthetic_development`; producer/source classification. | All | Gate | N |
| producer_version | string | No | Adapter or generator version, enabling reproducible mapping. | All | Gate | N |
| extracted_at | Instant | No | Export freeze time; all included facts were available by this time. Not a substitute for historical availability. | All | Gate | N |
| source_timezone | string | No | Source timezone used for normalization (IANA identifier or `UTC`); not inferred from a customer's location. | All | Gate | B |
| currency_minor_units | map[string, int] | No | Declared currency code -> decimal exponent; empty when no monetary profile. Dataset policy, not inferred from numeric scale. | S | Gate | B |
| completion_policy_version | string | Yes | Documented mapping of source states to completed purchase; required for completion metrics/labels. | F,L,S | Gate | B |
| session_policy_version | string | Yes | Origin of stable session IDs or documented sessionization rule; required for session metrics/features. | F,L | Gate | B |
| identity_policy_version | string | Yes | Pseudonymization/linking policy; required for L and customer aggregates. | L,S | Gate | P |
| generation_seed | int64 | Yes | Required only for synthetic origin; null for real/public sources. | All | Gate | N |
| generation_config_hash | string | Yes | Required for synthetic origin; SHA-256 of versioned generator settings. Hidden settings remain outside model inputs. | All | Gate | N |

Dataset manifests/version references are not features. A later source registry retains the provenance/authorization and mapping documents referenced by versions without embedding credentials or raw private paths in records.

### CoverageInterval (repeated metadata per stream)

| Field | Type | Null | Description/source concept | Module | At T | Sensitive |
|---|---|---|---|---|---|---|
| dataset_id | ID | No | Owning manifest. | All | Gate | N |
| stream | enum | No | `customers`, `products`, `orders`, `order_items`, `inventory_movements`, or one of the six event names in section 3. | All | Gate | N |
| interval_start | Instant | No | Inclusive coverage start. | All | Gate | N |
| interval_end | Instant | No | Inclusive coverage watermark; must be >= start. A complete assertion certifies through this instant, including events exactly at it. | All | Gate | N |
| coverage_status | enum | No | `complete`, `partial`, `unsupported`, `unavailable`; explicit source/adapter evidence. | All | Gate | N |
| known_at | Instant | No | When this coverage assertion was established; required when replaying what was known at a historical cutoff. | All | Gate | N |
| reason_code | string | Yes | Required unless complete: bounded documented reason such as `source_outage`, `not_instrumented`, `invalid_rows`, `unknown_historical_availability`. | All | Gate | N |

Coverage rows split around outages. No row for a required time/stream means unknown coverage, not complete coverage. Complete means all qualifying source facts for that interval have been reconciled; it does not mean the source has events in every minute. Unsupported streams must be declared even if empty. Coverage can be reassessed in a new dataset version; do not rewrite prior manifests. Overlapping contradictory assertions are invalid. For as-of replay select only assertions known at its availability cutoff. Require known_at <= extracted_at and, for complete intervals, interval_end <= known_at. Closed coverage watermarks permit a producer to certify all facts through T at T without claiming future visibility. Declare timestamp precision in the versioned adapter/generator policy; adjacent coverage/gap boundaries must partition that precision without hiding a missing instant.

### Common record envelope (applies to all six domain entities)

| Field | Type | Null | Description/source concept | Module | At T | Sensitive |
|---|---|---|---|---|---|---|
| dataset_id | ID | No | Links to manifest/source scope and data origin; not repeated origin flags on every field. | All | Gate | N |
| source_record_ref | ID | No | Opaque stable reference into the adapter's provenance map, or deterministic synthetic record reference. Do not put raw PII/native customer keys here. | All | Join | P |
| available_at | Instant | No | Earliest evidenced time this exact fact was durably available to the approved analytics input path. Source logging/CDC history or simulated delivery establishes it. | All | Gate | P |

No current mutable snapshot may be assigned an earlier `available_at` merely to make it usable in training. `available_at` can precede the current export's `extracted_at` only with historical evidence. A snapshot first observed today is available today. Facts are immutable in v1; corrected facts require a new dataset version and explicit correction handling (section 5), not in-place history replacement.

### Customer

| Field | Type | Null | Description/source concept | Module | At T | Sensitive |
|---|---|---|---|---|---|---|
| customer_id | ID | No | Stable pseudonymous subject from an authorized identity mapping. | L,S; optional F | Join | P |
| first_seen_at | Instant | No | Earliest evidenced existence of this customer in this source, not assumed birth date or account registration. | L quality/eligibility | Known | P |

No name, email, phone, sex, age, address, national ID, medical history or partner account object. A customer record does not imply consent for outreach; access/use decisions belong to the partner governance boundary.

### Product

| Field | Type | Null | Description/source concept | Module | At T | Sensitive |
|---|---|---|---|---|---|---|
| product_id | ID | No | Stable saleable-commerce-item identity; unrelated to DDI/medicine model keys. | F,S,I; joins L | Join | B |
| selling_unit | string | No | Declared inventory/order counting unit, e.g. `pack`; not a dose or treatment instruction. | S,I | Gate | B |
| merchandising_group | string | Yes | Optional non-clinical reporting group supplied by source; abstract groups only in simulation. Excluded from initial lead features. | S future grouping | Known | B |

Mutable prices and stock are not product fields. Product display names may be resolved by the partner when presenting results; the analytics core can use opaque IDs. Quantity v1 counts integer saleable units; fractional units require a versioned unit policy, not rounding.

### CommerceEvent

| Field | Type | Null | Description/source concept | Module | At T | Sensitive |
|---|---|---|---|---|---|---|
| event_id | ID | No | Stable event/deduplication identity. | F,L,S | Join | P |
| event_name | enum | No | One of the six names in section 3. | F,L,S | Known | P |
| occurred_at | Instant | No | Time of actual successful behavior/lifecycle transition, not extraction. | F,L,S | Known / No for future outcomes | P |
| customer_id | ID | Yes | Subject known when the event occurred; required for main SRS cart flow and scoring attribution. | L,S; optional F | Join | P |
| session_id | ID | Yes | Behavioral session or order's originating session; required for product/cart events, optional on unattributed orders. | F,L | Join | P |
| cart_id | ID | Yes | Stable cart attempt; required on cart events, optional on order events only when unknown/unattributed. | F,L | Join | P |
| product_id | ID | Yes | Required for product/cart events; absent on order lifecycle events (use items). | F,L,S | Join | B/P when linked |
| order_id | ID | Yes | Required only on order lifecycle events. | F,L,S | Join | P |
| quantity | int64 | Yes | Positive successfully added/removed units, required only for cart events. It is a delta magnitude, not a post-event cart size. | L cart state; F validation | Known | P |

Null conditionally irrelevant fields rather than using overloaded payloads. No free-text metadata bag, URLs, search terms, IP, device fingerprint or clinical attributes. Fields present for an incompatible event variant are invalid.

### Order (immutable placement fact)

| Field | Type | Null | Description/source concept | Module | At T | Sensitive |
|---|---|---|---|---|---|---|
| order_id | ID | No | Durable order identity mapped from source placement. | F,L,S,I | Join | P |
| customer_id | ID | Yes | Customer known at order placement; required for lead labels/history. | L,S | Join | P |
| created_at | Instant | No | Successful durable creation; must equal the canonical `order_created` time. | F,L,S | Known | P |
| session_id | ID | Yes | Originating session; null if not evidenced. | F,L | Join | P |
| cart_id | ID | Yes | Originating cart attempt; null if not evidenced. | F,L | Join | P |
| currency | string | Yes | Currency code present in manifest minor-unit map; required with item_subtotal_minor and for monetary reporting. | S; optional L | Gate | B |
| item_subtotal_minor | Money | Yes | Sum of order-item merchandise amounts at placement; excludes shipping, tax and later refunds. Required for monetary profile. | S; optional historical L | Known | P |

No `current_status`, final amount, lifetime spend or completed flag is stored in this immutable header. Derive lifecycle as-of a cutoff from events. A future completed purchase event must never rewrite the header supplied to an earlier prediction.

### OrderItem

| Field | Type | Null | Description/source concept | Module | At T | Sensitive |
|---|---|---|---|---|---|---|
| order_item_id | ID | No | Stable immutable line identity within source. | S,I | Join | P |
| order_id | ID | No | Parent order. | S,I; optional L | Join | P |
| product_id | ID | No | Saleable product. | S,I | Join | B/P when linked |
| quantity | int64 | No | Positive integer units at placement in Product.selling_unit. | S,I | Known | P |
| line_subtotal_minor | Money | No | Actual merchandise amount for the whole line at placement in the order's currency, after any source-allocated line discount. Not inferred from today's product price. | S; optional L | Known | P |

Avoid redundant unit price/discount fields in v1. Source-provided line amounts and their allocation policy must reconcile to the order subtotal; sources unable to provide compatible amounts can support counts only. OrderItem inherits fact time from Order.created_at and is available only at its own `available_at`. Partially fulfilled/amended item histories are outside this minimal profile and must be rejected for completion/inventory claims until a contract extension is agreed.

### InventoryMovement (optional supporting ledger)

| Field | Type | Null | Description/source concept | Module | At T | Sensitive |
|---|---|---|---|---|---|---|
| movement_id | ID | No | Unique stock-ledger fact. | I | Join | B |
| product_id | ID | No | Stock-keeping commerce product in its declared selling unit. | I | Join | B |
| occurred_at | Instant | No | Time stock/reservation changes became effective. | I | Known | B |
| movement_kind | enum | No | `opening_balance`, `receipt`, `reserve`, `release`, `fulfill`, `adjustment`. | I | Known | B |
| on_hand_delta | int64 | No | Signed physical-stock change. | I | Known | B |
| reserved_delta | int64 | No | Signed reserved-stock change. | I | Known | B |
| order_item_id | ID | Yes | Required on reserve/release/fulfill, otherwise null in v1. | I | Join | P |
| trigger_event_id | ID | Yes | Required on reserve/release/fulfill; links creation/cancellation/completion respectively. | I | Join | P |

No warehouse, supplier, lot, expiry or replenishment lead-time contract is assumed. v1 is one inventory pool per source/product; multiple locations or stock units require an explicit adapter policy or versioned extension. A snapshot-only source does not support causal reservation movements: declare that profile unavailable rather than fabricate a ledger.

## 3. Minimal stable event taxonomy

All events require the common envelope, event_id, event_name and occurred_at. All supplied foreign keys must resolve within the same source/dataset. Required/optional below are in addition to that envelope. All fields not listed for a variant must be null.

| Name | Required event fields | Optional event fields | Semantics |
|---|---|---|---|
| `product_viewed` | session_id, product_id | customer_id | Product details successfully displayed/selected under the documented view policy; not a list impression. View telemetry is a B instrumentation assumption. |
| `cart_item_added` | session_id, cart_id, product_id, quantity | customer_id structurally, but required by the main SRS authenticated-cart profile | Successfully add quantity units. Out-of-stock attempts/clicks do not emit this event. |
| `cart_item_removed` | session_id, cart_id, product_id, quantity | customer_id with the same profile rule | Successfully remove quantity units from existing contents; B support for truthful cart state. |
| `order_created` | order_id | customer_id, session_id, cart_id, matching Order exactly | Durable order accepted/stored. One canonical creation per order; a retry returns the same logical fact. |
| `purchase_completed` | order_id | customer_id, session_id, cart_id, copied from Order when present | Whole order both successfully fulfilled and payment confirmed under the declared completion policy. Emit once at the later qualifying transition. Definition is a development convention pending real mapping. |
| `order_cancelled` | order_id | customer_id, session_id, cart_id, matching Order | Terminal cancellation of an uncompleted order; explicitly supported by EUC-11. |

These names are internal contracts, not partner API routes or demanded frontend event names. Inventory changes are typed ledger facts, not a second general-purpose behavioral event bus.

Not emitted in v1: exposure, checkout, refill, repeat-purchase, abandoned-cart, lead-score-assigned or recommendation-click events. Repeat purchase and drop-off are computed outcomes; abandonment is only a horizon-bound absence under complete follow-up, not an observed intent. Pending is the derived absence of a terminal order event under known coverage, never a fabricated terminal state.

## 4. Relationships and attribution

1. Customer has zero or more attributed events/orders. Product has zero or more view/cart events/items/movements. Order has one or more items when the item profile is supported; a counts-only order feed may explicitly lack item coverage.
2. An order has exactly one creation event and at most one terminal event in v1 (completed or cancelled). Header times and customer/cart/session references agree with its lifecycle events. An order created before the dataset's reporting interval still needs its immutable header to interpret later lifecycle facts.
3. A session can contain many product actions and cart attempts. A cart attempt may span sessions, but has at most one placed order in this v1 profile. For full-funnel attribution, its qualifying addition and order creation must belong to the same originating session after that session's first view. Cross-session or missing-session purchases remain valid sales but may be unattributed to the full funnel.
4. After order placement a cart attempt is closed; later shopping uses a new cart ID. This is a synthetic/B simplification. A partner with a reusable shopping-cart row must map placement attempts to stable canonical cart IDs using an explicit rule rather than assume its row ID has these semantics.
5. Cart contents replay from successful add/remove deltas. On synthetic order placement, items exactly equal the cart contents at that time. Order quantities must not be reconstructed from cart contents after placement.
6. Anonymous views can contribute to session-level F1. They are not backfilled with a customer ID learned later. A session may contain anonymous views followed by authenticated cart actions; the lead feature builder uses only events with customer attribution already known at T. No cross-device/person merging or email inference in the core.
7. Order completion can happen after the originating session ends. Its attribution references are retained; it is not a new browsing session. All opaque references are scoped to a single manifest's namespace; leakage across shops/datasets is invalid.

## 5. Data validation rules

### Structural and source integrity

- Validate types, bounded enums, no extra fields, nonblank IDs, required variant fields and FK resolution. Reject malformed/naive timestamps and numeric overflow; quantities are positive where specified, monetary values nonnegative. Currency codes are uppercase three-letter source-validated codes; their declared minor-unit exponents are nonnegative integers. No float conversion/rounding to make data pass.
- The same logical record ID and identical content are idempotent duplicates. The same ID with conflicting content is an explicit conflict, not last-write-wins. Log sanitized IDs/reasons with Python standard logging and quarantine or fail the affected batch; mark affected coverage incomplete. Do not silently discard failures or retain `complete` coverage after losing relevant records.
- Every record links to an immutable manifest, a source record reference and an evidenced availability time. Synthetic manifests/records are never marked real, and real/public records never have invented generation seeds. Do not mix origin tiers in a report without separate strata and explicit purpose.
- Source data may be incomplete without being intrinsically malformed. Distinguish `invalid_record`, `unsupported_profile`, `insufficient_coverage`, `immature_followup` and a valid zero observation. Consumers carry these statuses; a zero score or zero conversion is not an error fallback.
- Corrections/tombstones are not silently overwritten into historical examples. v1 development inputs are immutable. An adapter encountering a substantive historical correction must quarantine affected results and publish a new dataset version with a correction record outside the v1 core, or propose a versioned correction contract. Historical features cannot be rebuilt from corrected facts pretending they were known earlier. No promise of a production CDC/correction engine is made in this phase.

### Time, lifecycle and financial integrity

- Fact/event time <= available_at <= manifest.extracted_at. For Customer the fact time is first_seen_at; for Order/OrderItem it is created_at; for other events/movements it is occurred_at. Product needs availability evidence but no invented creation timestamp.
- Complete source coverage must span every required lookback/follow-up, including gaps. Reporting cutoff and knowledge cutoff are explicit. Do not use a manifest's later extraction timestamp as evidence that all past telemetry was available on time.
- Creation precedes or equals its terminal event. A cancelled order cannot complete in v1; a completed order cannot later cancel. Returns/refunds are different facts outside v1. Sources using cancellation to mean refund must not map it here.
- SRS placement confirmation is not payment/fulfillment evidence. Unknown statuses are unsupported/unavailable, not coerced to completed. Real completion requires the documented mapping; a partially delivered or amended order is outside this v1 completed-purchase profile.
- Item subtotal equals the sum of line subtotals in the declared currency; no cross-currency aggregation without an explicit later conversion policy. Header currency/subtotal must be jointly present/absent; items require currency. Counts remain possible without monetary coverage. Amount definitions exclude shipping, tax and refunds and must be labeled accordingly.
- Cart removal cannot exceed prior contents. Failed requests do not increase contents. Referenced products exist/are known before their facts become usable. All history needed for a state replay must be supplied, or mark state unavailable.

### Inventory conservation (synthetic profile mandatory)

For each product start from one opening balance; replay atomic, causally ordered movements. At every completed transaction, `on_hand >= 0`, `reserved >= 0`, and `available = on_hand - reserved >= 0`.

| Movement kind | Required effect | Correlation |
|---|---|---|
| opening_balance | Nonnegative on_hand_delta, reserved_delta = 0; one initial fact per product | No order/event link |
| receipt | Positive on_hand_delta, reserved_delta = 0 | No order/event link; source receipt |
| reserve | on_hand_delta = 0, reserved_delta = item quantity | Exactly once per created order item, triggered by order_created; enough available stock required atomically |
| fulfill | on_hand_delta = -item quantity, reserved_delta = -item quantity | Exactly once for each completed item's reservation, triggered by purchase_completed |
| release | on_hand_delta = 0, reserved_delta = -item quantity | Exactly once for each cancelled item's reservation, triggered by order_cancelled |
| adjustment | Signed nonzero on_hand_delta, reserved_delta = 0; cannot reduce on_hand below reserved | Explicit observed stock correction; never used to hide generation bugs |

An order's creation/terminal event and all corresponding item movements are treated as one transaction for conservation checks. Identical timestamps do not establish an arbitrary ID-based order; use the causal links, with independent simultaneous transactions admitted only when a valid stock ordering exists. The generator assigns distinct transaction times where contention would otherwise be ambiguous. Reject ambiguous real replay rather than inventing sequence. Restocking does not count as sales. Pending orders retain reservations through the dataset end. Real snapshot-only or multi-location inventory awaits a separate mapping/profile, while non-inventory analytics can still proceed.

## 6. Temporal semantics

There are two clocks: **occurred_at/fact time** describes behavior, and **available_at** describes what the scoring system could know. For features at T both must be <= T. Rolling 60-day behavior uses inclusive [T-60 days, T]. Outcomes use (T, T+30 days]. Period reports use half-open [start, end). Coverage intervals use closed [start, end] watermarks: to include an event at the feature or outcome upper boundary, coverage must certify through that exact instant. These conventions are intentionally explicit and must not be interchanged.

For records with different delivery times, only facts and join counterparts individually available by T may contribute. For example, a purchase at T-2 days delivered at T+1 day is not a feature at T. A customer's later identified anonymous event is not a historical attributed event at T. A current-state table without historical logging is insufficient for point-in-time replay; record that limitation instead of substituting created_at for available_at.

Features require coverage assertions known by T for their required history. Later offline label evaluation may use outcomes delivered after their occurrence, but only when known by the chosen label-availability cutoff. For training that cutoff is the actual fitting cutoff, for validation the selection cutoff, and for test the frozen evaluation export. A complete interval assertion established after the fitting cutoff cannot justify a training negative at that cutoff.

For the synthetic operational stream, on-time source transactions/events are immediately durably recorded; their coverage can be declared through T with known_at = T. The delayed-delivery edge-case stream uses actual simulated latency and delays complete-coverage assertions until reconciliation. Never mark delayed telemetry complete at the earlier T. Data gaps cause affected examples/metrics to be unavailable, not spuriously inactive.

Funnel attribution has its own 7-day horizon from first product view V and uses fully covered mature sessions. Lead labels use 30 days from T. Keep these horizons separate. A final report may use a later extraction cutoff, but must record its dataset version and exclude immature cohorts from conversion/drop-off denominators. Recompute late-arrival reports as a new version with changed-coverage counts rather than silently revising published totals.

## 7. Lead-scoring label construction

Target/version: `repeat_purchase_30d_v1`. The semantics here and in FOUNDATION section 6 are identical.

1. Select Monday 00:00 UTC observation times T inside the declared train/validation/test ranges. Use only customer records known by T.
2. Require complete evidenced required event/order coverage over [T-60 days, T]. Customer record existence alone is not evidence of a complete history. Require at least one attributable purchase completed in that lookback whose creation/header and completion were known by T. This defines **recent prior purchasers**, not all site visitors.
3. Build features exclusively from facts within the lookback with fact time <= T and available_at <= T, and from join counterparts also available at T. Coverage gaps return `insufficient_data`; no prior completed purchase returns `out_of_scope`. Do not exclude/include customers using future events.
4. Define H = T + 30 days. After follow-up is complete, identify orders whose customer matches and whose created_at is in (T,H], with purchase_completed.occurred_at also in (T,H]. At least one such order makes label 1. An order created at/before T but completed after T is **not** a qualifying repeat-purchase action for this target.
5. Require complete order-created and completion coverage for the entire (T,H] interval, plus resolvable order/customer links and known outcome facts by the label cutoff. Then no qualifying order means label 0. For consistency, partially observed follow-up is excluded even if a positive was already seen; otherwise only positives would enter early. Missing linkage, invalid states or insufficient follow-up remain unlabeled with reasons.
6. Orders cancelled before completion are not positive outcomes. Completion after H does not qualify for this row, though it may qualify elsewhere. Refunds after a valid completed purchase do not retroactively change this occurrence target; net-retained-purchase labels need a different contract and follow-up rule.
7. Retain a derived label manifest per example: dataset_id, customer_id, T, target_version, horizon_end, label_status, nullable label, label_available_at, and qualifying order references for audit. These are label/audit fields, never input features. For excluded rows store an explicit reason. No label files are created now.

Eligibility does not require customer account age >= 60 days: complete source coverage plus first_seen_at allows known new-to-source history, but at least one prior purchase is still mandatory. Being first seen recently is not evidence of a first-ever purchase across other systems. Repeat purchases from unlinked guest orders cannot be guessed.

### Initial feature allowlist (derived, not extra canonical entity fields)

| Feature group | Point-in-time derivation | Availability/limitations |
|---|---|---|
| Historical purchase frequency | Counts of distinct completed orders in preceding 7, 30 and 60 days | Use known completion events only, joined to orders; include earlier-created orders if completion is in historical window. |
| Purchase recency | Elapsed days since most recent known completion in 60-day lookback | Eligible cohort guarantees at least one; bounded by lookback. |
| Session engagement | Distinct attributed sessions containing product/cart actions in preceding 7/30/60 days | Orders/lifecycle callbacks alone do not create browsing sessions. Missing event coverage is unavailable, not zero. |
| Product engagement | Product-view count and distinct viewed-product count in preceding 7/30/60 days | Counts only; no raw product/customer IDs or medical product attributes as model inputs. |
| Cart activity | Successful add/remove counts and quantities in preceding 7/30/60 days; recency of last add with explicit no-add flag | Do not infer checkout or read the cart's future final state. No-add under complete coverage can use an explicit missing indicator. |
| Recent purchase pattern | Ratio of last-30-day completed-order count to 60-day count | Denominator positive for eligible customers; exact formula versioned. |

Start with this bounded behavioral feature set. Historical monetary features are optional later: completed-order merchandise subtotal aggregates at T, per currency, only with complete compatible amounts. Current inventory, demographics, promotion responses, product embeddings, and future order values are not needed for v1. Preprocessing learns imputation/scaling from training only; missing source coverage must fail eligibility before imputation. A future purchase-only variant has a new feature/model version and separate evaluation.

### Hand-checkable boundary examples (abstract, not medical fixtures)

- T = 2026-06-01 00:00 UTC. A known prior completion on May 10 qualifies the customer. A new order on June 15 completed June 18 makes y = 1 if all 30-day follow-up is complete.
- An order created May 31 and completed June 2 is excluded from the future target because creation was before T; it cannot be used as a completed-purchase feature at T either.
- A new order created July 1 00:00 and completed at that exact time is inside the inclusive H boundary; a completion one microsecond later is outside. Source precision must support any such distinction; do not invent higher precision.
- A May 30 event delivered June 2 is excluded from June 1 features. If its feed cannot certify complete history at T, this example is unavailable for the full behavior profile rather than a valid zero-activity row.
- A customer with no qualifying future order is negative only once order coverage through H is complete. An export ending June 20 cannot label this June 1 row negative.

## 8. Leakage-prohibited fields and operations

| Prohibited feature/input | Why excluded |
|---|---|
| Target label, future conversion flag, qualifying future order ID, label-status/availability fields | Directly reveal outcome or future follow-up. |
| Events, new orders, cart changes, inventory facts or completions after T | Future behavior is the prediction target, not knowledge at inference. |
| A pre-T event delivered after T | Event time alone does not establish availability. |
| Current/final order status, final mutable cart snapshot, current lifetime totals | Can incorporate events unavailable at T; reconstruct allowed history only. |
| Next-purchase date, days until next order, future order quantity/value, later cancellation/refund or eventual segment label | Post-observation information. |
| Customer/product raw identifiers, sequential ID order, generation row index | Memorization and generator/source shortcuts rather than behavior. |
| Hidden synthetic propensity, segment/loyalty class, latent purchase probability, random draw, generator coefficients/seed | Trivial leakage of the simulation's mechanism; these stay outside all training/inference tables. |
| SRS/partner-stored lead score or a previously generated outcome-aware rank | An unverified upstream target proxy; not part of v1 features. |
| Global statistics, target encoding, scalers, imputers, resampling fitted across all periods | Leakage from validation/test into training. |
| DDI output, prescription history, medical condition, dosage, refill schedule | Outside the non-clinical objective and unnecessary sensitive/clinical data. |

Observable activity is allowed to correlate with hidden propensities; the hidden propensity itself is never exported into model input. Keep feature, label and generator-audit outputs in separately allowlisted paths later. The future trainer selects a positive allowlist, never “all columns except label.” Test-period outcomes must not be used to change feature definitions, generator settings, thresholds or model selection.

## 9. Synthetic-generation requirements (design only)

### Reproducibility and scale

- Origin is always `synthetic_development`. Use fictitious opaque customers/products and abstract merchandise groups; no real names, medications, clinical facts, actual prescription quantities or copied DDI fixtures.
- Default master seed: **260903**. Use independent named pseudorandom streams derived deterministically from SHA-256 of `(master seed, generator version, component name)`, not process-dependent built-in hash values. Fix generator/dependency versions, timezone, rounding, event ordering and ID construction; store configuration hash and output hashes/counts later. Same seed/config/version must reproduce the same records byte-for-byte after canonical serialization.
- Main history: **2025-09-01 00:00 UTC <= time < 2026-09-01 00:00 UTC**. Simulate tail behavior through August 31 for 30-day test-label maturity. Historical facts before the first training period provide warm-up. Never generate future dates beyond this defined calendar without a versioned extension.
- Approximately **2,500 customers and 200 products**. Use initial and staggered customer/product arrivals; reserve about 15% of customers for arrivals across the simulated year to exercise cold start. All observed IDs come from entity records; metadata arrival times must remain consistent.
- Expected engineering sizing, not imposed statistical truth: roughly 30,000-70,000 sessions and 100,000-300,000 commerce events, with perhaps several thousand to low tens of thousands of orders. Let actual orders, conversion prevalence and class imbalance emerge; report them without forcing a quota. If unsuitable for an experiment, disclose and version a justified generator change before freezing evaluation, never cherry-pick a seed for model scores.

### Forward behavioral process

1. Assign hidden heterogeneous customer traits. A starting configuration uses 55% occasional, 30% regular and 15% highly engaged synthetic customers with mean weekly session intensities approximately 0.1, 0.5 and 1.2 respectively; draw individual rates around those means with a positive skewed distribution (e.g. Gamma shape 1.5). Trait membership, loyalty, price sensitivity and random propensities are generator-private, not canonical customer fields.
2. Simulate visits forward with a Poisson arrival process conditional on customer activity rate, recent engagement and a decaying purchase/activity history. Permit inactive stretches and return bursts rather than identical weekly behavior. Engagement and repeat history raise conversion tendency on average; stochastic noise leaves both converters and non-converters in every sufficiently populated behavioral group.
3. Assign product popularity using a skewed rank distribution (initial power exponent about 1.1) plus customer affinity to abstract non-medical merchandising groups. Draw initial prices from a positive skewed distribution and freeze order-time line amounts. Popularity parameters, rank and affinity classes are not ML input columns. Observable product counts may reflect popularity naturally.
4. Within a session draw a skewed positive number of views (for example 1 plus a capped negative-binomial draw), with varied dwell times and distinct event timestamps. Cart additions depend probabilistically on engagement, product affinity, relative price and available stock. Removals and session exit also occur. Some sessions only view; some authenticated shoppers order without a captured view chain, which must be reported as unattributed rather than repaired.
5. After a nonempty cart, sample order placement using a bounded logistic probability with positive terms for recent engagement, recent cart activity and previous completed purchases, negative terms for price friction or extended inactivity, plus latent customer variation/noise. Cap probabilities away from 0 and 1 (development starting bounds 0.02 and 0.90). The exact coefficient set belongs to the later versioned generator configuration, selected for behavioral coherence, not model accuracy. No formula/probability/coin-flip columns enter features.
6. Generate orders and items from actual cart contents; reserve available stock atomically. Failed stock attempts create no successful add/order event. Generate probabilistic cancellation versus completion and stochastic fulfillment delays (initial lognormal median about 1 day, with a small long-delay tail). Completion requires the simulated fulfillment and payment confirmations; emit one canonical event at their later time. Pending orders near the calendar end remain pending. Use truthful transactions, not a sampled label assigned directly to a customer row.
7. Start each product with stock related to its popularity. Simulate periodic receipts with randomized supply delays; reservations, releases and fulfillment obey section 5. Include genuine stockouts and replenishments. Do not patch negative inventory with invisible receipts. Sales are constrained by availability; unobserved latent demand is not labeled as observed sales.
8. Add modest synthetic weekday intensity variation (about +/-10% around weekly mean), a slow non-clinical activity trend, and occasional bounded bursts. These are explicitly simulated commerce patterns, not empirical pharmacy seasonality. Do not invent disease seasons, medication cycles, regional festivals or medical refill rules. No annual-seasonality claim follows from one simulated year.
9. Construct lead examples and labels **after** this event stream exists, applying the exact point-in-time and complete-follow-up rules. The generator does not output target probabilities for the trainer. Keep hidden parameters and diagnostic latent demand in an isolated audit manifest accessible for generator QA only.

The initial distribution choices are reproducible design defaults, not medical or market facts. Exact distribution parameters, stable serialization, event tie resolution and configuration schema must be pinned in MED-SALES-03 before generation. All constraints here remain acceptance requirements for that task; MED-SALES-00 produces no data or executable generator.

### Missingness, edge cases and audit expectations

Maintain a valid canonical main stream and a separately tagged conformance/perturbation stream. Invalid test records do not silently enter training, and defects must not be used as labels.

| Deliberate scenario | Expected handling |
|---|---|
| New customers, lapsed customers, no prior purchase, view-only sessions and no-cart history | Honest out-of-scope/zero-history distinctions; no fabricated lead probability. |
| Anonymous product views followed by login; unlinked guest orders | Preserve what identity was known at each time; exclude from customer labels when unresolvable. Anonymous cart/order flows are optional adapter robustness scenarios, not the main authenticated SRS workflow. |
| Completed, cancelled and pending orders; delayed completion beyond the horizon | Separate lifecycle and censored-label handling; cancellation releases stock. |
| Skewed product activity, rarely viewed products, sold-out products and zero-sales periods | Preserve heterogeneity; zero sales are not proof of absent demand. |
| Customer inactivity blocks and stochastic conversion among less-engaged customers | Avoid deterministic labels or a perfect threshold rule. |
| Small delayed-delivery sample (e.g. 2% of events delayed 1-48 hours) | Occurred/available times differ; coverage catches up only after reconciliation. Separate from on-time baseline for transparent impact reporting. |
| A bounded tracking outage; an unsupported product-view feed | Mark explicit coverage intervals/profile status; do not fill missing behavioral counts with zero. |
| Missing optional merchandising groups, missing optional monetary profile or session attribution | Counts-only/unattributed metrics where valid, otherwise explicit unavailable status. |
| Identical retransmissions and conflicting duplicate IDs | Deduplicate identical facts; quarantine conflicts and mark coverage affected. Conflicts belong in conformance fixtures. |
| Orphan IDs, negative stock/quantity, remove-too-many, impossible terminal events and naive times | Intentional invalid conformance inputs must fail validation; never contaminate the valid simulation to test an ML model. |
| T, lookback-start and horizon-end boundaries; same-time causally linked actions | Verify inclusive/exclusive semantics and stable valid order; reject causally ambiguous inventory replay. |

Later QA records entity/event counts, relationships, balances, stage nesting, label prevalence by time/cohort, missingness and censoring, plus evidence that hidden generator fields are absent from the feature allowlist. Compare default seed 260903 with one prespecified robustness seed 260904 without selecting the better result. This is a generator robustness check, not a broad model experiment or evidence of real-world validity.

## 10. Partner adapter responsibilities

The adapter owns source extraction, source-scope isolation, stable opaque ID maps, native timestamp/timezone normalization, historical availability evidence, event/status mappings, monetary/unit conversion, identity/session linking, source reconciliation and coverage declarations. It validates its outputs before they enter core analytics. It must retain auditable source references without exposing credentials, raw customer keys or PII to models/logs.

Partner integration acceptance requires:

1. An agreed mapping document with native concepts -> canonical fields/events and explicit unsupported cases. No table/route names are assumed in this specification.
2. A completion policy demonstrating which fulfillment/payment evidence qualifies; creation, payment authorization alone, shipping and partial delivery are not silently treated as full completion.
3. Stable pseudonym and cart-attempt/session mapping, preserving known-at-time identity and unknown links. Fuzzy person/product matching is not part of the analytics core.
4. Verified source coverage and late/corrected-event behavior. A current order snapshot may support current descriptive reports but cannot automatically support historical training.
5. Matching input/output validation and sanitized error logs. Source failures result in explicit unavailable/partial output, not “no customers,” zero sales or safe clinical interpretations.
6. Conformance examples using at least two unrelated source object shapes yielding equivalent canonical records and analytics inputs. Core packages must not import partner ORM/database types; only adapters depend on source-specific code.

Changing partner storage must not change `repeat_purchase_30d_v1` or `funnel_v1` semantics. If a real business concept does not fit (partial orders, returns, multi-stock locations), version the contract explicitly before claiming that capability. Portable serializable scalars support later SQLite or PostgreSQL persistence; neither is selected as the canonical contract itself. Partner API/frontend integration and authenticating pharmacists remain later partner/application responsibilities.

## 11. Sensitive-data minimization

Use pseudonymous IDs and behavioral counts. Exclude direct identity, prescriptions, medication histories, diagnoses, chatbot/consultation text, payment credentials, exact address/geolocation and free-text searches. Do not copy SRS conceptual user/medicine attributes wholesale into the sales contract. The source owns authorized re-identification for its UI; the model does not need it.

Order/product histories may still be sensitive because they can reveal health-related behavior. Restrict real-data access and retention to the agreed purpose; source namespaces enforce separation. Agree deletion/correction handling, model artifact access and data-use permission before real training. Log reason codes and minimized opaque references, not entire payloads or customer histories. Do not infer that pseudonymization establishes anonymity or consent. Synthetic reports and artifacts must visibly identify their origin, and must not be mixed with real customer rankings.
