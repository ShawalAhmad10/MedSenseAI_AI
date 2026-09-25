# DDI Orchestration Engine

**Status:** synthetic, provider-neutral orchestration implemented

**Clinical-use status:** this engine coordinates validated identity and provider
contracts only. It does not decide whether a provider assertion is clinically
important, normalize provider classifications, recommend an action, or establish
that a product combination is safe.

## Purpose and architecture

The engine implements this deterministic flow:

```text
validated product A + validated product B
  -> product eligibility gate
  -> canonical ingredient-pair expansion
  -> pinned RxNorm identity gate
  -> selected provider mapping gate
  -> provider-neutral single or batch lookup
  -> source-preserved pair results
  -> aggregate engine-state result
```

The implementation lives in `medsense_ai.interaction_engine`. `contracts.py`
defines immutable Pydantic DTOs, and `service.py` supplies the orchestration
function. It reuses `medsense_ai.product_mapping` and
`medsense_ai.ddi_providers`; it does not duplicate their medical identity or
provider transport rules.

No API endpoint, database table, network client, dataset, real provider adapter,
or real medical fixture is introduced.

## Input assumptions

`DDIOrchestrationRequest` accepts:

- two distinct, already validated `PakistanMedicineProduct` DTOs;
- the selected provider namespace;
- a required provider release identifier;
- a required RxNorm release identifier;
- versioned `RxNormIngredientCrosswalk` assertions;
- a correlation identifier;
- optional execution metadata, including whether batch lookup should be used when
  the adapter safely declares it.

The provider adapter is a separate typed argument to `orchestrate_ddi`. Raw brand
names are not accepted as ingredient identity. The selected provider namespace and
release must match its validated metadata before health, mapping, or lookup calls
proceed.

## Product eligibility gate

The engine first calls `expand_candidate_ingredient_pairs`, which reuses the
existing product eligibility rules. Incomplete composition, unresolved active
components, unknown component roles, ambiguous product mappings, unsupported
components, inactive canonical identities, and open review requirements block
candidate generation.

When either product is ineligible, the engine returns
`blocked_by_product_mapping`. It preserves both typed product eligibility results,
makes no provider health, mapping, or lookup call, and reports zero candidate
pairs.

Product and component source/release provenance remain in the input DTOs and are
copied into every generated pair result.

## Pair expansion

Eligible product ingredient sets are expanded by the existing deterministic
Cartesian algorithm. Canonical ingredient IDs define ordering and deduplication.
Duplicate source components resolving to the same canonical identity contribute
one canonical endpoint while all component identifiers remain preserved.

Each `DDIOrchestratedPairResult` retains:

- the complete `CandidateIngredientPair`;
- all product/component contribution paths;
- exact product and component `SourceProvenance` for every contribution;
- deterministic pair and provider request correlation identifiers.

The same canonical ingredient present in both products is excluded from provider
self-pair lookup and retained as `SameIngredientOverlap`. When overlap is the only
result, aggregate state is `no_distinct_candidate_pairs`. This is identity metadata
only and produces no clinical conclusion.

Shared canonical identifiers must carry identical canonical metadata across both
products. Distinct canonical ingredients that resolve to one RxCUI or provider
concept are blocked as a mapping failure before lookup, so provider self-identity
requests are never generated.

## Provider mapping gate

For each unique canonical ingredient, the engine selects exactly one RxNorm
crosswalk for the request's pinned RxNorm release. Missing, unmapped, ambiguous,
review-required, deprecated, superseded, duplicate, or release-mismatched
crosswalks remain explicit mapping issues.

An acceptable RxNorm assertion becomes a `CanonicalIngredientReference`. The
selected adapter's existing `map_ingredient` contract is then called once per
unique ingredient. Only a non-review-required `mapped` provider mapping whose
ingredient, provider identity, provider version, and provider release match the
request can enter lookup.

The mapping gate distinguishes:

- mapped;
- unmapped;
- ambiguous;
- review required;
- deprecated;
- superseded;
- provider identity mismatch;
- RxNorm or provider release mismatch;
- malformed, unavailable, or unexpected mapping failure.

No fuzzy matching exists. A mapping from another RxNorm or provider release is
never silently reused. An unresolved mapping blocks every affected pair. Other
pairs in the same combination may still be independently looked up, producing a
`completed_with_provider_uncertainty` aggregate rather than hiding the partial
state.

## Provider lookup flow

Every eligible pair is converted to the existing `ProviderPairLookupRequest` with
the required provider release and a deterministic request identifier.

When batch use is enabled and the adapter declares and implements batch lookup,
the engine calls `lookup_batch_fail_closed`. Otherwise, it calls
`lookup_pair_fail_closed` independently for every pair. The existing adapter
boundary therefore remains responsible for:

- exception translation;
- timeout, rate-limit, authorization, and availability classification;
- response/request/provider correlation;
- batch order restoration;
- independent partial outcomes;
- rejection of duplicate or unexpected batch response identifiers as a
  batch-level malformed response;
- reconstruction of missing or mismatched batch responses as
  `malformed_provider_response`.

