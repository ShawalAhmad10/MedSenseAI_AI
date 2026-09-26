> **HISTORICAL DEVELOPMENT SNAPSHOT**
>
> This document records an earlier MedSenseAI engineering stage.
> Some implementation-status, database, runtime-port, or feature-completion statements below are intentionally preserved as historical evidence and may no longer describe the integrated application.
>
> For the current system state, use the repository root `README.md`, `CURRENT_SYSTEM_STATUS.md`, and `ai_service/README.md`.
# Architecture

The service uses a `src/` package layout and keeps HTTP, configuration, persistence, schemas, and domain-oriented capabilities separated.

## Current foundation

- `api`: FastAPI routers and transport concerns.
- `config`: validated environment-based settings.
- `database`: SQLAlchemy engine, session factory, metadata, and connectivity checks.
- `domain`: typed medical-data lifecycle states and normalized SQLAlchemy persistence models.
- `schemas`: validated API request and response models.
- `services`: application orchestration shared by routes and future workers.
- `medical_data_ingestion`: deterministic normalization primitives, typed ingestion contracts, and the pinned local RxNorm CPC identity adapter/CLI.
- `ddi_providers`: provider-neutral DDI contracts, adapter mechanics, secret-free configuration, lifecycle gates, batch correlation, and reusable conformance reporting. It contains no real vendor adapter or clinical interpretation.
- `interaction_engine`: deterministic synthetic orchestration from validated products through provider-neutral pair outcomes. It contains no clinical interpretation.
- `recommendation_engine`: future recommendation orchestration over verified data.
- `lead_scoring`: future non-clinical lead scoring.
- `sales_analytics`: future non-clinical analytics and optimization.
- `utilities`: small shared helpers that do not belong to a domain package.

The application factory owns a database runtime placed on FastAPI application state. This avoids import-time connections, makes startup and health behavior testable, and keeps the SQLAlchemy URL configurable. SQLite is the development default, with foreign-key enforcement enabled on every connection; the schema and application layer do not depend on SQLite-specific query behavior.

The medical-data foundation separates brand products from normalized active ingredients and connects them through explicit product-ingredient assertions. Source, release, batch, record-level provenance, and quarantined-row reasons remain queryable. The first implemented source path imports only approved RxNorm CPC identity assertions from a pinned local `RXNCONSO.RRF`; see [rxnorm-cpc-ingestion.md](rxnorm-cpc-ingestion.md).

## Provider-neutral DDI boundary

The permitted pre-provider architecture is:

```text
RxNorm CPC identity
  -> canonical MedSenseAI ingredient
  -> versioned provider-specific mapping
  -> provider-neutral DDI contract
  -> source-preserved provider assertion or explicit uncertainty/failure outcome
  -> non-clinical DDI orchestration result
  -> FUTURE governed clinical interpretation (NOT IMPLEMENTED)
```

The `ddi_providers` contract keeps provider metadata and releases, capabilities, readiness, RxNorm-linked mappings, source-native classifications, descriptions, effects, management text, evidence classifications/references, directionality, contextual restrictions, group-expansion provenance, licensing/display restrictions, and lookup failures explicit. Provider lookup outcomes distinguish assertions, empty in-coverage responses, each unmapped endpoint, ambiguous mapping, insufficient coverage, provider unavailability, and provider errors. `no_assertion_returned` is not a safety conclusion.

All provider-specific mappings are versioned and carry their method, non-numeric confidence/status, review requirement, provenance, and lifecycle state. Fuzzy-name auto-mapping is not supported. Provider classifications remain source-native; the boundary defines no universal medical severity.

`lookup_pair_fail_closed` is the adapter exception-translation boundary. It logs expected and unexpected failures with sanitized provider/request context and exception type only, and returns typed unavailable/error results without assertions. Provider response validation failures are classified as malformed responses. The test-only synthetic provider exercises the contract without network access, vendor schemas, medical facts, or real interaction assertions.

The `interaction_engine` reuses product eligibility and deterministic ingredient-pair expansion, gates every canonical ingredient through a pinned RxNorm and provider mapping, selects contract-supported batch lookup only when declared, and returns immutable pair and aggregate engine-state results. It preserves product/component provenance, provider-native assertions, coverage, mapping uncertainty, failures, correlation, and counts without defining a MedSenseAI severity or treating no assertion as safe. See [ddi-orchestration-engine.md](ddi-orchestration-engine.md).

`BaseDDIProviderAdapter` validates common metadata, readiness, mapping, version, response, and pair-correlation mechanics without defining a vendor schema. `lookup_batch_fail_closed` and the batch correlation helper preserve independent pair outcomes and fail missing responses closed. Secret-free runtime configuration and transient-only retry classification are separate from clinical content.

Technical integration and conformance never imply production approval. The lifecycle boundary keeps technical integration, conformance, licensing/authorization, clinical acceptance, Pakistan coverage validation, and explicit production enablement independent. Production activation fails closed unless every gate has review evidence, the configured provider identity/release matches, the environment is production, and readiness is current. See [ddi-adapter-conformance.md](ddi-adapter-conformance.md).

Production-provider acceptance evidence and the reusable adapter conformance boundary are specified in [ddi-provider-acceptance-spec.md](ddi-provider-acceptance-spec.md). No real provider may be integrated until that hard-gate review passes.

## Safety boundary

No medical decision logic, real medical fixtures, drug facts, or claims of safety are present. Medical records require source provenance, and unknown data remains distinguishable from a confirmed safe result. Safety-critical engines should be deterministic and fail closed where appropriate.

## Deferred

- Additional medical sources, downloading, archive handling, and expanded RxNorm term/relationship coverage.
- Cross-source drug identity resolution beyond explicit RxNorm RXCUI grouping.
- Real DDI provider adapters, external DDI calls, DDI datasets, and production interaction records.
- Clinical interaction interpretation/decision logic, severity conversion, contraindication, dosage, and recommendation logic.
- Authentication, authorization, rate limiting, and audit event retention.
- PostgreSQL driver, migrations, production deployment, and observability integrations.
