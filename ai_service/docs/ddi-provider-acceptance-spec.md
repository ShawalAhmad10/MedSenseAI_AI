# DDI Provider Procurement and Acceptance Specification

**Status:** Pre-procurement hard-gate specification

**Clinical-use status:** No DDI provider is approved. This specification does not authorize provider integration, DDI data ingestion, interaction-record creation, or clinical deployment.

## 1. Purpose and boundary

This specification defines the evidence and conformance results a Drug-Drug Interaction (DDI) knowledge provider must supply before MedSenseAI may use that provider clinically. It implements the `CONDITIONAL GO` boundary in [ddi-source-decision.md](ddi-source-decision.md).

The evaluated boundary is:

```text
RxNorm CPC identity
        -> canonical MedSenseAI ingredient
        -> versioned provider mapping
        -> provider-neutral DDI contract
        -> source-preserved provider response
        -> synthetic non-clinical interaction orchestration
        -> FUTURE governed clinical interpretation (not implemented)
```

This specification evaluates licensing, data, mapping, delivery, provenance, operations, and reproducibility. It does not evaluate whether any real drug pair should trigger an alert, does not define a universal severity, and does not interpret a provider assertion clinically.

## 2. Acceptance rule

Every requirement marked **Hard gate** must be recorded as `PASS` with reviewable evidence. `UNKNOWN`, `PARTIAL`, verbal assurance, marketing material without binding detail, or a failed conformance test is not a pass.

The acceptance record must identify:

- provider legal entity and contracted product/module;
- contract/order identifier and effective dates;
- licensed territories, deployment environments, customer types, and users;
- provider and adapter versions evaluated;
- exact content release or evaluation snapshot;
- evidence artifact location and checksum where available;
- reviewer, review date, decision, exceptions, and exception owner;
- legal, procurement, clinical/pharmacy, security, and engineering sign-off.

There is no automatic waiver for a well-known provider. Any approved exception must be written, time-limited, assigned to an owner, and must not weaken the rule that missing or unavailable data is not safe. A licensing, clinical-scope, provenance, or missing-result-semantic failure cannot be waived for production clinical use.

## 3. Required provider evidence package

Before adapter implementation against real data, the provider must supply under authorized evaluation terms:

1. Applicable master agreement, order form, data license, product schedule, territory schedule, and acceptable-use terms.
2. Current data dictionary and complete machine-readable schema for the licensed DDI module and crosswalk.
3. A clearly licensed synthetic or non-clinical evaluation response package. Real clinical samples require separate authorization and a later governed validation phase.
4. Provider identifier definitions, concept lifecycle rules, mapping/crosswalk documentation, and release compatibility rules.
5. DDI scope and editorial-method documentation, including source-native classification definitions and evidence/reference behavior.
6. Release calendar, release identifiers, manifests/checksums where applicable, change logs, correction process, withdrawal/deletion semantics, and rollback process.
7. API or database operational documentation, authentication scheme, rate limits, timeouts, status/error catalogue, maintenance behavior, and service-level commitments.
8. Coverage-reporting method and a provider-generated inventory suitable for comparison with an authorized Pakistani ingredient formulary.
9. Security and incident contacts, escalation process, planned-maintenance notice process, and critical-content-correction service levels.
10. Written answers to every licensing and semantic question below, incorporated into the controlling agreement where needed.

## 4. A. Licensing acceptance requirements

| Hard gate | Required evidence | Pass criteria |
|---|---|---|
| Commercial pharmacy use | Executed agreement naming the licensed DDI product and MedSenseAI's commercial pharmacy decision-support purpose | The intended use is expressly permitted; it is not inferred from general API or website access |
| Safety-sensitive use | Contract language addressing clinical/pharmacy workflow use and applicable disclaimers | No term prohibits the intended safety-sensitive application; responsibilities and limitations are understood and accepted by legal and clinical governance |
| Pakistan territory | Territory schedule or written amendment | Hosting, access, processing, and customer use in Pakistan are expressly permitted |
| Storage rights | Contract schedule covering assertions, provider identifiers, crosswalks, descriptions, evidence, references, and release metadata | Required source-preserved fields may be stored for the approved retention period |
| Caching rights | Written API/cache allowance, maximum retention, refresh, and purge terms | Intended availability/cache design is permitted and expiry rules are implementable |
| Display rights | Written rights for classifications, descriptions, references, attribution, and provider branding | Authorized pharmacy users may see every field required by the approved workflow |
| Audit-retention rights | Retention and post-termination terms | Historical source/version evidence required to reproduce a past lookup may be retained and audited for the required period |
| Backup and disaster recovery | Contract treatment of encrypted backups, replicas, and recovery copies | Required operational copies are permitted in approved locations |
| Redistribution restrictions | Explicit definition of customer access, multi-tenancy, exports, reports, support access, and downstream transfer | MedSenseAI can technically enforce all restrictions; prohibited redistribution is excluded by design |
| Derived-data rights | Terms for canonical pair keys, search indexes, mapping tables, normalized transport fields, metrics, and adapter output | Required non-clinical transformations and internal indexes are expressly allowed without claiming ownership of provider content |
| Identifier/crosswalk rights | Separate entitlement terms for provider identifiers and RxNorm/other crosswalks | Mapping data may be used, refreshed, stored, audited, and displayed as required |
| Attribution | Required wording, placement, trademark rules, citation rules, and change notices | Product and documentation can comply without misleading users or implying endorsement |
| Termination/export | Deletion, export, transition, and retained-audit obligations | Vendor replacement is feasible and required audit evidence is not destroyed contrary to legal/clinical obligations |
| Subprocessors and hosting | Approved regions, subprocessors, data residency, and remote access terms | Proposed architecture and Pakistan operations fit the authorized deployment model |

