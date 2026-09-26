# OCR final calibration and validation status

Date: 2026-09-09

## Decision

**READY_FOR_SEALED.** Freeze `paddleocr` + `document_basic_v1` with an engine-specific minimum-line-confidence review threshold of `0.9998738169670105`. A result requires review when its minimum line confidence is less than or equal to the threshold; all existing fail-closed runtime review/status signals override confidence. This selection is for the sealed benchmark evaluation only. It is not approval for clinical, production, or autonomous use.

The sealed test was not loaded or executed.

## Calibration completion

All four official calibration configurations are complete at 132/132 `SUCCESS` results. The interrupted Paddle decode run was verified at 28 unique saved rows with matching calibration/config metadata, then resumed for only the remaining 104 rows. No completed sample was restarted.

| Configuration | CER | WER | Medication recall / precision | Known inventions | Review recall | Unsafe false accept | Threshold | Mean latency |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `tesseract__decode_only_v1` | 0.251033 | 0.710981 | 0.713542 / 1.0 | 0 | 0.959596 | 4/99 (0.040404) | 0.9603655880 | 361.75 ms |
| `tesseract__document_basic_v1` | 0.019111 | 0.015193 | 0.953125 / 1.0 | 0 | 0.954545 | 4/88 (0.045455) | 0.9600370267 | 269.26 ms |
| `paddleocr__decode_only_v1` | 0.168530 | 0.187845 | 0.997396 / 1.0 | 0 | 0.952381 | 2/42 (0.047619) | 0.9998897910 | 28,926.73 ms |
| `paddleocr__document_basic_v1` | 0.000110 | 0.001036 | 0.994792 / 1.0 | 0 | 1.0 | 0/13 (0.0) | 0.9998738170 | 28,565.74 ms |

New Paddle decode evidence: results SHA-256 `4340f1aee60ef91592530e9f3bf8a5c7a8ac4b94ec6905ab80577034016be3c8`; calibration report SHA-256 `b9036e165e5aaf65a1fa0988002f324552f074e333e5f34c2f7956ec8671fd20`. It passed all configured calibration gates.

## Validation performed and selection

The two decode-only configurations were excluded from validation as clearly dominated by their same-engine `document_basic_v1` counterpart on CER, WER, medication recall and safety behavior. Paddle decode also had no latency advantage. Tesseract decode was faster, but its medication recall and text error rates were materially worse and unsuitable for a safety-first finalist comparison.

The two viable document-basic configurations were each evaluated once on all 66 validation samples. Their calibration-selected thresholds were applied unchanged; validation did not tune or replace them.

| Configuration | CER / WER | Medication recall / precision | Known inventions | Review recall | Unsafe false accept | Safe false review | Mean latency | Gate |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `tesseract__document_basic_v1` | 0.023401 / 0.018646 | 0.9375 / 1.0 | 0 | 50/53 (0.943396) | 3/53 (0.056604) | 11/13 (0.846154) | 272.19 ms | **Fail** |
| `paddleocr__document_basic_v1` | 0.0 / 0.0 | 1.0 / 1.0 | 0 | 6/6 (1.0) | 0/6 (0.0) | 58/60 (0.966667) | 28,545.84 ms | **Pass** |

Paddle document-basic recovered all 192 expected medication occurrences and all 66 complete texts without a benchmark-known invention. Its frozen threshold triggered review for 64/66 samples. Tesseract document-basic failed both the minimum 0.95 review-recall gate and maximum 0.05 unsafe-false-accept gate, and recovered 180/192 medication occurrences. The Paddle configuration is therefore the only defensible sealed-test candidate under the predefined safety gates.

## Safety and limitations

- OCR output remains raw, `UNVERIFIED` evidence. There is no dictionary guessing, fuzzy clinical correction, medicine-name completion, LLM correction, or invented text.
- The six validation handwriting-safety probes were all review-triggered by both finalists. These are synthetic script-font samples and are **not real handwriting** or evidence of real-handwriting performance.
- The selected Paddle runtime is slow on the measured CPU path (about 28.5 seconds/sample) and its threshold is deliberately conservative: 96.7% of validation-defined safe samples were still sent to review. This is operationally expensive but does not weaken the safety gate.
- The benchmark is artificial and limited. It does not establish performance on real prescriptions, cameras, scanners, handwriting, layouts, languages, pharmacies, patients, or clinical workflows.
- Confidence is engine-specific; this Paddle threshold must not be transferred to Tesseract or another Paddle model/version.

## Regression verification

Focused isolated OCR regression: **94 passed, 0 failed** in 9.13 seconds (one existing Starlette/AnyIO deprecation warning). A prior attempt using an inaccessible pytest base-temp path reached 80 passes and 14 setup errors; the identical suite passed after using a writable OCR-local temp directory. No OCR source-code defect was found, so no source code was changed.
