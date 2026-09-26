# Pakistan Medicine Product Data Decision

**Decision:** CONDITIONAL GO

**Research cut-off:** 2026-08-30

**Scope:** the Pakistan medicine-product-to-active-ingredient path that must precede any DDI provider lookup

This is a source and architecture decision, not a medical dataset. It adds no medicine records, clinical assertions, price records, interaction data, or regulatory claim. No source evaluated here is approved merely because it is publicly viewable.

## 1. Requirements and safety boundary

The required deterministic path is:

```text
Pakistani pharmacy product selection
  -> source-preserved Pakistan product record
  -> complete, role-qualified product composition
  -> canonical MedSenseAI active ingredient(s)
  -> versioned DDI-provider mapping
  -> DDI provider lookup
```

The product source must support, or be augmentable to support:

- a stable product identity and Pakistan market context;
- every active component of a combination product;
- the ingredient name exactly as supplied by the source;
- active/inactive/unknown ingredient role;
- salt, ester, hydrate, solvate, stereochemical or other precise form when stated;
- strength, strength basis and dosage form without discarding source detail;
- manufacturer or market-authorization-holder identity when available;
- DRAP registration number and status when available;
- source record, release or observation time, transformation history and reviewer evidence;
- explicit unmapped, ambiguous, incomplete, stale and unavailable outcomes.

The following are hard safety rules:

1. A brand-name string is never itself a DDI ingredient.
2. Free-text similarity cannot automatically establish an ingredient, salt-to-moiety or combination mapping.
3. A product with an incomplete or unresolved active-ingredient list cannot receive a complete DDI result.
4. No assertion returned by a DDI provider never means that a combination is safe.
5. Price, pack and stock data never establish clinical identity.
6. RxNorm is an identity aid, not the authority that a product is registered, marketed or formulated in Pakistan.

## 2. Confirmed DDI identity model

The repository's existing model remains correct:

```text
MedicineProduct
  -> one or more source-preserved ProductIngredient assertions
  -> canonical ActiveIngredient
  -> ExternalIdentifier mappings, including versioned RxCUI where available
  -> versioned provider-specific DDI concept mapping
```

`MedicineProduct`, `ProductIngredient` and `ActiveIngredient` must remain separate. A product can change status or composition evidence without changing the canonical ingredient identity. An RxCUI or provider identifier can change or be retired without changing MedSenseAI's permanent internal identifier. The DDI provider must never receive an unreviewed brand string as a substitute for an ingredient mapping.

## 3. Pakistan source evaluation

### 3.1 DRAP Registered Product Data / Registered Drugs Index