**Immediate failure conditions:** a non-commercial-only license; a safety-critical-use prohibition; Pakistan excluded; required local/audit storage prohibited; crosswalk not licensed; source display prohibited where clinical governance requires it; or ambiguity that the provider declines to resolve in writing.

## 5. B. Clinical and data acceptance requirements

| Hard gate | Required evidence | Pass criteria |
|---|---|---|
| Clinical purpose | Current editorial-policy and intended-use documents | The licensed module is curated for professional medication-safety/DDI use, not merely research prediction, label search, or chemical association |
| DDI scope | Written scope by interaction type, ingredient/product level, route/form context, excluded categories, geography, and population where applicable | Scope is precise enough to determine whether a query is in coverage |
| Ingredient coverage | Versioned provider concept inventory or authorized coverage report | Coverage can be deterministically compared with MedSenseAI canonical ingredients and the approved Pakistan validation list |
| Pair structure | Schema and data dictionary | Endpoints, directionality, group/class expansion, duplicates, context, and assertion identifiers are unambiguous |
| Source-native classification | Complete native code/label definitions and lifecycle rules | Native values can be preserved exactly; no MedSenseAI severity conversion is needed at the provider boundary |
| Description and management fields | Field definitions and display/storage rights | Available source text is identifiable, optionality is documented, and absence is distinguishable from parsing failure |
| Evidence provenance | Reference/evidence schema, source types, editorial traceability, and rights | Each available reference remains provider-linked and source-identifiable; evidence absence is explicit |
| Editorial process | Source selection, review roles, quality controls, correction and conflict-handling policy | Clinical/pharmacy reviewers accept the method for the intended scope |
| Update and release process | Release cadence, effective dates, emergency corrections, withdrawals, and advance notices | Content freshness and correction behavior can be monitored and audited |
| Missing-result semantics | Binding technical definition for empty results, unsupported concepts, out-of-scope domains, partial results, filtered results, and provider errors | A successful in-coverage query returning no assertion can be distinguished from every uncertainty/failure state; no state is described as proof of safety |
| Mapping support | Crosswalk schema, matching level, exactness rules, salt/precise-ingredient handling, retirements, and review states | Mapping is deterministic and versioned; fuzzy-name auto-mapping is not required |
| Coverage reporting | Machine-readable supported/unsupported concept reporting tied to a release | `insufficient_provider_coverage` can be emitted deterministically rather than guessed from an empty result |
| Deletions and disputes | Tombstone/withdrawal semantics and disputed/conflicting-evidence policy | Removed or changed assertions remain reproducible historically and are not silently lost |

Clinical acceptance must preserve provider-native meaning. A provider is not required to use another provider's classification system, and MedSenseAI must not compare labels as though they were equivalent.

## 6. C. Technical acceptance requirements

