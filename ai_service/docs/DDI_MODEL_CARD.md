# MedSenseAI Binary DDI Model Card

Model version: `med-ddi-binary-1.0.0`
Selected estimator: `linear_sgd_logistic`
Checkpoint date: 2026-09-02

## Intended use

This model supports a controlled FYP/research warning workflow for two active-ingredient/salt names already present in the approved inference vocabulary. It produces a **model warning score** discriminating known-positive source pairs from constructed sampled-unlabeled pairs.

It is not a diagnostic device, a substitute for a pharmacist, a clinical safety database, or a predictor for unseen ingredients. The score is not a calibrated clinical probability.

## Training data

- Primary known-positive source: `external/db_drug_interactions.csv`.
- Source SHA-256: `95d8399aa9c7479001f90400fbd91c6260cbfe517b22d5153a2b031f39b11328`.
- Original rows: 191,541.
- Unique unordered positive pairs: 191,135.
- Unique normalized names: 1,701.
- PubChem/structure coverage: 1,682 resolved (98.883%); 6 ambiguous and 13 not found.
- Usable known-positive pairs: 189,109.
- Comparison pairs: 189,109 reproducibly sampled pairs absent from the known-positive set.
- Comparison label: `sampled_unlabeled_negative`; it does not mean safe or clinically verified non-interacting.

### Splits

| Protocol | Train | Validation | Test | Notes |
|---|---:|---:|---:|---|
| Pair split | 302,578 | 37,820 | 37,820 | Primary selection/evaluation split |
| Strict drug-disjoint | 244,237 | 3,739 | 3,460 | Endpoint sets disjoint; 126,782 cross-partition pairs omitted |

## Representation and features

Each drug uses the existing 2,048-bit radius-2 RDKit Morgan fingerprint.

- Linear candidate: sparse 4,096-dimensional concatenation `[fingerprint_A AND fingerprint_B, fingerprint_A XOR fingerprint_B]`.
- Histogram-boosting candidate: 134 features comprising 64 chunked intersection counts, 64 chunked XOR counts, and six symmetric global count/similarity values.

Bitwise intersection, XOR, minimum/maximum counts, Tanimoto, and Dice features are unchanged when endpoints are swapped. Automated and real-artifact checks verify identical A+B/B+A scores.

## Models compared

Exactly two fixed practical configurations were trained; no grid or random search was run.

| Validation result | Precision | Recall | F1 | ROC-AUC | PR-AUC | TN / FP / FN / TP |
|---|---:|---:|---:|---:|---:|---|
| SGD logistic | 0.6645 | 0.9642 | 0.7868 | 0.8771 | **0.8600** | 9,705 / 9,205 / 677 / 18,233 |
| Histogram gradient boosting | 0.5596 | 0.9795 | 0.7123 | 0.7940 | 0.7838 | 4,334 / 14,576 / 388 / 18,522 |

The SGD logistic candidate was selected by highest validation PR-AUC, with validation F1 specified as the tie-break.

## Operating threshold

Selected threshold: `0.06481356918811798`.

The threshold maximizes F2 on the pair validation set, deliberately weighting recall more heavily for warning triage. It was not selected on test data.

| Validation operating point | Precision | Recall | F1 |
|---|---:|---:|---:|
| Default threshold 0.5 | 0.7802 | 0.8400 | 0.8090 |
| Selected F2 threshold | 0.6645 | 0.9642 | 0.7868 |

The selected operating point accepts more comparison-pair warnings to reduce missed known-positive pairs. Because the comparison class is sampled-unlabeled, these false-positive counts cannot be interpreted as clinical false alarms without additional evidence.

## Final pair-test metrics

The pair test was untouched during model and threshold selection.

| Precision | Recall | F1 | ROC-AUC | PR-AUC | Accuracy | TN / FP / FN / TP |
|---:|---:|---:|---:|---:|---:|---|
| 0.6613 | 0.9638 | 0.7844 | 0.8744 | 0.8565 | 0.7350 | 9,574 / 9,336 / 685 / 18,225 |

## Strict cold-drug stress test

A fresh clone of the selected family was fit only on the strict drug-disjoint training partition. Its threshold was selected only on the disjoint validation partition, then evaluated once on the disjoint test partition.

| Precision | Recall | F1 | ROC-AUC | PR-AUC | Accuracy | TN / FP / FN / TP |
|---:|---:|---:|---:|---:|---:|---|
| 0.4563 | 0.9847 | 0.6236 | 0.5837 | 0.5246 | 0.4627 | 61 / 1,835 / 24 / 1,540 |

Cold validation selected threshold `5.260913837901171e-08`. The very low threshold and near-baseline ranking metrics show poor, unstable unseen-drug generalization. Runtime prediction is therefore prohibited for names outside the approved inference vocabulary.

## Runtime characteristics

- Selected model artifact size: 46,872 bytes.
- Verified model, vocabulary, and fingerprint SHA-256 values match `model_metadata.json`.
- Local model/evidence initialization observed at 3.39 seconds.
- Warm single-pair runtime over 100 calls: median 0.376 ms, p95 0.411 ms.

## Limitations

- Known positives come from the supplied CSV and are not independently clinically adjudicated here.
- Sampled-unlabeled pairs may include real but unrecorded interactions.
- Random pair-split results benefit from drugs occurring across partitions and exceed strict cold-drug performance.
- Scores are uncalibrated model outputs.
- Resolution is exact against 1,682 supported names; 19 source names are quarantined.
- Exact-name normalization does not establish synonym, brand, formulation, dose, route, timing, patient, or disease-context equivalence.
- Runtime exact evidence is only as complete and current as the supplied CSV.
- Repository evidence does not establish licensing or production clinical authorization.

## Prohibited interpretations

- `NO_MODEL_WARNING` must not be interpreted as safe, compatible, or no interaction.
- A score must not be shown as a clinical probability or risk percentage.
- Accuracy, specificity-like behavior, or sampled-unlabeled classification must not be used as proof of safety.
- Unsupported/unseen ingredients must not receive speculative model predictions.
- The model must not generate or paraphrase interaction descriptions.
- The model/runtime must not be coupled directly to assumed partner product, cart, brand, or database schemas.
