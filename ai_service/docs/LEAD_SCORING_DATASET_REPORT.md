# MED-SALES-04: point-in-time lead dataset

## Purpose and frozen inputs

Construct the reusable supervised input to MED-SALES-05 without training a model or fitting preprocessing. Versions: `lead_features_v1`, `repeat_purchase_30d_v1`, `lead_temporal_split_v1`, builder `med-sales-lead-dataset-1.0.0`. The governing specifications remain [SALES_AI_FOUNDATION.md](SALES_AI_FOUNDATION.md), sections 6 and 11; [SALES_DATA_CONTRACT.md](SALES_DATA_CONTRACT.md), sections 6-8; and [SALES_SYNTHETIC_DATASET_REPORT.md](SALES_SYNTHETIC_DATASET_REPORT.md).

**All generated records are `synthetic_development`. These are simulated commerce histories, not real pharmacy/customer observations. No predictive performance, clinical validity or real-world effectiveness is established by this phase.**

Source: `data/synthetic/sales/v1/default_260903/`, dataset `synthetic_sales_260903_079a482eb7f58fb0`. Its 2,500 customers, 200 products, 208,492 events and 11,730 orders were loaded with the existing canonical coverage, item and inventory files. All eight canonical file hashes match SALES-03 provenance. The builder reads canonical files and their hash manifest only; it does not read generator configuration, hidden traits or synthetic QA diagnostics.

## Target, eligibility and point-in-time rules

One candidate is `(source_namespace, customer_id, T)`, with T at Monday 00:00 UTC in an approved supervised interval. Its opaque SHA-256 `example_id` includes dataset ID, namespace, customer, T and target version. IDs are joins/audit metadata only.

An eligible customer is known at T, has complete required history over **[T-60 days, T]** known at T, and has at least one attributable completed order in that interval. Both the order/header and completion must be knowable. Customers without such a purchase are `out_of_scope`, never negatives. Missing history yields `insufficient_data`, with no feature vector. Unknown customers do not enter the candidate schedule; the single-observation feature API returns `not_known` for them.

For an eligible snapshot, H = T + 30 days. Label 1 requires a matching new order **created and completed in (T,H]**, with required facts/joins available by the split evidence cutoff. An order created at/before T and completed after T cannot be positive. Label 0 requires mature, entirely complete follow-up and no qualifying order. Partial follow-up excludes positives as well as negatives: statuses `immature` and `insufficient_followup` retain null labels. `label_evidence_cutoff` records the actual cutoff used, not the earliest instant at which a label might have become knowable.

Historical coverage requires `customers`, `products`, `orders`, `order_created`, `purchase_completed`, `product_viewed`, `cart_item_added` and `cart_item_removed`. Future label coverage requires the first-party identity/order streams `customers`, `orders`, `order_created`, `purchase_completed`. The approved closed-interval helper evaluates (T,H] as [T+1 microsecond,H]. Every contributing event and required join must be knowable at the relevant cutoff. A delayed fact contradicting an apparently complete source watermark causes conservative rejection of that affected source interval, rather than a false zero. These coverage assertions are source-wide, not customer-specific.

Anonymous behavior is never retroactively assigned to customers. Lifecycle-only callbacks do not count as behavioral sessions. Product identifiers support distinct counts and joins only. Counts come from deduplicated canonical facts, with customer/type/time indexes and sorted window searches instead of rescanning all events per snapshot.

## Fixed feature contract

`feature_manifest.json` contains the exact ordered positive allowlist, per-field types, descriptions, lookbacks, null policy, boundary semantics and source streams. The eight families below expand to three separate names each (`7d`, `30d`, `60d`), giving 24 count features plus four individual features: **28 total**.

| Names | Meaning/type |
|---|---|
| `purchase_count_7d`, `purchase_count_30d`, `purchase_count_60d` | Distinct completed-order counts; integer |
| `session_count_7d`, `session_count_30d`, `session_count_60d` | Distinct attributed view/add/remove sessions; integer |
| `product_view_count_7d`, `product_view_count_30d`, `product_view_count_60d` | Product-view event counts; integer |
| `distinct_products_viewed_7d`, `distinct_products_viewed_30d`, `distinct_products_viewed_60d` | Distinct viewed product counts; integer |
| `cart_add_count_7d`, `cart_add_count_30d`, `cart_add_count_60d` | Successful add-event counts; integer |
| `cart_add_quantity_7d`, `cart_add_quantity_30d`, `cart_add_quantity_60d` | Units successfully added; integer |
| `cart_remove_count_7d`, `cart_remove_count_30d`, `cart_remove_count_60d` | Successful remove-event counts; integer |
| `cart_remove_quantity_7d`, `cart_remove_quantity_30d`, `cart_remove_quantity_60d` | Units successfully removed; integer |
| `purchase_recency_days` | Days since latest known completion inside 60 days; decimal |
| `days_since_last_cart_add` | Days since latest known add inside 60 days; nullable decimal |
| `no_cart_add_60d` | Boolean; true iff complete telemetry proves no add and add recency is null |
| `purchase_frequency_ratio_30d_60d` | Exact count fraction rounded to the documented decimal precision |

