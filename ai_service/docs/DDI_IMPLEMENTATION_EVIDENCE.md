# MedSenseAI DDI Implementation Evidence

Audit checkpoint: 2026-09-02  
Scope: completed TRAIN-01, TRAIN-02, and RUNTIME-03 work only.

## Relevant implementation files

### TRAIN-01

- `src/medsense_ai/ddi_training/pipeline.py` — source validation, canonical pairs, Morgan fingerprints, sampled-unlabeled construction, deterministic splits, and leakage checks.
- `src/medsense_ai/ddi_training/pubchem.py` — resumable exact-name resolution cache, ambiguity quarantine, and rate limiting. This code is not imported or called by runtime DDI service code.
- `src/medsense_ai/ddi_training/cli.py` — reproducible dataset-build CLI.
- `tests/test_ddi_training_dataset.py` — six focused dataset tests.

### TRAIN-02

- `src/medsense_ai/ddi_model/data.py` — immutable artifact validation, membership checks, hashes, and split isolation.
- `src/medsense_ai/ddi_model/features.py` — deterministic symmetric pair representations.
- `src/medsense_ai/ddi_model/training.py` — two-family training, validation-only selection/thresholding, test/cold evaluation, and serialization.
- `src/medsense_ai/ddi_model/inference.py` — trusted artifact hash validation and local inference loader.
- `src/medsense_ai/ddi_model/cli.py` — training and direct model-inference CLI.
- `tests/test_ddi_model.py` — six focused feature/model tests.

### RUNTIME-03

- `src/medsense_ai/ddi_runtime/contracts.py` — typed states and cross-field safety invariants.
- `src/medsense_ai/ddi_runtime/evidence.py` — immutable exact unordered source-description index.
- `src/medsense_ai/ddi_runtime/service.py` — cached model/evidence orchestration and fail-closed result behavior.
- `src/medsense_ai/ddi_runtime/cli.py` — offline runtime smoke interface.
- `tests/test_ddi_runtime.py` — 14 focused runtime cases/parameterized cases.

## Dataset and report artifacts

### Approved inputs

- `external/db_drug_interactions.csv` — 191,541 source assertions; SHA-256 `95d8399aa9c7479001f90400fbd91c6260cbfe517b22d5153a2b031f39b11328`.
- `data/processed/ddi/drug_features.csv` — 1,682 resolved supported ingredients.
- `data/processed/ddi/morgan_fingerprints.npz` — aligned `(1682, 2048)` binary fingerprint matrix.
- `data/processed/ddi/known_positive_pairs.csv` — 189,109 usable positives.
- `data/processed/ddi/sampled_unlabeled_negatives.csv` — 189,109 comparison pairs.
- `data/processed/ddi/pair_splits.csv` — 378,218 primary examples.
- `data/processed/ddi/drug_disjoint_splits.csv` — 251,436 retained strict-disjoint examples.

### TRAIN-01 provenance

- `artifacts/ddi/dataset_build_report.json` — verified counts and leakage results.
- `artifacts/ddi/provenance_manifest.json` — source, fingerprint, sampling, and research-scope metadata.
- `artifacts/ddi/pubchem_compound_cache.csv` — 1,701 attempted names: 1,682 resolved, 6 ambiguous, 13 not found.
- `artifacts/ddi/pubchem_unresolved_or_ambiguous.csv` — explicit quarantine.
- `artifacts/ddi/canonical_positive_pairs.csv` — one row per unordered source pair.
- `artifacts/ddi/positive_pair_source_assertions.csv` — all 191,541 original descriptions and row provenance.

### TRAIN-02 model package

- `artifacts/ddi/model/selected_model.joblib` — selected 46,872-byte SGD logistic artifact.
- `artifacts/ddi/model/candidate_linear_sgd_logistic.joblib` and `candidate_hist_gradient_boosting.joblib` — both compared candidates.
- `artifacts/ddi/model/model_metadata.json` — version, selection/threshold rules, library version, and artifact hashes.
- `artifacts/ddi/model/feature_metadata.json` — exact symmetric feature specification.
- `artifacts/ddi/model/selected_threshold.json` — validation-only threshold record.
- `artifacts/ddi/model/training_config.json` — seed and fixed candidate configurations.
- `artifacts/ddi/model/evaluation_metrics.json` — validation, pair-test, and cold-drug metrics.
- `artifacts/ddi/model/dataset_provenance.json` — immutable TRAIN-01 hashes and split references.
- `artifacts/ddi/model/inference_drug_features.csv` and `inference_morgan_fingerprints.npz` — self-contained runtime vocabulary/features.

