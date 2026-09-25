# MedSenseAI DDI Final Status

## Freeze decision

**DDI core status: FROZEN for the current research/decision-support scope.**

The frozen core covers deterministic normalization, symmetric pair features, saved-model inference, exact source-evidence lookup, typed fail-closed runtime states, and provider-neutral orchestration contracts. This is an engineering freeze, not production, regulatory, or clinical readiness. Changes require a reproducible correctness or security defect, an approved source/model release, or an approved contract revision.

## Frozen model and evidence identity

- Model version: `med-ddi-binary-1.0.0`
- Selected model: `linear_sgd_logistic`
- Selected threshold: `0.06481356918811798`, selected on validation by maximum F2
- Model artifact SHA-256: `bd590c773e879ce595a813973f95d742d6d1895bb3b3d479b379e71317e01667`
- Inference vocabulary SHA-256: `f62939268fc81c5804f2498dbd8d6ab5d82c80e4cf2e419e494d919e4b5573b1`
- Inference fingerprints SHA-256: `a1559dc5fe7d0722ca1230b249b57ef738fd4ea51d8cb6cbb138c9215ebabfb5`
- Exact evidence source: `external/db_drug_interactions.csv`
- Evidence source SHA-256: `95d8399aa9c7479001f90400fbd91c6260cbfe517b22d5153a2b031f39b11328`
- Source assertions: 191,541; usable known-positive pairs: 189,109; reproducible sampled-unlabeled comparison pairs: 189,109
- Resolved inference vocabulary: 1,682 names; 19 source names unresolved or ambiguous during dataset construction

All listed model-bundle hashes and the evidence-source hash were recomputed from the local files on 2026-09-08 and matched their recorded identities. The saved model loaded successfully. The model was not retrained and no benchmark truth or metric artifact was changed.

## Repository-verified evaluation metrics

These metrics discriminate known-positive pairs from constructed sampled-unlabeled pairs. The comparison class is not verified non-interacting, so the metrics do not measure clinical safety.

| Evaluation | Precision | Recall | F1 | ROC-AUC | PR-AUC | Accuracy |
|---|---:|---:|---:|---:|---:|---:|
| Pair test (37,820 examples) | 0.66126047676064 | 0.9637757800105764 | 0.7843601385810506 | 0.8743717072799683 | 0.8565115779973073 | 0.7350343733474353 |
| Strict cold-drug stress test (3,460 examples) | 0.4562962962962963 | 0.9846547314578005 | 0.623608017817372 | 0.5837144021064673 | 0.5246221778274851 | 0.46271676300578035 |

The weak cold-drug ranking performance is a material limitation. Runtime scoring remains prohibited outside the exact approved inference vocabulary.

## Runtime statuses and safety semantics

| Status | Meaning |
|---|---|
| `INTERACTION_WARNING` | The threshold was crossed, exact source evidence was found, or both. Exact descriptions are preserved from source rows only. |
| `NO_MODEL_WARNING` | A supported pair scored below threshold and had no exact source row. It does **not** establish safety, compatibility, or absence of a clinical interaction. |
| `UNSUPPORTED_INGREDIENT` | At least one normalized ingredient is outside the approved vocabulary; no model score is returned and review is required. |
| `INVALID_INPUT` | Input is blank, malformed, contains control characters, exceeds limits, or resolves to the same ingredient; no model score is returned and review is required. |
| `MODEL_UNAVAILABLE` | Required model/evidence initialization or inference failed; no speculative score is returned and review is required. |

Normalization is deterministic Unicode NFKC, case-folding, whitespace collapse, and exact lookup. It makes no fuzzy mapping or clinical equivalence decision. Pair features and exact evidence lookup are order invariant. Duplicate/same-ingredient requests are invalid. Runtime output is deterministic except for measured latency.

The result contract now rejects prediction states with missing score/threshold/decision fields, decisions inconsistent with `score >= threshold`, and known-evidence claims without an evidence-source identity, descriptions, and aligned record identifiers.

OCR output has no direct path into governed DDI identity. Unverified OCR text must be matched to an authoritative product and resolved through an approved, versioned ingredient mapping before it can enter this core.

## Verification performed

- Focused pre-change DDI/runtime/provider/orchestration suite: 160 passed.
- Contract regression after the fix: 20 passed.
- Final broad DDI-adjacent regression: **203 passed, 0 failed**, one existing Starlette/AnyIO deprecation warning.
- Runtime smoke with the real frozen artifacts covered:
  - exact known interaction and reversed pair: identical score, status, source row, and threshold;
  - model-negative pair: `NO_MODEL_WARNING` with explicit non-safety wording;
  - unsupported ingredient: fail-closed `UNSUPPORTED_INGREDIENT`;
  - malformed input: fail-closed `INVALID_INPUT`;
  - missing model directory: logged initialization failure and fail-closed `MODEL_UNAVAILABLE`.
- Static wording audit found no prohibited “safe to take,” “no clinical interaction exists,” “clinically safe,” or “compatible” claim in DDI/interaction Python source and tests.

No tests, code, data, or documentation from Sales, OCR execution, Chatbot, partner repositories, frontend/backend, or a real database were changed or exercised as part of this freeze.

## Limitations and external blockers

- Research source/model only; not a validated clinical DDI knowledge base and not production/clinical readiness.
- Sampled-unlabeled comparison pairs are not verified negatives; a negative model result is never a safety conclusion.
- Unseen ingredients are unsupported; cold-drug performance is weak.
- Exact source rows may be incomplete; absence of a row is unknown information.
- Model scores are not calibrated clinical probabilities.
- No generated or paraphrased interaction descriptions are permitted.
- Production use remains blocked on an authorized/licensed clinical DDI source, approved Pakistan formulary coverage, governed exact ingredient mappings, clinical/pharmacy review, legal/security approval, release/update operations, and deployment packaging of the exact hashed artifacts.
- Any OCR or partner-product integration remains outside this frozen standalone core and must fail closed until its own provenance and mapping contracts are satisfied.