All windows include both endpoints. Integer counts remain exact; fractional days use integer elapsed microseconds / 86,400,000,000. Divisions use 28 significant decimal digits with `ROUND_HALF_EVEN`, independent of the caller's decimal context. The purchase-ratio denominator is positive by eligibility. No imputation, scaling, class balancing, clipping or resampling occurs.

The matrix has `example_id` plus these 28 fields only. MED-SALES-05 must select exactly `feature_allowlist` in its declared order; never select “all columns except label.” `read_features` enforces that header and separates IDs from typed feature objects. Metadata, customer/product/order references, future labels, seeds, hidden traits, monetary amounts and clinical information are excluded from model inputs.

## Exact temporal schedule and observed split results

All dates below are UTC; intervals include start and exclude end. Source freeze is **2026-08-31T23:59:59.999999Z**, the last represented microsecond before the approved exclusive 2026-09-01 boundary. This is consistent with the frozen calendar and requires no upstream change.

| Role | Observation interval | Label evidence cutoff/use |
|---|---|---|
| Warm-up | 2025-09-01 to 2025-11-01 | History only |
| TRAIN | 2025-11-01 to 2026-03-01 | 2026-04-01 00:00 |
| Purge 1 | 2026-03-01 to 2026-04-01 | No supervised rows |
| VALIDATION | 2026-04-01 to 2026-05-01 | 2026-06-01 00:00 |
| Purge 2 | 2026-05-01 to 2026-06-01 | No supervised rows |
| TEST | 2026-06-01 to 2026-08-02 | Actual source freeze |
| Tail | 2026-08-02 to 2026-09-01 | Outcomes/history only |

Assignment depends only on T. There are 17 training, 4 validation and 9 test Mondays. All supervised windows mature by their cutoff; train horizons end before validation observations begin, and validation horizons end before test observations begin. Zero supervised rows occur in warm-up, purge or tail intervals.

| Split | Rows | Distinct customers | Positive | Negative | Prevalence | Observed T range | Horizon-end range |
|---|---:|---:|---:|---:|---:|---|---|
| TRAIN | 9,428 | 917 | 4,373 | 5,055 | 46.3831% | 2025-11-03 to 2026-02-23 | 2025-12-03 to 2026-03-25 |
| VALIDATION | 2,272 | 664 | 1,068 | 1,204 | 47.0070% | 2026-04-06 to 2026-04-27 | 2026-05-06 to 2026-05-27 |
| TEST | 5,245 | 811 | 2,564 | 2,681 | 48.8847% | 2026-06-01 to 2026-07-27 | 2026-07-01 to 2026-08-26 |

Customer overlap is allowed for returning-customer prediction: TRAIN/VALIDATION **509**, TRAIN/TEST **539**, VALIDATION/TEST **533**. No IDs, ID encodings or customer embeddings are features. Weekly rows within a split have overlapping history/outcome windows; they are not independent observations for uncertainty estimation.

## Coverage, censoring and feature QA

Candidate denominator: known customers on the 30 supervised-period Mondays only. Of **70,003** candidates, **16,945** are eligible and supervised, **53,058** are out of scope, **0** have insufficient history, **0** are immature and **0** have insufficient follow-up. The 16,945 labels contain 8,005 positives and 8,940 negatives. Excluded candidates remain in the index and label audit with null labels; only mature supervised examples enter feature/label matrices.

Separate aggregate known-customer snapshots excluded by schedule: warm-up **19,451**, purge 1 **11,707**, purge 2 **9,640**, tail **12,421**. These are not additional candidate feature/label rows and are not included in the 70,003 denominator. This narrower schedule explains why totals differ from the SALES-03 all-week readiness preview. Customer selection is not conditioned on outcomes. Optional customer/time limits exist only for bounded development/reproducibility checks; the default build uses all customers and the entire frozen schedule.

All 28 features pass finite-value, type and applicable nested-window checks. Only `days_since_last_cart_add` has nulls: **104**, each paired with `no_cart_add_60d=true`; all other null counts are zero. Incomplete telemetry does not produce zeros. Skew is retained, with no winsorization:

| Representative feature | Min | Median | Mean | Max |
|---|---:|---:|---:|---:|
| `purchase_count_60d` | 1 | 2 | 3.180 | 38 |
| `session_count_60d` | 0 | 8 | 10.216 | 74 |
| `product_view_count_60d` | 0 | 19 | 25.360 | 194 |
| `cart_add_count_60d` | 0 | 5 | 8.592 | 109 |
| `cart_remove_count_60d` | 0 | 0 | 0.944 | 14 |
| `purchase_recency_days` | 0.000833 | 16.733 | 21.156 | 59.988 |
| `purchase_frequency_ratio_30d_60d` | 0 | 0.5 | 0.505 | 1 |

`build_report.json` contains type, null count, min, median, mean, max and finite-value status for every feature without rounding away the underlying statistics.

## Leakage, persistence and reproducibility evidence

