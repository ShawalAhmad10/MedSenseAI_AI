# RxNorm CPC Real-Data Validation

Validation date: 2026-08-30 (Asia/Karachi) / 2026-08-29 UTC

Verdict: **PASS**

This report validates the existing RxNorm Current Prescribable Content (CPC)
identity importer against one real, pinned NLM monthly release. It records
identity/provenance validation only. It contains no interaction data, clinical
recommendations, dosage information, contraindications, or safety conclusions.

## Pinned official release and acquisition

| Item | Value |
|---|---|
| Release identifier used by the importer | `2026-08-03` |
| Official release date | August 3, 2026 |
| Archive filename | `RxNorm_full_prescribe_08032026.zip` |
| Official release page | <https://www.nlm.nih.gov/research/umls/rxnorm/docs/rxnormfiles.html> |
| Exact official archive URL | <https://download.nlm.nih.gov/rxnorm/RxNorm_full_prescribe_08032026.zip> |
| Official release notes | <https://www.nlm.nih.gov/research/umls/rxnorm/docs/2026/rxnorm_releasenotes_prescribe_08032026.html> |
| Acquisition method | Direct HTTPS download with PowerShell `Invoke-WebRequest`; no login, credential, or license-acceptance step was required |
| Acquisition completion timestamp | `2026-08-29T20:47:47Z` |
| Archive size | 74,563,744 bytes |
| NLM-published checksum | MD5 `5854a3cc9f4cbd214a70e67edb6a0625` |
| Locally calculated archive MD5 | `5854a3cc9f4cbd214a70e67edb6a0625` |
| Official checksum status | **Verified: exact match** |
| Locally calculated archive SHA-256 | `ca90484736109dc1551dfdca3b4b9831fabdf8664a16dbbe7d8183e222d71000` |
| Official SHA-256 status | NLM did not publish a SHA-256 on the release page; the SHA-256 above is locally calculated and is not called officially verified |

NLM identifies this dated file as the August 3, 2026 CPC monthly release,
publishes the MD5 beside it, and marks the CPC download as requiring no
license. No unversioned `current` URL was used as release identity.

## Archive inspection and safe extraction

The ZIP was inspected only after the official MD5 matched. It contained 16
files with 510,763,834 total uncompressed bytes. Every entry was checked for
rooted/drive-qualified paths, `..` traversal, destination escape, and Unix
symlink file type. No unsafe entry was found. Extraction then copied only the
release README and required `RXNCONSO.RRF` through validated, resolved paths;
existing destination files were not overwritten.

| Item | Value |
|---|---|
| Archive member | `rrf/RXNCONSO.RRF` |
| Local ignored relative path | `data/rxnorm-cpc-2026-08-03/extracted/rrf/RXNCONSO.RRF` |
| Size | 30,562,330 bytes |
| SHA-256 | `60302315447ddf1411836c4a88c1a6e16fa8e25fcf508b0a9393fca984e3a87a` |

The official source file was not modified. The later integrity-race test used
a separate copy and reconfirmed the original hash afterward.

## Real RXNCONSO format findings

The file was read in strict UTF-8 before database persistence and compared with
the official RxNorm technical documentation:
<https://www.nlm.nih.gov/research/umls/rxnorm/docs/techdoc.html>.

| Check | Observed result |
|---|---:|
| Source rows | 246,041 |
| Exactly 18 fields | 246,041 |
| Pipe-terminated rows | 246,041 |
| Malformed rows | 0 |
| Strict UTF-8 decoding | Passed |
| UTF-8 BOM | Absent |
| Line endings | 246,041 LF; 0 CRLF; 0 CR; final newline present |
| `LAT=ENG` | 246,041 |
| `SUPPRESS=N` | 246,041 |
| `CVF=4096` | 246,041 |
| Nonblank `TS`, `LUI`, `STT`, `SUI`, `ISPREF`, or `SRL` | 0 for every field |
| Missing `RXCUI`, `RXAUI`, or `STR` in supported candidates | 0 |

The observed column order was exactly:

```text
RXCUI|LAT|TS|LUI|STT|SUI|ISPREF|RXAUI|SAUI|SCUI|SDUI|SAB|TTY|CODE|STR|SRL|SUPPRESS|CVF|
```

Source-abbreviation counts were `RXNORM=140,740`, `MTHSPL=105,290`, and
`MTHCMSFRF=11`. The current NLM technical documentation describes CPC as also
including MTHCMSFRF, while the older CPC overview page describes RXNORM and
MTHSPL only. The 11 MTHCMSFRF `PT` rows are outside the approved importer scope
and were counted, not promoted or silently mapped.

Relevant term-type counts were:

