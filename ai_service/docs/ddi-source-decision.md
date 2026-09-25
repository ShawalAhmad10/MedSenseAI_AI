# Drug-Drug Interaction Knowledge-Source Decision

**Status:** Decision record

**Research checked:** 2026-08-30

**Decision:** **CONDITIONAL GO**

**Scope:** Selection of a source for ingredient-level drug-drug interaction (DDI) assertions. This decision does not authorize a DDI engine, dataset ingestion, clinical deployment, or interaction-record creation.

## Executive decision

MedSenseAI does not yet have a DDI source that is both clinically and legally approved for production. Public information supports a commercial procurement process, but it does not establish the precise licensed rights, Pakistan coverage, delivery schema, release provenance, service levels, or missing-result semantics required for a safety-sensitive pharmacy deployment.

For production, **FDB MedKnowledge Drug-Drug Interaction Module is the preferred lead procurement candidate**, with **Medi-Span Drug Therapy Monitoring System (DTMS) as the required comparator**. Micromedex remains a clinically strong alternative if Merative can license a structured embedded feed or API with adequate identifiers and auditability. DrugBank must not be used in production unless a mutually executed subscriber order expressly permits the intended safety-critical DDI application, stored derivative records, and deployment territory.

For a non-clinical FYP demonstration, **DDInter 2.0 may be considered only after written confirmation that the university/project use is non-commercial and complies with CC BY-NC-SA 4.0**. It must be isolated behind the same provider interface, visibly labelled research/demo-only, and never used for patient care or pharmacy operations. If that confirmation is not obtained, no real DDI knowledge source should be loaded for the FYP.

This is therefore a **CONDITIONAL GO** for provider-neutral architecture and procurement work only. It is not a go for production DDI ingestion or clinical interaction checking.

## 1. DDI requirements

### 1.1 Clinical and data requirements

A production provider must satisfy all of the following:

1. Curated for medication-safety or pharmacy clinical decision support, with a documented editorial process.
2. Structured ingredient-to-ingredient or otherwise deterministically resolvable interaction assertions. Narrative label text alone is insufficient.
3. Stable provider identifiers and a supported route from RxNorm ingredient concepts to provider concepts.
4. Provider-native classification preserved without inventing a universal severity scale.
5. Clinical description, management/effect information, evidence characterization, and references where supplied by the provider.
6. Reproducible releases or API content versions, update history, and a way to identify exactly what knowledge was queried.
7. Explicit coverage semantics. An empty result must not be treated as proof of safety.
8. Availability, error, and mapping states distinguishable from a valid query that returned no assertion.
9. Rights to use the data in a commercial, safety-sensitive pharmacy system in the licensed territories, including Pakistan.
10. Contractual clarity for caching, derived records, audit retention, backups, display, attribution, and any redistribution to pharmacy customers.

### 1.2 Production acceptance gates

No provider may be approved for production until procurement, legal, clinical, and technical reviewers have verified in writing:

- safety-critical clinical-decision-support use is permitted;
- commercial use and the intended deployment model are permitted;
- Pakistan is an allowed territory and the provider describes applicable coverage;
- the licensed delivery mechanism is machine-readable and suitable for deterministic processing;
- provider identifiers, RxNorm crosswalk terms, and mapping refreshes are included;
- interaction records may be stored with the required provenance, retention, backup, and audit history;
- source text, classifications, references, and attribution may be displayed to authorized users;
- permitted and prohibited redistribution are explicit;
- release/version, corrections, update cadence, and end-of-life processes are documented;
- API rate limits, uptime/service levels, support, outage behavior, and bulk reconciliation are acceptable;
- the provider defines query and empty-result semantics sufficiently to implement fail-closed behavior;
- a Pakistan-focused pharmacist review and validation study passes before clinical release.

Pricing for the commercial candidates below is not publicly stated in the reviewed official material. It must be obtained from sales. No price estimate is inferred in this document.

## 2. Candidate evaluation

`UNKNOWN` means that the reviewed official public information did not establish the fact. It must not be interpreted as absent, permitted, or prohibited.

### 2.1 FDB MedKnowledge Drug-Drug Interaction Module

