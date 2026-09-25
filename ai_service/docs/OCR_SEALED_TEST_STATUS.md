# MedSenseAI OCR Sealed Test Final Status

**Date:** 2026-09-09  
**Status:** SEALED_PASS  
**OCR CORE:** ENGINEERING FROZEN

## Frozen configuration

- Engine: `paddleocr`
- Preprocessing: `document_basic_v1`
- Confidence/review threshold: `0.9998738169670105`
- Configuration ID: `paddleocr__document_basic_v1`

This configuration was frozen before the sealed evaluation.

No threshold, engine, preprocessing rule, benchmark truth, or OCR correction
policy was changed after viewing sealed-test results.

**POST-TEST TUNING: NO**

## Sealed evaluation

The frozen OCR configuration was evaluated once on the official sealed split.

- Sealed samples: **66 / 66**
- Successful completion: **66 / 66**
- Expected medication occurrences: **192**
- Matched medication occurrences: **192**

### Text and medication metrics

| Metric | Sealed result |
|---|---:|
| Micro CER | **0.0** |
| Micro WER | **0.0** |
| Exact text match rate | **1.0 (100%)** |
| Medication recall | **1.0 (100%)** |
| Medication precision | **1.0 (100%)** |
| Benchmark-known inventions | **0** |

## Safety-threshold evaluation

| Metric | Sealed result |
|---|---:|
| Unsafe samples | 6 |
| Safe samples | 60 |
| Unsafe samples sent to review | 6 / 6 |
| Review-trigger recall | **1.0 (100%)** |
| Unsafe false accepts | **0 / 6** |
| Unsafe false-accept rate | **0.0** |
| Safe samples sent to review | 56 / 60 |
| Safe false-review rate | **0.9333333333 (93.33%)** |
| Total review triggers | 62 / 66 |
| Safety gate | **PASS** |

The predefined review-safety gate therefore passed.

## Runtime

Mean sealed CPU runtime:

`27542.7868 ms/sample`

Approximately:

`27.54 seconds/sample`

The selected PaddleOCR configuration is therefore accurate on this benchmark
but operationally slow on the measured CPU environment.

Its frozen confidence threshold is deliberately conservative. It sends most
otherwise-safe benchmark samples to manual review.

This is a safety-first configuration, not an automation-maximizing
configuration.

## Artifact integrity

Sealed results:

`data/processed/ocr/benchmark_runs/sealed_test/paddleocr__document_basic_v1/results.jsonl`

SHA-256:

`FACCC130F410F0B0795895C8198ADCE6AFBDD1A9C8BB856FA8E18DF64EAB6EEC`

Sealed summary:

`data/processed/ocr/benchmark_runs/sealed_test/paddleocr__document_basic_v1/sealed_summary.json`

SHA-256:

`DD0E0E0FEEAEF0AE45816C00F2C026A21BCB003D5CEB3350364EC356CAE9F29C`

## Evaluation history

Before the sealed run:

- all four calibration configurations completed;
- `paddleocr__document_basic_v1` was selected from calibration + validation;
- its threshold was frozen before sealed evaluation;
- Tesseract document-basic failed the predefined validation safety gates;
- the sealed split had not previously been executed.

The sealed evaluation did not trigger any post-test model/configuration
selection or tuning.

## Safety boundaries

OCR output remains **UNVERIFIED evidence**.

The OCR system does not:

- perform dictionary guessing;
- perform fuzzy clinical correction;
- invent medicine names;
- use LLM-based authoritative OCR correction;
- infer medication identity from uncertain text;
- directly submit raw OCR text to DDI.

Prescription integration must later use:

OCR evidence
→ medication candidates
→ authoritative Product matching
→ human confirmation where required
→ normal cart
→ centralized cart-level DDI

Synthetic script-font safety probes are **not real human handwriting** and
must never be presented as evidence of real handwriting performance.

The sealed benchmark is controlled/artificial and does not establish:

- real prescription performance;
- real handwriting performance;
- clinical safety;
- production readiness;
- regulatory approval.

## Freeze decision

**The standalone MedSenseAI OCR engine/evaluation core is ENGINEERING FROZEN
for the current FYP/research scope.**

The frozen candidate is:

`PaddleOCR + document_basic_v1 + threshold 0.9998738169670105`

Future OCR-core changes require a documented reason such as:

- reproducible correctness defect;
- approved new OCR model/version;
- approved new real-world evaluation dataset;
- approved performance optimization that preserves safety semantics.

The next engineering layer is **Prescription Analysis**, which must remain
separate from the frozen raw OCR core.
