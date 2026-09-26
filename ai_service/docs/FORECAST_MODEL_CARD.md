# MED-FORECAST-02: Forecast model card

## 1. Model and version

- Model version: `med-sales-forecast-1.0.0`
- Selected method: persistence, `prediction = completed_units_lag_1w`
- Features: `forecast_features_v1`, exactly 19 ordered fields
- Target: `observed_completed_units_next_7d_v1`
- Split: `forecast_temporal_split_v1`
- Data origin: synthetic development

Persistence won the frozen validation comparison, so the bundle contains a versioned inference configuration and no fitted estimator. The Poisson candidate was fitted and evaluated only for the authorized comparison.

## 2. Intended use

This bundle supports local, synthetic-development experiments that predict observed completed-unit sales over the next seven days for a product-week. It is suitable for evaluating the frozen forecasting contract and runtime behavior. It is not approved for pharmacy operations or real customer, inventory, procurement, or clinical decisions.

## 3. Target semantics

The target is canonical completed `OrderItem.quantity` attributed by `purchase_completed.occurred_at` in `[T,T+7d)`. It measures observed completed-unit sales. Stock-constrained observations remain in the target without uplift or latent-demand adjustment.

## 4. Dataset and temporal splits

The hash-pinned `med-sales-forecast-dataset-1.0.0` export supplied 8,707 rows: 4,707 TRAIN, 1,800 VALIDATION, and 2,200 TEST. TEST remained gated until the selected method and configuration were written to `selection_frozen.json`. The selected method was evaluated on TEST once.

## 5. Compared methods

Exactly two methods were compared:

1. Persistence: no fitting; prediction equals `completed_units_lag_1w`.
2. Pooled `PoissonRegressor`: `alpha=1.0`, `solver=lbfgs`, `max_iter=1000`, `tol=1e-7`, with all 19 features standardized by a `StandardScaler` fitted on TRAIN only.

There was no resampling, target transformation, product ID feature, product-specific model, hyperparameter search, or candidate adjustment. Poisson converged under the predefined configuration.

## 6. Selection rule

Lower pooled product-week VALIDATION MAE wins; an exact tie selects persistence. TEST data did not participate in selection.

## 7. Train and validation metrics

| Method | Split | Rows | Actual units | Predicted units | MAE | RMSE | WAPE | Signed bias | Normalized bias |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Persistence | TRAIN | 4,707 | 8,831 | 8,835 | 1.5020 | 3.6490 | 0.8006 | 0.00085 | 0.00045 |
| Poisson | TRAIN | 4,707 | 8,831 | 8,831.0004 | 1.4934 | 4.2190 | 0.7960 | 0.00000007 | 0.00000004 |
| Persistence | VALIDATION | 1,800 | 3,415 | 3,360 | **1.5606** | 3.9642 | 0.8225 | -0.0306 | -0.0161 |
| Poisson | VALIDATION | 1,800 | 3,415 | 3,835.3744 | 1.6044 | 4.8394 | 0.8457 | 0.2335 | 0.1231 |

Persistence was selected because its validation MAE was lower by 0.04387 units per product-week. Neither candidate produced a negative prediction.

## 8. Final TEST metrics

TEST contained 2,200 rows and 4,256 actual units. Persistence predicted 4,303 units. MAE was 1.7086, RMSE 4.5920, WAPE 0.8832, signed bias 0.0214 units per row, and normalized bias 0.0110. There were zero nonnegative-prediction violations. Zero targets represented 1,089 rows, or 49.50%.

## 9. Per-product diagnostics

All 200 products were evaluated. Median product MAE was 0.9091; the interquartile range was 0.6364 to 1.2727. Per-product WAPE was defined for 198 products and not applicable for two products with zero actual totals; median defined WAPE was 1.3333.

The lowest TEST MAE was 0.0 for `product_0003`, whose 11 targets and predictions were all zero. This is not evidence of useful demand prediction. The highest TEST MAE was 37.2727 for `product_0081`; its actual and predicted totals were 444 and 482 units. Other high-MAE products included `product_0044` at 19.0 and `product_0018` at 18.8182. These bounded diagnostics did not alter training or selection.

TRAIN-derived product-volume bands used total completed units per product, with low at no more than 12 units and high above 17 units. On TEST, MAE was 0.7205 for the low band, 0.8248 for medium, and 3.7188 for high. Scale differences make raw MAE across these bands non-comparable without their totals and WAPE.

## 10. Weekly aggregate diagnostics

