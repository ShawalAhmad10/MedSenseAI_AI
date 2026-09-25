# Medical Data Source Evaluation

Research status: 2026-08-29

This document evaluates sources only. It does not authorize ingestion, create medical facts, select clinical rules, or treat the absence of an interaction assertion as evidence of safety. Licensing observations are operational risk notes, not legal advice.

## 1. Requirements summary

MedSenseAI needs three deliberately separate source layers:

1. **Global drug identity and normalization:** normalized ingredient concepts, source-supported names, aliases, stable identifiers, and explicit relationships among ingredients, clinical drugs, and products.
2. **Clinical interaction knowledge:** ingredient-to-ingredient assertions in a reproducible machine-readable form, with the source's own classification, description/evidence, identifiers, release, and provenance.
3. **Pakistan-market products:** authoritative local brands, registration numbers, ingredients/composition, strengths and dosage forms where published, manufacturers or marketing-authorization holders, and market status.

One source does not need to cover all three layers. Any future selection must preserve source-native meaning and release history. A normalized ingredient match must not convert an unsupported product, interaction, severity, or safety conclusion into a verified assertion. Unknown, missing, stale, ambiguous, or inaccessible data must remain explicit.

The evaluation criteria are structure, authority, traceability, reproducibility, versioning, licensing compatibility, commercial-use rights, Pakistan relevance, and integration risk. Website search results or label prose are not equivalent to a versioned structured interaction dataset.

## 2. Candidate source comparison

| Source | Primary role | Machine-readable | DDI pairs / native class | Pakistan-market value | Commercial/licensing position | Recommendation |
|---|---|---:|---|---|---|---|
| RxNorm Current Prescribable Content | US drug identity/normalization | RRF files; REST API | No / no | Indirect terminology only | Public domain subset; acknowledgement requested | **Preferred** identity foundation |
| FDA GSRS / UNII | Substance identity and synonyms | Downloads; JSON API | No / no | Useful cross-identifier only | FDA/openFDA data published as public domain/CC0 | **Preferred** identity supplement |
| DailyMed / openFDA SPL | US product-label provenance and product-to-ingredient evidence | XML; zipped JSON; API | Label prose, not normalized pairs / no normalized class | No direct market coverage | openFDA SPL states public domain/CC0 | **Supplementary** |
| PubChem | Chemical identity cross-reference | API; bulk files | No authoritative DDI set / no | Indirect only | License varies by contributing source | **Supplementary**, source-filtered |
| WHO ATC/DDD | Therapeutic classification | Search; ordered Excel/XML; change-list Excel | No / no | Classification only | Commercial copying restriction in published guidelines; full-index terms need review | **Requires legal/license review** |
| DrugCentral | Secondary curated drug identity/approval resource | PostgreSQL dump; TSV/SDF/text | No dedicated structured clinical DDI feed found / no | No verified Pakistan registry coverage | CC BY-SA 4.0 stated by project; attribution/share-alike implications | **Supplementary; legal review** |
| DrugBank | Commercial drug knowledge and DDI | API; licensed XML/CSV/JSON/SDF | Yes / severity and evidence level | Product coverage for Pakistan unknown | Default terms prohibit safety-critical use and DDI database creation unless an executed order permits it | **Requires legal/license review** |
| DDInter 2.0 | Secondary curated DDI | CSV pair downloads; website | Yes / native risk level | No local product mapping | CC BY-NC-SA 4.0; non-commercial only | **Unsuitable** for commercial production under current terms |
| KEGG DRUG/DDI | Structured DDI derived mainly from Japanese labels | REST; licensed FTP | Yes / contraindication or precaution | No local product mapping | Non-academic use requires commercial license | **Requires legal/license review** |
| FDB MedKnowledge | Commercial pharmacy knowledge and DDI | Licensed direct integration, developer tools, web API | Yes / configurable native severity categories | Public documentation does not establish Pakistan coverage | Proprietary contract required | **Requires legal/license review; procurement shortlist** |
| Micromedex | Commercial clinical drug reference and DDI | Subscription products and licensed integration | Yes / severity, onset, documentation | Public documentation does not establish Pakistan product coverage | Proprietary contract required | **Requires legal/license review; procurement shortlist** |
| DRAP Registered Product Data | Pakistan registrations and product-to-ingredient data | Searchable website | No / no | Direct and authoritative in origin | Provisional-list disclaimer bars research/citation/statistical use; no bulk terms found | **Requires written DRAP authorization/data agreement** |
| DRAP National Essential Medicines List | Pakistan policy/reference list | PDF; publication page | No / no | Pakistan-specific but not a product registry | No reusable structured-data license found; DRAP site reserves rights | **Supplementary; legal review before extraction** |

## 3. Global drug identity candidates

### 3.1 RxNorm Current Prescribable Content