Audit verification found all selected-model package files present and all three hashes in `model_metadata.json` matching.

## Available commands

Dataset construction exists but was not rerun during this audit:

```powershell
.venv\Scripts\python.exe -m medsense_ai.ddi_training.cli --source external/db_drug_interactions.csv --processed-dir data/processed/ddi --artifacts-dir artifacts/ddi --seed 20260902 --requests-per-second 4
```

Model training exists but was not rerun during this audit:

```powershell
.venv\Scripts\python.exe -m medsense_ai.ddi_model.cli train --data-dir data/processed/ddi --provenance-dir artifacts/ddi --model-dir artifacts/ddi/model --seed 20260902
```

Direct saved-model inference:

```powershell
.venv\Scripts\python.exe -m medsense_ai.ddi_model.cli infer --model-dir artifacts/ddi/model --drug-a Abacavir --drug-b Aceclofenac
```

Offline runtime model plus exact evidence lookup:

```powershell
.venv\Scripts\python.exe -m medsense_ai.ddi_runtime.cli --ingredient-a Abacavir --ingredient-b Alogliptin --model-dir artifacts/ddi/model --known-source external/db_drug_interactions.csv
```

## Smoke inference evidence

Verified with one loaded `RuntimeDDIService` instance:

| Input pair | Model warning score | Threshold | Runtime status | Exact known evidence | Runtime latency |
|---|---:|---:|---|---|---:|
| Abacavir + Alogliptin | 0.01772965 | 0.06481357 | `INTERACTION_WARNING` | Yes — `db_drug_interactions.csv:row:180946`; exact evidence elevated the warning | 1.323 ms |
| Abacavir + Aceclofenac | 0.09418139 | 0.06481357 | `INTERACTION_WARNING` | No; warning is model-derived | 0.688 ms |
| Trioxsalen + Verteporfin | Not produced | Not applied | `UNSUPPORTED_INGREDIENT` | Yes — `db_drug_interactions.csv:row:2`; model inference blocked | 0.027 ms |

The first example demonstrates the evidence override: a below-threshold model result cannot suppress an exact known source record. The third demonstrates that exact evidence may still be returned while an unsupported ingredient is denied model inference.

Warm 100-call measurement for Abacavir + Aceclofenac: median 0.376 ms, p95 0.411 ms. One-time model/evidence initialization measured 3.39 seconds.

## Runtime result semantics

- `INTERACTION_WARNING`: model threshold crossed, exact evidence exists, or both.
- `NO_MODEL_WARNING`: supported pair scored below threshold and no exact row exists. This does not mean safe or no interaction.
- `UNSUPPORTED_INGREDIENT`: at least one name is outside the approved resolved vocabulary; no model score is produced.
- `INVALID_INPUT`: malformed, blank, control-character, or identical input; no model score is produced.
- `MODEL_UNAVAILABLE`: model/evidence initialization or inference failure; no speculative score is returned.

All error states block and require manual review. Scores are labeled model warning scores, not calibrated clinical probabilities. Descriptions are returned verbatim from the source rows only.

## Automated test evidence

- Focused TRAIN-01 tests: 6.
- Focused TRAIN-02 tests: 6.
- Focused RUNTIME-03 tests/cases: 14.
- Latest complete repository regression run: 243 passed.

Covered behavior includes canonical/reversed-pair prevention, cache reuse, unresolved quarantine, comparison sampling, split leakage, deterministic symmetric features, saved artifact loading, threshold boundaries, unsupported inputs, deterministic inference, exact description preservation, corrupt/missing model handling, and prohibition of runtime network/PubChem access.

## Git and packaging state

`git status --short` was clean immediately before these three reports were created. Model and processed-data artifacts exist locally; `data/` and `artifacts/ddi/` are generated/ignored paths. An integration/deployment task must package the exact hashed model bundle explicitly rather than assume those files are present in a fresh checkout.

Only these audit documents are introduced by MED-DDI-AUDIT-01:

- `docs/DDI_CURRENT_STATUS.md`
- `docs/DDI_MODEL_CARD.md`
- `docs/DDI_IMPLEMENTATION_EVIDENCE.md`
