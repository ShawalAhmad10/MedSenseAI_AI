> **HISTORICAL DEVELOPMENT SNAPSHOT**
>
> This document records an earlier MedSenseAI engineering stage.
> Some implementation-status, database, runtime-port, or feature-completion statements below are intentionally preserved as historical evidence and may no longer describe the integrated application.
>
> For the current system state, use the repository root `README.md`, `CURRENT_SYSTEM_STATUS.md`, and `ai_service/README.md`.
# MedSenseAI DDI Current Status

Audit checkpoint: 2026-09-02
Scope: MED-DDI-TRAIN-01, MED-DDI-TRAIN-02, and MED-DDI-RUNTIME-03 only.

## Executive status

The research DDI data/model/runtime core is complete and locally reusable. It accepts two exact active-ingredient names from the approved vocabulary, creates the same symmetric Morgan pair features used in training, returns a model warning score, applies the saved threshold, and independently retrieves exact source descriptions. It is offline and fail-closed.

The feature is not end-to-end integrated. No HTTP endpoint, partner database/cart adapter, or frontend warning flow exists. The core must remain independent of partner schemas; integration must occur through a future API/adapter after the partner's actual product, cart, and salt contracts are inspected.

This is an FYP/research checkpoint, not clinical validation or production authorization.

## Completion dashboard

| DDI-only area | Completion | Repository evidence |
|---|---:|---|
| Data preparation | 100% | 191,541 source rows validated; 191,135 canonical positive pairs; every source assertion retained |
| Ingredient/structure resolution | 98.9% | 1,682/1,701 resolved; 6 ambiguous and 13 not found quarantined |
| Training dataset construction | 100% | 189,109 usable positives and 189,109 reproducible sampled-unlabeled comparison pairs; leakage checks pass |
| Model training | 100% | Two fixed model families trained and serialized |
| Model evaluation | 100% | Validation selection, untouched pair test, and strict drug-disjoint stress test recorded |
| Saved-model/inference capability | 100% | Versioned model, threshold, features, hashes, loader, and CLI exist and load successfully |
| Runtime DDI service | 100% | Reusable offline service with typed fail-closed states and cached artifact loading |
| Known-interaction evidence lookup | 100% | Exact unordered lookup preserves descriptions and CSV row identifiers |
| HTTP API exposure | 0% | Explicitly not implemented |
| Partner backend integration | 0% | Partner schema has not been inspected or adapted |
| Frontend warning integration | 0% | No frontend contract or warning component exists |
| Final DDI testing/documentation | 100% | 243-test regression pass plus the three checkpoint reports |

Aggregate percentages use explicit stage weights so missing integration is not hidden by many completed core subtasks:

- **DDI AI/ML Core Completion: 99.9%** — arithmetic mean of the first eight core areas; the 0.1% gap reflects 19 quarantined names.
- **DDI Integration-Ready Completion: 60%** — 50% AI/runtime core, 20% HTTP exposure, 20% partner adapter, 10% tests/documentation.
- **DDI End-to-End FYP Feature Completion: 55%** — 45% AI/runtime core, 10% HTTP exposure, 15% partner integration, 20% frontend integration, 10% tests/documentation.

Completion measures delivered engineering scope, not clinical quality. In particular, weak cold-drug metrics remain a material limitation even though the evaluation work is complete.

## Completed work

### TRAIN-01 — data preparation

- Primary source: `external/db_drug_interactions.csv`, SHA-256 `95d8399aa9c7479001f90400fbd91c6260cbfe517b22d5153a2b031f39b11328`.
- Validated 191,541 original interaction rows, 191,135 unique unordered positive pairs, and 1,701 unique normalized names.
- Retained all original descriptions and source row numbers in a separate provenance table.
- Resolved 1,682 names (98.883%) to PubChem CID/SMILES; quarantined 6 ambiguous and 13 not-found names.
- Generated 2,048-bit radius-2 RDKit Morgan fingerprints for resolved structures.
- Constructed 189,109 usable known-positive pairs and 189,109 `sampled_unlabeled_negative` pairs. An absent source row is not treated as evidence of safety.
- Pair split: 302,578 train / 37,820 validation / 37,820 test.
- Strict drug-disjoint split: 244,237 train / 3,739 validation / 3,460 test; 126,782 cross-partition pairs omitted.
- Canonical, reversed-pair, split, endpoint, and positive/comparison overlap checks all pass.