| Hard gate | Required evidence | Pass criteria |
|---|---|---|
| Delivery format | Authorized API specification or database/file schema and sample manifest | Fully machine-readable, deterministic, and compatible with validated request/response handling |
| Schema stability | Versioning policy, compatibility window, deprecation notice, and migration guide | Breaking changes are versioned and announced with sufficient migration time |
| Authentication | Credential type, rotation, expiry, least-privilege scopes, test/production separation, and revocation | Secrets can remain outside source code and logs; separate environments and safe rotation are supported |
| Authorization/license failures | Documented status/error behavior | Authentication and entitlement failures are distinguishable and testable |
| Rate limits | Per-operation limits, burst rules, headers/statuses, quotas, and increase process | Expected workload and retry policy fit without silently dropping checks |
| Timeouts | Connection/read/server timeout guidance and idempotency behavior | Adapter can set bounded timeouts and classify timeouts explicitly |
| Uptime/SLA | Availability target, exclusions, maintenance notices, support and escalation | Clinical governance accepts the dependency and an unavailable response can fail closed |
| Failure semantics | Complete error catalogue including partial/malformed response behavior | Every error maps deterministically to a typed provider failure; exceptions are never silently swallowed |
| Version pinning | Request/header/database-release mechanism and response version field | Every lookup can prove which provider content release answered it |
| Version mismatch | Documented behavior for stale/unsupported client and content versions | Mismatch is detectable before clinical interpretation |
| Rollback | Supported prior-release restoration or snapshot procedure | A faulty release can be removed from service while preserving historical audit data |
| Batch behavior | Batch schema, ordering, partial-failure, maximum size, and atomicity rules, if offered | Capability is declared accurately and each pair receives an independent typed outcome |
| Offline behavior | File/database integrity verification, manifests, checksums, and update atomicity, if offered | Corrupt or partial releases cannot become ready |
| Coverage endpoint/report | Schema, release binding, and availability guarantees, if offered | Coverage statements are versioned and cannot be confused with DDI negatives |
| Observability | Request correlation, provider status identifiers, safe logging guidance, and metrics | Failures can be investigated without logging credentials or unlicensed raw data |

An adapter must declare only capabilities verified for its licensed product. Unsupported optional operations must be explicit and must not fall back to scraping or undocumented endpoints.

## 7. D. Audit and reproducibility acceptance requirements

| Hard gate | Required evidence | Pass criteria |
|---|---|---|
| Release identity | Immutable release/content identifier in files or responses | Every assertion and no-assertion result records the exact provider release |
| Release integrity | Provider checksum/signature or a contractually accepted equivalent for offline delivery | Acquired content can be verified before use |
| Change logs | Machine-readable or reviewable additions, modifications, deprecations, merges, splits, and withdrawals | Release changes can be reconciled and clinically reviewed |
| Stable identifiers | Concept and interaction identifier guarantees and retirement rules | Historical references remain resolvable or receive explicit tombstones |
| Reproducible lookup | Authorized snapshot/replay method or documented deterministic query behavior | A past response can be reconstructed to the degree required by the retention agreement |
| Mapping reproducibility | Crosswalk version, RxNorm release compatibility, mapping source record, and mapping change history | A past provider mapping can be explained without name guessing |
| Retrieval audit | Correlation ID, request time, completion time, response status, provider version, and sanitized failure details | Each provider call is independently traceable |
| Retention | Written retention periods for content, mappings, responses, logs, backups, and contract evidence | Retention satisfies legal and clinical governance and is technically enforceable |
| Correction trace | Emergency-correction identifier, affected releases/records, effective time, and remediation instructions | Impacted historical and current records can be located deterministically |
| Adapter trace | Adapter version and conformance-suite result tied to the provider release/schema | A deployed response can be linked to the exact parsing/translation code |

## 8. E. Pakistan validation acceptance requirements

The provider's global positioning is not evidence of Pakistan coverage. Production acceptance requires a separate, versioned Pakistan validation record.

### Required inputs

- A lawful, authorized list of in-scope Pakistani products and their verified active ingredients.
- The exact RxNorm CPC release used for canonical identities.
- The exact provider release and crosswalk release being evaluated.
- Inclusion/exclusion rules for routes, formulations, precise ingredients, salts/esters, fixed-dose combinations, biologics, OTC products, and other locally relevant categories.
- A pre-registered coverage threshold approved by Pakistan pharmacy/clinical governance before results are measured. This specification does not invent that business/clinical threshold.

### Required measurements

- total in-scope products and unique canonical ingredients;
- exact mapped, human-verified, review-required, ambiguous, unmapped, deprecated, and out-of-provider-coverage counts;
- coverage by agreed clinically relevant category, not only an overall percentage;
- fixed-dose combination endpoint coverage;
- mapping changes from the previous provider/RxNorm release;
- assertions with missing native classification, description, evidence, or stable identifier where those capabilities were contracted;
- provider unavailable/error rates during an agreed operational evaluation window.

### Mapping acceptance

- Every ingredient allowed to enter the provider-supported go-live scope must have an exact or human-verified, versioned mapping.
- Ambiguous, review-required, unmapped, deprecated-without-replacement, or unsupported ingredients must remain outside the supported scope and produce the corresponding fail-closed outcome.
- No transaction involving an unresolved ingredient may receive `no_assertion_returned`.
- Fuzzy-name matching cannot satisfy the threshold.
- The overall formulary threshold and category thresholds must be approved before measurement; missed thresholds are a hard failure unless scope is formally narrowed and re-reviewed.

### Pharmacist review plan

Pakistan-licensed or otherwise appropriately authorized pharmacy/clinical reviewers must approve:

- mapping policy and sampled mapping evidence;
- local formulations and fixed-dose combination handling;
- provider-native classification display and accompanying limitations;
- missing-result wording and escalation workflow;
- unsupported ingredient and outage behavior;
- release-change review and critical correction workflow;
- validation protocol, observed results, deviations, and final go-live scope.

