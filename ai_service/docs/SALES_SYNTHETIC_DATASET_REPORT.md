# MED-SALES-03: Synthetic commerce development dataset

## Purpose and authority

This is **synthetic_development data**, not real pharmacy transactions, real customers, medical evidence, or empirical conversion estimates. It contains opaque synthetic identities and abstract merchandise, with no medication names, clinical attributes or personal contact information.

The implementation follows [SALES_AI_FOUNDATION.md](SALES_AI_FOUNDATION.md), especially sections 5, 6 and 10-11, and [SALES_DATA_CONTRACT.md](SALES_DATA_CONTRACT.md), especially profiles and sections 3-9. Existing canonical validators and `funnel_v1` are used unchanged. No feature/label training dataset, model, API, frontend, clinical recommendation or partner schema was created.

## Version, configuration and process

- Generator: `med-sales-synthetic-1.0.0`; default master seed **260903**.
- Calendar: **2025-09-01 00:00 UTC <= facts < 2026-09-01 00:00 UTC**. The closed extraction watermark is `2026-08-31T23:59:59.999999Z`.
- Runtime: CPython **3.13.9**, Pydantic **2.13.5**. No dependencies were added. Exact replay requires the same source version, config, seed and dependency versions.
- Config SHA-256: `079a482eb7f58fb0e5b86706dc2917d1928968a925887f20ac00ecdf3e8ea9e6`.
- Component random streams use SHA-256 of master seed, generator version and component name. They do not use Python's built-in `hash()` or wall-clock time. Future generation behavior changes require a new generator version.

Customers have private heterogeneous rates (Gamma variation around the approved 0.1/0.5/1.2 weekly mixture), group affinities, price sensitivity, inactivity periods and bounded bursts. Approximately 15% arrive during the calendar; a small product subset also arrives later. Conditional Poisson session opportunities respond to past engagement/completions and modest weekday/drift effects. Overlapping opportunities are suppressed while the current session is active; activity gaps of at least 30 minutes separate sessions, and simulated sessions remain under the 24-hour cap.

Sessions emit a capped, skewed number of actual views. Probabilistic cart additions depend on engagement, history, affinity, price friction and available stock; removals precede placement. Bounded logistic placement probabilities use private variation and noise, never a preassigned conversion or funnel-stage column. Orders/items come from actual cart contents and immutable integer minor-unit prices. A small configured fraction loses order-session attribution without losing its cart/items.

The global event queue interleaves shopping, replenishment and order outcomes chronologically. Creation reserves stock atomically; completion occurs at the later simulated payment/fulfillment confirmation; cancellation releases reservations. Completion delays have a lognormal body and a small long tail. Outcomes beyond the calendar remain pending. Opening stock and periodic receipts depend on baseline popularity, with stochastic supply delay; there are no invisible stock corrections. Stock availability is checked before successful additions and again before placement. Product popularity uses shuffled rank weights with exponent 1.1; prices are positive skewed commerce amounts in PKR minor units, without any claim about regional shopping behavior.

## Actual default dataset

| Entity/fact | Count |
|---|---:|
| Synthetic customers | 2,500 |
| Abstract products | 200 |
| Observed sessions | 55,234 |
| Carts with observed activity | 23,525 |
| Commerce events | 208,492 |
| Orders | 11,730 |
| Order items | 16,242 |
| Inventory movements | 37,642 |

Events comprise **146,386 views**, **34,459 additions**, **4,225 removals**, **11,730 creations**, **10,795 completions** and **897 cancellations**. There are **38 pending orders** at extraction. Session/event counts fall within the design expectations without quotas or seed selection. All relationships, lifecycle states, cart contents, amounts and inventory movements passed the existing full canonical validation profile.

## Existing funnel_v1 results

The existing `analyze_funnel` function is the sole source of funnel calculations. Reporting covers first-view times in the full calendar, with seven-day follow-up and the explicit extraction cutoff.

| Stage | Mature session count | Incoming conversion | Outgoing drop-off count | Outgoing drop-off rate |
|---|---:|---:|---:|---:|
| Product view | 54,042 | Not applicable | 30,861 | 57.11% |
| Cart addition | 23,181 | 42.89% | 11,922 | 51.43% |
| Order creation | 11,259 | 48.57% | 1,284 | 11.40% |
| Completed purchase | 9,975 | 88.60% | Not applicable | Not applicable |