1. **Source name:** RxNorm Current Prescribable Content (CPC).
2. **Organization/maintainer:** U.S. National Library of Medicine (NLM).
3. **Official URL/documentation:** [overview](https://www.nlm.nih.gov/research/umls/rxnorm/overview.html), [CPC documentation](https://www.nlm.nih.gov/research/umls/rxnorm/docs/prescribe.html), [release files and checksums](https://www.nlm.nih.gov/research/umls/rxnorm/docs/rxnormfiles.html), and [terms](https://www.nlm.nih.gov/research/umls/rxnorm/docs/termsofservice.html).
4. **Data provided:** Normalized names and RXCUIs for currently prescribable US drugs, attributes, and relationships; the subset includes RxNorm and selected FDA SPL/CMS content.
5. **Active ingredients:** Yes.
6. **Aliases/synonyms:** Yes, within the included RxNorm/SPL names and relationships; it is not a universal synonym authority.
7. **Drug identifiers:** Yes: RXCUI, plus included attributes such as NDC and UNII where present.
8. **Brand/product mappings:** Yes for represented US branded/clinical-drug concepts and relationships; not a Pakistan product registry.
9. **Drug-drug interactions:** No.
10. **Interaction severity/classification:** No.
11. **Geographic scope:** Intended as an approximation of currently marketed prescription drugs in the United States, with some OTC content; exclusively non-US drugs are excluded.
12. **Pakistan-specific usefulness:** Useful as a normalization and cross-reference layer when a DRAP ingredient can be matched deterministically; it cannot establish Pakistan registration or availability.
13. **Access method:** Versioned monthly files, weekly update files, REST API, and browser.
14. **Formats:** UTF-8, pipe-delimited Rich Release Format (RRF); REST responses are also available through the RxNorm API.
15. **Version/release information:** Yes: dated releases, archives, release notes, and MD5 checksums.
16. **Update frequency:** Full monthly release on the first Monday (or next day for a US federal holiday) and weekly updates on Wednesday; NLM documents the exact schedule.
17. **Licensing/redistribution:** CPC is public domain and does not require a UMLS license. The full RxNorm release is different: it requires a free UMLS license and includes source vocabularies with their own restrictions.
18. **Commercial-use considerations:** CPC is the safer initial scope. Do not silently substitute the full release or proprietary source vocabulary content without a source-by-source rights review.
19. **Attribution requirements:** NLM requests an acknowledgement statement and citation; NLM endorsement must not be implied.
20. **Reliability/authority:** High for US terminology and identifiers; official government terminology, not a clinical interaction authority.
21. **Integration difficulty:** Medium because RRF concepts, term types, relationships, weekly deltas, retirement, and source fields must be interpreted deterministically.
22. **Major limitations:** US-centric; no DDI assertions; CPC is a subset; names and identifiers still require exact concept/term-type rules and provenance.
23. **Recommendation:** **Preferred** as the first identity/normalization source.

### 3.2 FDA Global Substance Registration System / UNII

1. **Source name:** FDA Global Substance Registration System (GSRS) public substance data and Unique Ingredient Identifiers (UNIIs).
2. **Organization/maintainer:** U.S. Food and Drug Administration; a public GSRS implementation is also operated with NIH/NCATS.
3. **Official URL/documentation:** [FDA UNII Search and downloads](https://precision.fda.gov/uniisearch), [UNII release archive](https://precision.fda.gov/uniisearch/archive), [GSRS downloads](https://gsrs.ncats.nih.gov/downloads/), [GSRS API documentation](https://gsrs.ncats.nih.gov/api-documentation), and [openFDA UNII data](https://open.fda.gov/data/unii/).
4. **Data provided:** Substance identities based on scientific-defining characteristics, UNIIs, preferred names, other names, codes, and attributes.
5. **Active ingredients:** Yes, as substances; the resource also contains non-drug and other regulated substances.
6. **Aliases/synonyms:** Yes, with FDA warning that synonyms and mappings reflect the best public information available at publication time.
7. **Drug identifiers:** Yes: UNII and linked source codes where present.
8. **Brand/product mappings:** No complete medicinal-product-to-ingredient registry.
9. **Drug-drug interactions:** No.
10. **Interaction severity/classification:** No.
11. **Geographic scope:** Global substance identity model used in FDA regulatory data; not a global marketing-authorization registry.
12. **Pakistan-specific usefulness:** Strong cross-identifier supplement for deterministically resolved substances; it does not prove a product is authorized or marketed in Pakistan.
13. **Access method:** Search website, downloadable substance files/archive, public REST API, and openFDA bulk/API access.
14. **Formats:** GSRS API JSON/schema; openFDA bulk download is zipped JSON. Other FDA download formats should be confirmed from each release manifest before ingestion.
15. **Version/release information:** Yes: the FDA archive publishes dated releases; GSRS publishes dumps, release notes, a data dictionary, and schemas.
16. **Update frequency:** Public lists and archives are updated, but no single guaranteed bulk-release cadence was found. Treat the date on each release as authoritative rather than assuming a cadence.
17. **Licensing/redistribution:** The openFDA UNII dataset identifies its license as public domain and CC0. The GSRS software license must not be confused with the data license.
18. **Commercial-use considerations:** Public-domain/CC0 FDA data is commercially favorable, subject to FDA/openFDA terms and disclaimers.
19. **Attribution requirements:** No mandatory attribution was identified for CC0 data; provenance and FDA acknowledgement should still be retained and endorsement must not be implied.
20. **Reliability/authority:** High for substance identity and UNII assignment. FDA explicitly states that a UNII does not imply regulatory review or approval.
21. **Integration difficulty:** Medium to high because substance forms, mixtures, salts, relationships, and version changes require conservative identity-resolution rules.
22. **Major limitations:** Not limited to medicines; no product market status, DDI, or clinical safety classifications; synonyms cannot be accepted blindly as canonical mappings.
23. **Recommendation:** **Preferred** as a supplementary substance-identity source after the RxNorm CPC foundation.

### 3.3 DailyMed and openFDA Structured Product Labeling

1. **Source name:** DailyMed/FDA Structured Product Labeling (SPL), including the openFDA drug-label endpoint.
2. **Organization/maintainer:** FDA supplies SPL submissions; NLM operates DailyMed; FDA operates openFDA.
3. **Official URL/documentation:** [DailyMed SPL resources](https://dailymed.nlm.nih.gov/dailymed/spl-resources.cfm), [DailyMed label downloads](https://dailymed.nlm.nih.gov/dailymed/spl-resources-all-drug-labels.cfm), [openFDA SPL description and license](https://open.fda.gov/data/spl/), [drug-label API](https://open.fda.gov/apis/drug/label/), and [bulk JSON download](https://open.fda.gov/apis/drug/label/download/).
4. **Data provided:** Submitted US product labeling, label sections, active-ingredient content, label/product identifiers, brands/generic names, manufacturers, and harmonized identifiers where available.
5. **Active ingredients:** Yes, in SPL fields/sections and openFDA annotations where available.
6. **Aliases/synonyms:** Limited; label names and harmonized fields are present, but this is not a comprehensive synonym authority.
7. **Drug identifiers:** Yes, including stable SPL set IDs, revision/document IDs, NDCs, UNIIs and RXCUIs where available.
8. **Brand/product mappings:** Yes for represented US labels and products.
9. **Drug-drug interactions:** Label interaction sections may contain interaction prose; they are not a normalized ingredient-pair assertion dataset.
10. **Interaction severity/classification:** No consistent normalized source-native severity field across labels.
11. **Geographic scope:** United States labeling.
12. **Pakistan-specific usefulness:** Indirect evidence/reference only; US labeling cannot establish Pakistani market authorization or local labeling.
13. **Access method:** Daily/weekly/monthly ZIP updates and full releases, mapping files, openFDA API, and zipped JSON bulk files.
14. **Formats:** Original SPL XML and openFDA JSON.
15. **Version/release information:** Yes at label level (stable set ID, revision version/document ID) and distribution level (dated files, last-modified data, checksums on DailyMed).
16. **Update frequency:** DailyMed offers daily, weekly, and monthly updates; the openFDA SPL page states weekly API updates.
17. **Licensing/redistribution:** The openFDA SPL data page states public domain and CC0.
18. **Commercial-use considerations:** Favorable for the openFDA/FDA public data, but source terms and any embedded third-party material still require compliance review.
19. **Attribution requirements:** No mandatory CC0 attribution identified; retain FDA/NLM source provenance and do not imply endorsement.
20. **Reliability/authority:** High for the submitted label and its revision, but label content varies and openFDA warns not to rely on its API for medical-care decisions.
21. **Integration difficulty:** High for safe interpretation because XML/section variability and product revisions are substantial; straightforward as evidence storage, difficult as DDI extraction.
22. **Major limitations:** US-only; label prose is not a deterministic DDI pair table; harmonized fields are annotations and may be absent; old records can change, requiring complete refresh logic.
23. **Recommendation:** **Supplementary** for product evidence, identifiers, and traceable label references; not a primary DDI source.

### 3.4 PubChem

1. **Source name:** PubChem.
2. **Organization/maintainer:** National Center for Biotechnology Information (NCBI), U.S. National Library of Medicine.
3. **Official URL/documentation:** [downloads](https://pubchem.ncbi.nlm.nih.gov/docs/downloads), [PUG REST](https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest), [data-source/provenance documentation](https://pubchem.ncbi.nlm.nih.gov/docs/data-sources), and [PUG REST tutorial](https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest-tutorial).
4. **Data provided:** Chemical substance and compound records, names/synonyms, structures, identifiers, cross-references, deposited annotations, and provenance from many contributors.
5. **Active ingredients:** Many drug substances are represented, but PubChem is a general chemical resource and does not define a complete active-ingredient list for pharmacy use.
6. **Aliases/synonyms:** Yes, contributor-supplied; PubChem warns that identifiers appearing in synonym lists are not validated as identifiers.
7. **Drug identifiers:** PubChem CIDs/SIDs and source-linked external identifiers.
8. **Brand/product mappings:** No authoritative, complete medicinal-product mapping.
9. **Drug-drug interactions:** No authoritative, normalized clinical DDI dataset suitable as the MedSenseAI interaction source.
10. **Interaction severity/classification:** No.
11. **Geographic scope:** Global contributor coverage.
12. **Pakistan-specific usefulness:** Limited to cross-identification; no verified Pakistan market authorization layer.
13. **Access method:** PUG REST/API services, record downloads, search-result downloads, and bulk FTP.
14. **Formats:** CSV, JSON/JSONL, XML, RDF, SDF, text, and service-specific formats.
15. **Version/release information:** Contributor records expose deposition/modification and provenance; no single clinical-drug release version governs all PubChem content.
16. **Update frequency:** Varies by contributing source; source pages expose status and last-updated information where supplied.
17. **Licensing/redistribution:** Not uniform. PubChem states that licensing and reuse conditions are defined by each contributing source and some datasets cannot be bulk-downloaded.
18. **Commercial-use considerations:** A future adapter must whitelist source records whose license is known and compatible; PubChem availability alone is not commercial-use permission.
19. **Attribution requirements:** Source-specific and therefore unknown globally; retain contributor-level provenance and license metadata.
20. **Reliability/authority:** High as an NCBI aggregation platform, variable at the individual contributed assertion level.
21. **Integration difficulty:** High if used broadly because contributor authority, conflicts, source licenses, and ambiguous synonyms must be filtered deterministically.
22. **Major limitations:** Heterogeneous data and licensing; names can be ambiguous; no product-market authority and no production DDI authority.
23. **Recommendation:** **Supplementary**, restricted to explicitly approved contributor/source types and identity cross-checks.

### 3.5 WHO ATC/DDD Index

1. **Source name:** Anatomical Therapeutic Chemical (ATC) Classification with Defined Daily Doses (DDD).
2. **Organization/maintainer:** WHO Collaborating Centre for Drug Statistics Methodology, hosted by the Norwegian Institute of Public Health.
3. **Official URL/documentation:** [searchable ATC/DDD Index](https://atcddd.fhi.no/atc_ddd_index/), [annual updates](https://atcddd.fhi.no/atc_ddd_index/updates_included_in_the_atc_ddd_index/), [temporary changes](https://atcddd.fhi.no/lists_of__temporary_atc_ddds_and_alterations/lists_of_temporary_atc_ddds_and_alterations), and [2026 guidelines](https://atcddd.fhi.no/filearchive/publications/2026_guidelines_for_atc_classification_and_ddd_assignment.pdf).
4. **Data provided:** Hierarchical therapeutic classification codes/names and DDD information; change lists document additions and alterations.
5. **Active ingredients:** ATC fifth-level entries include substance or combination names, but ATC is a classification rather than a complete identity authority.
6. **Aliases/synonyms:** No comprehensive alias set.
7. **Drug identifiers:** ATC codes.
8. **Brand/product mappings:** No; national authorities must link ATC codes to their own products.
9. **Drug-drug interactions:** No.
10. **Interaction severity/classification:** No.
11. **Geographic scope:** International drug-utilization classification.
12. **Pakistan-specific usefulness:** Useful as a classification attached only after a verified ingredient/product mapping; it does not establish local registration.
13. **Access method:** Free searchable website; complete electronic index through a registered ordering account; public annual and temporary change lists.
14. **Formats:** Complete index is offered in Excel or XML; change lists are available in Excel; website search is available.
15. **Version/release information:** Yes, annual index year plus dated temporary/final change decisions.
16. **Update frequency:** Complete index annually; new codes and alterations are published twice annually before later implementation.
17. **Licensing/redistribution:** Published guidelines state that use requires reference to the Centre and that commercial copying/distribution and modification are not allowed. Exact terms for an ordered complete electronic index were not found in the public pages reviewed.
18. **Commercial-use considerations:** **Unknown without the applicable order/license terms**; legal review and likely direct licensing are required before embedding or redistributing ATC data commercially.
19. **Attribution requirements:** The Centre publishes a suggested citation and requires reference to the Centre.
20. **Reliability/authority:** High for ATC/DDD classification; it is not an ingredient-identity or safety authority.
21. **Integration difficulty:** Medium technically; high governance risk until licensed terms and version-transition rules are resolved.
22. **Major limitations:** No synonyms, market products, or DDI; codes change over time; public search access does not grant commercial redistribution rights.
23. **Recommendation:** **Requires legal/license review**; potentially supplementary after rights are confirmed.

### 3.6 DrugCentral

1. **Source name:** DrugCentral.
2. **Organization/maintainer:** Division of Translational Informatics, University of New Mexico, with the Illuminating the Druggable Genome collaboration.
3. **Official URL/documentation:** [about](https://drugcentral.org/about), [download page](https://drugcentral.org/download), [project license repository](https://github.com/unmtransinfo/DrugCentral-2023), and [maintainer-authored 2023 update](https://pmc.ncbi.nlm.nih.gov/articles/PMC9825566/).
4. **Data provided:** Secondary curated drug identities, names, structures, identifiers, approvals from major regulators, labels/uses and other pharmacological data.
5. **Active ingredients:** Yes.
6. **Aliases/synonyms:** Yes, including development codes and alternate forms.
7. **Drug identifiers:** DrugCentral IDs and linked external identifiers.
8. **Brand/product mappings:** Marketed formulations and regulatory approval data are represented, but exact current country/product coverage must be validated from the dump.
9. **Drug-drug interactions:** No dedicated, versioned clinical ingredient-pair DDI download was documented on the reviewed official download page; label-derived material should not be assumed to be a DDI feed.
10. **Interaction severity/classification:** No documented normalized DDI severity feed.
11. **Geographic scope:** Aggregates data including FDA, EMA, and PMDA; not a national regulator.
12. **Pakistan-specific usefulness:** No authoritative Pakistan registry coverage was established.
13. **Access method:** PostgreSQL database dump/public instance, TSV exports, SDF, structure text files, and website.
14. **Formats:** PostgreSQL dump, TSV, SDF, SMILES/InChI text, and SQL examples.
15. **Version/release information:** Named publication releases exist; the public download page reviewed exposes a dated 2023 PostgreSQL dump but no immutable release manifest/checksum was found.
16. **Update frequency:** No guaranteed public release cadence found.
17. **Licensing/redistribution:** The project repository identifies the database as CC BY-SA 4.0. The website presents the license graphically rather than as readily auditable text.
18. **Commercial-use considerations:** CC BY-SA permits commercial use subject to attribution/share-alike, but the effect on a combined proprietary database and third-party fields requires legal review.
19. **Attribution requirements:** Attribution, license link, change indication, and ShareAlike obligations under CC BY-SA 4.0.
20. **Reliability/authority:** Reputable secondary curated academic resource, below primary regulators for approval/label assertions.
21. **Integration difficulty:** Medium to high due to a PostgreSQL dump, mixed domains, source-level provenance, and license-boundary analysis.
22. **Major limitations:** Public dump freshness and release mechanics are unclear; no Pakistan authority; not a dedicated DDI source; secondary assertions must retain their original sources.
23. **Recommendation:** **Supplementary; requires legal review** before combining or redistributing data.

## 4. Interaction-data candidates

### 4.1 DrugBank Clinical API / licensed datasets

1. **Source name:** DrugBank Clinical API and licensed DrugBank datasets.
2. **Organization/maintainer:** DrugBank.
3. **Official URL/documentation:** [DDI API](https://docs.drugbank.com/v1/), [release page](https://go.drugbank.com/releases/latest), [terms of use](https://trust.drugbank.com/drugbank-trust-center/terms-of-use), and [data-format FAQ](https://dev.drugbank.com/guides/faqs).
4. **Data provided:** Drug identities, names/synonyms, identifiers, products, structures, and structured clinical DDI responses depending on the licensed product.
5. **Active ingredients:** Yes.
6. **Aliases/synonyms:** Yes.
7. **Drug identifiers:** Stable DrugBank IDs and external links.
8. **Brand/product mappings:** Yes in relevant licensed packages; precise geographic product coverage is contract/package-dependent.
9. **Drug-drug interactions:** Yes, including ingredient/product queries and structured pair results.
10. **Interaction severity/classification:** Yes: API documentation exposes native severity, evidence level, description/action, and optional references.
11. **Geographic scope:** Broad drug knowledge; the exact regulatory/product regions in a license must be confirmed.
12. **Pakistan-specific usefulness:** Unknown; public documentation reviewed does not establish complete DRAP product coverage.
13. **Access method:** Authenticated commercial API and licensed data files; public website is not permission to bulk ingest.
14. **Formats:** API JSON; licensed downloads documented across XML, CSV, JSON, SDF and related formats depending on dataset.
15. **Version/release information:** Yes for release downloads; API release/snapshot retention terms must be confirmed contractually.
16. **Update frequency:** Releases are dated and versioned, but a guaranteed production delivery cadence was not established from the reviewed public documentation.
17. **Licensing/redistribution:** Academic datasets are CC BY-NC 4.0; small open-data vocabulary/structure datasets are CC0 but do not constitute the clinical DDI dataset. Default terms tightly restrict copying, derivative databases, redistribution, safety-critical use, and DDI-database development.
18. **Commercial-use considerations:** A mutually executed subscriber order must explicitly permit MedSenseAI's commercial, safety-sensitive use, storage/caching, DDI database creation, derivative normalization, audit retention, and any customer-facing display.
19. **Attribution requirements:** Dataset/package-specific; academic releases request citation. Exact commercial attribution is **unknown** until contract review.
20. **Reliability/authority:** Reputable curated commercial secondary source with structured clinical fields; it is not a regulator.
21. **Integration difficulty:** Medium technically; very high legal/governance importance.
22. **Major limitations:** Default terms conflict directly with the intended use; Pakistan product coverage and redistributable evidence text are unknown; contract-defined access dependency.
23. **Recommendation:** **Requires legal/license review**. Do not ingest clinical DDI content without explicit written rights.

### 4.2 DDInter 2.0

1. **Source name:** DDInter 2.0.
2. **Organization/maintainer:** Computational Biology & Drug Design Group and collaborating academic/pharmacy teams.
3. **Official URL/documentation:** [download page](https://ddinter2.scbdd.com/download/), [terms](https://ddinter2.scbdd.com/terms/), [tutorial](https://ddinter2.scbdd.com/tutorials/), and [peer-reviewed update](https://pmc.ncbi.nlm.nih.gov/articles/PMC11701621/).
4. **Data provided:** Secondary curated drug entities and DDI pairs, risk level, mechanism/description, management guidance and references where available; it also exposes other interaction types outside this evaluation.
5. **Active ingredients:** Drug entities are represented, but DDInter is not a primary ingredient terminology.
6. **Aliases/synonyms:** Search supports generic names/synonyms; the complete alias export coverage is not documented.
7. **Drug identifiers:** Unique DDInter identifiers plus selected chemical/external links.
8. **Brand/product mappings:** No authoritative national product-to-ingredient registry.
9. **Drug-drug interactions:** Yes, with downloadable pair CSV files grouped by ATC category.
10. **Interaction severity/classification:** Yes, source-native risk/severity levels; exact labels and semantics must be preserved from the selected release.
11. **Geographic scope:** General/academic clinical knowledge compiled from literature and pharmaceutical labels; not a national regulator.
12. **Pakistan-specific usefulness:** Interaction knowledge could be cross-linked only after independently verified ingredient resolution; no Pakistan brand mapping.
13. **Access method:** Public CSV downloads and searchable website; no supported public bulk API was documented in the reviewed official pages.
14. **Formats:** CSV for downloadable DDI pairs; website pages for richer details.
15. **Version/release information:** Named 2.0 release and publication date exist, but the download page does not expose immutable release filenames, checksums, or a release archive.
16. **Update frequency:** The maintainers describe continual minor corrections and announced significant updates, but no fixed release cadence is documented.
17. **Licensing/redistribution:** CC BY-NC-SA 4.0; use is non-commercial and ShareAlike.
18. **Commercial-use considerations:** The non-commercial restriction is incompatible with a commercial MedSenseAI product without a separate license from the rights holder.
19. **Attribution requirements:** Attribution and ShareAlike under CC BY-NC-SA 4.0.
20. **Reliability/authority:** Reputable peer-reviewed, pharmacist-reviewed secondary resource; not primary regulatory evidence, and its own terms warn of incompleteness/errors.
21. **Integration difficulty:** Medium for CSV pairs; high for reproducible rich evidence because version/checksum and bulk-detail delivery are unclear.
22. **Major limitations:** Commercial blocker; secondary curation; incomplete coverage; absence explicitly does not mean no interaction; rich detail may not be in the pair download.
23. **Recommendation:** **Unsuitable** for commercial production under the published license; possible evaluation-only research use must remain segregated.

### 4.3 KEGG DRUG and KEGG DDI

1. **Source name:** KEGG DRUG / KEGG Drug Interaction Database.
2. **Organization/maintainer:** Kanehisa Laboratories and KEGG operations.
3. **Official URL/documentation:** [KEGG DRUG](https://www.kegg.jp/kegg/drug/), [REST API manual](https://www.kegg.jp/kegg/rest/keggapi.html), [API restrictions](https://www.kegg.jp/kegg/rest/), [download terms](https://www.kegg.jp/kegg/download/), and [legal terms](https://www.kegg.jp/kegg/legal.html).
4. **Data provided:** Drug identities/D numbers, names and classifications, cross-references, country-related product links, and known adverse interactions extracted from Japanese prescription-drug labels.
5. **Active ingredients:** Yes, unified by chemical structure/component.
6. **Aliases/synonyms:** Yes, multiple generic-name systems are represented.
7. **Drug identifiers:** Stable KEGG D numbers and linked identifiers.
8. **Brand/product mappings:** Japanese and US product links are represented; no Pakistan registry.
9. **Drug-drug interactions:** Yes, machine-readable through the `ddi` REST operation for supported identifiers.
10. **Interaction severity/classification:** Native contraindication (`CI`) and precaution (`P`) classes; these must not be converted into a universal severity without an approved mapping.
11. **Geographic scope:** Drug identities span Japan, US and Europe; DDI content is described as extracted from Japanese prescription labels.
12. **Pakistan-specific usefulness:** Indirect DDI/identity cross-reference only; it cannot establish DRAP product composition or local label status.
13. **Access method:** REST API and licensed/subscription FTP.
14. **Formats:** REST tab-delimited text/flat-file responses; FTP formats are package-dependent.
15. **Version/release information:** The API `info` operation exposes database release information; FTP is described as weekly updated.
16. **Update frequency:** FTP is weekly updated; exact DDI release/snapshot retention needs confirmation for the licensed product.
17. **Licensing/redistribution:** Public API is limited to academic users; non-academic use requires a commercial license.
18. **Commercial-use considerations:** MedSenseAI must obtain commercial rights covering API/FTP access, local storage, derived mappings, audit snapshots, and output display.
19. **Attribution requirements:** License-specific and **unknown** until agreement; KEGG copyright must be retained.
20. **Reliability/authority:** Reputable curated knowledgebase with label-derived DDI, but not the issuing Japanese regulator and not Pakistan-specific.
21. **Integration difficulty:** Medium technically; high legal and semantic work for label scope and CI/P interpretation.
22. **Major limitations:** Japanese-label DDI scope, commercial license required, limited source-evidence detail in the pair endpoint, and no Pakistan product mapping.
23. **Recommendation:** **Requires legal/license review**.

### 4.4 FDB MedKnowledge

1. **Source name:** FDB MedKnowledge, especially the Drug-Drug Interaction Module.
2. **Organization/maintainer:** First Databank (FDB), part of Hearst Health.
3. **Official URL/documentation:** [product overview](https://www.fdbhealth.com/solutions/medknowledge-drug-database), [clinical modules](https://www.fdbhealth.com/solutions/medknowledge-drug-database/medknowledge-clinical-modules), [integration options](https://www.fdbhealth.com/solutions/medknowledge-drug-database/integration-options), and [package datasheet](https://www.fdbhealth.com/-/media/documents/form-not-required/us/datasheets/datasheet---fdb-medknowledge-packages.ashx).
4. **Data provided:** Proprietary drug nomenclature/products plus configurable clinical screening modules, including DDI, descriptions/monographs, and references depending on package.
5. **Active ingredients:** Yes.
6. **Aliases/synonyms:** Drug nomenclature and stable vocabularies are advertised; exact export fields are contract/documentation-dependent.
7. **Drug identifiers:** Proprietary FDB identifiers and interoperability mappings; exact identifiers depend on licensed modules.
8. **Brand/product mappings:** Yes for covered markets/products.
9. **Drug-drug interactions:** Yes, including prescription, OTC, alternative-therapy and some inactive-ingredient screening according to the module datasheet.
10. **Interaction severity/classification:** Yes, configurable severity levels and subcategories are documented; exact source-native code set requires technical documentation.
11. **Geographic scope:** Public product pages emphasize US and Canada and state other regional solutions exist.
12. **Pakistan-specific usefulness:** **Unknown**; Pakistan product coverage and local terminology mapping must be demonstrated by the vendor.
13. **Access method:** Licensed direct programming/data integration, developer software, and web API/cloud services.
14. **Formats:** **Unknown from public documentation**; obtain schemas, delivery manifests, and sample records under evaluation terms.
15. **Version/release information:** Public documentation does not establish immutable release identifiers/checksums; this must be a procurement requirement.
16. **Update frequency:** FDB states content is continuously updated and web APIs can receive real-time updates; file delivery cadence is package-dependent.
17. **Licensing/redistribution:** Proprietary commercial license.
18. **Commercial-use considerations:** Contract must cover MedSenseAI's pharmacy workflow, safety-sensitive use, local persistence/cache, normalized derivatives, audit retention, HA/offline behavior, user display and downstream restrictions.
19. **Attribution requirements:** **Unknown** until contract review.
20. **Reliability/authority:** Established commercial clinical/pharmacy knowledge vendor; due diligence still requires editorial methods, quality metrics, change controls and source traceability.
21. **Integration difficulty:** Medium to high, depending on licensed delivery; vendor onboarding and identifier mapping are material work.
22. **Major limitations:** Proprietary cost/dependency; public docs do not establish Pakistan coverage, exact evidence granularity, release reproducibility, SLAs, or redistribution rights.
23. **Recommendation:** **Requires legal/license review; preferred commercial procurement shortlist**, not approved for ingestion yet.

### 4.5 Micromedex Drug Interactions

1. **Source name:** Micromedex Drug Interactions and licensed medication-management data.
2. **Organization/maintainer:** Merative.
3. **Official URL/documentation:** [core drug reference](https://www.merative.com/documents/micromedex-core-drug-reference), [Drug Interactions editorial policy](https://www.merative.com/content/dam/merative/training/micromedex/Micromedex%20Drug%20Interactions%20Policy.pdf), and [service description](https://www.merative.com/content/dam/merative/terms/offering/service/Micromedex_Service_Description.pdf).
4. **Data provided:** Proprietary drug reference and DDI screening with interaction effect, management, probable mechanism and literature reporting.
5. **Active ingredients:** Yes within the licensed drug reference.
6. **Aliases/synonyms:** Brand/generic search is supported; exact bulk synonym fields are **unknown**.
7. **Drug identifiers:** Proprietary identifiers and supported integration keys are **unknown from public documentation**.
8. **Brand/product mappings:** Product/drug coverage exists, but market and package scope are contract-dependent.
9. **Drug-drug interactions:** Yes.
10. **Interaction severity/classification:** Yes: official policy documents severity, onset and documentation classifications, plus effect, management and probable mechanism.
11. **Geographic scope:** International evidence/reference use; exact licensed country-product scope is **unknown**.
12. **Pakistan-specific usefulness:** **Unknown**; local brands and DRAP registration mappings were not established in public documentation.
13. **Access method:** Subscription user products and licensed components/integration; precise data API/file options require vendor confirmation.
14. **Formats:** **Unknown from public documentation reviewed**.
15. **Version/release information:** **Unknown** for an ingestible data delivery; require immutable release IDs, effective dates and change manifests.
16. **Update frequency:** Merative describes current/reliable updates, but an exact contractual DDI delivery cadence was not found.
17. **Licensing/redistribution:** Proprietary commercial terms.
18. **Commercial-use considerations:** Contract must expressly allow the intended safety-sensitive workflow, local storage, source/evidence display, derived identifier mappings, audit snapshots and customer access.
19. **Attribution requirements:** **Unknown** until contract review.
20. **Reliability/authority:** Established curated commercial clinical reference with a published interaction editorial policy; not a regulator.
21. **Integration difficulty:** Unknown-to-high until delivery schemas, supported identifiers and service constraints are disclosed.
22. **Major limitations:** Proprietary dependency; public material is insufficient to judge Pakistan product coverage, machine-readable delivery, release reproducibility and redistribution.
23. **Recommendation:** **Requires legal/license review; preferred commercial procurement shortlist**, not approved for ingestion yet.

## 5. Pakistan-market candidates

### 5.1 DRAP Registered Product Data

1. **Source name:** Registered Product Data / Registered Drugs Index.
2. **Organization/maintainer:** Drug Regulatory Authority of Pakistan (DRAP), Government of Pakistan.
3. **Official URL/documentation:** [registered-product search](https://eapp.dra.gov.pk/WebProductIndex.php), [DRAP database notice](https://www.dra.gov.pk/news_updates/regulatory_updates/updated-database-of-pharmaceutical-and-biological-drug-product/), [pharmaceutical-drugs page](https://www.dra.gov.pk/therapeutic-goods/drugs/pharmaceuticals/), and [e-services portal](https://e.dra.gov.pk/).
4. **Data provided:** DRAP describes brand/proprietary name, dosage form, composition/active ingredients, registration number/date, marketing-authorization holder and manufacturer for registered pharmaceutical/biological products.
5. **Active ingredients:** Yes, as product composition/generic information where populated.
6. **Aliases/synonyms:** No documented normalized alias system.
7. **Drug identifiers:** Pakistan registration number; no documented global ingredient identifier.
8. **Brand/product mappings:** Yes, this is the most directly relevant official Pakistan source reviewed.
9. **Drug-drug interactions:** No.
10. **Interaction severity/classification:** No.
11. **Geographic scope:** Pakistan.
12. **Pakistan-specific usefulness:** Direct and potentially essential for local product identity, subject to data quality, terms and formal access.
13. **Access method:** Searchable public website. **No official structured bulk download or documented API was found in the official pages reviewed.**
14. **Formats:** Website/HTML search results; bulk format **unknown**.
15. **Version/release information:** The portal exposes registry/search update context, but no immutable downloadable release, manifest, checksum or archive was found.
16. **Update frequency:** **Unknown**; DRAP states the database has been updated but publishes no fixed registry-release cadence on the reviewed pages.
17. **Licensing/redistribution:** **Unknown and currently restrictive in practice.** The search page calls the list provisional and says it cannot be used as a reference for purposes including research, citation, or statistical analysis and is intended for stakeholder review/feedback.
18. **Commercial-use considerations:** Do not scrape or ingest under the current public disclaimer. Request a written data-sharing/license agreement and an official bulk export directly from DRAP.
19. **Attribution requirements:** **Unknown**; DRAP website reserves rights. Written terms must define attribution and permitted displays.
20. **Reliability/authority:** Highest local regulatory authority in origin, but the public copy is expressly provisional and warns of errors/omissions.
21. **Integration difficulty:** High until DRAP supplies structured data, field definitions, status semantics, versioning and permitted-use terms.
22. **Major limitations:** Restrictive disclaimer, no documented bulk/API, provisional quality, no stable release archive/checksum, and no DDI content.
23. **Recommendation:** **Requires written DRAP authorization/data agreement**. It is the preferred Pakistan authority, but not currently an ingestible approved source.

#### Pakistan structured-data finding

- **Official structured/downloadable dataset:** None was identified for the registered-drug registry in the reviewed official DRAP materials.
- **Searchable website/document/PDF requiring later extraction:** The Registered Product Data search is official and field-rich, but its disclaimer currently prevents treating it as a reusable production dataset. Extraction/scraping is not recommended.

### 5.2 DRAP National Essential Medicines List

1. **Source name:** National Essential Medicines List (NEML), including the current and archived editions published by DRAP.
2. **Organization/maintainer:** DRAP / Government of Pakistan.
3. **Official URL/documentation:** [National Essential Medicine Lists](https://www.dra.gov.pk/publications/national-essential-medicine-lists/) and [DRAP notifications](https://www.dra.gov.pk/category/about_us/legislation/notifications/).
4. **Data provided:** Pakistan essential-medicine policy list, with medicine names and presentation details as present in the edition.
5. **Active ingredients:** Yes at the list level.
6. **Aliases/synonyms:** No comprehensive alias set.
7. **Drug identifiers:** No stable medicinal-product identifier documented; list entries are not registration numbers.
8. **Brand/product mappings:** No; it is not a registered-product or manufacturer registry.
9. **Drug-drug interactions:** No.
10. **Interaction severity/classification:** No.
11. **Geographic scope:** Pakistan policy context.
12. **Pakistan-specific usefulness:** Useful for coverage analysis and policy context, not proof of product registration, availability or safety.
13. **Access method:** Official publication page and downloadable PDF editions.
14. **Formats:** PDF; no official structured NEML dataset was found.
15. **Version/release information:** Yes by edition year and notification/publication date; prior lists are archived.
16. **Update frequency:** Periodic, not a documented fixed cadence.
17. **Licensing/redistribution:** No explicit reusable data license was found; the DRAP site reserves rights.
18. **Commercial-use considerations:** Legal/DRAP permission review is required before extracting and redistributing a structured derivative.
19. **Attribution requirements:** **Unknown** beyond normal government-source citation; obtain explicit terms.
20. **Reliability/authority:** High for the published Pakistan essential-medicines policy document; not a product or DDI authority.
21. **Integration difficulty:** Medium for a one-time PDF extraction, high for safe repeatable versioning and rights clearance.
22. **Major limitations:** PDF-only, no product/brand/manufacturer registration linkage, no DDI, and unclear reuse terms.
23. **Recommendation:** **Supplementary; requires legal review before extraction**.

## 6. Licensing and commercial-use analysis

### Lowest licensing risk for the first technical phase

- **RxNorm CPC:** Public domain, no UMLS license required, with explicit release/version/checksum support. Use only the CPC content until full-RxNorm source restrictions are reviewed.
- **FDA GSRS/openFDA UNII and openFDA SPL:** Public-domain/CC0 statements are favorable. Preserve source/release provenance and disclaimers.

### Sources that require explicit legal or contractual clearance

- **DrugBank:** The default terms expressly prohibit safety-critical use and building a DDI database unless an executed subscriber order specifically permits it. A normal API subscription must not be assumed sufficient.
- **FDB and Micromedex:** Proprietary. Contracts must cover commercial pharmacy decision support, source display, local caching/storage, derivative normalization, historical snapshots, service availability, audit rights, and termination/export behavior.
- **KEGG:** Non-academic use requires a commercial license; the public API is not available for this commercial use by default.
- **WHO ATC/DDD:** Publicly searchable does not mean freely redistributable. Published guidelines bar commercial copying/distribution, and complete-index order terms require review.
- **DrugCentral:** CC BY-SA may permit commercial reuse, but attribution and ShareAlike effects on a combined database require legal analysis.
- **DRAP registry/NEML:** No reusable structured-data license was found. The registry's provisional disclaimer is an immediate blocker until DRAP grants written permission and structured access.

### Sources unsuitable under current public terms

- **DDInter 2.0:** CC BY-NC-SA is incompatible with commercial production use without a separate license.
- **Unfiltered PubChem content:** Contributor-specific rights vary. Only records from an approved source/license whitelist could be considered.

No source should be copied into the repository merely because it can be viewed or downloaded. Procurement must record the exact licensed dataset/module, permitted purpose, data fields, territories, users, storage rules, redistribution/display rights, attribution, change/termination rights, and whether source text/references may be shown to customers.

## 7. Recommended multi-source architecture

1. **Identity backbone:** Ingest a pinned RxNorm CPC release into source-scoped staging, preserve RXCUI/term type/relationship provenance, and promote only deterministically accepted ingredient concepts.
2. **Substance enrichment:** Add FDA GSRS/UNII as a separately versioned source for substance-level identifiers and source-supported names. Do not let an alias alone auto-merge ambiguous substances.
3. **Pakistan product layer:** Obtain an official DRAP bulk export and written permitted-use terms. Preserve the DRAP registration number and product record independently, then map each source ingredient string to the identity layer through explicit verified/review-required states.
4. **Interaction layer:** Procure a structured clinical DDI source only after clinical, technical and legal acceptance. Preserve each source's pair IDs, native classifications, evidence/references and release; do not create a universal severity by inference.
5. **Supporting evidence layer:** Store versioned SPL/label records as source evidence where useful, but do not convert narrative text into authoritative interaction pairs through LLM extraction or unsupported automation.
6. **Deterministic resolution:** Product input resolves to a DRAP product, then to explicitly verified ingredient relationships, then to exact normalized ingredient IDs, then to source-specific DDI assertions. Any unresolved step returns an explicit insufficient/unknown state.
7. **Release governance:** Pin immutable source releases/checksums, stage changes, validate schemas and referential integrity, compare additions/removals, require review for ambiguous mappings, and retain historical releases for audit.
8. **Source independence:** Keep source assertions separate even when they appear to describe the same pair. Reconciliation policies must be versioned and clinically approved; disagreement is not silently collapsed.

This architecture fits the existing `DataSource -> SourceRelease -> IngestionBatch -> ProvenanceRecord -> stored assertion` chain. No schema blocker was identified during this evaluation; source-specific adapters may reveal additional requirements later, which should be documented before schema changes.

## 8. Risks and gaps

- No reviewed public DDI source is both clearly acceptable for commercial production and fully demonstrated to meet MedSenseAI's structure, evidence, versioning, traceability and clinical-governance needs.
- Public documentation is insufficient to rank FDB, Micromedex and a specially licensed DrugBank offering conclusively. Vendor demonstrations and contracts are required.
- Pakistan product data is not presently available as a documented official bulk/API release, and the public DRAP registry disclaimer conflicts with production ingestion.
- Pakistan coverage in commercial identity/DDI products is unknown.
- Source-native definitions differ. Severity, contraindication, precaution, evidence level and management text cannot be merged by label similarity.
- Identity resolution across salts, hydrates, esters, mixtures, biologics, dose forms and combination products needs a conservative, reviewed policy.
- Public sources can revise past records. A future ingestion system needs full-snapshot comparison and historical retention, not only incremental pulls.
- Source licenses can change. License text and effective date must be captured with every approved source release.
- Editorial quality, coverage metrics, correction SLAs, release rollback, and per-assertion traceability remain open procurement questions for commercial DDI vendors.

## 9. Proposed next source to integrate first

**RxNorm Current Prescribable Content, using one pinned monthly release—not the full RxNorm release.**

## 10. Exact reason for choosing it

RxNorm CPC is the best first source because it is official, structured, versioned, archived, checksummed, public domain, available without a UMLS license, and designed around normalized drug names, identifiers and explicit relationships. It can exercise MedSenseAI's provenance, release, identity, alias, external-identifier and relationship foundations without importing DDI claims or pretending to deliver clinical safety decisions. Its US scope is a known limitation, so it is an identity backbone only; it does not replace DRAP product data, GSRS substance identity, or a separately licensed clinical interaction source.

Before any implementation begins, record the exact CPC release URL, date, checksum, NLM terms snapshot, selected RRF files/fields, allowed term types, retirement rules, and the deterministic acceptance/quarantine policy in a source-specific ingestion specification.

## Unresolved questions requiring external decisions

1. Will DRAP provide a versioned structured export and written permission for commercial storage, transformation, attribution and customer-facing use?
2. Which commercial DDI vendors will contractually permit safety-sensitive pharmacy use, local audit snapshots, normalized derivative keys and Pakistan deployment?
3. Which vendor provides the strongest Pakistan-relevant ingredient coverage and the required per-assertion evidence/source traceability?
4. Must DDI evidence text be displayed to end users, or is storing/displaying source references and native summaries sufficient? This materially affects license scope.
5. How should ShareAlike-licensed sources be isolated, if used at all, from proprietary datasets and service outputs?
6. Is ATC classification required in the first product phase? If so, what commercial electronic-index license is available for the intended deployment?
