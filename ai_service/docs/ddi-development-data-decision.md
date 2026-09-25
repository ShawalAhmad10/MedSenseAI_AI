# DDI development-data decision

**Decision:** CONDITIONAL GO

**Recommended development source:** DDInter 2.0, only after written authorization for the exact MedSenseAI FYP use

**Production status:** Not authorized

**Evidence checked:** 2026-08-30

This is a technical and licensing risk decision, not legal advice and not a clinical validation. It does not authorize a dataset download, ingestion, a real provider adapter, interaction records, a hosted checker, or pharmacy use. Until the conditions in this document are satisfied, MedSenseAI must continue to use only its synthetic DDI provider.

## 1. Evaluated sources

| Source | Official evidence | Development-data assessment |
|---|---|---|
| **DDInter 2.0** | [Official site](https://ddinter2.scbdd.com/), [terms](https://ddinter2.scbdd.com/terms/), [downloads](https://ddinter2.scbdd.com/download/), and [peer-reviewed DDInter 2.0 paper](https://doi.org/10.1093/nar/gkae726) | Best candidate. It offers downloadable CSV partitions, curated interaction pairs, source-native risk/mechanism information, descriptions, management guidance, and references. Its CC BY-NC-SA 4.0 license excludes commercial use, and the exact MedSenseAI use requires confirmation because the project may later become commercial. The downloadable schema and complete downloadable coverage are not documented sufficiently to pass the provider acceptance gate without inspection. |
| **DrugBank** | [Academic access](https://go.drugbank.com/academic_research), [current terms](https://trust.drugbank.com/drugbank-trust-center/terms-of-use), [DDI API](https://docs.drugbank.com/v1/), and [commercial-use FAQ](https://dev.drugbank.com/guides/faqs) | Technically strong and structured, but not a better development path. The public terms limit ordinary access to internal, non-clinical research; prohibit safety-critical use and development of another DDI database unless a subscriber order specifically permits it; and require commercial licensing for commercial product development. Academic downloads are currently reported as paused. A specific DrugBank agreement would be required. |
| **KEGG DRUG DDI** | [KEGG API](https://www.kegg.jp/kegg/rest/), [DDI operation](https://www.kegg.jp/kegg/rest/keggapi.html), [copyright/licensing](https://www.kegg.jp/kegg/legal.html), and [interaction checker description](https://www.kegg.jp/kegg/medicus/medicus3.html) | Structured and academically accessible, with KEGG D numbers and contraindication/precaution classes. The assertions are derived principally from Japanese drug labels, however, and the API is restricted to academic users. Providing an academic service requires an academic service-provider license; non-academic use requires a commercial license. It is not a clearer bulk-development or redistribution path for MedSenseAI. |
| **DrugCentral** | [Official download](https://drugcentral.org/download), [official license page](https://drugcentral.org/privacy), and [provider-authored publication](https://pmc.ncbi.nlm.nih.gov/articles/PMC5210665/) | The database is downloadable in PostgreSQL form and is described as CC BY-SA 4.0, which is more permissive for commercial reuse than DDInter's license. Official materials establish a drug compendium focused on ingredients, products, targets, indications, and labels, but do not establish a curated, source-native pairwise DDI assertion product with severity and missing-result semantics. It is useful for identifiers or supporting metadata, not as the primary DDI development source. |
| **DailyMed / openFDA labels** | [DailyMed structured-label resources](https://dailymed.nlm.nih.gov/dailymed/spl-resources.cfm), [DailyMed developer support and RxNorm mappings](https://dailymed.nlm.nih.gov/dailymed/app-support.cfm), and [openFDA drug-label API](https://open.fda.gov/apis/drug/label/) | Authoritative for the labels it publishes and reproducibly downloadable, but interaction sections are label text rather than a normalized ingredient-pair DDI knowledge base. Turning them into assertions would require a separate deterministic extraction and clinical-curation program. No-result semantics would be unsafe. Not selected. |
| **NLM RxNorm / RxNav** | [RxNav FAQ](https://lhncbc.nlm.nih.gov/RxNav/information/FAQs.html) and [RxNorm API](https://lhncbc.nlm.nih.gov/RxNav/APIs/RxNormAPIs.html) | Retained as the identity and normalization layer, not a DDI source. NLM discontinued RxNav drug-interaction features on 2024-01-02. |

No checked alternative provides both DDInter-like structured development content and a clearly better license path for this project. This finding does not replace the production-source procurement decision in `docs/ddi-source-decision.md`.

## 2. DDInter official license evidence

DDInter states that its **data** is available under the [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International license](https://creativecommons.org/licenses/by-nc-sa/4.0/) (**CC BY-NC-SA 4.0**). Its terms also state that content may be printed or downloaded for personal, non-commercial, informational, or scholarly use. The website footer's general “All Rights Reserved” notice does not establish that website software, presentation, or other non-data material is covered by the data license; this decision applies only to DDInter data that the provider actually identifies as licensed.

The controlling [CC BY-NC-SA 4.0 legal code](https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode.en) grants rights to reproduce and share the licensed material, and to produce, reproduce, and share adapted material, for **NonCommercial** purposes only. “NonCommercial” means a use not primarily intended for or directed toward commercial advantage or monetary compensation. Creative Commons' [official FAQ](https://creativecommons.org/faq/#does-my-use-violate-the-noncommercial-clause-of-the-licenses) emphasizes that this depends on the use and its purpose, not merely whether the user is a university, nonprofit, or business. Creative Commons recommends contacting the rights holder when the classification is uncertain.

### Permission and obligation analysis

| Question | Verifiable conclusion |
|---|---|
| Dataset access | DDInter provides official CSV download links grouped by ATC category and requires no account on the published download page. |
| Local download and storage | The license permits reproduction for a qualifying noncommercial purpose, and DDInter expressly permits download for personal, non-commercial, informational, or scholarly use. For **this project**, written confirmation is still required before download because the stated future-commercial trajectory could affect the purpose analysis. |
| Local derived database | The license permits adapted material for noncommercial purposes. A private mapping or normalized database is therefore likely within the license if the MedSenseAI use is confirmed noncommercial. Whether a particular mapping database is legally “Adapted Material” is fact-specific and must not be guessed. |
| Attribution | When licensed material is shared, the user must retain supplied creator/attribution information, copyright and license notices, the warranty disclaimer, and a source URI where practicable; link the license; and identify modifications. MedSenseAI must preserve provenance even for private use. The DDInter 2.0 paper must also be cited in project documentation and demonstrations. |
| ShareAlike | If adapted material is shared, the adapter's contribution to that adapted material must use CC BY-NC-SA 4.0, a later license with the same elements, or a compatible license. No additional legal or technological restrictions may prevent recipients exercising the licensed rights. This does **not automatically license unrelated MedSenseAI source code**; data, derived data, mappings, and code must be separated and reviewed before distribution. |
| Database rights | Where sui generis database rights apply, the license permits noncommercial extraction, reuse, reproduction, and sharing of all or a substantial portion. A new database containing all or a substantial portion may itself be Adapted Material for ShareAlike purposes. |
| Redistribution | The CC license permits noncommercial sharing subject to attribution and ShareAlike. It does not authorize commercial redistribution. DDInter's “own ... use” wording, MedSenseAI's product trajectory, and the exact contents of a proposed repository or service make public redistribution an approval question, not a presently approved action. |
| Commercial use | **Not permitted** by CC BY-NC-SA 4.0. A separate written commercial license from the rights holder would be required. No such licensing offer, price, or production warranty was verified. |
| Warranty and clinical reliance | DDInter disclaims accuracy and completeness, says the database contains errors and is incomplete, and explicitly says absence of an interaction does not mean no interaction exists. The license also disclaims warranties. These terms prevent treating it as production-validated clinical knowledge. |

## 3. Development use-case matrix

The classifications below apply to the actual MedSenseAI project, including its documented possibility of later commercial use. They are narrower than a general description of what the CC license may allow.

| Use case | Classification | Basis and boundary |
|---|---|---|
| **A. Local private FYP development** | **LIKELY ALLOWED BUT REQUIRES CONFIRMATION** | Personal/scholarly download and noncommercial adaptation are within the published terms and license. Because MedSenseAI may become commercial, obtain written confirmation that this exact private FYP use is not treated as commercial product development. No real patient data or clinical decisions. |
| **B. University demonstration** | **LIKELY ALLOWED BUT REQUIRES CONFIRMATION** | A closed, noncommercial scholarly assessment is likely within scope, but user identity alone does not determine NonCommercial status. Confirm the university demonstration, attribution, display of descriptions, and retention of derived data. |
| **C. Supervisor demonstration inside a pharmacy** | **LIKELY ALLOWED BUT REQUIRES CONFIRMATION** | A pharmacy location does not automatically make the use commercial, but it increases ambiguity and the risk of apparent clinical use. Written permission must cover the setting. The demo must be offline/non-operational, use no patient prescriptions, and state that it is not clinical decision support. |
| **D. Public GitHub repository containing DDInter raw or derived data** | **UNKNOWN** | Noncommercial sharing is possible under CC BY-NC-SA, attribution, and ShareAlike, but it is unknown whether the proposed files are adapted data, how the repository's eventual commercial purpose affects NC, and whether all embedded material is within DDInter's licensable scope. Do not commit raw data, derived assertions, mappings, excerpts, or real interaction fixtures. A code-only repository with no DDInter material is outside this data-redistribution question. |
| **E. Hosted public demo backed by DDInter** | **UNKNOWN** | A public service is not covered clearly by DDInter's use-specific wording, and commercial advantage depends on facts. It also creates unacceptable clinical-reliance risk without additional controls and validation. Provider and institutional written approval would be required before any hosted use. |
| **F. Commercial pharmacy deployment** | **NOT ALLOWED** | The standard license prohibits commercial use. Separate commercial rights, clinical/vendor review, acceptance evidence, and production governance approval would all be required. |

Written confirmation must come from the DDInter rights holder or an authorized licensing representative and identify MedSenseAI, the university/FYP purpose, the exact data release, local retention, creation of a mapping/derived database, demonstrations, publication, redistribution, future commercial separation, and deletion or migration expectations. Supervisor approval alone cannot grant DDInter rights.

## 4. Technical suitability of DDInter 2.0

### Verified strengths

- **Structured access:** the official download page exposes CSV files partitioned by ATC category. This is suitable in principle for deterministic inspection and adapter ingestion.
- **Interaction representation:** the site and paper describe DDI records as drug-entity pairs with unique DDInter identifiers.
- **Source-native classification:** DDInter publishes mechanism categories and risk levels of Major, Moderate, Minor, and Unknown. MedSenseAI must store the exact source value and must not translate it into a stronger clinical claim.
- **Descriptions and evidence:** the paper and tutorials describe interaction mechanisms, management recommendations, source literature, and traceable references. Whether every field is included in the downloadable CSV is **UNKNOWN** until an authorized schema inspection.
- **Curation provenance:** the DDInter 2.0 paper reports literature and FDA-label collection, standardization, deduplication, and review of newly expanded data by at least two pharmacists, with a third resolving disagreements. This is published methodology, not independent MedSenseAI validation.
- **Published size:** the site reports 302,516 DDI records and 2,310 drug entries (2,122 distinct drugs), with 8,398 distinct mechanism descriptions and management recommendations. These are provider-reported database statistics, not a verified count of downloadable rows.

### Gaps and technical risks

- **Download coverage is unverified.** The current download page visibly lists only eight ATC-partition files, while the statistics page lists more ATC categories. It is **UNKNOWN** whether the exposed downloads constitute the complete published DDI database.
- **No downloadable schema contract was found.** Exact columns, null rules, pair directionality, duplicate policy, encoding, referential integrity, and inclusion of citations/descriptions are **UNKNOWN**.
- **No native RxNorm identifier was verified.** The current documentation verifies DDInter's own identifiers, names/synonyms, ATC codes, and external links, but not a downloadable RxCUI field.
- **Entity granularity is risky.** The earlier DDInter methodology treated administration routes as distinct records. Salt, form, route, mixture, and ingredient distinctions must not be collapsed automatically.
- **Unknown annotations remain.** The DDInter 2.0 publication says newly collected unknown annotations were excluded, while its comparison table still reports 42,417 existing DDI records with unknown risk. Both facts must be preserved; “unknown” must never be upgraded or discarded silently.
- **Weak release reproducibility.** The site identifies “DDInter 2.0” and a 2024-05-14 last-update date, but the download filenames do not include a release version and the page publishes no file checksums or machine-readable release manifest. The paper says minor corrections may occur without formal announcements; changes over 10% are described with updated dates. A later download with the same filename may therefore differ.
- **Update process is not sufficiently operationalized.** No fixed publication cadence, changelog for every correction, end-of-life policy, or notification mechanism was verified.
- **Clinical coverage is not guaranteed.** The provider explicitly describes the resource as incomplete and error-containing. It cannot establish exhaustive coverage for Pakistan or any other market.

### RxNorm mapping approach

The development path must keep the existing provider-neutral boundary:

```text
RxNorm CPC identity
    -> canonical MedSenseAI ingredient
    -> versioned DDInter mapping assertion
    -> DDInter source identifier
    -> source-preserved DDInter interaction assertion
```

Mapping must be deterministic and auditable. Start with verified exact ingredient-level correspondences using normalized names and any provider-supplied external identifiers that are legally and technically available. Record the RxCUI, DDInter identifier, both source releases, mapping method, source evidence, review state, and timestamps. Salt/form/route mismatches, multiple candidates, combination products, and approximate name matches are unresolved until explicitly reviewed. Unresolved mappings must return a mapping outcome, never an empty interaction result.

### Missing-result semantics

DDInter's own terms and tutorial require a fail-closed interpretation: a zero match may reflect incorrect input, an unrecorded drug, an unidentified interaction network, or incomplete data. The development adapter must therefore be capable of distinguishing at least:

- interaction assertion found;
- mapped pair with no source assertion returned;
- one or both ingredients not covered by the provider release;
- unresolved or ambiguous RxNorm-to-provider mapping;
- provider data unavailable or corrupt;
- release/schema unsupported;
- insufficient data to decide.

No one of the last six states means “safe combination.” Before a real adapter may exist, authorized schema inspection must show how release coverage can be enumerated and how a genuine pair lookup miss can be separated from mapping, coverage, and provider failures.

## 5. Development recommendation

Use **DDInter 2.0 as the contingent, isolated development provider**, not as production clinical knowledge. It is the most practical candidate for exercising the provider-neutral architecture because it combines downloadable structured data with pair-level classifications and explanatory provenance. It must remain replaceable and must carry a conspicuous `development/non-production` designation through import manifests, provider metadata, UI demonstrations, logs, and exported results.

The recommendation remains conditional because:

1. the MedSenseAI FYP exists within a project that may later seek commercial deployment, making the exact NonCommercial purpose fact-specific;
2. pharmacy, public-repository, and hosted-demo uses are not clearly authorized;
3. the complete downloadable dataset and schema have not been verified;
4. release checksums, immutable versioning, and complete change history are not provider-supplied; and
5. DDInter expressly disclaims completeness and warns that absence is not evidence of no interaction.

## 6. Production boundary

DDInter 2.0 under CC BY-NC-SA 4.0 is **not approved for commercial pharmacy deployment**. This decision does not change the production-source decision, provider acceptance specification, adapter conformance requirements, or governance gates. It does not establish clinical reliability for Pakistan, regulatory approval, a service-level commitment, indemnity, update guarantees, or a commercial right.

A future production provider must be separately procured and accepted. DDInter-derived data, mappings, caches, assertions, and adaptations must not be copied into that production path unless the production agreement explicitly permits it. Migration must retain source separation so that NC-licensed material can be removed without contaminating licensed production data.

## 7. GO / CONDITIONAL GO / NO-GO gate

**CONDITIONAL GO**

Architecture and synthetic-provider development may continue. DDInter is a credible candidate for a private, nonclinical FYP adapter, but **no DDInter file may be downloaded, stored, inspected, ingested, or embedded in MedSenseAI until written rights-holder confirmation is recorded for the exact use**.

## 8. Exact next permitted action

The next permitted action is licensing confirmation, not data engineering:

1. Send the DDInter rights holder a written request describing use cases A-E, the eventual-commercial separation, local storage, proposed derived mapping database, retention, attribution, repository boundaries, and planned demonstrations. Ask for an explicit yes/no answer for each use and for any additional terms.
2. Record the response, the identity/authority of the respondent, and a dated copy or cryptographic digest of the official terms reviewed. Obtain university review of the response.
3. Until that evidence is accepted, continue only with the synthetic DDI provider and provider-neutral contracts. Do not download or inspect DDInter data.

Only after written confirmation is accepted may the first real-data engineering task be authorized: manually obtain the official DDInter 2.0 files into the already gitignored `data/ddi/ddinter/2.0-2024-05-14/` directory; record source URLs, retrieval time, license, and SHA-256 checksums; inspect schema and coverage read-only; and produce an acceptance-gap report. That future task must not yet create a real adapter, medical records, public data, interaction fixtures, a hosted demo, or clinical output.

If confirmation is refused, absent, or narrower than required, the gate becomes **NO-GO for real DDI development data** and MedSenseAI must remain synthetic-only until another source is licensed.