- **Provider / official source:** First Databank, Inc. (FDB), [MedKnowledge](https://www.fdbhealth.com/solutions/medknowledge-drug-database), [Drug-Drug Interaction Module](https://www.fdbhealth.com/solutions/medknowledge-drug-database/medknowledge-clinical-modules/drug-drug-interaction), [integration options](https://www.fdbhealth.com/solutions/medknowledge-drug-database/integration-options), [MedKnowledge Explorer](https://www.fdbhealth.com/solutions/fdb-medknowledge-explorer), and [Interoperability Module datasheet](https://www.fdbhealth.com/-/media/documents/form-not-required/us/datasheets/datasheet---interoperability-module.ashx).
- **Clinical purpose and DDI:** Embedded medication decision support for healthcare information systems. The DDI module describes prescription, OTC, alternative-therapy, and some inactive-ingredient screening. It provides three severity levels and subcategories, including a conflicting-evidence category.
- **Access:** Direct database programming, developer software, and web API are advertised. The exact licensed tables, API schema, pair granularity, response codes, and query semantics are not public: **UNKNOWN**.
- **Identifiers / RxNorm:** FDB uses proprietary medication and clinical-formulation identifiers. Its separately licensed Interoperability Module cross-references FDB vocabulary concepts with RxNorm. The exact mapping level needed for ingredient-only DDI screening and its contract terms require validation.
- **Interaction structure:** Structured DDI content is clearly offered, but the exact endpoint-pair representation and whether all assertions resolve to ingredient pairs are **UNKNOWN** from public documentation.
- **Classification / evidence:** Source-native severity, evidence type such as animal study or human clinical trial, coded sections, professional monographs, primary-literature references, and government-approved prescribing information are advertised.
- **Version and updates:** FDB advertises continuously maintained content and standard weekly or monthly configurations; its Explorer describes weekly automatic updates between monthly releases. Whether every DDI assertion exposes an immutable release ID, change type, effective date, and withdrawal history is **UNKNOWN**.
- **Commercial position:** This is a commercial product designed for embedded healthcare workflows. Pricing requires sales contact. Exact clinical-use, storage, derived-record, attribution, territory, redistribution, and Pakistan rights are **UNKNOWN until contract**.
- **Global / Pakistan applicability:** The main MedKnowledge page describes strong US/Canada use, and FDB states that other regional solutions exist. Pakistan-specific product and DDI coverage are **UNKNOWN**.
- **Implementation difficulty:** Medium if the licensed crosswalk and schema are supplied; otherwise high.
- **Major technical risks:** Proprietary identifiers; optional crosswalk dependency; unknown empty-result/coverage semantics; unknown reproducible assertion-level version metadata; possible US/Canada product assumptions.
- **Major licensing risks:** Licensed module and crosswalk scope, derived-data retention, customer display, redistribution, post-termination audit retention, and Pakistan territory must be negotiated.
- **Production position:** **Preferred lead candidate, conditional on all production gates.**

### 2.2 Medi-Span Drug Therapy Monitoring System (DTMS)

- **Provider / official source:** Wolters Kluwer, [Medi-Span content sets](https://www.wolterskluwer.com/en/solutions/medi-span/medi-span/content-sets), [available APIs](https://www.wolterskluwer.com/en/solutions/medi-span/medi-span-around-the-world/available-apis), and [content and editorial process](https://www.wolterskluwer.com/en/solutions/medi-span/about/content-and-editorial-process).
- **Clinical purpose and DDI:** DTMS is intended for prescribers and pharmacists and covers drug-drug, drug-food, and drug-alcohol screening. Official material describes route- and ingredient-specific results, severity, management, onset, contraindication/avoidance information, and documentation quality/quantity.
- **Access:** APIs, web services, and locally stored datasets/flat files are advertised across Medi-Span offerings. The exact DTMS schema and pair response contract require authenticated developer documentation and a licensed evaluation.
- **Identifiers / RxNorm:** Medi-Span uses proprietary identifiers including GPI, Drug Descriptor ID, and Drug Name ID. An official RxNorm Cross-Reference File maps these concepts to RxNorm. Contracted ingredient-level coverage and update synchronization must be confirmed.
- **Interaction structure:** The service is described as ingredient- and route-specific, but the exact pair representation, group expansion, directionality, and assertion identity are **UNKNOWN** publicly.
- **Classification / evidence:** Severity, supporting documentation, management, onset, route/schedule context, professional and patient monographs, comment text, and citations are advertised.
- **Version and updates:** The provider describes daily literature surveillance, ongoing label and literature monitoring, clinical quality control, and prompt updates. Immutable DDI release identifiers, correction feeds, and assertion-level history are **UNKNOWN**.
- **Commercial position:** Commercially licensed embedded drug data. Pricing requires contact with an expert; public pricing was not found. Storage, display, redistribution, territory, and audit-retention rights remain **UNKNOWN until contract**.
- **Global / Pakistan applicability:** Medi-Span advertises multinational APIs and regional identifiers/practice standards. Pakistan is not specifically established in the reviewed public country information: **UNKNOWN**.
- **Implementation difficulty:** Medium with DTMS schema and RxNorm Cross-Reference File; high without them.
- **Major technical risks:** Proprietary hierarchy, context-dependent screening behavior, unknown empty-result semantics, and unknown Pakistan concept coverage.
- **Major licensing risks:** Separate content/crosswalk entitlements, territorial use, caching and derivative records, customer access, redistribution, and post-termination retention.
- **Production position:** **Required commercial comparator; potentially equal to FDB after contract and technical validation.** Its explicit RxNorm cross-reference is a particular integration strength.

### 2.3 Micromedex

- **Provider / official source:** Merative, [Micromedex product information](https://www.merative.com/clinical-decision-support/micromedex), [Drug Interactions Policy](https://www.merative.com/content/dam/merative/training/micromedex/Micromedex%20Drug%20Interactions%20Policy.pdf), and [Service Description](https://www.merative.com/content/dam/merative/terms/offering/service/Micromedex_Service_Description.pdf).
- **Clinical purpose and DDI:** Point-of-care clinical decision support for hospitals and retail pharmacy, used in more than 80 countries according to Merative. The editorial policy applies clinically actionable evidence criteria and explicitly excludes several weak or non-clinically-relevant categories.
- **Access:** Desktop, mobile, EHR integration, and database components for integration into client applications are described. A public DDI API/data schema suitable for this architecture was not found: **UNKNOWN**.
- **Identifiers / RxNorm:** The proprietary drug vocabulary, stable interaction identifiers, and an ingredient-level RxNorm crosswalk are **UNKNOWN** in the reviewed public material.
- **Interaction structure:** Drug interaction checking is available, but a machine-readable ingredient-pair schema, directionality, and group expansion rules are **UNKNOWN**.
- **Classification / evidence:** Severity, onset, documentation, interaction effect, clinical management, probable mechanism, and literature reports are documented.
- **Version and updates:** Merative states that content is curated from primary literature with inline references and daily updates. Immutable database/API releases, correction events, and assertion-level effective versions are **UNKNOWN**.
- **Commercial position:** Subscription/commercial offering; pricing requires contact. Exact embedded rights, caching, derived records, attribution, redistribution, Pakistan territory, and post-termination retention are **UNKNOWN until contract**.
- **Global / Pakistan applicability:** Global use and international drug-name resources are advertised; Pakistan-specific coverage and deployment rights are **UNKNOWN**.
- **Implementation difficulty:** Potentially high until Merative confirms a structured delivery option, mapping support, and response semantics rather than only a human-facing checker or EHR link.
- **Major technical risks:** Publicly unverifiable schema and RxNorm mapping; possible coupling to a hosted interactive product; unknown empty-result and coverage semantics.
- **Major licensing risks:** Product subscription may not include embedding or storing DDI assertions. Contract scope and territory require procurement review.
- **Production position:** **Clinically strong alternative, not technically or legally approved from public information.**

### 2.4 DrugBank

- **Provider / official source:** OMx Personal Health Analytics Inc. d/b/a DrugBank, [Clinical API documentation](https://docs.drugbank.com/v1/), [implementation guide](https://dev.drugbank.com/guides/implementation/medication_search), [terms](https://trust.drugbank.com/drugbank-trust-center/terms-of-use), and [release page](https://go.drugbank.com/releases/latest).
- **Clinical purpose and DDI:** Drug knowledgebase and clinical API with structured drug and product data, including DDI endpoints.
- **Access:** Authenticated REST API returns JSON. Licensed datasets may also be delivered in structured formats. The API documents product-interaction objects containing ingredient DrugBank IDs, descriptions, action, severity, evidence level, and management fields.
- **Identifiers / RxNorm:** Stable DrugBank IDs and product-concept IDs. The API supports lookup by RxCUI and returns RxNorm concepts and ingredient DrugBank IDs.
- **Interaction structure:** Structured pair assertions are supported. The exact semantics of an empty list as distinct from out-of-coverage or unresolved inputs must be contract-tested.
- **Classification / evidence:** Major/moderate/minor severity, action, description/extended description, evidence level, management, and optional references are documented.
- **Version and updates:** API v1 is current and versioned for backward compatibility. The public academic release page identifies version 5.1.22 released 2026-06-27. Whether API responses expose the exact content release used for an assertion is **UNKNOWN**.
- **Commercial position:** Commercial use requires a commercial license and sales contact; pricing is not public. The default terms limit use to non-clinical research and prohibit safety-critical applications and creation of another DDI database unless specifically permitted in a mutually executed subscriber order. Proper citation and a license are required for use or redistribution.
- **Global / Pakistan applicability:** API product results are filtered by regions allowed in the license; public documentation lists US, Canada, and EU base regions. Pakistan coverage and rights are **UNKNOWN**.
- **Implementation difficulty:** Low-to-medium technically because RxCUI lookup and JSON DDI structures are documented; high contract risk.
- **Major technical risks:** Product-region filtering, uncertain assertion content-version visibility, and unknown negative/coverage semantics.
- **Major licensing risks:** The ordinary terms conflict directly with the intended safety-critical use and stored DDI database unless the subscriber order expressly overrides them. Academic downloads were shown as temporarily paused at the time of review.
- **Production position:** **Blocked unless an executed subscriber order expressly authorizes this exact use.** Technical convenience does not overcome the legal gate.

### 2.5 DDInter 2.0

- **Provider / official source:** Computational Biology & Drug Design Group with academic and hospital collaborators, [DDInter 2.0](https://ddinter2.scbdd.com/), [download page](https://ddinter2.scbdd.com/download/), [terms](https://ddinter2.scbdd.com/terms/), and the provider-authored [DDInter 2.0 publication indexed by NLM](https://pubmed.ncbi.nlm.nih.gov/39180399/).
- **Clinical purpose and DDI:** Curated research database of drug interactions. The publication reports 2,310 drugs and 302,516 DDI records, with mechanism descriptions and management recommendations.
- **Access:** Downloadable CSV files partitioned by ATC category and a human-facing website. A supported production API, schema stability policy, and service-level commitment were not found.
- **Identifiers / RxNorm:** Proprietary DDInter IDs with links to external databases such as DrugBank, ChEBI, PubChem, and KEGG. A native RxNorm crosswalk was not verified. RxNorm mapping would therefore require a separately validated deterministic crosswalk.
- **Interaction structure:** Pair records with severity and descriptive data are available. Exact CSV schema versioning, pair directionality, group expansion, and deletion semantics require inspection only after use is authorized.
- **Classification / evidence:** Severity/risk level, mechanism, detail, management, and references are described.
- **Version and updates:** The product is labelled 2.0, but the download page does not publish a dated release manifest, checksum, update cadence, or correction/deletion feed: **UNKNOWN**.
- **Commercial position:** Data is CC BY-NC-SA 4.0 and the terms allow personal, non-commercial, informational, or scholarly use. Attribution and share-alike apply. Commercial pharmacy use is not permitted under those public terms. Separate commercial licensing availability and pricing are **UNKNOWN**.
- **Global / Pakistan applicability:** Ingredient-level data may cover ingredients sold in Pakistan, but Pakistan market validation and coverage are **UNKNOWN**.
- **Implementation difficulty:** Medium for a research adapter; mapping and reproducible release controls require additional work.
- **Major technical risks:** Limited drug count relative to commercial products, incomplete mapping, no verified release manifest, no service level, and uncertain coverage boundaries.
- **Major licensing risks:** Non-commercial and share-alike obligations. The official disclaimer states the database is incomplete, may contain errors, and that absence of an interaction does not mean none exists.
- **Production position:** **No.**
- **FYP position:** **Conditional research/demo candidate only after written institutional confirmation of non-commercial compliance.**

### 2.6 KEGG DRUG / KEGG DDI

- **Provider / official source:** Kanehisa Laboratories / KEGG, [KEGG DRUG](https://www.kegg.jp/kegg/drug/), [DDI API manual](https://www.kegg.jp/kegg/rest/keggapi.html), [API terms](https://www.kegg.jp/kegg/rest/), [FTP/update information](https://www.kegg.jp/kegg/download/), and [legal terms](https://www.kegg.jp/kegg/legal.html).
- **Clinical purpose and DDI:** KEGG DRUG integrates approved-drug and molecular knowledge. The DDI API standardizes contraindication (`CI`) and precaution (`P`) interactions extracted from Japanese drug labels to KEGG identifiers, with possible molecular-mechanism annotation. The English checker also links US product information, but the API's documented DDI assertions are Japanese-label-derived.
- **Access:** Structured REST API and licensed weekly FTP distribution. The public API is restricted to academic use by academic users and rate-limited.
- **Identifiers / RxNorm:** KEGG D numbers, with NDC/YJ input support and ATC/JTC links. A direct official RxNorm crosswalk was not established.
- **Interaction structure:** The API can return all known interactions for one entry or check pairs within a set. `CI`/`P` are source-native label classifications, not a universal severity scale.
- **Classification / evidence:** Contraindication/precaution and possible mechanism are available. Clinical management narratives and evidence grading comparable to commercial systems are not established.
- **Version and updates:** FTP is described as weekly updated; the API manual and KEGG DRUG pages carry update dates. Immutable DDI release packages/checksums and deletion history require the licensed delivery terms.
- **Commercial position:** KEGG states that it is not a public database and non-academic use requires a commercial license. Academic service provision may also require an academic service-provider license. Pricing requires the licensing provider; public pricing was not verified.
- **Global / Pakistan applicability:** DDI scope is strongly tied to Japanese label contraindications/precautions; direct Pakistan applicability and RxNorm mapping are weak.
- **Implementation difficulty:** Medium technically, high mapping/localization work.
- **Major technical risks:** Japanese-label scope, no direct RxNorm crosswalk verified, limited classification semantics, and unclear negative/coverage semantics.
- **Major licensing risks:** Academic API restrictions and separate commercial licensing; some Japanese label content has additional restrictions and download prohibitions.
- **Production position:** **Not preferred.** Consider only if a commercial contract and a clinical scope analysis establish value as a supplementary source; it is not a substitute for a broad production pharmacy DDI source.

### 2.7 DailyMed and openFDA

- **Provider / official source:** US National Library of Medicine and US Food and Drug Administration, [DailyMed label downloads](https://www.dailymed.nlm.nih.gov/dailymed/spl-resources-all-drug-labels.cfm), [DailyMed RxNorm mapping files](https://www.dailymed.nlm.nih.gov/dailymed/spl-resources-all-mapping-files.cfm), [openFDA drug-label API](https://open.fda.gov/apis/drug/label/), and [openFDA data licensing](https://open.fda.gov/license/).
- **What they provide:** Structured Product Labeling (SPL) documents, label sections, Set IDs, machine-readable JSON/XML, daily/weekly/monthly or full releases, checksums, and SPL-to-RxNorm mappings.
- **Licensing:** openFDA states its material is generally public domain under CC0 and may be used commercially, subject to service terms and stated exceptions. This legal openness does not make it a normalized clinical DDI knowledgebase.
- **Why not primary DDI:** Drug-interaction information is narrative, product-label-specific, variable in structure and coverage, and lacks a consistent ingredient-pair assertion model and source-native cross-product severity taxonomy. openFDA explicitly says not to rely on it for medical-care decisions and says reformatted label content has not been verified by FDA. An empty label section or query result has no safe negative meaning.
- **Position:** **Supplementary traceable label evidence only, never the primary DDI provider.** Do not use an LLM to convert narrative labels into authoritative DDI assertions.

### 2.8 DrugCentral

- **Provider / official source:** University of New Mexico Translational Informatics Division, [DrugCentral](https://drugcentral.org/) and [download page](https://drugcentral.org/download).
- **What it provides:** Active ingredients, products, approvals, indications, mechanisms, structures, identifiers, and drug-target interaction data. The currently listed database dump is dated 2023-11-01.
- **Why not primary DDI:** The official download page documents drug-target interactions, not a clinically curated ingredient-pair DDI assertion feed with severity and management information. Exact redistribution terms for a MedSenseAI use would still require review.
- **Position:** **Not a primary DDI candidate.** It may have identity/research value, but it does not fill this requirement.

### 2.9 RxNorm / NLM interaction resources

- **Provider / official source:** US National Library of Medicine, [RxNav FAQ](https://lhncbc.nlm.nih.gov/RxNav/information/FAQs.html).
- **Position:** RxNorm remains MedSenseAI's identity and normalization backbone. It is not a current DDI source. NLM states that RxNav drug-drug interaction features were discontinued on 2024-01-02.

## 3. Weighted decision matrix

The requested weights are retained because the priorities are appropriate for a safety-sensitive commercial pharmacy system. No numeric total is produced: material contract, schema, response-semantic, and Pakistan facts remain unknown, and converting those unknowns into numbers would create false precision.

**Evidence grades:** `Strong` = official public evidence substantially satisfies the category; `Moderate` = useful evidence with material gaps; `Weak` = significant mismatch; `Blocked` = known restriction conflicts with production use; `UNKNOWN` = evidence is insufficient; `N/A` = not a primary DDI source.

| Candidate | Clinical authority 25% | Commercial suitability 20% | Structured integration 15% | Traceability/versioning 10% | RxNorm/mapping 10% | Coverage 10% | Pakistan 5% | Practicality 5% | Weighted conclusion |
|---|---|---|---|---|---|---|---|---|---|
| FDB MedKnowledge DDI | Strong | Moderate; commercial product, rights UNKNOWN until contract | Strong | Moderate | Strong with Interoperability Module | Strong for stated US/Canada scope; other regions UNKNOWN | UNKNOWN | Moderate | Preferred lead for procurement; no production approval yet |
| Medi-Span DTMS | Strong | Moderate; licensed product, rights UNKNOWN until contract | Strong | Moderate | Strong with RxNorm Cross-Reference File | Strong global positioning; country scope UNKNOWN | UNKNOWN | Moderate | Required comparator; may equal or exceed FDB after validation |
| Micromedex | Strong | Moderate; subscription/embedding rights UNKNOWN | Moderate/UNKNOWN | Moderate | UNKNOWN | Strong global positioning | UNKNOWN | Weak/UNKNOWN until structured delivery is shown | Clinical shortlist, technical/legal evidence incomplete |
| DrugBank | Moderate | **Blocked under default terms unless subscriber order expressly permits use** | Strong | Strong for public releases; API content release UNKNOWN | Strong | Moderate; licensed region filtering | UNKNOWN | Moderate technically | Contract-sensitive alternative, not currently approvable |
| DDInter 2.0 | Moderate for research; disclaimer limits reliance | **Blocked for commercial production** | Moderate | Weak | Weak/indirect | Moderate research coverage; explicitly incomplete | UNKNOWN | Moderate for FYP | FYP-only, conditional on non-commercial compliance |
| KEGG DDI | Moderate for its label-derived scope | Weak/UNKNOWN; commercial license required | Strong API | Moderate | Weak | Weak for broad global pharmacy DDI | Weak | Moderate | Not preferred; scope and licensing mismatch |
| DailyMed/openFDA | N/A as pair-level DDI | Strongly reusable data, but not clinically sufficient | Strong for labels; weak for DDI pairs | Strong | Strong for SPL mapping | US label scope only | Weak | Weak for normalized DDI | Supplementary evidence only |
| DrugCentral | N/A as production DDI | UNKNOWN | N/A for clinical DDI | Weak/current dump dated 2023 | Moderate identity links | N/A | UNKNOWN | N/A | Reject as primary DDI source |
| RxNorm/RxNav | N/A; DDI discontinued | N/A | Strong for identity only | Strong for identity releases | Native identity layer | N/A | Strong as global ingredient vocabulary, not DDI | Strong for identity only | Keep as identity layer; cannot supply DDI assertions |

### Matrix interpretation

Clinical authority carries the highest weight, so DDInter's convenient research downloads and openFDA's legal openness cannot compensate for their production clinical limitations. Commercial suitability is the second-largest category and remains a hard gate: the commercial products cannot be approved from marketing pages alone, and DrugBank's default terms create an explicit conflict. FDB and Medi-Span reach the procurement shortlist because they combine clinical decision-support purpose with embedded structured delivery and mapping options. Neither wins final production approval until the unknowns are resolved by contract and evaluation data.

## 4. Production / real-pharmacy recommendation

### Recommendation

Run a competitive procurement and technical validation led by **FDB MedKnowledge DDI Module**, with **Medi-Span DTMS as a mandatory comparator** and Micromedex invited only if Merative offers a structured embedded product meeting the same contract. FDB is the provisional lead because its official material directly describes embedded pharmacy/HIT integration, source-native severity and evidence categories, referenced professional monographs, structured delivery options, and an RxNorm interoperability module.

Medi-Span could become the final selection if its contract and evaluation package provide better ingredient mapping, Pakistan/global coverage, release provenance, response semantics, licensing rights, or total operating fit. The documentation does not prejudge that procurement result.

### Production approval status

**No provider is currently approved.** A source cannot be selected for clinical production without procurement, legal review, a clinical-content review, a licensed sample/schema, and Pakistan validation. This document does not claim regulatory approval or clinical equivalence among vendors.

## 5. FYP / development recommendation

Use **DDInter 2.0 only as an isolated, non-clinical research/demo provider**, and only if the university or project owner documents that:

- the use is genuinely non-commercial and scholarly;
- it is not primarily for a commercial third party;
- CC BY-NC-SA 4.0 attribution and share-alike obligations are understood and satisfied;
- no patient-care, dispensing, prescribing, or operational pharmacy decision relies on it;
- the interface and output visibly state that the knowledge is incomplete and not production clinical data;
- the project can remove the DDInter adapter and data cleanly before any commercial or pharmacy deployment.

The FYP must not market DDInter-backed results as production-safe. If the project is already being used for commercial product development in a way that makes the non-commercial license uncertain, obtain written permission from the provider or do not load DDInter. DrugBank academic data is not a safer default: its current terms permit only non-clinical research and prohibit safety-critical use, while academic downloads were temporarily paused when checked.

## 6. Provider-neutral architecture recommendation

Adopt the proposed provider-neutral architecture:

```text
RxNorm CPC identity
        ↓
canonical MedSenseAI ingredient
        ↓
versioned provider mapping
        ↓
licensed DDI provider adapter
        ↓
source-preserved interaction assertion
```

This separation is required, not optional. Provider identifiers, classifications, evidence fields, coverage models, licensing controls, and update behavior differ materially. Coupling the eventual engine or database directly to FDB, Medi-Span, Micromedex, DDInter, or DrugBank would make safe vendor replacement and source comparison unnecessarily difficult.

The provider interface should define typed data contracts without defining clinical inference. At minimum, it must carry:

- canonical MedSenseAI ingredient identifiers and RxCUIs;
- provider namespace, provider concept IDs, mapping status, mapping method, mapping version, and reviewer/audit fields;
- provider assertion ID or other stable source locator;
- provider release/content version and retrieval/import timestamps;
- exact source-native classification code and label;
- source-preserved description, effect, management, evidence category, and citations when licensed;
- endpoint directionality, route/form/context restrictions, and group expansion provenance;
- license/territory policy metadata needed to prevent unlicensed use;
- explicit query outcome and provider availability/coverage states.

MedSenseAI must not create a universal severity scale during ingestion. Any later cross-provider normalization is a separately governed clinical feature and must retain the original classification alongside it.

## 7. RxNorm mapping strategy

1. Keep the validated RxNorm CPC release as the canonical identity source. Do not make a vendor ID the MedSenseAI primary ingredient identity.
2. Map only supported canonical ingredient concepts, beginning with RxNorm `IN` and handling `PIN`, salts, esters, hydrates, biologics, and precise ingredients explicitly. Never silently collapse them merely because names look similar.
3. Prefer the provider's licensed RxNorm crosswalk, tied to a specific provider and RxNorm release. FDB's Interoperability Module and Medi-Span's RxNorm Cross-Reference File are procurement requirements, not assumed entitlements.
4. Store mappings as versioned, auditable relationships: canonical ingredient ID, RxCUI, provider namespace/ID, provider release, RxNorm release, exact/related match type, mapping status, method, timestamps, and reviewer where manual review was needed.
5. Allow deterministic mapping through another stable identifier only when both crosswalks are licensed, reproducible, and versioned. Name-only fuzzy matching must never auto-approve a safety-critical mapping.
6. Preserve provider group or class assertions as provider-native structures. If a provider expands a class to ingredients, retain the group ID, expansion release, and expansion provenance; do not silently manufacture pairs.
7. Treat combination products as sets of verified active ingredients for query preparation, while preserving any provider-specific formulation, route, strength, or combination context.
8. Reconcile every mapping after either the RxNorm CPC release or provider release changes. Retired, split, merged, ambiguous, and unmatched concepts must become explicit unresolved states.

## 8. Pakistan-market implications

### What is globally separable

Core pharmacologic ingredient-to-ingredient knowledge is reasonably separable from local brand catalogs. A Pakistani brand can be resolved to verified active ingredients, those ingredients can map to canonical RxNorm concepts, and the canonical ingredients can then map to a global DDI provider. This supports the provider-neutral design.

That separation is not proof that every global assertion applies identically. Route, dosage form, dose, salt/ester, formulation, label policy, patient population, locally used combinations, and evidence/editorial standards may affect an alert's interpretation. Provider coverage must be measured against the Pakistani formulary rather than assumed from a “global” marketing statement.

### Pakistan-specific validation still required

- Build or license a lawful, verified local product-to-active-ingredient catalog.
- Clinically review salt/ester and precise-ingredient mappings, fixed-dose combinations, routes, strengths, biologics, insulin products, vaccines, OTC products, herbal/traditional products, and local spelling/transliteration variants.
- Measure the percentage of in-scope Pakistani active ingredients that map exactly to the provider and report unresolved/unsupported categories.
- Have Pakistan-licensed pharmacy/clinical reviewers assess a governed validation set, alert relevance, classification interpretation, and expected workflow behavior.
- Confirm the vendor contract permits Pakistan deployment, local customer access, data residency/hosting choices, caching, audit retention, and disaster-recovery copies.
- Validate locally required language, patient-facing wording, escalation, pharmacist override/review, and incident-correction workflows.

### What DRAP does and does not solve

DRAP's [registered drug database description](https://www.dra.gov.pk/news_updates/regulatory_updates/updated-database-of-pharmaceutical-and-biological-drug-product/) identifies brand/proprietary name, dosage form, composition/active ingredients, registration information, authorization holder, and manufacturer. That is relevant to local product identity and market authorization.

DRAP does **not** provide a structured, clinically curated ingredient-pair DDI knowledgebase with severity, evidence, management, and interaction provenance. Its current [public registry disclaimer](https://eapp.dra.gov.pk/WebProductIndex.php) describes the list as provisional, warns of errors/omissions, and says it cannot be used as a reference for research, citation, or statistical analysis. MedSenseAI must not scrape or repurpose that interface. A production product catalog requires an authorized data path or written agreement and independent validation.

Nothing in this decision constitutes DRAP or any other regulatory approval.

## 9. Missing-data semantics

The eventual provider boundary must return a typed outcome, never a bare Boolean and never an empty array with implied safety:

| Outcome | Required meaning | Safety behavior |
|---|---|---|
| `interaction_found` | Both inputs resolved, provider query completed, and one or more source assertions were returned | Display/source the assertions under later approved clinical logic |
| `no_assertion_available` | Both inputs resolved and an in-scope provider query completed, but the provider returned no assertion | **Unknown, not safe**; preserve provider, release, query, and coverage context |
| `unresolved_drug` | One or both canonical ingredients did not map unambiguously to the provider | Fail closed; no interaction conclusion |
| `provider_unavailable` | Timeout, authentication, rate limit, outage, corrupt release, or other access failure | Fail closed; no interaction conclusion |
| `insufficient_data` | Provider does not cover the ingredient, interaction type, territory, route, product class, or other required domain—or coverage cannot be established | Fail closed; no interaction conclusion |

An adapter may emit `no_assertion_available` only if the provider contract and tested response semantics establish that both concepts were valid, the query executed successfully, and the requested domain was covered. Otherwise it must emit `unresolved_drug`, `provider_unavailable`, or `insufficient_data`. These names align with the existing domain assessment vocabulary except for the newly explicit provider-availability outcome; this task does not authorize changing that model.

### Candidate semantics assessment

- **FDB, Medi-Span, Micromedex:** Public material does not document sufficient machine-level empty-result and coverage semantics. **UNKNOWN; mandatory contract and conformance-test item.**
- **DrugBank:** HTTP errors and structured responses are documented, but an empty DDI collection versus licensed-region/coverage absence is not sufficiently established for this safety boundary. **UNKNOWN; mandatory contract test.**
- **DDInter:** The provider expressly states that absence of an interaction does not mean none exists. It supports the required distinction conceptually but cannot provide a safe negative conclusion.
- **KEGG:** The API returns known `CI`/`P` label-derived interactions, but no returned interaction cannot establish absence outside that source scope.
- **DailyMed/openFDA:** Missing sections and empty searches have no normalized DDI negative meaning. The APIs are unsuitable for production DDI negatives.
- **DrugCentral and RxNorm:** They are not DDI providers, so a missing DDI result is not meaningful.

Coverage metrics must be reported separately from query results: mapping coverage, provider-domain coverage, release freshness, unresolved concepts, provider availability, and assertion-return rate. None is a safety rate.

## 10. Licensing and procurement blockers

The following blockers prevent production approval today:

1. No executed commercial DDI license for MedSenseAI.
2. No written permission for safety-critical pharmacy use in Pakistan.
3. No verified rights for storing source-preserved assertions, descriptions, classifications, evidence, references, mapping data, and release history.
4. No verified rights for customer display, multi-tenant use, backups, disaster recovery, audit exports, derived indexes, or post-termination retention.
5. No verified redistribution and attribution terms.
6. No provider price quote or total-cost model; all serious commercial candidates require sales contact.
7. No licensed sample schema and no conformance evidence for pair structure, identifiers, source-native severity, references, deletions/corrections, and group expansion.
8. No contractual or tested semantics for empty results, out-of-coverage ingredients, invalid mappings, outages, and partial responses.
9. No measured coverage against a lawful Pakistani formulary and no Pakistan pharmacist validation.
10. No documented release pinning/checksum or equivalent content-version mechanism that has passed MedSenseAI reproducibility requirements.
11. For DrugBank, default terms prohibit the intended safety-critical/DDI-database use unless a subscriber order specifically permits it.
12. For DDInter, public terms are non-commercial/share-alike and the source expressly disclaims completeness; it cannot be used for production.
13. For KEGG, academic API access does not authorize non-academic/commercial use, and DDI scope is primarily Japanese-label-derived.
14. DRAP's public registry cannot be treated as an authorized reusable product feed under its current disclaimer.

## 11. GO / CONDITIONAL GO / NO-GO decision

**CONDITIONAL GO**

Provider-neutral architecture specification, procurement, legal review, and licensed vendor evaluation may proceed. A carefully isolated, visibly non-clinical DDInter FYP adapter may proceed only after the non-commercial license conditions are documented as satisfied.

Production DDI ingestion, interaction-record creation, an interaction engine, patient/pharmacy use, and any claim that “no result” means safe remain **NO-GO** until one commercial provider passes every production acceptance gate.

This gate is conditional rather than full GO because the leading commercial sources appear clinically and technically plausible but their critical rights and semantics are not public. It is conditional rather than full NO-GO because the provider-independent contract, procurement evidence, and non-clinical architecture can be developed safely without creating clinical interaction knowledge.

## 12. Exact next engineering step permitted

Create a **documentation-only provider contract and procurement acceptance specification**—no adapter, dataset, interaction record, or engine. It should define:

- typed provider mapping and query-outcome schemas;
- the five missing-data states in section 9;
- required assertion provenance and source-native fields;
- release/version and correction semantics;
- a vendor questionnaire for FDB, Medi-Span, and Micromedex;
- DrugBank subscriber-order questions if it remains under consideration;
- licensing, territory, retention, attribution, redistribution, service-level, and termination questions;
- a Pakistan formulary-coverage measurement protocol and pharmacist validation plan;
- objective pass/fail procurement gates and a licensed-sample conformance-test plan.

Do not download or ingest any DDI data and do not implement the DDI engine until that specification is reviewed and a provider contract authorizes the intended use.
