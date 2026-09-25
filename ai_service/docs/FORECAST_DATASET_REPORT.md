# MED-FORECAST-01: Point-in-time forecasting dataset

## Versions and scope

- Builder: `med-sales-forecast-dataset-1.0.0`
- Features: `forecast_features_v1`
- Target: `observed_completed_units_next_7d_v1`
- Split: `forecast_temporal_split_v1`
- Canonical input: `sales_contract_v1`
- Frozen development source: `med-sales-synthetic-1.0.0`, seed 260903

This phase constructs an immutable supervised dataset. It does not fit preprocessing, train a baseline/model, select a model, forecast inventory, or create an API. **Synthetic observed completed-unit sales are not real pharmacy demand.**

## Row and target semantics

One row represents `(source_namespace, product_id, Monday T)`, where `T` is Monday 00:00 UTC. Product ID is retained as join/audit metadata and is absent from the feature matrix. Selling-unit metadata remains in the example index.

The target is the sum of canonical `OrderItem.quantity` for the product when the parent order has a valid `purchase_completed.occurred_at` in `[T,T+7 days)`. Completion time, rather than order-creation time, controls attribution. The target describes observed completed sales; it is not unconstrained demand, true demand, required stock, or a reorder quantity.

## Exact feature contract

The feature matrix contains exactly 19 ordered fields:

1. `completed_units_lag_1w`
2. `completed_units_lag_2w`
3. `completed_units_lag_4w`
4. `completed_units_lag_8w`
5. `completed_units_sum_4w`
6. `completed_units_mean_4w`
7. `completed_units_sum_8w`
8. `completed_units_mean_8w`
9. `nonzero_sales_weeks_8w`
10. `cancellation_count_1w`
11. `cancellation_count_4w`
12. `available_stock_at_t`
13. `stockout_seconds_1w`
14. `stockout_seconds_4w`
15. `receipt_quantity_4w`
16. `iso_week_sin`
17. `iso_week_cos`
18. `month_sin`
19. `month_cos`

Cancellation counts are distinct cancelled orders containing the product. Receipt quantity includes canonical receipt movements in `[T-28d,T)`. IDs, lead scores, prices, customer fields, DDI/medical data, hidden generator state, target-window behavior, and future receipts are prohibited.

## Point-in-time and coverage policy

Normal feature facts require `fact_time < T` and `available_at <= T`. `available_stock_at_t` is the sole exception: it is the canonical replayed state after valid inventory movements occurring exactly at `T`. All historical windows are half-open. Eight full weeks of usable history are required; incomplete history is excluded rather than converted to zero.

Sales features and targets require complete product, order, order-item, and purchase-completion coverage. Cancellation features additionally require cancellation coverage. Because inventory features are non-nullable in `forecast_features_v1`, incomplete pre-`T` inventory excludes the row.

## Target stockout and censoring metadata

The target file separately stores `target_stockout_observed`, `target_stockout_seconds`, `target_full_week_stockout`, and `inventory_context_status` for `[T,T+7d)`. These values are evaluation metadata and are structurally absent from `feature_matrix.csv`.

Stock-constrained targets remain in the dataset because the target is observed sales. The target is not uplifted or adjusted to estimate lost demand. Missing target inventory context would produce an explicit insufficient status rather than “no stockout.”

## Frozen chronological split

| Split | Observation Mondays | Planned cohorts | Candidate rows | Eligible rows |
|---|---|---:|---:|---:|
| TRAIN | 2025-10-27 through 2026-04-06 | 24 | 4,800 | 4,707 |
| VALIDATION | 2026-04-13 through 2026-06-08 | 9 | 1,800 | 1,800 |
| TEST | 2026-06-15 through 2026-08-24 | 11 | 2,200 | 2,200 |

Targets are half-open seven-day intervals. The final target in each earlier split ends exactly at the first observation time of the next split, so target intervals do not overlap and no extra empty-week gap is needed. No random splitting occurs.

## Actual dataset results

The schedule considered 8,800 product-weeks. It produced 8,707 supervised rows across all 200 products and excluded 93:

- 92 rows: the product record was not yet known at `T`.
- 1 row: pre-`T` inventory evidence was insufficient for the non-nullable inventory feature contract.

These exclusions explain the difference from the FORECAST-00 estimate of 8,800 supervised rows. Output was not forced to match the estimate.

Targets total 16,502 completed units. The minimum is 0, maximum 115, and mean is 1.895256690019524520500746526 units per eligible product-week.

| Split | Rows | Zero targets | Zero rate | Products represented |
|---|---:|---:|---:|---:|
| TRAIN | 4,707 | 2,410 | 51.20% | 200 |
| VALIDATION | 1,800 | 933 | 51.83% | 200 |
| TEST | 2,200 | 1,089 | 49.50% | 200 |
| Total | 8,707 | 4,432 | 50.90% | 200 |

All 19 features have zero nulls. Observed ranges include completed-unit lags 0–115, four-week sums 0–369, eight-week sums 0–728, available stock 0–400, one-week stockout seconds 0–604,800, four-week stockout seconds 0–2,419,200, and four-week receipt quantity 0–431.

## Stockout categories

- No recorded target stockout: 4,987 rows.
- Partial target-week stockout: 2,891 rows.
- Full target-week stockout: 829 rows.
- Inventory context unavailable among eligible rows: 0.

The 3,720 stockout-context rows differ from the earlier estimate of 3,836 because 93 candidate rows were excluded and the final builder applies exact point-in-time product/inventory eligibility. These categories support stratified evaluation only; they do not reveal latent demand.

## Leakage and reproducibility

The leakage audit passed all required checks:

- exact 19-feature allowlist;
- IDs and censoring metadata absent from features;
- normal fact times strictly before `T`;
- only inventory state permits facts exactly at `T`;
- all feature inputs available by `T`;
- future receipts excluded;
- completion-time and product-item target attribution verified;
- exact split boundaries and non-overlapping split targets;
- deterministic example IDs;
- nested windows validated;
- zero targets retained;
- hidden generator fields absent.

All 14 deterministic data/audit payload hashes verify. A bounded rebuild using the same canonical source and `product_limit=3` produced 132 rows twice with identical hashes. Runtime timestamps, timings, and peak memory are deliberately excluded from deterministic hashes.

## Runtime

On the development machine, canonical load/validation took 17.62 seconds, index construction 0.22 seconds, snapshot construction 18.34 seconds, and artifact write/verification 1.12 seconds. Peak process working set was approximately 1.24 GB. These are local engineering measurements, not production guarantees.

## Limitations and MED-FORECAST-02 handoff

This dataset comes from one synthetic source/seed, provides less than one year of post-lookback weekly cohorts, is approximately 51% zero, contains strong product-scale imbalance, and has extensive simulated stock constraints. It does not model real returns, refunds, partial fulfillment, locations, product lifecycle changes, planned receipts, prices, promotions, or true unmet demand.

MED-FORECAST-02 may consume only the frozen feature/target/split artifacts. It should compare the lag-1-week persistence baseline with one fixed Poisson-regression candidate, select using VALIDATION MAE, keep TEST sealed until selection, report stockout-stratified diagnostics, and preserve the observed-sales limitation. No reorder or real-demand interpretation is authorized.
