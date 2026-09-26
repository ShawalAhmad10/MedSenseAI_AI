# RxNorm CPC Identity Ingestion

This adapter imports identity and normalization assertions from one explicitly pinned monthly RxNorm Current Prescribable Content (CPC) release. It is not a drug-interaction knowledge source and produces no clinical safety conclusion.

## Obtain and pin a release manually

1. Open NLM's official [RxNorm release files page](https://www.nlm.nih.gov/research/umls/rxnorm/docs/rxnormfiles.html) and select a specific archived **monthly RxNorm Current Prescribable Content** release. Do not substitute the full RxNorm release; its licensing boundary differs.
2. Record the exact release identifier, official release URL, publication information, and published archive checksum in the release approval record.
3. Download the selected archive manually and verify the archive against NLM's published checksum before extraction. Do not bypass NLM access controls or terms.
4. Extract it locally and locate the included `RXNCONSO.RRF`. The importer accepts that file directly and deliberately makes no assumption about the surrounding archive layout.
5. Calculate an MD5 or SHA-256 checksum of the extracted `RXNCONSO.RRF`. Pass that exact file checksum to the command. The published archive checksum and extracted-file checksum cover different bytes and must not be confused.

The repository contains no RxNorm release. Do not commit downloaded source archives, extracted data, or local databases.

## Run locally

Install the project, copy `.env.example` to `.env`, and select a database. The CLI requires both the release and local path; it never selects `latest`, rejects unpinned labels such as `latest`/`current`/`newest`, and never performs a network request.

```powershell
medsense-ingest-rxnorm-cpc `
  --release "YYYY-MM exact approved release identifier" `
  --source-path "C:\approved-data\RXNCONSO.RRF" `
  --source-url "https://www.nlm.nih.gov/research/umls/rxnorm/..." `
  --checksum "sha256:<checksum-of-the-extracted-RXNCONSO.RRF>"
```

`md5:<32 hexadecimal characters>` is also accepted because NLM publishes MD5 release checksums, but SHA-256 of the exact ingested file is always calculated and retained. A configured checksum mismatch stops before any database metadata is written. Omitting `--checksum` is allowed only when verification is not requested; the actual SHA-256 is still recorded, but imported provenance and a newly created ingredient remain `unverified` rather than being silently promoted to `verified`.

The CLI emits one JSON result on success or ingestion failure. Invalid CLI/request arguments exit with code 2, an ingestion failure exits with code 1, and success exits with code 0. Logs go through the service's standard logging configuration.

The current foundation uses `Base.metadata.create_all()` for fresh local schemas. It does not alter pre-existing tables. A local database created before these ingestion columns existed must be migrated through an approved migration or recreated if it contains no required data. Production schema migration tooling remains a separate deployment task.

## Documented input contract

NLM documents `RXNCONSO.RRF` as UTF-8, pipe-delimited, pipe-terminated rows with these 18 fields:

```text
RXCUI|LAT|TS|LUI|STT|SUI|ISPREF|RXAUI|SAUI|SCUI|SDUI|SAB|TTY|CODE|STR|SRL|SUPPRESS|CVF|
```

The adapter accepts only active English CPC identity rows (`LAT=ENG`, `SUPPRESS=N`, `CVF=4096`) under these deterministic rules:

- An RxNorm normalized ingredient atom (`SAB=RXNORM`, `TTY=IN`) establishes an `ActiveIngredient` and its `RXCUI` external identifier. The RxNorm release documentation marks `TS`, `LUI`, `STT`, `SUI`, and `ISPREF` as fields for which RxNorm provides no value, so they are not used to infer preference.
- Active MTHSPL substance names (`SAB=MTHSPL`, `TTY=SU`) sharing that explicit RXCUI may become `IngredientAlias` assertions.
- Unicode NFKC normalization, case folding, and whitespace collapse produce matching keys. Spelling similarity, an LLM, and inferred equivalence are never used.
- An alias without an accepted RxNorm normalized `IN` concept is quarantined. Conflicting RXAUIs, canonical names, normalized identities, or existing mappings are quarantined rather than guessed.
- An alias key that occurs under multiple RXCUIs, or collides with another RXCUI's canonical normalized name, is quarantined for every affected alias rather than assigned by processing order.

