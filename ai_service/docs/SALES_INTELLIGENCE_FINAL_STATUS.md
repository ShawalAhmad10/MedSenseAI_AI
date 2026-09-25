# Sales Intelligence final status

Date: 2026-09-08

## Decision

The four partner-independent cores are engineering-frozen against `sales_contract_v1`. No model was retrained and no model truth or evaluation artifact was changed. Overall repository status is **partially frozen** only because the pre-existing, untracked `src/medsense_ai/sales_analytics/live.py` integration adapter is inside the core package and causes the core-isolation architecture test to reject its SQLAlchemy import. That adapter is outside this run and was not modified.

## Core status

| Area | Version | Standalone status | Freeze decision |
|---|---|---|---|
| Sales funnel | `funnel_v1` | Deterministic stage, conversion/drop-off, maturity, coverage, invalid-input, empty-cohort and zero-denominator behavior verified | Frozen |
| Analytics / optimization | `sales_analytics_v1` | Completed/cancelled orders, units, minor-unit totals, AOV, trends, rankings, repeat-customer and inventory context verified; insights remain deterministic, evidence-linked and non-causal | Frozen |
| Lead scoring | `med-sales-lead-1.0.0`, logistic regression, `lead_features_v1` | Pinned bundle, typed validation, canonical inference, probability/score/rank ordering, deterministic output and explicit failure statuses verified | Frozen |
| Forecasting | `med-sales-forecast-1.0.0`, persistence (`completed_units_lag_1w`), `forecast_features_v1` | Pinned bundle, canonical runtime, seven-day horizon, history/coverage/product validation, deterministic batch ordering and fail-closed artifact behavior verified | Frozen |

## Evidence and verified metrics

All metrics below are read from the repository's frozen artifacts. They describe one synthetic-development dataset, not real-pharmacy performance.

- Canonical source: `synthetic_sales_260903_079a482eb7f58fb0`; source namespace `synthetic_sales`; source file-hash manifest SHA-256 `c06982322640736572db72696f5d03241f85f31fc6560a236afc61fcfc0ab3ce`.
- Frozen July analytics report: 1,037 completed orders, 93 cancelled orders, 1,796 completed units, PKR 2,578,587 merchandise subtotal in integer minor units, and AOV PKR 2,486.583413693346190935390550 minor units. These are synthetic report values, not business performance claims.
- Frozen funnel report: 5,074 eligible sessions; stage counts 5,074 / 2,092 / 1,088 / 967; overall conversion 0.1905794245171462357114702404; 22 unattributed orders retained with reason `missing_session`.
- Lead TEST (5,245 synthetic rows): AP 0.8412169602, ROC-AUC 0.8317534380, Brier 0.1674856204, log loss 0.5047738102, F1 0.7518796992 at the technical threshold 0.29511255802121295. Bundle manifest SHA-256: `3b9a1132ab9101bb334859737674d0ddf65c82a3f2ab89298f1428611f2c9df2` (17 payload hashes verified by the loader/tests).
- Forecast TEST (2,200 synthetic product-weeks): 4,256 actual units, 4,303 predicted units, MAE 1.7086363636, RMSE 4.5920385649, WAPE 0.8832236842, signed bias 0.0213636364 units/row, normalized bias 0.0110432331, and zero negative-prediction violations. Bundle manifest SHA-256: `c3c90cd451165b13246ecb2dd4b539b0e17786d71fce4befa2db20be4a85a3e0`.

## Runtime and safety semantics

- Funnel and analytics distinguish observed, immature/not-applicable, insufficient coverage and invalid input. Empty or zero-denominator cohorts do not manufacture rates.
- Analytics missingness never becomes an observed zero. This audit added contract checks so unavailable ratios/currency values cannot carry numbers, observed ratios/averages must match their counts, and observed counts cannot retain an unavailability reason.
- Lead runtime returns `scored`, `out_of_scope`, `insufficient_data`, `model_unavailable` or `invalid_input`; only `scored` carries probability/score fields. Scores are synthetic model outputs, not causal explanations, customer value, or validated real conversion probabilities.
- Forecast runtime returns `forecasted`, `out_of_scope`, `product_not_known`, `insufficient_history`, `insufficient_coverage`, `model_unavailable` or `invalid_input`; only `forecasted` carries a numeric prediction. A forecast is observed completed-unit sales over seven days, not true demand, a reorder quantity, procurement advice or a clinical result.
- Lead and forecast loaders verify an externally pinned manifest, every declared payload hash, versions, feature order, provenance and compatible runtime dependencies before deserialization/inference. Missing, corrupt or incompatible artifacts fail closed.

## Tests actually run

- Focused analytics regression after the contract fix: 15 passed, 0 failed.
- Broad standalone Sales/Funnel/Lead/Forecast regression: 438 passed, 0 failed, 1 deselected; one AnyIO deprecation warning from Starlette.
- The deselected architecture assertion is reproducibly blocked by the pre-existing untracked live SQLAlchemy adapter described above. Before deselection it produced the only failure; 437 other tests passed.

The broad suite covers canonical contracts/validation/temporal conformance, funnel and lifecycle calculations, analytics, synthetic data readiness, lead labels/features/dataset/model/bundle/inference, and forecast dataset/model/runtime/bundle behavior.

## Limitations and remaining external blockers

- All present model metrics and analytics examples are synthetic-development evidence. No real-pharmacy accuracy, lift, demand quality, business outcome or operational readiness is claimed.
- Authorized real `medsenseai_pharm` data, stable partner-to-`sales_contract_v1` mappings, representative mature histories/outcomes, chronological retraining/evaluation, calibration/drift review and approved business policies remain external work.
- The untracked live adapter must be relocated across the integration boundary or reconciled with the core-isolation rule in its own integration task. This audit did not touch it or weaken the guard.
- No frontend/backend, live database, partner integration, DDI, OCR or chatbot validation is included in this freeze.