| SAB / TTY | Rows | Import disposition |
|---|---:|---|
| `RXNORM / IN` | 5,839 | Supported canonical candidates |
| `MTHSPL / SU` | 11,351 | Supported alias candidates subject to exact RXCUI resolution |
| `RXNORM / PIN` | 1,931 | Counted; deliberately out of scope |
| `RXNORM / MIN` | 961 | Counted; deliberately out of scope |
| `RXNORM / SCD` | 12,059 | Counted; deliberately out of scope |
| `RXNORM / SBD` | 8,087 | Counted; deliberately out of scope |
| `RXNORM / GPCK` | 604 | Counted; deliberately out of scope |
| `RXNORM / BPCK` | 703 | Counted; deliberately out of scope |
| Other RXNORM names/forms (`BN`, `DF`, `DFG`, `PSN`, `SY`, `TMSY`, `SCDC`, `SCDF`, `SCDFP`, `SCDG`, `SCDGP`, `SBDC`, `SBDF`, `SBDFP`, `SBDG`) | 110,556 | Counted; deliberately out of scope |
| MTHSPL products (`DP`, `MTH_RXN_DP`) | 93,939 | Counted; deliberately out of scope |
| `MTHCMSFRF / PT` | 11 | Counted; deliberately out of scope |

The longest source `STR` was 2,600 characters, but it was outside the approved
candidate scope. The longest supported `RXNORM/IN` and `MTHSPL/SU` strings were
148 and 168 characters respectively, so no supported candidate exceeded the
500-character persistence contract. The real file had no repeated RXAUI and no
exact duplicate row. Each of the 5,839 canonical candidate RXCUIs had exactly
one `RXNORM/IN` atom, and no canonical normalized name was shared across
different RXCUIs. These observations agree with the parser's fail-closed
assumptions, so persistence was allowed to proceed.

## Disposable database and command structure

The first and second imports used the new, ignored SQLite database:

```text
data/rxnorm-cpc-2026-08-03/validation/rxnorm-cpc-20260803-validation.sqlite3
```

The installed project environment did not contain the generated console-script
executable, so the same existing CLI module was invoked explicitly:

```powershell
$env:MEDSENSE_DATABASE_URL = "sqlite:///C:/.../data/rxnorm-cpc-2026-08-03/validation/rxnorm-cpc-20260803-validation.sqlite3"
python -m medsense_ai.medical_data_ingestion.cli `
  --release 2026-08-03 `
  --source-path "C:/.../data/rxnorm-cpc-2026-08-03/extracted/rrf/RXNCONSO.RRF" `
  --source-url "https://download.nlm.nih.gov/rxnorm/RxNorm_full_prescribe_08032026.zip" `
  --checksum "sha256:60302315447ddf1411836c4a88c1a6e16fa8e25fcf508b0a9393fca984e3a87a"
```

The CLI verified the exact extracted-file SHA-256. This is deliberately
separate from the official MD5 verification of the ZIP archive.

## First ingestion and count reconciliation

The first run completed with parser version `1.0.1`.

| Summary field | Count |
|---|---:|
| Source/extracted rows | 246,041 |
| Structurally validated rows | 246,041 |
| Supported normalized candidates | 17,190 |
| Persisted source assertions | 14,151 |
| Exact duplicates skipped | 0 |
| Quarantined candidates | 3,039 |
| Ignored out-of-scope rows | 228,851 |

Reconciliation was exact:

```text
246,041 validated = 228,851 out of scope + 17,190 normalized
17,190 normalized = 14,151 persisted + 3,039 quarantined
14,151 persisted = 5,839 canonical/RXCUI assertions + 8,312 alias assertions
```

After the first run the database contained 5,839 active ingredient identities,
5,839 RXCUI external-identifier assertions, 8,312 ingredient-alias assertions,
14,151 provenance records, and 3,039 quarantine records. `PRAGMA
foreign_key_check` returned no violation. Product and interaction tables
remained empty.

## Quarantine review

| Reason code | Count | Engineering finding |
|---|---:|---|
| `unresolved_semantic_mapping` | 3,004 | MTHSPL `SU` atoms whose explicit RXCUI had no accepted `RXNORM/IN`; 1,940 distinct RXCUIs. The associated in-file RXNORM rows were predominantly out-of-scope `PIN` rows (1,581), plus `SY` (69), `TMSY` (112), and `BN` (1); some had no RXNORM atom in this file. This is expected conservative scope behavior, not evidence of malformed data. |
| `ambiguous_normalized_alias` | 35 | Fifteen normalized alias keys occurred under more than one RXCUI or conflicted with a canonical identity. All affected aliases were quarantined independently of row order, as designed. |

A deterministic sample of three records from each reason code was inspected
using only row number, RXAUI, RXCUI, SAB, TTY, and aggregate collision context.
No clinical judgment was made and no raw source row or medical string is
included here. The sample agreed with the reason codes. There were no malformed
rows, missing required candidate fields, conflicting RXAUIs, unexpected
unpopulated fields, or parser-format quarantines.

The first run contains 1,521 `(ingredient, normalized alias)` groups supported
by more than one distinct source atom, representing 2,271 additional
independently provenanced source assertions (maximum 11 assertions in one
group). This is source assertion multiplicity, not an idempotency duplicate:
each has distinct RXAUI provenance, and the second run added none. Future
consumer queries must select distinct logical aliases when presenting names.

