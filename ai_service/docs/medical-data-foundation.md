> **HISTORICAL DEVELOPMENT SNAPSHOT**
>
> This document records an earlier MedSenseAI engineering stage.
> Some implementation-status, database, runtime-port, or feature-completion statements below are intentionally preserved as historical evidence and may no longer describe the integrated application.
>
> For the current system state, use the repository root `README.md`, `CURRENT_SYSTEM_STATUS.md`, and `ai_service/README.md`.
# Medical Data Foundation

This phase defines storage and ingestion contracts only. It contains no medical dataset, medical facts, interaction lookup, safety decision, recommendation, dosage, contraindication, lead-scoring, or sales-analytics behavior.

## Model overview

`DataSource` identifies a declared provider. A source has one or more `SourceRelease` records; a release may carry a source-native version, release date, URI, and checksum when those are available. Each deterministic import creates an `IngestionBatch`, and every imported assertion points to a `ProvenanceRecord` belonging to that batch.

The provenance chain is:

```text
stored assertion
  -> provenance record and source record identifier
  -> ingestion batch and pipeline version
  -> source release/version
  -> data source
```

`ProvenanceRecord` also records ingestion time, verification status, source-record checksum, whether the source record was transformed, and a required transformation description when transformation occurred. Completed or failed batches require a completion timestamp. This supports review, quarantine, reproduction, and audit without treating the transformation itself as authoritative.

## Ingredients, aliases, and identifiers

`ActiveIngredient` is the normalized identity used by future deterministic interaction processing. Its canonical and normalized names are distinct fields. `IngredientAlias` stores a source-supported alias plus its deterministic normalized form and mapping status. A review-required mapping stays review-required; it is not promoted by guessing.

`ExternalIdentifier` stores source-specific identifiers for either an ingredient or a medicine product. No global drug identifier is assumed. Its source is derived exclusively from its mandatory provenance chain, avoiding contradictory source assignments. Database constraints require each identifier to target exactly one supported entity type and prevent the same provenance/namespace/value assertion from mapping twice. Repeated identifiers in later releases remain preserved as separate historical assertions.

## Products and combination products

`MedicineProduct` represents a brand or market product independently from active ingredients. Optional manufacturer and two-character market-country fields allow future Pakistani-market records without making brand names part of interaction identity.

`ProductIngredient` is the explicit many-to-many relationship. A product can therefore have one or multiple ingredients. Each relationship preserves the source ingredient name and its deterministic normalized form. A mapped relationship requires an ingredient foreign key; an unresolved relationship requires that key to remain absent. Review-required relationships can retain a tentative candidate without asserting that it is verified.

## Interaction records

`InteractionRecord` stores only a source assertion between two normalized ingredient identities. The ingredient IDs must be distinct and canonically ordered, preventing self-pairs and reverse-order duplicates within one provenance assertion.

Source-native classification, description, and evidence fields are stored as source-preserved text. The model intentionally defines no universal severity enum and performs no clinical reinterpretation. The source-specific interaction identifier is held by the associated provenance record.

The absence of an interaction row does **not** mean safe. A future engine must return an explicit status that distinguishes:

- `interaction_found`
- `no_assertion_available`
- `unresolved_drug`
- `insufficient_data`

Those values are a typed contract only; the engine is not implemented.

## Ingestion and quarantine boundary

The ingestion package defines typed records and a protocol for this deterministic sequence:

```text
extract -> validate -> normalize -> stage -> review/quarantine -> persist
```

Source-specific adapters must validate licensing, record schemas, provenance, and transformation rules. Invalid or uncertain data belongs in review or quarantine states. The first adapter is the narrow, pinned local RxNorm CPC identity importer described in [rxnorm-cpc-ingestion.md](rxnorm-cpc-ingestion.md). It includes no downloader, interaction data, or clinical assertions.

`QuarantinedRecord` retains rejected source-row identity, row checksum, source line, reason code, detail, and batch/release chain. An ingestion batch also records the source file name, expected checksum when supplied, actual input checksum, and pipeline version. These fields make invalid input auditable without promoting it to a medical assertion.

## Database behavior

The schema uses standard SQLAlchemy types, foreign keys, unique constraints, check constraints, and indexes that work with SQLite and PostgreSQL. SQLite foreign-key enforcement is enabled for every pooled connection. Transaction scopes commit on success and log, roll back, and re-raise failures.

Schema creation remains suitable for local development. Migration tooling and the PostgreSQL driver are deferred until a deployment and migration workflow is selected.

## Intentionally unimplemented

- Additional medical datasets, downloading, and broader source adapters.
- Medicine matching, candidate ranking, or cross-source automatic mapping decisions.
- Interaction lookup, inference, severity conversion, or safety decisions.
- Recommendations, contraindications, dosages, and clinical decision support.
- API routes for medical data.
- Alembic migrations and PostgreSQL deployment configuration.
