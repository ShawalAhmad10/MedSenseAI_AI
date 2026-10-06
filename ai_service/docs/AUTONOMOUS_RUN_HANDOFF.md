> **HISTORICAL DEVELOPMENT SNAPSHOT**
>
> This document records an earlier MedSenseAI engineering stage.
> Some implementation-status, database, runtime-port, or feature-completion statements below are intentionally preserved as historical evidence and may no longer describe the integrated application.
>
> For the current system state, use the repository root `README.md`, `CURRENT_SYSTEM_STATUS.md`, and `ai_service/README.md`.
# MedSenseAI Autonomous Run Handoff

## INT-01 partner Product record adapter — 2026-09-04

- Starting HEAD: `1385da54e917cc354a09b44fef55bd5c68a0becb`.
- Starting Git state: clean `main...origin/main`; `git diff --check` clean.
- Added a pure, deterministic adapter for the authoritative amnaMedcopy
  Sequelize `Product` record. The partner repository remained read-only.
- Authoritative identity is the positive integer `Product.product_id`. The
  adapter converts it only with `str(product_id)` where the existing
  MedSenseAI product contract requires strings. It does not accept, construct,
  strip, or interpret the storefront-only `prod-{product_id}` presentation ID.
- Relevant source fields are exactly `product_id`, `product_title`,
  `product_generic_name`, `product_salt`, `product_requires_rx`, and
  `product_status`; unexpected fields are rejected.
- `product_salt` is preserved verbatim as source text. A nonblank value creates
  only an `UNMAPPED`, role-`UNKNOWN`, human-review-required source component;
  null or blank salt creates no component. No canonical ingredient, RxNorm
  identity, active moiety, or clinical meaning is inferred.
- Composition remains `UNKNOWN`, review remains required, and the existing
  eligibility evaluator returns `INCOMPLETE_PRODUCT_COMPOSITION`. Neither
  lifecycle status nor `product_requires_rx` changes DDI eligibility.
- Truthful `source_release_identifier` is mandatory caller input because the
  partner row does not provide one and the existing provenance contract
  requires it. No release, timestamp, checksum, or verification fact is
  fabricated. A checksum is optional caller input.
- A null or blank `product_title` remains valid source-state evidence but the
  adapter raises `PartnerProductAdaptationError`, because the existing target
  contract requires a nonblank display name and no truthful substitute exists.
- Files added:
  - `src/medsense_ai/integrations/__init__.py`
  - `src/medsense_ai/integrations/amna_medcopy/__init__.py`
  - `src/medsense_ai/integrations/amna_medcopy/contracts.py`
  - `src/medsense_ai/integrations/amna_medcopy/product_adapter.py`
  - `tests/test_amna_medcopy_product_adapter.py`
- This handoff is the only existing file modified. Frozen DDI, OCR,
  sales/lead/forecast, API, database, and partner code were not changed.
- Verification:
  - Partner adapter: 33 passed.
  - Existing product mapping: 21 passed.
  - Existing interaction engine: 73 passed.
  - Targeted DDI runtime/model/provider/adapter: 75 passed.
  - Complete non-OCR suite: 714 passed in 47.55s.
  - Startup/health/database: 3 passed; explicit package/application import and
    application factory check passed.
  - All pytest runs emitted only the existing Starlette/anyio deprecation
    warning.
- Remaining partner questions: define the production source snapshot/release
  identifier supplied to this adapter; confirm whether null lifecycle status
  can occur in deployed data despite the observed default; define an approved,
  evidence-backed ingredient crosswalk before any salt can become canonical.
- Recommended next slice: specify and test a read-only transport boundary that
  obtains authoritative Product rows plus truthful snapshot provenance and
  invokes this adapter. Do not add ingredient inference, cart DDI, or checkout
  policy until their separate contracts and partner decisions are approved.

## OCR closure continuation — 2026-09-04

- Continuation starting HEAD: `dd92ed7 docs: record autonomous OCR calibration run`.
- Preflight: clean `main...origin/main`; Python 3.13.9 / OCR Python 3.12.10.
- Starting allowance reported by the user: approximately 42%; exact remaining
  context and reset behavior are not exposed to the agent.
- Current task is paused at 28/132 official calibration rows for
  `paddleocr__decode_only_v1` pending the quota reset and requested DDI/Sales
  polish-and-freeze pass.
- Exact continuation command:
  `.\.venv-ocr\Scripts\python.exe -m medsense_ai.ocr.benchmark.resumable_runner --config-id paddleocr__decode_only_v1`
- SEALED TEST REMAINS FORBIDDEN AND HAS NOT BEEN EXECUTED.
- Token-saving reset-boundary pause completed at 28/132 official calibration
  rows for `paddleocr__decode_only_v1`; 104 remain.