DRAP product registration data does not replace DDI clinical knowledge, and its current public registry must not be scraped or repurposed contrary to its terms. Nothing in this acceptance process constitutes regulatory approval.

## 9. Vendor-neutral adapter conformance suite

The reusable conformance boundary is the public contract in `medsense_ai.ddi_providers`. Before any adapter is merged, the same behavior suite must be executed against an authorized synthetic/evaluation environment. Tests must not assert real clinical facts during contract conformance.

### Required cases

| Case | Required adapter behavior |
|---|---|
| Metadata | Return non-empty provider name/namespace, adapter version, provider version, release identifier, and typed capabilities |
| Health/readiness | Return typed readiness and an explicit failure when unavailable |
| Mapping success | Preserve canonical ingredient, RxCUI and release, provider concept ID/release, method, confidence/status, provenance, and timestamp |
| Mapping A absent | Return `ingredient_a_unmapped`; no assertions |
| Mapping B absent | Return `ingredient_b_unmapped`; no assertions |
| Both mappings absent | Return `both_ingredients_unmapped`; no assertions |
| Ambiguous mapping | Return `ambiguous_mapping`, candidate IDs, and human-review-required; no assertions |
| Assertion found | Return at least one internally consistent source-preserved assertion with both resolved mappings |
| No assertion | Return `no_assertion_returned` only after both mappings and in-scope coverage are confirmed; no safety field or conclusion |
| Insufficient coverage | Return `insufficient_provider_coverage`, distinct from no assertion |
| Native classification | Preserve exact provider code/label without converting it to a universal severity |
| Description/evidence | Preserve optional source fields and reference identifiers without generating missing content |
| Provenance | Preserve provider/release, interaction ID when supplied, concept IDs, mapping provenance, retrieval time, and restrictions metadata |
| Timeout | Log context and translate to `provider_unavailable` with `timeout` |
| Rate limit | Log context and translate to `provider_unavailable` with `rate_limit` |
| Maintenance/outage | Translate to `provider_unavailable`; no assertions |
| Authentication | Translate to `provider_error` with `authentication_failure`; no assertions |
| License/authorization | Translate to `provider_error` with `authorization_or_license_failure`; no assertions |
| Malformed response | Reject and translate to `provider_error` with `malformed_provider_response` |
| Unsupported concept | Preserve an unmapped/coverage result or typed failure according to the verified provider semantics; never no assertion by default |
| Version mismatch | Fail before interpretation with `provider_error` and `version_mismatch` |
| Unexpected exception | Log the exception and return a sanitized `provider_error`; do not silently continue |
| Batch, if declared | Preserve request/result association and independent pair statuses; test partial failures according to documented semantics |
| Extra fields | Reject undocumented transport fields at the provider-neutral DTO boundary |
| Synthetic-only fixtures | Use unmistakably synthetic identifiers and text; contain no real drugs or clinical interaction claims |

### Conformance evidence

The adapter acceptance report must record:

- test-suite commit and adapter commit;
- Python/package versions and dependency consistency result;
- provider evaluation environment and schema/release version;
- complete test output and any warnings;
- sanitized raw-response fixtures authorized for retention, or provider-signed schema examples if responses cannot be retained;
- coverage of every declared capability and every documented error response;
- unresolved deviations and reviewer disposition.

Passing synthetic conformance proves only that the adapter preserves the contract. It does not prove clinical correctness, provider coverage, Pakistan applicability, licensing approval, or regulatory approval.

## 10. Production approval record

The final approval record must contain these independent decisions:

| Review | Required decision |
|---|---|
| Legal/licensing | Intended use and every required data right are authorized |
| Procurement | Product/module, term, price, support, SLA, termination, and vendor risk are accepted |
| Clinical/pharmacy | Editorial method, native classifications, scope, missing-data behavior, and Pakistan validation are accepted |
| Engineering | Schema, mapping, failures, releases, rollback, audit, and conformance tests pass |
| Security/privacy | Authentication, secrets, hosting, logging, vendor access, and incident processes are accepted |
| Product governance | Supported scope, user wording, escalation, and non-safe missing-result behavior are approved |

Only an all-`PASS` record permits a real provider adapter to move from evaluation toward production integration. That later work still requires a separate implementation plan, approved real-data fixtures, clinical validation, and full regression testing.

## 11. Current decision

No vendor has supplied or passed this evidence package. Therefore:

- provider-neutral contracts and synthetic conformance tests are permitted;
- procurement and authorized vendor evaluation are permitted;
- real DDI API calls, datasets, adapters, assertions, and clinical interpretation remain deferred;
- `no_assertion_returned` remains an unknown-information result and never means safe.