### TRAIN-02 — model training and evaluation

- Compared one sparse linear SGD logistic model and one histogram gradient-boosting model; no hyperparameter search was used.
- Selected `linear_sgd_logistic` because validation PR-AUC was 0.8600 versus 0.7838 for histogram boosting.
- Saved model version `med-ddi-binary-1.0.0` with operating threshold `0.06481356918811798`.
- Threshold was selected only on pair validation by maximizing F2, prioritizing recall for warning triage.
- Selected-model pair test: precision 0.6613, recall 0.9638, F1 0.7844, ROC-AUC 0.8744, PR-AUC 0.8565.
- Strict cold-drug stress test: precision 0.4563, recall 0.9847, F1 0.6236, ROC-AUC 0.5837, PR-AUC 0.5246.

### RUNTIME-03 — offline runtime service

- `RuntimeDDIService` loads the selected model, feature vocabulary/fingerprints, threshold, and exact evidence index once.
- Supported names are resolved only by Unicode/whitespace/case normalization against the approved inference vocabulary.
- Pair features and scores are invariant under A+B/B+A reversal.
- Exact descriptions are returned only from the source CSV, without generation or paraphrasing.
- States: `INTERACTION_WARNING`, `NO_MODEL_WARNING`, `UNSUPPORTED_INGREDIENT`, `INVALID_INPUT`, and `MODEL_UNAVAILABLE`.
- Invalid, unsupported, and unavailable states block and require manual review. `NO_MODEL_WARNING` does not mean safe or no interaction.
- Observed local initialization: 3.39 seconds. Warm prediction median: 0.376 ms; p95: 0.411 ms over 100 calls.

## Pending work

1. Inspect the partner's real product/cart/salt schemas and ingredient identifiers without changing the DDI core.
2. Define a versioned adapter request containing two normalized active-ingredient names and a typed response matching `RuntimeDDIResult`.
3. Add an authenticated, validated HTTP boundary that owns one application-lifetime `RuntimeDDIService` instance.
4. Add partner contract tests, deployment artifact packaging, health/readiness reporting, logging, and monitoring.
5. Implement frontend rendering for warning, unsupported, invalid, and unavailable states without translating `NO_MODEL_WARNING` into safety.
6. Perform domain-expert review and obtain licensed/validated clinical evidence before any production clinical use.

## Blockers and dependencies

- The actual partner product/cart/salt schema and identifiers have not been inspected; no adapter can be safely assumed.
- Model artifacts under `artifacts/ddi/` are local/ignored generated artifacts. Deployment needs an explicit immutable artifact packaging or registry process with hash verification.
- The sampled-unlabeled comparison class is not a clinically verified negative class.
- Cold-drug discrimination is weak, so unseen ingredients must remain unsupported and require review.
- The warning score is uncalibrated and must not be presented as a clinical probability.
- Source licensing and clinical production authorization are not established by these repository artifacts.

## Ownership boundary

| MedSenseAI AI/runtime owns | Partner backend/frontend owns |
|---|---|
| Immutable model/version/threshold loading | Product, cart, inventory, and database schemas |
| Exact approved-vocabulary validation | Mapping partner records to explicit active-ingredient/salt names |
| Symmetric feature generation and model score | Calling the versioned DDI API/adapter at the correct workflow point |
| Typed fail-closed result states | User/session authorization and partner-side audit linkage |
| Exact source-description lookup and evidence IDs | Frontend display and user interaction behavior |
| Model/evidence provenance and limitations | No reinterpretation of `NO_MODEL_WARNING` as safe |

The DDI core must not import or encode partner product IDs, cart structures, brand tables, or database entities.

## Next exact steps

Start **MED-DDI-INTEGRATION-04 — Partner Schema Inspection & DDI Adapter Contract**: inspect only the partner's actual product/cart/active-ingredient contracts, document deterministic mapping inputs and failure states, then define the versioned API/adapter boundary without modifying the trained core.