Across the 11 TEST weeks, aggregate actual and predicted totals were 4,256 and 4,303. Weekly-total MAE was 39.7273 units, RMSE 48.0256, WAPE 0.1027, signed bias 4.2727 units per week, and normalized bias 0.0110. Individual product-week errors can cancel in weekly totals, so the aggregate WAPE must not replace product-week evaluation.

## 11. Stockout-stratified TEST metrics

Target stockout fields were evaluation metadata only and never entered either method.

| Target stockout category | Rows | Actual units | Predicted units | MAE | RMSE | WAPE | Signed bias |
|---|---:|---:|---:|---:|---:|---:|---:|
| No recorded stockout | 1,254 | 1,652 | 1,512 | 0.9458 | 2.6906 | 0.7179 | -0.1116 |
| Partial stockout | 710 | 2,462 | 1,939 | 2.5169 | 5.7623 | 0.7258 | -0.7366 |
| Full-week stockout | 236 | 142 | 852 | 3.3305 | 7.6297 | 5.5352 | 3.0085 |

The full-week group is heavily overpredicted because persistence carries prior observed sales into a stock-constrained target week. These results do not estimate lost or latent demand.

## 12. Sparsity and prediction-scale diagnostics

For the 1,089 zero-target TEST rows, MAE was 0.8182 and the model predicted 891 units in total; WAPE and normalized bias are not applicable because actual units sum to zero. For 1,111 nonzero-target rows, MAE was 2.5815, RMSE 6.2662, WAPE 0.6739, signed bias -0.7597, and normalized bias -0.1983.

TEST prediction quantiles were: minimum 0, p10 0, p25 0, median 0, p75 1, p90 3, p99 38, and maximum 109 units. This concentration at zero and long upper tail reflect the synthetic product-volume imbalance.

## 13. Synthetic-shortcut assessment

Validation Pearson correlations with the target were 0.8510 for lag 1, 0.9033 for lag 2, 0.9000 for lag 4, and 0.8818 for lag 8. Lag 1 was not the strongest single lag, and validation MAE was not flagged as suspiciously near zero. The uniformly strong lag associations may still reflect programmed synthetic periodicity. Persistence outperforming the pooled Poisson candidate does not establish real-world forecast quality.

## 14. Inference contract

Input requires `feature_version=forecast_features_v1` plus an exact mapping of all 19 ordered feature values. Missing fields, extra fields, wrong versions, invalid types, corrupt files, missing files, dependency drift, and bundle-hash mismatches fail closed. Product IDs, example IDs, customer IDs, and target stockout metadata are prohibited from the feature mapping.

Output contains `model_version`, `feature_version`, `target_version`, `selected_method`, `predicted_completed_units_next_7d`, and the synthetic-development notice. The numeric prediction is nonnegative and is not automatically rounded. Loading requires an externally pinned SHA-256 of `bundle_hashes.json`; no retraining occurs at inference.

The canonical sales-to-feature-to-score runtime is deferred. The existing FORECAST-01 builder constructs supervised rows and requires a known target interval, so reusing it for a future observation would incorrectly require future target coverage.

## 15. Runtime

Poisson fitting took 0.0650 seconds. The one selected TEST prediction plus diagnostics took 0.0684 seconds, and the full training/evaluation run took 0.5156 seconds. A verified persistence-bundle load took 36.12 ms. Two local smoke predictions took 0.10 ms and 0.03 ms after loading.

## 16. Limitations

The experiment uses one synthetic source and seed, fewer than one year of weekly cohorts, approximately 51% zero targets, highly imbalanced product volumes, and simulated stock constraints. The pooled Poisson configuration was intentionally fixed and bounded. No uncertainty interval, location dimension, promotion effect, planned receipt, real return/refund behavior, or latent-demand adjustment is available.

## 17. Prohibited interpretations

- A forecast is not true or unconstrained demand.
- A forecast is not a reorder quantity.
- A forecast is not a procurement instruction.
- A forecast is not a statement of pharmacy clinical need.
- Synthetic performance is not real-pharmacy performance.
- Stockout-stratified errors do not reveal lost sales or causal stockout effects.

## 18. Real-data validation requirements

Before any operational use, a partner must supply versioned real schemas, status mappings, timezone rules, product and selling-unit identity, point-in-time inventory history, completion/cancellation semantics, and outcome coverage. The same chronological evaluation must then be rerun on representative real data, with stockout censoring reviewed, product drift monitored, calibration and uncertainty requirements defined, and operational thresholds approved independently. No such partner validation exists in this bundle.
