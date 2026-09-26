# Forecast runtime

## Runtime contract

`med-sales-forecast-runtime-1.0.0` exposes the partner-neutral `ForecastRuntime` callable in `medsense_ai.forecasting.runtime`. It combines a validated `sales_contract_v1` dataset, one reusable `ForecastIndex`, and a trusted `med-sales-forecast-1.0.0` bundle. The selected method remains exact persistence:

`predicted_completed_units_next_7d = completed_units_lag_1w`

The runtime calls the same `build_feature_snapshot` implementation used by the FORECAST-01 supervised builder. It does not duplicate feature calculations or require target-window evidence.

## Required inputs

A single request supplies `source_namespace`, `product_id`, and a Monday observation time `T`. `T` must be Monday 00:00:00 UTC. The runtime also requires a canonical dataset accepted by the existing validator, a local bundle directory, and a caller-configured trusted SHA-256 pin for `bundle_hashes.json`.

Features use the frozen eight-week policy: normal facts occur before `T`, all evidence is available by `T`, and only canonical inventory state may incorporate valid movements exactly at `T`. Missing history, coverage, inventory context, or product evidence is never converted to zero.

## Statuses

- `forecasted`: complete point-in-time features and verified bundle; the only status carrying a numeric prediction.
- `out_of_scope`: unknown product or source-namespace mismatch.
- `insufficient_history`: required eight-week historical coverage is incomplete.
- `insufficient_coverage`: late historical facts or unavailable pre-`T` inventory context.
- `product_not_known`: the product record exists but was not knowable at `T`.
- `model_unavailable`: bundle verification, compatibility, or inference failed.
- `invalid_input`: malformed request or an observation time outside the exact Monday rule.

Every non-forecasted result carries a reason code and a null prediction.

## Bundle integrity

The FORECAST-02 loader verifies the externally pinned manifest digest, every declared payload hash, model/feature/target/split versions, exact 19-feature order, source provenance, dependency versions, and selected-method contract before use. The persistence bundle contains an explicit inference configuration and no fabricated fitted estimator. Arbitrary or unverified serialized artifacts are never loaded.

## Single and batch inference

`forecast(request)` returns a typed result with status, runtime/model/feature/target versions, source and product identity, observation time, seven-day horizon, selling unit where known, reason code, prediction, and limitation notices.

`forecast_batch(source_namespace, observation_time, product_ids)` reuses the loaded bundle and canonical index. Results are sorted by product ID. Each product is evaluated independently, so an unavailable product does not suppress valid results. No parallel execution or distributed infrastructure is involved.

An actual frozen-source smoke at `2026-08-24T00:00:00Z` returned 200 `forecasted` results for 200 products. `product_0001` produced 0.0 predicted observed completed units. An unknown `product_9999` returned `out_of_scope`, reason `unknown_product`, and no numeric prediction.

## Output semantics and stock availability

The output is a nonnegative decimal prediction of observed completed units for `[T,T+7d)`. Core inference does not round, add trends, add safety stock, tune by product, or adjust for stockout conditions.

Future target-window inventory is unknown and is never read by runtime feature construction. Every result preserves this limitation: “Prediction estimates observed completed units from historical information available at T. Future stock availability may materially affect realized sales.” The runtime does not estimate latent or unconstrained demand.

## Local performance

On the development machine, canonical source load and validation took 17.00 seconds, forecast index construction 0.222 seconds, and trusted bundle verification/load 39.4 ms. A warm single-product forecast took 0.862 ms. A deterministic 200-product batch took 730.7 ms. These measurements are local engineering observations, not production guarantees.

## Future partner adapter

A future thin adapter must map partner records into versioned `sales_contract_v1` objects, run the canonical validator, provide the exact partner source namespace and UTC observation time, and supply the trusted bundle pin from deployment configuration. It may then retain one `ForecastRuntime` per validated source snapshot and translate typed results for the host application.

Partner order statuses, database tables, ORM objects, inventory locations, routes, authentication, and frontend behavior remain outside the core runtime. Their mappings require explicit versioned partner policies.

## Prohibited interpretations

The prediction is not true demand, a reorder quantity, a procurement requirement, a stock recommendation, or a statement of clinical need. Synthetic-development performance does not establish performance in a real pharmacy.