- Persisted rows: 28 SUCCESS, average OCR elapsed 31,126.041 ms/sample, total
  OCR elapsed 871,529.135 ms.
- Result path:
  `data/processed/ocr/benchmark_runs/calibration/paddleocr__decode_only_v1/results.jsonl`.
- Run metadata was verified as calibration / PaddleOCR / decode-only.
- Paddle was stopped immediately after `printed_007__rotated_90` persisted.
- Pause-point Git HEAD: `dd92ed7 docs: record autonomous OCR calibration run`;
  branch was synchronized with `origin/main` before this handoff update.
- Exact resume command after the quota reset:
  `.\.venv-ocr\Scripts\python.exe -m medsense_ai.ocr.benchmark.resumable_runner --config-id paddleocr__decode_only_v1`
- On resume, perform the user-requested final DDI + Sales Funnel / Lead Scoring
  / Forecasting polish-and-freeze pass before resuming Paddle decode. Do not
  run DDI/Sales work concurrently with Paddle.
- Do not start OCR validation until Paddle decode calibration is complete and
  the updated user priority permits it.

## Run identity

- Started: 2026-09-04 (Asia/Karachi)
- Starting HEAD: `c783726 feat: add OCR confidence calibration and reports`
- Project root: `C:\Projects\MedsenseAI`
- Main Python: `.venv\Scripts\python.exe` (3.13.9)
- OCR Python: `.venv-ocr\Scripts\python.exe` (3.12.10)

## Current verified state

- Preflight Git status was clean: `main...origin/main`.
- Both Python versions were executed and matched the recorded environments.
- Focused OCR runner/calibration/report suite: 24 passed.
- Focused report/confidence rerun after the reporting fix: 17 passed.
- Full isolated OCR suite: 94 passed in 8.66s.
- Full non-OCR regression: 681 passed in 77.37s (one Starlette/anyio
  deprecation warning only).
- Targeted DDI/model/interaction/provider suite: 154 passed in 19.38s (two
  environment warnings only).
- Sales/funnel/lead/forecast suite: 438 passed in 36.67s (one dependency
  deprecation warning only).
- Final startup/health/database check: 3 passed in 0.67s; main and OCR package
  import checks passed.
- Final OCR report/confidence check: 17 passed in 0.30s.
- `tesseract__decode_only_v1`: 132/132 SUCCESS; micro CER 0.25103265958032717,
  micro WER 0.7109806629834254, medication recall 0.7135416666666666,
  medication precision 1.0, threshold 0.9603655879999999, review-trigger
  recall 0.9595959595959596, unsafe false-accept 4/99 (0.04040404040404041),
  handwriting-safety review-trigger recall 1.0, all gates pass.
- `tesseract__document_basic_v1`: 132/132 SUCCESS; micro CER
  0.019111086633254393, micro WER 0.015193370165745856, medication recall
  0.953125, medication precision 1.0, threshold 0.9600370266666666,
  review-trigger recall 0.9545454545454546, unsafe false-accept 4/88
  (0.045454545454545456), handwriting-safety review-trigger recall 1.0,
  all gates pass.
- OCR sealed-test evaluation has not been executed and remains prohibited.
- DDI artifact loader verified all pinned hashes/alignment: model
  `med-ddi-binary-1.0.0`, `linear_sgd_logistic`, threshold
  0.06481356918811798, vocabulary 1,682, fingerprints 1,682 x 2,048.
- Repository pair-test evidence: precision 0.66126047676064, recall
  0.9637757800105764, F1 0.7843601385810506, ROC-AUC 0.8743717072799683,
  PR-AUC 0.8565115779973073. These discriminate known positives from a
  sampled-unlabeled class; they are not clinical safety metrics.
- DDI runtime tests verify exact evidence provenance, unordered pair behavior,
  order invariance, unsupported/invalid/unavailable fail-closed states, and
  that a negative model warning is never described as safe. Frozen semantics
  were not changed.
- Sales funnel/data analytics, deterministic lead scoring, bundle integrity,
  forecasting selection/persistence, and runtime failure states are green.
- Lead bundle: `med-sales-lead-1.0.0`, logistic regression, threshold
  0.29511255802121295, manifest SHA-256
  `3b9a1132ab9101bb334859737674d0ddf65c82a3f2ab89298f1428611f2c9df2`.
- Forecast bundle: `med-sales-forecast-1.0.0`, persistence, no fitted estimator,
  manifest SHA-256
  `c3c90cd451165b13246ecb2dd4b539b0e17786d71fce4befa2db20be4a85a3e0`.
- All sales/lead/forecast metrics are SYNTHETIC DEVELOPMENT EVIDENCE, not real
  pharmacy performance evidence.

## Completed this run