The engine checks that mappings returned with a provider result still equal the
mappings accepted by the pre-lookup gate. A changed or contradictory mapping is a
provider error, never a no-assertion result.

## Pair result semantics

`DDIOrchestratedPairResult` is immutable and preserves the canonical pair,
product/component provenance, accepted provider mappings and concept IDs, provider
release, lookup status, coverage evidence, source assertions, failure detail,
review requirement, completion time, and correlation identifier.

Pair orchestration states are:

| State | Engine meaning |
|---|---|
| `assertion_returned` | Provider lookup completed and returned one or more validated source assertions. |
| `no_assertion_returned` | Provider lookup completed in declared coverage and returned no assertion. This remains unknown information. |
| `provider_mapping_unresolved` | RxNorm or provider mapping did not pass the gate; no lookup occurred. |
| `insufficient_provider_coverage` | Provider mapping succeeded, but provider coverage was out of scope or unknown. |
| `provider_unavailable` | Lookup or pre-lookup provider operation failed with timeout, rate limit, maintenance, or unavailability. |
| `provider_error` | Lookup or pre-lookup provider operation failed through authorization, malformed response, version mismatch, mapping contradiction, or another non-availability error. |

Provider-native classification code and label remain only inside
`ProviderSourceAssertion`. The engine defines no severity field and does not
compare or reinterpret provider labels.

## Aggregate result semantics

`DDIOrchestrationResult` summarizes execution state:

| State | Engine meaning |
|---|---|
| `lookup_completed` | Every distinct candidate pair completed as assertion-returned or no-assertion-returned. |
| `no_distinct_candidate_pairs` | Eligible products generated overlap metadata but no distinct provider pair. |
| `blocked_by_product_mapping` | Product eligibility failed before candidate generation. |
| `blocked_by_provider_mapping` | Every candidate pair was blocked by RxNorm/provider mapping state. |
| `completed_with_provider_uncertainty` | Some pair work completed, while another pair was unresolved, out of coverage, unavailable, or failed. |
| `provider_unavailable` | Every candidate pair was blocked by provider availability failure. |
| `provider_error` | Every candidate pair ended in a non-availability provider error. |

The aggregate status is validated against the complete ordered pair-result set; it
cannot be supplied inconsistently.

Aggregate counts are deterministically recomputed and validated for:

- candidate pairs;
- pairs actually looked up;
- source assertions returned;
- no-assertion pair results;
- pairs affected by an unmapped identity;
- provider-failure pairs;
- review-required pairs;
- same-ingredient overlaps.

These are processing counts, not clinical risk or safety statistics.
Every distinct candidate pair has exactly one pair result and exactly one
pair-level status. Mapping-blocked and unsupported pairs remain in the candidate
and pair-result totals; count subsets may overlap only where explicitly defined
(for example, a review-required pair is also a candidate pair).

## No-assertion semantics

`no_assertion_returned` is preserved exactly from the provider-neutral contract
only when both mappings are resolved and explicit in-scope coverage evidence is
present. It means that the selected provider release returned no assertion for
that request. It does not mean no interaction exists and never produces a `safe`,
`no interaction`, recommendation, or clinical classification field.

Zero returned assertions can coexist with unresolved mapping, insufficient
coverage, provider unavailability, or provider error. Aggregate counts keep those
states separate.

## Failure behavior

The engine fails closed:

- product mapping failure prevents every provider call;
- provider identity or release mismatch prevents health, mapping, and lookup;
- provider health failure prevents mapping and lookup;
- missing or unacceptable RxNorm/provider mapping blocks affected pairs;
- provider mapping exceptions are sanitized and typed;
- provider lookup failures retain their existing category;
- no provider failure is converted to no-assertion;
- partial batches preserve independent successful and failed pair results;
- missing batch entries become pair-specific malformed-response errors;
- unexpected exceptions are logged with sanitized provider/ingredient/request
  context and exception type, without raw provider content.

## Synthetic-only validation scope

Automated tests use `SyntheticDDIProvider` and fictional products, ingredients,
RxNorm identifiers, provider concepts, assertions, classifications, evidence, and
provenance. They exercise the orchestration contract and failure mechanics only.
Passing tests do not validate medical content, clinical completeness, Pakistan
coverage, licensing, or production suitability.

## Future production-provider boundary

A real adapter remains prohibited until the procurement and acceptance gates in
`ddi-provider-acceptance-spec.md` pass. A later production integration must use the
same provider-neutral adapter contract, pinned releases, conformance harness,
mapping evidence, coverage semantics, rights controls, governance approvals, and
Pakistan validation. This engine requires no vendor-specific change to support
such a future adapter.

## Explicitly deferred clinical interpretation

This phase does not implement clinical severity normalization, contraindication
interpretation, dose advice, substitutions, recommendations, patient-specific
rules, pregnancy/lactation logic, allergy logic, renal/hepatic logic, or
pharmacist-facing natural-language explanations. Any future clinical interpretation
layer requires a separate governed design, validated medical sources, clinical
review, and dedicated tests.
