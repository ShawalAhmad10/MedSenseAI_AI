# DDI Adapter Boundary and Conformance

**Status:** Provider-neutral engineering framework

**Clinical-use status:** No DDI provider is approved. This framework does not authorize a real provider adapter, external DDI calls, DDI ingestion, interaction records, clinical interpretation, or production pharmacy use.

## 1. Adapter boundary

The adapter boundary translates an authorized provider's future delivery format into the audited contracts in `medsense_ai.ddi_providers`. It stops at a source-preserved provider response:

```text
RxNorm CPC identity
  -> canonical MedSenseAI ingredient
  -> versioned provider mapping
  -> concrete provider adapter
  -> provider-neutral DDI contract
  -> source-preserved response or explicit uncertainty/failure
  -> synthetic non-clinical interaction orchestration
  -> FUTURE governed clinical interpretation (NOT IMPLEMENTED)
```

`BaseDDIProviderAdapter` supplies only vendor-neutral mechanics:

- configuration and metadata consistency;
- typed readiness handling with sanitized failures;
- mapping input and provider-provenance validation;
- pair request/result correlation;
- deterministic batch correlation by unique request identifier;
- pair-specific malformed outcomes for missing or mismatched batch responses;
- safe exception boundaries through `lookup_pair_fail_closed` and `lookup_batch_fail_closed`.

A concrete adapter remains responsible for translating its authorized schema into the existing DTOs. It must not invent missing source content, infer a normalized severity, use fuzzy-name auto-mapping, scrape an undocumented endpoint, or treat an empty response as safe.

## 2. Safe configuration boundary

`ProviderAdapterConfig` is frozen, rejects undocumented fields, and contains no credential fields. It records:

- provider name and namespace;
- enabled/disabled state;
- development, test, evaluation, or production environment;
- expected provider version and content release when pinned;
- a bounded operation timeout;
- retry-policy limits.

Credentials are deliberately outside this contract. A future implementation must obtain them from an approved secret-management boundary and must never place them in repository configuration, DTOs, logs, conformance reports, or retained raw fixtures.

Enabled means only that technical adapter operations may run in the configured environment. It does not mean licensed, clinically accepted, Pakistan-validated, or production-authorized.

## 3. Retry and logging safety

`ProviderRetryPolicy` classifies only timeout, rate-limit, and provider-maintenance/unavailability failures as potentially retryable. `retry_permitted` also requires the adapter's sanitized failure to mark the event retryable and requires attempts to remain below the configured maximum.

Authorization/license failure, authentication failure, malformed response, version mismatch, mapping failure, unsupported concept, unexpected error, ambiguous mapping, insufficient coverage, and no-assertion outcomes are never made retryable by this policy. The framework classifies permission only; it performs no automatic network retry or delay.

Adapter infrastructure logs provider namespace, request correlation identifiers where available, failure category, pair count, and exception type. It does not log exception messages, credentials, full provider responses, assertion descriptions, citations, or raw source payloads by default.

## 4. Batch correlation

Every pair request carries a unique request identifier. Duplicate ingredient pairs are allowed only as independently correlated requests with distinct identifiers. The batch helper:

1. indexes returned pair results by their request identifier;
2. rejects unknown or duplicate response identifiers;
3. restores the exact requested order;
4. verifies the full request and provider metadata for every returned pair;
5. creates a pair-specific `malformed_provider_response` failure for a missing or mismatched pair;
6. preserves valid mixed outcomes so one pair's timeout or other failure does not overwrite another pair's result.

A batch-level exception or structurally untrustworthy response fails every requested pair closed. No missing response becomes `no_assertion_returned`.

## 5. Reusable conformance harness

`run_adapter_conformance` accepts an adapter-specific `AdapterConformanceProbe`. The probe must induce the standard scenarios using clearly synthetic responses or a separately authorized non-clinical evaluation environment. The reusable runner checks:

- metadata, capabilities, readiness, and mapping provenance;
- assertion found and explicit no-assertion outcomes;
- each unmapped endpoint state, ambiguous mapping, and insufficient coverage;
- provider unavailable, provider error, timeout, rate limit, authorization, malformed response, version mismatch, mapping-provenance mismatch, and unexpected exception behavior;
- exact source-native classification and assertion provenance preservation;
- frozen DTO behavior;
- batch correlation, pair-specific partial failure, missing response, and duplicate-pair behavior.

Each future adapter must implement the same probe against provider responses that the controlling evaluation agreement authorizes MedSenseAI to use and retain. Provider-specific conformance tests may add stricter requirements but may not remove or weaken the reusable checks.

The structured `DDIAdapterConformanceReport` records provider and adapter identity, contract version, tested capabilities, timestamp, requirement outcomes, failures, warnings, and environment. Its `clinical_use_authorized` field is constrained to `false`. An unavailable authorized fixture is recorded as `blocked`, which blocks the overall report rather than being treated as a pass.

## 6. What conformance proves

A passing report proves only that the tested adapter version and provider release behaved consistently with the provider-neutral engineering contract for the induced cases. It provides evidence about deterministic translation, DTO validation, failure classification, correlation, source-field preservation, and technical reproducibility.

Conformance does **not** prove:

- that provider content is clinically correct or sufficiently complete;
- that an absent assertion means a combination is safe;
- that provider identifiers or RxNorm mappings cover the intended formulary;
- that the provider has granted commercial, storage, display, caching, audit, or redistribution rights;
- that Pakistan is an authorized territory;
- that Pakistan formulary coverage or pharmacist validation has passed;
- that security, privacy, procurement, clinical governance, or regulatory review has passed;
- that a provider may be enabled in production.

Synthetic passing is therefore not clinical evidence and cannot authorize patient-care or pharmacy use.

## 7. Production safety gate

`ProviderLifecycleApproval` keeps these states independent:

1. technically integrated;
2. conformance tested;
3. licensed and authorized;
4. clinically accepted;
5. Pakistan coverage validated;
6. production enabled.

The lifecycle record is pinned to the provider name/namespace, adapter version, provider version, and content release so evidence cannot be reused silently for another integration. Every completed gate requires an evidence identifier, reviewer identifier, and timezone-aware review timestamp. A production-enabled pass is invalid unless every prior gate is also a recorded pass.

`evaluate_production_activation` additionally requires:

- the adapter configuration to be enabled;
- the environment to be production;
- configured provider identity and pinned versions to match readiness metadata;
- current readiness to be `ready`;
- every lifecycle gate to be `pass`.

The function only enforces externally governed records; it does not create or validate legal or clinical approval. Those records must come from the review process in [ddi-provider-acceptance-spec.md](ddi-provider-acceptance-spec.md). Unknown, in-progress, failed, missing, or partial evidence remains a blocker.

## 8. Future vendor-adapter workflow

Before any real adapter work begins:

1. Procurement and legal reviewers must authorize the exact evaluation product, environment, schemas, responses, and retention behavior.
2. Engineering must implement the vendor translation behind `BaseDDIProviderAdapter` without adding vendor fields to the neutral contracts unless a separately reviewed generic contract change is necessary.
3. The adapter must provide an authorized conformance probe for every declared capability and documented provider failure.
4. The reusable harness, vendor-specific tests, dependency check, compilation, module imports, full test suite, health tests, logging scans, and prohibited-content scans must pass.
5. The conformance report and provider release must be reviewed as engineering evidence.
6. Licensing, clinical, security, procurement, Pakistan coverage, and product-governance gates must still be completed independently.
7. Production activation remains blocked until the final production-enabled gate is explicitly recorded after every prerequisite passes.

No step in this document authorizes clinical interpretation, a real provider,
or production use. The implemented synthetic interaction orchestrator remains a
separate non-clinical boundary and does not weaken provider procurement,
acceptance, or clinical-governance gates.