## Real-data idempotency

The identical release, source URL, file path, and file SHA-256 were run a second
time against the same disposable database.

| Summary field | First run | Second run |
|---|---:|---:|
| Rows extracted | 246,041 | 246,041 |
| Rows normalized | 17,190 | 17,190 |
| Rows persisted | 14,151 | 0 |
| Exact assertions skipped | 0 | 14,151 |
| Rows quarantined | 3,039 | 3,039 |
| Rows ignored out of scope | 228,851 | 228,851 |

After the second run, identity tables were unchanged: 5,839 ingredients, 5,839
RXCUI assertions, 8,312 alias assertions, and 14,151 provenance records. There
were two completed batch records and 6,078 quarantine records because each
auditable run retains its own quarantine outcome. No provenance assertion was
duplicated across batches and no RXCUI was linked to more than one ingredient.
The second-run pipeline time was 19.56 seconds (20.64 seconds process wall
clock).

## File-replacement integrity check

A separate ignored copy of the real file was ingested into a separate new
database. Immediately after the preflight checksum and batch-metadata commit,
one byte in the copy was changed without changing the original file. The
second streaming hash rejected the copy with
`source_file_changed_after_checksum`.

The test batch was auditably marked `failed`; zero ingredients, identifiers,
aliases, provenance records, or quarantine records were persisted. The changed
copy hash was
`f6592b4ec9e94f35514c8428262fd8d8fafce92efa587ed47d86cf9d79861eab`,
while the official extracted file remained
`60302315447ddf1411836c4a88c1a6e16fa8e25fcf508b0a9393fca984e3a87a`.

## Performance

| Measurement | Result |
|---|---:|
| Source `RXNCONSO.RRF` size | 30,562,330 bytes (29.15 MiB) |
| First-run pipeline time from structured timestamps | 32.59 seconds |
| Fresh measured run wall clock | 36.07 seconds |
| Fresh measured run peak working set | 99,028,992 bytes (94.44 MiB) |
| First-run database size | 9,781,248 bytes (9.33 MiB) |
| Idempotency database size after two runs | 10,625,024 bytes (10.13 MiB) |

Classification: **acceptable for development validation**. The full real
identity pass completed in under one minute with a peak working set under 100
MB and an approximately 10 MB database. No optimization was attempted because
there was no correctness failure. Measurements were made on Windows from a
OneDrive-backed workspace and should not be treated as production benchmarks.

## Defects and fixes

No implementation defect was found, and no ingestion rule or medical mapping
was changed. No code fix was made. The integrity-race protection, transaction
behavior, deterministic quarantine policy, and same-release idempotency all
worked with real data.

## Repository and data safety

The repository's existing `.gitignore` covers `data/`, RxNorm ZIP/RRF files,
SQLite databases, and validation logs. `git check-ignore` confirmed the
downloaded archive, extracted `RXNCONSO.RRF`, disposable databases, integrity
copy, and captured validation output are ignored. No real source row was added
to documentation, no source archive or extracted dataset is tracked, and no
credential, token, or secret was introduced. Only this metadata/count/hash
report is intended to be tracked.

## Regression verification

| Check | Result |
|---|---|
| Dependency consistency | `python -m pip check`: no broken requirements |
| Package compilation | `python -m compileall -q src tests`: passed |
| All module imports | 27 package/module imports passed |
| Application startup and health | In-memory SQLite lifespan startup passed; `GET /api/v1/health` returned HTTP 200 with `healthy/available` |
| Complete test suite | 62 passed in 12.27 seconds |
| Dedicated health endpoint tests | 2 passed in 0.41 seconds |
| Git whitespace check | `git diff --check`: passed |
| Git status | Only `docs/rxnorm-cpc-real-validation.md` is untracked; all real-data and disposable artifacts are ignored |

## Limitations and remaining risks

- RxNorm CPC is a US identity terminology subset, not a drug-interaction or
  clinical-safety source. Absence remains unknown and must not be interpreted as
  safe.
- `PIN`, `MIN`, products, dose forms, strengths, and relationships remain
  intentionally unsupported. The 3,004 unresolved aliases must not be promoted
  by inference.
- The database `SourceRelease.released_at` field remains null because the
  existing CLI request does not accept a release-date argument. The official
  date is nonetheless pinned in the release identifier, URL, archive filename,
  official release notes, and this report.
- NLM publishes an official MD5 for the archive but no SHA-256 on the release
  page. The locally calculated SHA-256 supports local reproducibility but is not
  an NLM-published checksum.
- Multiple MTHSPL atoms can support the same logical normalized alias. Provenance
  is preserved intentionally; future presentation/search code must deduplicate
  logical alias values without discarding source assertions.
- The current importer is documented as single-writer. This validation did not
  test concurrent ingestion and does not authorize it.