The default source audit passed **645,195 event provenance checks**, **1,290,390 join-availability checks**, **8,005 positive-order checks** and **8,940 complete-negative-follow-up checks**. It checks actual source references, times, customer linkage, horizon boundaries and evidence cutoffs. Tests reject future lineage, false negative labels, wrong partitions and unstable example IDs. Dependency AST checks prohibit generator, ORM, API, DDI, estimator and network dependencies and fitting calls in the lead package. No lead estimator or preprocessor was fitted.

Default processed files are under `data/processed/sales/lead/v1/default_260903/`: `example_index.csv`, `feature_matrix.csv`, `labels.csv`, `train_ids.txt`, `validation_ids.txt`, `test_ids.txt`. Feature and label ID sets match; split ID files partition them exactly once. `example_index.csv` retains every candidate; `labels.csv` contains supervised labels only.

Default manifests/audits are under `artifacts/sales/lead/v1/default_260903/`: feature, target, split and provenance manifests; build config/report; leakage report; `label_audit.jsonl`; `feature_lineage.jsonl`; `file_hashes.json`; `run_metadata.json`. Positive future order IDs exist only in the label audit. Historical feature lineage holds only contributing pre-T references. Generated outputs are ignored by Git.

| SHA-256 identity | Digest |
|---|---|
| SALES-03 source `file_hashes.json` | `c06982322640736572db72696f5d03241f85f31fc6560a236afc61fcfc0ab3ce` |
| Lead build config | `4e5a7b7b4411a39f18e9dcd7574f3d47c5ea44011b4501bebb458f64f3740444` |
| Feature matrix | `b0281e0ed7544e2962550b992095ea2e83113b6494092eb123e487bf33c6eb85` |
| Labels | `fdc0d3d4581f2ceb8e96717c6096c5828fa3f6e011d334f43dccbb10624d2204` |

`file_hashes.json` verifies all 15 deterministic payloads. JSON keys/IDs and CSV field/row order are stable; JSONL/CSV use UTF-8 and LF, decimals serialize as strings, and CSV booleans use `true`/`false`. Run timestamps, timings and memory are isolated in `run_metadata.json`, outside reproducible hashes. Dependency versions are recorded; byte reproducibility is verified in this resolved environment, not promised across arbitrary Python/library upgrades.

Bounded verification reused the unchanged canonical source for two fresh builds of the same lexicographically selected 40 customers: **1,087 candidates, 279 supervised rows**. All 15 payloads and the hash manifest were byte-identical. All 279 feature rows also matched the full build, and 20 labels were independently recomputed directly from canonical source records. Evidence: `artifacts/sales/lead/v1/reproducibility_check.json`; outputs: `repro_40_a/` and `repro_40_b/` beneath the processed/artifact roots. No synthetic source was regenerated.

## Runtime, verification and MED-SALES-05 handoff

The default build ran once in **55.77 seconds**, with approximately **1,179.36 MiB (1.15 GiB)** peak process working set on this machine: load/validation 17.25 s; indexing 0.92 s; snapshot/features 13.47 s; labels 1.19 s; QA 11.67 s; serialization/verification 7.37 s. Remaining time is candidate assembly and orchestration. Python 3.13.9 and Pydantic 2.13.5 were used; no dependency changes were required.

Verification passed: **56 focused tests** (22.88 s), **364 combined sales/lead tests** (30.87 s), and the **full regression once: 607 passed** (43.67 s). Imports, application startup and the in-process health endpoint passed (HTTP 200, database available). `pip check` reported no broken requirements. No external network service was called.

Git diff/whitespace checks passed for tracked and new text files. All **19 frozen sales source/document SHA-256 checks** and **141 existing data/artifact size-and-mtime checks** passed. DDI tracked files and existing artifacts are unchanged; SALES-00/01/02/03 remain unchanged. The existing untracked SRS PDF was left untouched. New work is confined to nine lead package modules, four lead test/fixture files, this report, the lead-artifact ignore rule and generated lead outputs. Detailed results and the changed-file list are in `artifacts/sales/lead/v1/verification_report.json`.

The package exposes typed deterministic builders taking a validated `sales_contract_v1` dataset. A future partner adapter can supply the same canonical records without changing the feature/label logic. The CLI entry point is `python -m medsense_ai.lead_scoring.cli build`; it requires explicit source/hash/output locations and refuses nonempty output directories.

Limitations: this single synthetic source has complete on-time default telemetry, while missingness/late-arrival behavior is exercised in focused tests. Eligibility intentionally excludes first-purchase/cold-customer prediction. Source-wide coverage rejection is conservative. The implementation is in-memory and measured at this dataset size, not a streaming/scalability claim. Semantic changes to the target, chronology or allowlist require explicit versioning; do not silently rebuild them differently in training.

**Next exact task: MED-SALES-05 — Bounded Lead Scoring Model Training, Evaluation & Saved Inference Bundle.** Consume the saved feature allowlist, labels and frozen split IDs, preserve synthetic provenance and keep preprocessing/model fitting confined to the approved training workflow. Model training, calibration, thresholds, performance comparison, partner integration, APIs and frontend were not started here.