- Confirmed the repository root and clean Git preflight.
- Confirmed current history and Python interpreter versions.
- Added count-based medication micro precision and complete-recovery fields to
  deterministic calibration reports, with regression coverage.
- Regenerated/verified the decode-only report.
- Completed and reported official document-basic Tesseract calibration.
- Verified the frozen DDI runtime/model artifacts and safety behavior; no
  correctness defect found and no model changes made.
- Verified sales funnel/lead/forecast implementations and saved bundles; no
  correctness defect found and no model changes made.
- Completed and reported official Paddle document-basic calibration after a
  separate one-sample cached-model access smoke.

## Current task

- Final stabilization is complete; checkpoint/push this handoff and stop.

## Files changed

- `docs/AUTONOMOUS_RUN_HANDOFF.md` (this recovery file).
- `src/medsense_ai/ocr/benchmark/calibration_report.py`.
- `tests/test_ocr_calibration_report.py`.

## Benchmark jobs

- `tesseract__decode_only_v1`: calibration complete, 132/132; results SHA-256
  `e8481bdd79e445abb5ce37ae623b6706c32867cc521ba32e158b9c8ebccf8bd9`;
  report SHA-256
  `cedbe5712e4db2bc4bc1914fed7c835c775c3a348af4a8121cdf94491a771fd0`.
- `tesseract__document_basic_v1`: calibration complete, 132/132; results
  SHA-256
  `02ae133d71dc9f3af634f9f7b9702371549ca27164dde6173e9323ec36422ed9`;
  report SHA-256
  `83c83d2a81f88bcc1952e3bca8ac852efcbb795f811b083ac1b45ed55596685f`.
- Benchmark results/reports are ignored under `data/`; they remain local.
- `paddleocr__document_basic_v1`: official calibration complete, 132/132
  SUCCESS. Micro CER 0.00011015035523489564, micro WER
  0.0010359116022099447, exact-text rate 0.9848484848484849, exact-line rate
  0.9977703455964325, medication recall 0.9947916666666666, medication
  precision 1.0, zero known inventions. Selected threshold
  0.9998738169670105; review-trigger recall 1.0; unsafe false-accept 0/13;
  synthetic script-font safety review-trigger 12/12. All configured gates pass.
  Mean elapsed 28,565.739 ms; total OCR elapsed 3,770,677.567 ms. Results
  SHA-256 `2a9d823ceeb7d778e836296e26055c053b966eceb39fb0758462d1c6a86faf40`;
  report SHA-256
  `20bcf7cc306ebe956aadff83f18386c6489509160d5132846aaee37afdeaef94`.
- Paddle operational caveat: the threshold causes 122/132 review triggers and
  a 0.9159663865546218 false-review rate among calibration-defined safe rows.
  Do not select a final OCR engine from calibration alone.
- The initial sandboxed Paddle attempt persisted 132
  `OCR_UNAVAILABLE` rows because access to cached model `inference.yml` was
  denied. All 132 carried the same explicit permission warning; these are not
  OCR performance evidence. `pip check` passed and installed versions are
  PaddlePaddle 3.3.1, PaddleOCR 3.7.0, PaddleX 3.7.2. A separate escalated
  one-sample smoke succeeded (CER/WER 0), proving cached PP-OCRv6 medium det/rec
  models work with CPU-only `enable_mkldnn=False`. The invalid sandbox run was
  preserved under a `__failed_sandbox_20260904` archival run name before
  the successful official rerun with approved cached-model access.
- The invalid sandbox run is preserved at
  `data/processed/ocr/benchmark_runs/calibration/paddleocr__document_basic_v1__failed_sandbox_20260904/`.
- `paddleocr__decode_only_v1`: not started.

## Git state

- Latest local HEAD: `a75258c feat: complete OCR calibration reporting`.
- Push state: `a75258c` pushed to `origin/main`.
- Working tree before the final docs checkpoint: only this handoff update.

## Blockers

- None currently established.
- The approved external test temp root was not writable inside this sandbox;
  OCR tests passed using a fresh ignored temp path inside `data/processed/ocr`.

## Next commands

```powershell
$env:PYTHONPATH = 'C:\Projects\MedsenseAI\src'
git status --short --branch
.\.venv-ocr\Scripts\python.exe -m medsense_ai.ocr.benchmark.resumable_runner --config-id paddleocr__decode_only_v1
.\.venv-ocr\Scripts\python.exe -m medsense_ai.ocr.benchmark.calibration_report --config-id paddleocr__decode_only_v1
```

## Remaining work

1. Complete `paddleocr__decode_only_v1` calibration in a future run.
2. Perform authorized validation-stage comparisons before any engine
   selection.
3. Never run the sealed test without separate explicit authorization.