MTHSPL `CODE` values are not imported as UNIIs: NLM documents that this field can contain other substance-code forms. No code-to-UNII inference is made.

## Flow and responsibilities

```text
extract -> validate -> normalize -> stage -> quarantine/review -> persist -> JSON summary
```

- **Extract:** stream UTF-8 text and require the documented field count and terminating pipe.
- **Validate:** identify only supported source/term types and require RXCUI, RXAUI, and source name.
- **Normalize:** apply the single deterministic text-normalization function.
- **Stage:** group source atoms only by their explicit RXCUI and detect within-file conflicts.
- **Quarantine/review:** retain row identity, row checksum, line number, deterministic reason code, detail, batch, source, and release. The source row payload is not silently discarded into an unreported state.
- **Persist:** create source assertions and provenance in one database transaction.
- **Summary:** report source, release, batch, timestamps, checksums, parser version, all required row counts, quarantine reasons, and failure state.

Well-formed rows outside the approved scope are counted as `rows_ignored_out_of_scope`; this is deliberate filtering, not a mapping decision. Malformed or ambiguous candidate rows are counted and persisted in `quarantined_records`. An empty file, or a nonempty file containing only out-of-scope rows with no explicit quarantine outcome, fails closed instead of producing an apparently successful empty import.

## Provenance and reproducibility

The stored chain is:

```text
ActiveIngredient / IngredientAlias / RXCUI assertion
  -> ProvenanceRecord (RXAUI, row checksum, transformation)
  -> IngestionBatch (batch ID, parser version, file name, expected/actual checksum, times)
  -> SourceRelease (exact release, source URL, actual file SHA-256)
  -> DataSource (RxNorm CPC identity)
```

Each accepted source row has an independent provenance record. Quarantined rows have equivalent batch/release traceability and a row checksum, without being promoted to an ingredient assertion.

## Idempotency and release conflicts

- Re-running the same release with the same file checksum creates an auditable completed batch but skips already imported RXAUI rows with identical row checksums. It creates no duplicate logical ingredients, aliases, identifiers, or provenance.
- Reusing the same release identifier with different file content is a hard pre-ingestion conflict.
- A new release creates new source assertions/provenance while reusing an unchanged logical ingredient identity. This retains release history without duplicating the identity.
- A changed RXCUI-to-name mapping, ambiguous normalized name, or conflicting alias is quarantined; the importer does not overwrite an established identity automatically.

The file is hashed once before metadata creation and again from the exact bytes decoded by extraction. If the local file changes or is replaced between verification and parsing, the batch fails before any identity or quarantine record is committed.

The current administrative importer is a single-writer workflow. Service-level checks prevent sequential RXCUI/name conflicts, but the historical identifier assertion model does not provide a database constraint that serializes two concurrent imports of the same new RXCUI. Do not run ingestion processes concurrently. A production scheduler or database-level identity-locking design must enforce this before concurrent execution is supported.

## Transaction and rollback guarantee

Source, release, and batch metadata are committed first so a run that reaches ingestion remains auditable. All provenance, identifiers, ingredients, aliases, quarantine records, and final completed state are then written in one transaction. Any exception rolls that transaction back, leaving no partial dataset or quarantine set. A separate transaction marks the existing batch `failed`; the structured result reports a non-clinical failure reason.

## Deliberately ignored or deferred

The adapter ignores product concepts and every other unapproved term type. `RXNSAT.RRF`, `RXNREL.RRF`, `PIN`, `MIN`, clinical drugs, branded products, dose forms, strengths, National Drug Codes, and other attributes/relationships are not imported in this phase. Full RxNorm, weekly deltas, downloads, archive parsing, schema migrations, medical-data APIs, interaction data, interaction logic, contraindications, dosage, recommendations, and safety decisions remain deferred.

RxNorm CPC provides identity terminology only. Absence of an ingredient, alias, or any future interaction assertion is unknown and must never be interpreted as safe.