Overall conversion is **9,975 / 54,042 = 18.46%**. The largest observed adjacent drop-off is **view to cart**, a descriptive finding with no causal or marketing claim. Artifacts retain integer fractions and precise decimal ratios; displayed percentages here are rounded.

**1,192 immature sessions** are excluded, with **zero coverage-unavailable sessions** in the clean main data. The report-level status is therefore `immature`, while eligible-subset metrics are valid. **300 orders** with missing originating session attribution remain explicit unattributed diagnostics. No downstream order fabricates an upstream journey. Completions outside a session's seven-day horizon remain valid commerce completions.

## Lead-scoring readiness preview

This is an aggregate weekly QA preview of `repeat_purchase_30d_v1`, not final training data. Every Monday T uses known-at-T customer/order/completion facts, complete required 60-day history and at least one prior completed purchase. A positive requires a new order created after T and completed by T+30 days. All future follow-up must be complete; partially observed positives are also censored. The label-availability cutoff for this preview is the final export. MED-SALES-04 must separately implement the approved fitting/selection cutoffs, purge gaps, feature allowlist and train/validation/test construction.

| Weekly snapshot category | Count |
|---|---:|
| Known-customer snapshots examined | 123,222 |
| Potentially eligible at observation, before maturity gating | 25,185 |
| Eligible mature examples | 22,147 |
| Positive future-repeat outcomes | 10,412 |
| Negative mature outcomes | 11,735 |
| Out of scope (no qualifying prior purchase) | 78,586 |
| Insufficient history/coverage | 19,451 |
| Immature/censored after observation eligibility | 3,038 |

Mature prevalence is **47.01%**. Early-calendar history is insufficient; no pre-calendar behavior is invented. Weekly detail is in `qa_report.json`; these overlapping snapshots are correlated and are not independent customers. No per-customer feature vectors, target rows, next-purchase dates or lead scores are persisted.

## Inventory and synthetic-process QA

- Existing cart replay, order/item amounts, lifecycle reference checks and inventory conservation all passed. Negative physical/reserved/available state observations: **0**.
- Final stock totals: **916 on hand**, **56 reserved**, **860 available**, with per-product balances retained in QA. Pending reservations are retained.
- **171 products** experienced stockouts, across **2,322 episodes**, covering **22.11% of product-time exposure**. There were **19,638 stock-blocked cart opportunities** and **6 stock-blocked placement opportunities** in private aggregate simulation diagnostics. They are not observed demand labels. This degree of stock constraint is a limitation to carry into future experiments, not evidence about pharmacy stockouts.
- **1,164 customers** have zero orders; **444** have one order; **853** have repeated completed purchases. Customer activity, order values and product popularity are nonuniform. The top product decile accounts for **66.61% of completed units**. This seed produced **no zero-selling products** and one product with 1-5 sold units; no zero-sales quota was imposed.
- Private aggregate group QA shows overlap: occasional customers include **442 purchasers and 943 non-purchasers**; highly engaged customers include **345 purchasers and 53 non-purchasers**. Segment membership, propensities, affinities, random draws and probabilities are never written to canonical records. Only aggregate group counts are retained in the QA area.
- Schema allowlist checks confirm no hidden-state, lead-score or target columns in canonical record files. Manifest seed/config hashes and source IDs remain provenance, explicitly excluded from future feature inputs.

## Reproducibility, perturbations and robustness

Two independent CLI smoke runs produce identical canonical files, config, deterministic QA and file-hash manifests. Run timestamps/timings live separately in `generation_report.json` and are intentionally different. The default serialized data was also reloaded, fully validated (including inventory), hash-checked and checked against the current readiness implementation.

Default `events.jsonl` SHA-256: `4e009f385ca6725983654f291f4e84b2d6a47d43a4bd8b100993861c75a8b85b`. All canonical/config/QA file hashes, row counts and dependency versions are recorded in `file_hashes.json`.

The clean stream is on-time and has complete coverage. Closed weekly blocks plus exact Monday checkpoints establish the knowledge available at weekly observation times. They do not imply completeness at every arbitrary historical intraday cutoff.

Separate smoke scenarios preserve provenance and stay outside future training input:

- **Delayed telemetry:** five selected view/add events arrive 1-48 hours later; affected complete-coverage assertions move to reconciliation time. The final reconciled funnel equals the clean smoke funnel. Point-in-time tests reject their premature use.
- **Two-day view outage:** view records are absent and coverage is unavailable, producing 68 coverage-excluded sessions and an explicitly incomplete cohort. The existing funnel conservatively requires first-view history from the declared session-history origin, so exclusions can extend beyond the outage. Remaining subset metrics must not be presented as whole-cohort rates.
- **Unsupported views:** no full-funnel denominator is fabricated; all stage counts and conversion are unavailable.
- Invalid orphans, naive timestamps, conflicting duplicates, terminal conflicts, excess removals and impossible stock/reservation/release records exist only in tests and fail QA.

The 60-day smoke profile is too short for mature lead readiness; it is used for fast mechanics/reproducibility checks. The same bounded **120-customer, 20-product, 180-day QA profile** was run with both prespecified seeds:

| Metric | Seed 260903 | Seed 260904 |
|---|---:|---:|
| Sessions | 1,125 | 1,227 |
| Commerce events | 4,199 | 4,766 |
| Orders | 244 | 293 |
| Funnel overall conversion | 18.55% | 19.49% |
| Mature readiness positives / negatives | 112 / 153 | 167 / 201 |
| Mature readiness prevalence | 42.26% | 45.38% |

Both seeds produce both mature classes. Their differences are reported without choosing the better seed or comparing a smoke result as though it were the default population.

## Artifacts, execution and performance

Source package: `src/medsense_ai/sales_data/synthetic/`. No existing sales core or DDI implementation was changed. Canonical files are JSON manifest plus JSONL coverage/customers/products/events/orders/order_items/inventory_movements with stable field/row ordering and exact integers/timestamps/nulls.

Default data: `data/synthetic/sales/v1/default_260903/` (**104,033,136 bytes**, about 99.2 MiB). Default provenance/QA: `artifacts/sales/synthetic/v1/default_260903/`, containing `dataset_manifest.json`, `generation_config.json`, `generation_report.json`, `qa_report.json` and `file_hashes.json`. Sibling directories hold `smoke_260903`, `smoke_reproduction`, `qa_260903`, `qa_260904`, `smoke_delayed`, `smoke_outage` and `smoke_unsupported`. The artifact root also contains `verification_report.json`. Data and synthetic artifacts are ignored by Git; source, tests and this report remain reviewable.

```powershell
.\.venv\Scripts\python.exe -m medsense_ai.sales_data.synthetic.cli generate --profile default --seed 260903 --output-dir data/synthetic/sales/v1/default_reproduction --artifacts-dir artifacts/sales/synthetic/v1/default_reproduction
```

Use `--profile smoke` for mechanics or `--profile qa --seed 260904` for bounded robustness. `--scenario delayed|outage|unsupported_views` selects an isolated observation scenario; default is `clean`. Outputs must be empty/new directories. The loader revalidates canonical records; call `verify_hashes` before consuming persisted files. Hash checking detects drift, not malicious replacement/authenticity.

Observed full default command time: **128.68 seconds**. Simulation: **38.97 s**; initial canonical/cart/inventory validation: **14.07 s**; QA validation: **14.99 s**; existing funnel plus its validation: **52.63 s**; readiness: **0.66 s**; serialization/hashing phase: **5.22 s**. Other summaries and overhead account for the remainder. Peak process working set was approximately **1.38 GiB**; this is an observed local run, not a performance guarantee. The existing funnel and validators were not weakened or redesigned for speed.

## Use, limits and partner replacement

Use this data to develop canonical adapters, deterministic funnel/sales/stock analytics, temporal data QA and later supervised-learning plumbing. Do not describe synthetic predictive scores as real-world validation, use these parameters as operational forecasts, or treat the generated prices/groups as medical facts. The year contains designed weekday/drift effects and cannot establish annual seasonality. No external dataset/network service was used and no model was trained.

Keep canonical data separate from generator config/QA artifacts. Future feature construction must use an explicit allowlist, point-in-time records/joins and frozen coverage gates; it must exclude IDs, seeds, private group audits and future outcomes. No QA class balance or conversion percentage is an accuracy target.

The boundary remains **synthetic generator -> sales_contract_v1 -> existing downstream engines**. Later, **partner backend -> thin adapter -> the same sales_contract_v1 -> the same engines**. The partner owns actual identity/session mappings, availability history, product keys and fulfillment/payment interpretation. This generator is not an assumed partner database schema.

Next task: **MED-SALES-04 — Point-in-Time Lead Feature, Label & Temporal Split Construction**. It has not been started here.