**Provider and official access:** Drug Regulatory Authority of Pakistan (DRAP), [Registered Product Data](https://eapp.dra.gov.pk/WebProductIndex.php), linked as the Registered Drugs Index from the [DRAP e-services portal](https://e.dra.gov.pk/).

**Purpose and fields:** DRAP describes the public database as covering registered pharmaceutical and biological drug products. Its 2026-updated notice lists product or proprietary name, dosage form, composition/active ingredients, registration number, registration date, market authorization holder and manufacturer: [Updated Database of Pharmaceutical and Biological Drug Product](https://www.dra.gov.pk/news_updates/regulatory_updates/updated-database-of-pharmaceutical-and-biological-drug-product/). The public search supports registration number, brand and generic-name queries.

**Access and machine readability:** interactive public lookup is confirmed. No official public API documentation, OpenAPI description, registered-product bulk download, release manifest, checksum or machine-readable archive was identified in the official materials checked. This is an evidence-limited finding, not proof that no non-public mechanism exists.

**Update/version support:** the public search displayed a data reference date, and DRAP publishes update notices, but a versioned release contract, correction feed, deletion/status feed and reproducible archive were not identified. Update frequency is UNKNOWN.

**License and reuse:** the DRAP portal states all rights reserved. No explicit license authorizing automated extraction, commercial reuse, derivative product catalogs or redistribution was identified. Public viewing is not permission to scrape or ingest.

**Production conclusion:** authoritative in origin and Pakistan-specific, but the public copy is not an approved production input. Its provisional disclaimer, undocumented bulk semantics and unverified reuse rights are blocking. A written DRAP data-sharing/licensing response and a technical data contract would be required before production ingestion.

### 3.2 DRAP Drug Pricing Index

**Official access:** [DRAP Drug Pricing Index](https://e.dra.gov.pk/public/price).

**Purpose and fields:** the public search exposes product name, registration number, manufacturer, category, pack size, price and effective-from date.

**Limitations:** no explicit public API, bulk release, archive/checksum scheme or reuse license was identified on the page. The price index does not establish the complete active composition, salt mapping or DDI identity of a product.

**Decision:** exclude it from the clinical identity path. A future price module may link a separately versioned price assertion to a verified product by registration number, pack and effective date only after rights and update semantics are confirmed. Price must never overwrite or infer product composition.

### 3.3 DRAP National Essential Medicines List 2025

**Official access:** [DRAP National Essential Medicine Lists](https://www.dra.gov.pk/publications/national-essential-medicine-lists/). DRAP lists NEML 2025 as an English PDF, updated 2025-10-30, with archived earlier editions; DRAP also published the corresponding 2025 notification.

**Purpose:** selection and policy guidance for essential medicines. It is not a national registered-product master, does not demonstrate that a brand is stocked by a pharmacy, and does not provide manufacturer, registration or complete market-product coverage.

**Machine readability and reuse:** only a PDF publication was identified, not a structured versioned product feed. No explicit license for dataset reuse or redistribution was identified. NEML may later inform an independently approved coverage-validation list; it must not populate or verify brand-product records by itself.

### 3.4 Other DRAP and government material

- DRAP's [Summary of Product Characteristics collection](https://www.dra.gov.pk/summary-of-product-characteristics-smpc/) can be product-level corroborating evidence when the exact authorized product and version are identifiable. It is a living document collection, not a verified complete structured catalog or bulk interface. Bulk access, reuse rights and coverage are UNKNOWN.
- DRAP registration forms and rules show that regulatory submissions distinguish proprietary/generic name, dosage form and active/inactive composition. They define expected regulatory data categories, not a reusable public dataset.
- DRAP online verification and published pending-application spreadsheets are not registered-product bulk data and cannot substitute for the registered product index.
- Searches of official Pakistan government open-data and health sites did not identify a current, national, structured, licensed medicine-product dataset with complete active composition. This finding is limited to official material found and reviewed by the research cut-off.
- No official public-sector formulary was verified as a complete national registered-product master with stable product identifiers, full active composition, machine-readable releases and commercial reuse terms. Formularies and tenders may define procurement items, but must not be treated as proof of the entire market.

### 3.5 Pharmacy inventory or medicine master

For one pharmacy, its own lawfully held inventory/master data is the strongest practical starting point because it represents the products actually selectable and stocked. It is operational evidence, not automatically authoritative composition evidence. Data ownership, supplier terms, completeness and maintenance practices must be audited before any row participates in DDI preparation.

The pharmacy route is production-capable only if:

- the pharmacy or contracting party has the right to use the master data for this purpose;
- every active component is explicit and role-qualified rather than inferred from the brand;
- registration and label/SmPC evidence can be linked where required;
- a qualified pharmacist verifies mappings and unresolved records are excluded;
- changes, discontinuations and corrections have an auditable workflow;
- the system records source and reviewer evidence for every product-component assertion.

Manufacturer catalogs, distributor feeds and point-of-sale item names may supplement an authorized pharmacy master, but their composition fidelity, update terms and reuse rights remain UNKNOWN until contract and sample-schema review.

### 3.6 Commercial Pakistan product databases

No commercial provider was verified from official provider material as offering all of the following for Pakistan: a current registered-product catalog, complete structured active composition, stable identifiers, versioned machine-readable delivery and rights suitable for MedSenseAI's intended commercial pharmacy use.

MIMS officially documents localized JSON medication APIs and commercial clinical modules for specific supported markets through its [developer portal](https://developer.mims.com/), with pricing by account-manager contact. The official material located did not verify a Pakistan product dataset or Pakistan licensing scope. MIMS is therefore a procurement lead, not an approved Pakistan product source. Any other commercial candidate remains UNKNOWN until the provider supplies an official Pakistan coverage statement, schema, sample, update SLA and contract.

## 4. Exact DRAP disclaimer analysis

The full disclaimer displayed by the Registered Product Data page was reviewed on 2026-08-30. It calls the content an expanded provisional list, warns of possible errors or omissions, disclaims DRAP liability, says it cannot be used as a reference for purposes including research/citation/statistical analysis, and limits its intended purpose to stakeholder review and feedback about their own products. A critical exact excerpt is: **“cannot be used as a reference for any purpose”**. The live text must be retained with procurement evidence because DRAP can change it.

Consequences:

| Question | Decision |
|---|---|
| Can the interactive lookup be the sole authoritative production input? | **No.** Regulator origin does not cure the public copy's stated provisional status and restricted purpose. |
| Is scraping authorized? | **Not established.** No permission for automated extraction or commercial reuse was found; MedSenseAI must not scrape it. |
| Is bulk ingestion documented? | **No public documentation identified.** Endpoint behavior observed in a browser is not an API contract. |
| Is written DRAP permission/data sharing required? | **Yes as a MedSenseAI production gate.** Procurement/legal must obtain written terms covering access, reuse, storage, transformations, corrections, attribution, redistribution/display and commercial deployment. Whether a particular legal instrument is required under Pakistani law is for counsel/DRAP, not this document. |

The separate DRAP update notice says the public version is for reference purposes and subject to the disclaimer. That notice does not override the more restrictive live disclaimer.

## 5. Recommended source strategy

### Production at one pharmacy

Use a **pharmacy-authorized product master as the operational catalog**, then require source-backed, pharmacist-reviewed active composition before a product is eligible for DDI preparation. Prefer DRAP registration number plus an authorized label/SmPC or DRAP-provided record as corroboration. Quarantine any record that cannot meet the gates in section 11.

This is conditional, not approval of the pharmacy's current data. The first assessment must use a blank schema/data dictionary and aggregate quality counts; it must not assume that item descriptions contain ingredients.

### National or multi-pharmacy production

Prefer a **written DRAP data-sharing/bulk arrangement** with versioned delivery and explicit commercial rights. A licensed commercial Pakistan dataset is an alternative only after the same technical, legal and coverage evidence is supplied. The public DRAP search page is not the bulk source.

### Controlled fallback

A pharmacist-maintained catalog may cover local gaps only through a structured workflow with source documents, two-person review for safety-critical mappings, change control, expiry/review dates and explicit unresolved status. Ad hoc free-text entry is not a production identity source.

## 6. Pharmacy inventory field contract

These levels describe eligibility for DDI preparation, not what a typical pharmacy is assumed to possess.

### REQUIRED

- stable pharmacy/source product identifier and source namespace;
- product/brand display string exactly as held;
- complete list of active components, each separately represented;
- exact source ingredient text and explicit role (`active`, `inactive`, or `unknown`);
- exact salt/ester/hydrate/solvate/other form text when supplied, or an explicit source-unknown value;
- strength text per component, parsed amount/unit where safe, and stated strength basis or `unknown`;
- dosage-form text;
- data origin, source record/version or observation timestamp, and record checksum;
- mapping status and reason, verifier identity/role, verification time and evidence reference;
- product lifecycle status or explicit `unknown`.

An ingredient with role `unknown`, missing composition, unknown strength basis where material to the mapping, or unresolved identity cannot participate in a complete DDI check.

### RECOMMENDED

- DRAP registration number, normalized separately from the original text;
- market authorization holder and manufacturer;
- registration/status evidence and last DRAP verification date;
- authorized label or SmPC identifier/version;
- pack presentation, barcode/GTIN and local SKU crosswalks;
- route, release characteristics and other formulation qualifiers;
- first/last observed dates and reason for record changes.

### OPTIONAL OR SEPARATE

- supplier, procurement and stock quantities;
- purchase, retail or reimbursement price;
- shelf/bin location;
- images and marketing descriptions.

Optional commercial fields must not resolve ingredient ambiguity. Price belongs in a separate price assertion linked to product and pack identity.

## 7. Documentation-only canonical model

This model describes future contracts. It does not authorize database changes in this task.

### `PakistanMedicineProduct`

| Field group | Required semantics |
|---|---|
| Internal identity | immutable MedSenseAI `product_id`; never derived solely from brand text |
| Source identity | `source_namespace`, `source_product_id`, original record key and checksum |
| Market identity | `market_country = PK`, brand/proprietary name as supplied, manufacturer/MAH where available |
| Regulatory identity | original and normalized DRAP registration number, status and verification evidence; all nullable/unknown until proven |
| Presentation | raw and normalized-candidate dosage form, route/release qualifiers, pack identifiers |
| Lifecycle | source status, first/last observed, effective and retired dates where supplied |
| Provenance | source, release/version or observation time, retrieval method, transformation description and reviewer evidence |
| Eligibility | composition completeness, product verification and DDI-preparation status with reason codes |

### `ProductActiveIngredient`

| Field group | Required semantics |
|---|---|
| Component identity | product ID and stable component sequence/key |
| Source assertion | exact ingredient string, source role and source composition text |
| Precise substance | salt/ester/hydrate/solvate/stereochemical form as supplied; separate from active moiety |
| Strength | original text, amount, unit, denominator and strength basis, preserving `unknown` |
| Canonical mapping | candidate/verified MedSenseAI ingredient ID, mapping method/status and review requirement |
| Cross-identifiers | versioned RxCUI/TTY and any provider ID; never unversioned truth |
| Provenance | record/release, transformation, rule-set version and reviewer evidence |
| Failure state | unmapped, ambiguous, unsupported, source-conflict, incomplete-combination or quarantined reason |

Inactive ingredients/excipients must use a separate role-qualified assertion or collection. They are never silently promoted to active ingredients. If the source does not distinguish roles, the component is unresolved and requires review.

## 8. Salt and ingredient normalization

### Required representation

MedSenseAI must preserve two distinct identities where applicable:

```text
precise substance as labeled
  --only through a verified, versioned relationship-->
canonical ingredient/active-moiety identity used by the selected DDI provider
```

Text-stripping rules such as deleting a salt suffix are forbidden. Salts, esters, hydrates, solvates, complexes, isomers and biologic suffixes are not interchangeable merely because their names share a token. Strength basis can refer to a precise substance or a base ingredient and must remain attached to the source assertion.

The official [RxNorm overview](https://www.nlm.nih.gov/research/umls/rxnorm/overview.html) defines `IN` as an ingredient/clinical moiety, `PIN` as a specified precise form—most commonly a salt or isomer—and `MIN` as multiple ingredients. The official [RxNorm relationship appendix](https://www.nlm.nih.gov/research/umls/rxnorm/docs/appendix1.html) defines versioned `PIN form_of IN` / `IN has_form PIN` relationships. Those explicit relationships can support a candidate crosswalk; a name-derived relationship cannot.

FDA's [Global Substance Registration System](https://www.fda.gov/industry/fda-data-standards-advisory-board/fdas-global-substance-registration-system) provides scientific substance identities and UNIIs and distinguishes substance relationships such as active moiety and salt/solvate. It may be evaluated later as an additional identity authority. FDA explicitly states that UNII availability does not imply regulatory review or approval, so GSRS cannot establish a Pakistan product or its market status.

### Mapping outcome vocabulary

- `exact_canonical_ingredient`: exact, source-supported identity at the accepted DDI granularity;
- `validated_precise_to_moiety`: precise form mapped through an approved, versioned relationship and review policy;
- `ambiguous_precise_form`: multiple or context-dependent candidates;
- `unsupported_ingredient`: source-valid ingredient outside the identity/provider scope;
- `unmapped_ingredient`: no acceptable crosswalk;
- `source_conflict`: composition sources disagree;
- `human_review_required`: no automatic promotion is allowed.

## 9. RxNorm role and identifier strategy

Use the **MedSenseAI canonical ingredient ID as the permanent primary identity**. Store RxCUI, TTY, source vocabulary, RxNorm release and mapping provenance as a versioned external identifier.

Reasons:

- NLM says RxNorm can be used internationally but is U.S.-centric and contains few, if any, non-U.S. products: [RxNorm FAQ](https://www.nlm.nih.gov/research/umls/rxnorm/faq.html). Pakistani brands should therefore map through verified composition, not through expected RxNorm brand coverage.
- RxCUIs may be remapped or retired across releases. An internal identifier keeps historical product and provider mappings stable while crosswalks evolve.
- A valid Pakistan ingredient may have no acceptable RxCUI. That remains an explicit unsupported/unmapped state; it must not be dropped or name-matched fuzzily.
- A DDI provider might use its own ingredient IDs or a different substance granularity. The canonical layer prevents permanent coupling to either RxNorm or one vendor.

The existing pinned RxNorm CPC release remains useful for exact normalized `IN` identities already validated by this repository. It intentionally excludes `PIN`, `MIN` and relationship ingestion, so it **cannot currently perform automatic salt-to-moiety normalization or combination decomposition**. Expanding that scope requires a separate source, licensing, schema and validation decision; this document does not modify the CPC pipeline.

NLM publishes dated monthly releases, checksums and prior releases. The CPC subset contains only `RXNORM` and `MTHSPL` and requires no download license, while full RxNorm uses UMLS terms and can contain proprietary source vocabularies: [RxNorm files](https://www.nlm.nih.gov/research/umls/rxnorm/docs/rxnormfiles.html) and [terms of service](https://www.nlm.nih.gov/research/umls/rxnorm/docs/termsofservice.html). These distinctions must remain in provenance and procurement review.

## 10. Combination-product behavior

For verified product ingredient sets `A` and `B`, future DDI preparation may generate the Cartesian set of canonical ingredient pairs. It must:

1. preserve every source component assertion;
2. resolve each component independently;
3. sort each pair by immutable canonical ingredient ID;
4. deduplicate only after identity is verified;
5. retain provenance linking each pair back to both products and components;
6. avoid sending a same-canonical-ingredient self-pair to a DDI provider;
7. report same-ingredient overlap separately as an unresolved future duplicate-therapy concern, not invent a DDI assertion;
8. mark the overall preparation incomplete if any active component is unresolved, ambiguous, unsupported or role-unknown.

Resolved pairs may later return source-preserved assertions, but the transaction must remain visibly partial/incomplete until every in-scope component and provider mapping has an outcome. A partial set of assertions can never be summarized as a complete or safe check.

## 11. Data gates before DDI participation

Every gate must pass for the exact product record and current source/release:

| Gate | Pass evidence | Fail behavior |
|---|---|---|
| Source authority and rights | documented owner/provider, permitted use, storage, transformations and commercial scope | reject source for production |
| Product identity | stable source key; Pakistan context; sufficient product/manufacturer/registration evidence | quarantine product |
| Composition completeness | every active component represented and role-qualified | `incomplete_composition`; no complete DDI result |
| Ingredient fidelity | exact source names/forms/strength basis preserved | quarantine affected component |
| Canonical mapping | exact or approved deterministic crosswalk with version and provenance | `unmapped`/`ambiguous`; no provider request for component |
| Combination integrity | component count and deduplication reviewed; conflicts resolved | `incomplete_combination` |
| Provider mapping | accepted provider concept, release and coverage status | provider-specific unresolved/insufficient-coverage outcome |
| Freshness | source/review within approved lifecycle; changes processed | stale/not-ready |
| Clinical governance | qualified reviewer and audit trail for production mappings | development-only |

These gates distinguish product not found, source unavailable, incomplete product composition, unresolved ingredient, unsupported RxNorm concept, unresolved provider mapping, provider insufficient coverage, provider unavailable and no DDI assertion returned. None is a safety conclusion.

## 12. FYP/development recommendation

Proceed with **unmistakably synthetic Pakistan-context products only** for the product/composition contract, mapping-state workflow and deterministic combination expansion. Synthetic records must:

- use fictional product and ingredient identifiers/names;
- carry an explicit `synthetic_non_clinical` source and watermark;
- be blocked from production configuration and exports;
- contain no copied or invented real Pakistani medicine composition;
- exercise success, ambiguity, incomplete combination, unknown role, unsupported identity and stale-source states;
- never produce a clinical interaction or safety claim.

The already validated RxNorm CPC identity pipeline may remain independently demonstrable. Synthetic Pakistan product fixtures should not pretend to prove a real product-to-RxNorm mapping. This allows the architecture to be built without violating DRAP's stated purpose or a non-commercial/unknown license.

## 13. Production recommendation

Production is **not approved today**. The preferred practical sequence is:

1. obtain pharmacy data-owner authorization and assess the pharmacy's blank schema/data dictionary plus aggregate completeness metrics;
2. establish a pharmacist-governed, source-backed composition verification workflow for the actual stocked catalog;
3. seek a written DRAP data-sharing/bulk arrangement for national regulatory verification, or procure a contractually suitable commercial Pakistan feed;
4. validate the provider's schema, update/deletion semantics, versioning, corrections, Pakistan coverage and rights;
5. run mapping and coverage acceptance against an approved, pharmacist-curated validation set before enabling DDI preparation.

A local pharmacy master that passes all gates can support a controlled single-pharmacy deployment; it does not become a national drug registry. Scaling requires national-source rights and coverage evidence.

## 14. Weighted decision matrix

Weights are adjusted from a clinical DDI-source matrix because this decision concerns market-product identity. Ingredient fidelity and Pakistan coverage therefore receive more weight, while DDI clinical authority is out of scope. Ratings are qualitative; no total is calculated where legal or technical evidence is insufficient.

| Criterion | Weight |
|---|---:|
| Source/regulatory authority | 15% |
| Ingredient composition fidelity | 20% |
| Pakistan product coverage | 15% |
| Legal/commercial usability | 15% |
| Machine readability/integration | 10% |
| Updateability/change semantics | 10% |
| Traceability/versioning | 10% |
| Implementation practicality | 5% |

Legend: **High**, **Medium**, **Low**, **UNKNOWN**, or **N/A**. A high rating is not approval; any failed hard gate overrides the matrix.

| Candidate | Authority 15 | Fidelity 20 | Pakistan coverage 15 | Legal 15 | Machine 10 | Updates 10 | Provenance 10 | Practical 5 | Decision |
|---|---|---|---|---|---|---|---|---|---|
| DRAP public Registered Product Data | High at source; public copy provisional | Medium/UNKNOWN; fields exist but errors/omissions warned | High intended scope; completeness UNKNOWN | Low/blocked: restrictive purpose, all-rights-reserved, no reuse grant found | Low: interactive search only verified | UNKNOWN | Low/Medium: reference date, no reproducible release found | Low for lawful ingestion | Lookup/corroboration only after policy; no scraping/ingestion |
| Written DRAP bulk/data-sharing arrangement | High | UNKNOWN until schema/sample validation | Potentially High | Potentially High only if written terms pass | UNKNOWN | UNKNOWN; require SLA/change feed | UNKNOWN; require releases/checksums | Medium | Preferred national path; procurement required |
| Pharmacy-owned inventory/master | Medium operational; not regulator authority | UNKNOWN, potentially High after pharmacist verification | High for that pharmacy only | Medium/UNKNOWN pending ownership/contracts | Medium/High depending schema | Medium if operational governance exists | Low/Medium until provenance added | High locally | Preferred conditional single-pharmacy path |
| Structured pharmacist-maintained catalog | Medium clinical governance; not registry | Potentially High with source evidence/two-person review | Medium/local and labor-limited | UNKNOWN by underlying evidence rights | High if contract enforced | Low/Medium; manual burden | High if audit controls enforced | Medium/Low | Controlled fallback/gap handling only |
| DRAP Drug Pricing Index | High for stated price purpose | Low/N/A for composition | Medium/High for priced items; exact coverage UNKNOWN | UNKNOWN | Low/Medium interactive | UNKNOWN | Medium for effective date; no release archive found | Medium for separate pricing | Excluded from DDI identity |
| NEML 2025 | High for essential-medicines policy | Medium at generic-list level; not product composition evidence | Low for market-product coverage | UNKNOWN for dataset reuse | Low: PDF identified | Medium: dated editions | High at document/version level | Medium for coverage planning | Scope/validation aid only |
| DRAP SmPC collection | High per exact authorized document | Potentially High per document | UNKNOWN/incomplete as catalog | UNKNOWN | Low for bulk use | Medium; described as living documents | Medium if exact document/version retained | Low at scale | Corroborating evidence only |
| Commercial Pakistan product feed | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN; contract required | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | No verified candidate approved; procurement discovery |
| Original synthetic FYP catalog | N/A, explicitly non-clinical | N/A; tests structure only | N/A | High if wholly original | High | High/reproducible | High | High | Development architecture only; never production |

## 15. Licensing and procurement blockers

Production remains blocked until evidence resolves:

- DRAP permission or contract for automated access, storage, transformations, internal/commercial use, attribution, display and any redistribution;
- a documented bulk/API delivery mechanism, schema, stable identifiers, version/release, checksums, correction/deletion feed, rate/SLA and outage behavior;
- whether DRAP's public disclaimer applies to any proposed supplied dataset and what superseding written terms govern it;
- pharmacy ownership and vendor/distributor restrictions on the inventory/master data;
- completeness and fidelity of active composition, salts, strength basis and combination components in the pharmacy data;
- qualified pharmacist review ownership, maintenance cadence and audit retention;
- Pakistan coverage and product-status semantics for any commercial provider;
- full pricing, support, deployment territory and commercial-use terms for any commercial provider. Pricing is UNKNOWN unless supplied in a formal quote;
- rights for storing mappings and derived indexes after a provider contract ends;
- legal review in Pakistan. This document is not legal advice and makes no claim of regulatory approval.

## 16. Decision and exact next engineering step

### CONDITIONAL GO

The provider-neutral product-to-ingredient architecture and FYP work can proceed with synthetic-only records. Production cannot proceed from the public DRAP interface or an unaudited pharmacy inventory. The most practical production route is a pharmacy-authorized master with pharmacist-verified composition for the single-pharmacy catalog, augmented by a written DRAP bulk/data-sharing arrangement or a verified licensed Pakistan feed.

**Exact next engineering step allowed:** define and test a typed, provider-neutral `PakistanMedicineProduct` / `ProductActiveIngredient` input-and-mapping contract using only clearly marked synthetic fixtures, including all failure states and combination expansion rules above. Do not connect it to a real pharmacy export, DRAP page, DDI provider or production database. In parallel, procurement may request a blank pharmacy schema/data dictionary and written DRAP data-access terms; no medicine rows should be acquired under this decision.
