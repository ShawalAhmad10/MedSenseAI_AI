# MED-SALES-00: Sales AI foundation

Date: 2026-09-03. Status: documentation foundation frozen for development; partner integration and real-world model acceptance remain gated. No implementation, dataset generation, or model training is part of this task.

Companion specification: [SALES_DATA_CONTRACT.md](SALES_DATA_CONTRACT.md). In both documents, **A** = `REQUIRED_BY_PROJECT`, **B** = `SUPPORTING_ENGINEERING`, **C** = `OPTIONAL_FYP_ENHANCEMENT`, and **D** = `DEFERRED_UNTIL_PARTNER_DATA`. A required capability can have a separate deferred implementation decision; deferral does not remove the requirement. Numerical windows, thresholds, schemas, and simulation parameters introduced here are engineering decisions, not quotations from the SRS.

## 1. Source-of-truth requirements and inspected evidence

### Source register

| Key | Source file | Authority and inspected scope |
|---|---|---|
| SRS | `Final_Evalution_MedSenseAI_SRS.pdf` | User-designated current MedSenseAI SRS. Inspected relevant objectives, constraints, functional/non-functional requirements, commerce use cases, sales/lead/inventory diagrams, and conceptual data diagrams. |
| TASK | User's MED-SALES-00 instructions, supplied in chat and `C:/Users/shawa/.codex/attachments/1a490557-b998-4f08-820a-2c06f52ab560/pasted-text.txt` | Current work authorization: documentation only, independent canonical contracts, no DDI changes, and the implementation sequence specified by the user. |
| RULES | [AGENTS.md](../AGENTS.md) | Binding engineering and medical-safety constraints. |
| ARCH | [docs/architecture.md](architecture.md), Current foundation | Existing `src/medsense_ai` layout and future `lead_scoring`, `sales_analytics`, `recommendation_engine` responsibilities. Architecture description is not a detailed commerce specification. |
| CODE | `src/medsense_ai/lead_scoring/__init__.py`, `src/medsense_ai/sales_analytics/__init__.py`, `src/medsense_ai/recommendation_engine/__init__.py` | All three contain only deferred-boundary docstrings. No existing sales implementation or contract to preserve in these packages. |
| CONFIG | [pyproject.toml](../pyproject.toml), [README.md](../README.md), `.env.example`, `src/medsense_ai/config.py` | Python 3.11+, typed configuration, existing dependency policy, portable database configuration, and no sales-specific configuration in inspected files. |
| DATA | `src/medsense_ai/domain/models.py`, `MedicineProduct`; file inventory of domain/schemas/API packages | Existing product persistence is a medical identity/provenance model, not an authoritative partner commerce catalog. Inspected schema inventory contains no customer/order/cart/inventory commerce models. Do not reuse medical primary keys as sales IDs. |
| AUDIT | [docs/FULL_PROJECT_AUDIT.md](FULL_PROJECT_AUDIT.md), sections 5, 7 and 18, dated 2026-08-30 | Historical supporting evidence: sales and lead packages were skeletons; calls for business objectives, labeled data, metrics, event/order schemas and deterministic KPIs. Its global implementation-status claims are historical and are not used to reassess the completed DDI system. |

The SRS was supplied outside this repository at both:

- `C:/Users/shawa/Downloads/Final_Evalution_MedSenseAI_SRS.pdf`
- `C:/Users/shawa/OneDrive/Desktop/customer-churn-intelligence-platform/docs/Final_Evalution_MedSenseAI_SRS.pdf`

Both files are 2,590,846 bytes with SHA-256 `7ae1ef9fb63b3f93cfc6916245e0c62799a3d9922ffbe42bb8467982427832d6`. They are identical copies, not competing revisions. The other project's requirements and decisions are not MedSenseAI authority. No SRS is tracked in the inspected MedSenseAI documentation inventory. The PDF identifies MedSenseAI and year 2026 but does not establish a signed revision/approval history. Treat this user-designated copy as the working requirements authority, not proof that no newer revision exists. Keep the fingerprint so future contributors can obtain the same source without copying an unauthorized third file in this task.

References below use **printed page numbers**, followed by PDF page numbers where useful. Printed p. 6 is PDF page 16; printed p. 21 is PDF page 31. Diagrams were visually inspected because their labels are not captured by ordinary text extraction.

### Requirement ambiguities that must remain visible

- SRS 3.2.8 emphasizes potential repeat customers; EUC-12 also says high-value customers and better conversion. Purchase probability and monetary customer value are different targets. This foundation chooses repeat-purchase probability; it does not claim to estimate lifetime value.
- SRS 6.11, Figure 12, p. 21 explicitly says to analyze the sales funnel and detect drop-off points. It specifies no stage list, denominator, attribution window, or ML algorithm.
- SRS 8.8, Figure 27, p. 36 contains a future-demand prediction step. SRS 3.2.10 requires demand reports but specifies no forecasting horizon, model, or accuracy. TASK explicitly sequences forecasting later, only if justified. Preserve the diagram-level requirement and defer implementation pending clarification/data readiness.
- SRS 5.3 requires login for adding to cart. Anonymous browsing/session analytics are an engineering extension; anonymous cart purchases are not asserted as current project functionality.
- Order creation/status changes/cancellation are supported by EUC-11 and Figure 16. Neither specifies the exact paid/fulfilled/delivered state that constitutes a completed purchase. The completion definition below is a development convention requiring a partner mapping decision.
- SRS sections 9-11 contain conceptual class/domain/ER diagrams (Figures 30-32, pp. 42-44). They support customer, product, cart, order/item, inventory and lead-score concepts; they do not establish the partners' final schema or authorize importing their suggested IDs/medical attributes into sales models.
- SRS 3.3.2/3.3.3 contains unrelated CFG/coverage wording. It is not a new sales capability. General data consistency, modularity, security, and maintainability remain relevant.
- The SRS's medicine-alternative recommendations require a separate governed clinical design. Sales promotion or popularity cannot establish medical suitability. The current task and AGENTS.md protect the completed DDI core regardless of diagrams mentioning it.

## 2. Requirement traceability

IDs below are local traceability IDs, not invented SRS identifiers.

| ID | Requirement/capability | Source file and section/identifier | Classification | Implementation implication |
|---|---|---|---|---|
| R01 | Analyze sales funnels and identify drop-offs | SRS 6.11, Figure 12, p. 21 (PDF 31) | A REQUIRED_BY_PROJECT | Deterministic ordered-stage counts and conversion/drop-off metrics; no funnel ML requirement. |
| R02 | Browse/select an available medicine and add it to a logged-in cart | SRS 5.3 EUC-03, Table 7, p. 10; 8.4 Figure 23, p. 32 | A REQUIRED_BY_PROJECT | Product/cart concepts are justified; successful cart additions must be distinguishable from attempts. |
| R03 | Create orders; manage status and cancellation | SRS 7.4 Figure 16, p. 25; 5.11 EUC-11, Table 15, p. 14; 8.10 Figure 29, pp. 40-41; 12.3.2 Figure 36, p. 47 | A REQUIRED_BY_PROJECT | Stable orders/items and timestamped lifecycle facts; creation alone does not prove purchase completion. |
| R04 | Score purchasing behavior to identify potential repeat customers | SRS 3.2.8, p. 6; 5.12 EUC-12, Table 16, p. 14 | A REQUIRED_BY_PROJECT | Supervised future repeat-purchase target and purchase-history features. Exact label/window is B below. |
| R05 | Rank customers and communicate insufficient scoring data | SRS EUC-12 steps 2-6 and alternate flow, p. 14; 6.6 Figure 7, p. 19 | A REQUIRED_BY_PROJECT | Ranked output with data quality/status; do not manufacture scores when required evidence is missing. UI belongs to partner. |
| R06 | Sales statistics, customer behavior, sales trends and demand reports; exportable reports | SRS 3.2.7 and 3.2.10, p. 6; 5.9 EUC-09, p. 13 | A REQUIRED_BY_PROJECT | Reusable deterministic aggregates and exportable result contracts later; no dashboard/API implementation here. |
| R07 | Identify high/low selling products; advise promotion and stock optimization | SRS 3.2.9, p. 6; 5.13 EUC-13, Table 17, p. 15 | A REQUIRED_BY_PROJECT | Evidence-linked descriptive product performance first; any action rule needs a documented policy and sufficient inputs. |
| R08 | Maintain stock and handle unavailable inventory | SRS 5.10 EUC-10, Table 14, p. 13; EUC-03 alternate flow; 7.6 Figure 18, p. 27 | A REQUIRED_BY_PROJECT | Product and inventory quantities have a canonical boundary; inventory editing remains partner work. |
| R09 | Return empty/unavailable analytics when evidence is absent | SRS EUC-09 alternate flow; EUC-13 alternate flow; 6.10 Figure 11, p. 21 | A REQUIRED_BY_PROJECT | Distinguish zero, unavailable, incomplete and immature cohorts. |
| R10 | Predict future demand, as diagram-level intent | SRS 8.8 Figure 27, p. 36 (PDF 46) | A REQUIRED_BY_PROJECT | Preserve traceability; execution deferred by TASK, with clarification required on acceptance. |
| R11 | Medicine-alternative recommendations | SRS 3.2.4, p. 5; 5.5 EUC-05, Table 9, p. 11 | A REQUIRED_BY_PROJECT | Separate later clinical recommendation boundary; no medical substitutions from commerce data. |
| R12 | Data consistency, protected customer data and modular extension | SRS 3.3.3, 3.3.4, 3.3.6, p. 7; RULES Development rules | A REQUIRED_BY_PROJECT | Validated contracts, explicit failure states, minimal sensitive fields, isolated modules. |
| E01 | Exact four-stage funnel, event instrumentation and 7-day session attribution | This document section 5; CONTRACT sections 3, 6; supported by R01-R03, but no exact SRS rule | B SUPPORTING_ENGINEERING | Versioned operational definition; product-view telemetry and purchase completion are explicit assumptions. |
| E02 | 60-day observation, 30-day target, eligible prior purchasers and weekly training snapshots | This document section 6; CONTRACT section 7; operationalizes R04-R05 | B SUPPORTING_ENGINEERING | Freeze an honest repeat-purchase experiment; revise/version when real purchase cadence is known. |
| E03 | Canonical opaque identifiers, availability timestamps, coverage and adapter validation | TASK Canonical data model/Architecture; RULES typed schemas; CONTRACT | B SUPPORTING_ENGINEERING | Keep partner schema changes outside analytics and ML. |
| E04 | Reproducible synthetic commerce development with hidden latent behavior | TASK Synthetic data strategy; SRS 2.5 permits possible synthetic/public training data, p. 2 | B SUPPORTING_ENGINEERING | Synthetic evidence demonstrates engineering only; no data generation now. |
| E05 | Bounded model comparison and temporal evaluation | TASK Model strategy/Time-aware splitting; this document section 11 | B SUPPORTING_ENGINEERING | Two existing-library model families; no training now. |
| E06 | Anonymous browse analysis and derived repeated-purchase cohort statistics | This document section 5; not specified by SRS | C OPTIONAL_FYP_ENHANCEMENT | Explicitly separate from the logged-in cart flow and main funnel totals. |
| E07 | Top-decile lift and optional High/Medium/Low display bands | This document sections 6, 11; SRS requires ranking, not these metrics/bands | C OPTIONAL_FYP_ENHANCEMENT | Supplement probability/ranking; use a separately versioned display policy if adopted. |
| D01 | Final source status mappings, timestamps, identity, consent/access and UI integration | TASK Partner integration boundary; SRS EUC-03/EUC-11/EUC-12 | D DEFERRED_UNTIL_PARTNER_DATA | Adapter specification must be agreed before real scoring or completed-purchase claims. |
| D02 | First-time prospect scoring, customer lifetime value and causal marketing uplift | SRS EUC-12 uses broad value/conversion language without a target; no detailed requirement | D DEFERRED_UNTIL_PARTNER_DATA | No claims that the repeat-purchase model implements these different problems. |
| D03 | Forecasting execution, reorder quantities and promotion-effect estimates | TASK planned order; SRS R07/R10 above | D DEFERRED_UNTIL_PARTNER_DATA | Require adequate history, stock coverage, business policy and acceptance criteria; record SRS clarification. |
| D04 | Real clinical recommendation integration and any commerce recommendation variant | TASK planned order; SRS R11; RULES Medical safety | D DEFERRED_UNTIL_PARTNER_DATA | Separate specification and verified clinical sources; popularity is never a clinical proxy. |

## 3. Scope

Freeze requirements evidence, deterministic funnel semantics, a supervised lead target, canonical data fields/events, a synthetic development strategy, temporal evaluation, and future module responsibilities. Provide explicit missing-data behavior and a path to partner adaptation. This is the design foundation for R01-R09, not implementation completion of those requirements.

## 4. Non-scope

No models, generated datasets, scripts, implementation packages, API routes, frontend, migrations, external dataset search/download, dependency changes, or partner schema integration. No DDI code/data/models/runtime/artifacts are modified or reused as synthetic commerce records. No medical facts, prescriptions, diagnoses, ingredients, dosages, medication schedules, interaction outputs, or clinical recommendation features enter sales ML. No automated outreach, price changes, promotion execution, purchasing or inventory updates.

## 5. Sales Funnel definition

The funnel is deterministic analytics. SRS Figure 12 supports its purpose, not an ML implementation. Version `funnel_v1` uses a **session-level, any-product journey**. It is not a per-product conversion metric and does not require that every viewed product is eventually purchased.

| Stage | Exact meaning and entry condition | Required event/time | Evidence/status | Identifiable customer needed? |
|---|---|---|---|---|
| F1 Product view | First successful display of a selected product's details in a session; search results/impressions alone do not qualify. This sets entry time V. | `product_viewed.occurred_at`, product ID and session ID | Selection/browsing supported by EUC-03/Figure 23; detail-display instrumentation is B. | No; stable session sufficient. |
| F2 Cart addition | At least one successful positive item addition after F1 in that session, not a click or rejected stock request. | `cart_item_added.occurred_at`, cart/product/session IDs, quantity | Cart action A; event representation B. | Main SRS flow requires login; aggregation can technically use pseudonymous session/cart IDs. |
| F3 Order creation | A durable order is created from a cart qualifying at F2, with the same originating session and explicit cart-to-order link. | `order_created.occurred_at` and matching Order | Order placement A; chain attribution B. | No direct customer identity needed for counting; source must satisfy its login policy. |
| F4 Completed purchase | The F3 order reaches the agreed successful fulfilled-and-payment-confirmed state by V + 7 days. A placement acknowledgement is insufficient. | `purchase_completed.occurred_at`, matching order ID | Completion criterion is B for simulation; real-state mapping is D. | No direct identity needed if the order is linked to its session. |

For the synthetic profile, session activity ends after 30 minutes of inactivity, capped at 24 hours. Product/cart actions and order creation belong to the originating session. A later lifecycle event carries that session ID for attribution without extending the session. Real partners must supply stable sessions or a documented equivalent reconstruction; do not silently regroup by customer or guess from IP addresses. These session limits are B assumptions.

For each session use its earliest F1 time V and look for the existence of a causally linked F1 -> F2 -> F3 -> F4 chain. Timestamps are nondecreasing; explicit cart/order relations resolve lifecycle causality. Distinct equal-time events may qualify, since timestamp precision is finite. Duplicate events never increase counts. Keep a session once at each stage even if it has many products/carts/orders; an order belongs to at most one originating session. Stop attribution at V + 7 days. A later purchase counts in sales reports, not this funnel's conversion.

Use a cohort whose V falls in reporting interval [a, b). Include only sessions whose full 7-day follow-up is covered by complete source telemetry. Partial, unsupported and immature cohorts are reported separately, with their counts and reasons. Let N1, N2, N3, N4 be the nested counts of mature eligible sessions reaching each stage. Then:

- Entry-stage share: N1/N1 = 1 when N1 > 0.
- Adjacent conversion F(i) -> F(i+1): N(i+1)/N(i).
- Adjacent drop-off count: N(i) - N(i+1); rate: 1 - N(i+1)/N(i).
- Cumulative conversion to F(i): N(i)/N1; cumulative drop-off: 1 - N(i)/N1. Overall purchase conversion is N4/N1.
- A zero denominator returns `not_applicable`, not 0%. Missing stage coverage returns `unavailable` for affected metrics. With incomplete telemetry, do not infer zero conversion or behavioral abandonment.

F1-F3 must actually be observed; an order without preceding view/cart evidence is an **unattributed order**, not an invented full journey. Report its count alongside telemetry coverage. If only order data is supported, expose separately named order-creation-to-completion cohort statistics with their own entry times and denominator; do not label that result the full funnel.

No exposure stage is introduced. SRS Figure 29 (p. 40) and Figure 36 (p. 47) show cart review and order confirmation, but do not define a separate checkout-start milestone. v1 therefore includes confirmation within order creation rather than adding another instrumentation assumption. Repeat purchase is a separate customer-level outcome, not F5: customers span many sessions and have different denominators. An optional 30-day repeat cohort report may count customers with another newly created/completed order within 30 days of their index completion, using fully observed cohorts and customer identity. No refill or medication-adherence inference follows.

## 6. Lead Scoring problem definition

### Selected target: `repeat_purchase_30d_v1`

At observation time **T**, for a customer with at least one known completed purchase during **[T - 60 days, T]**, predict whether that customer creates a **new order after T** that reaches `purchase_completed` by **T + 30 days**. Both creation and completion must be in **(T, T + 30 days]**. One such order makes y = 1; otherwise y = 0 only after complete follow-up. A follow-up window that is still open or incompletely observed is unlabeled. An order still pending at the end of fully observed follow-up is a nonconversion for this window.

The unit is `(source_namespace, customer_id, T)`. Features summarize only the preceding 60 days and facts available by T. Model-development snapshots occur each Monday at 00:00 UTC; future runtime scoring may use another T with the same point-in-time logic. The weekly sampling policy limits repeated near-identical examples; it is not an SRS requirement. Customer IDs identify rows and joins and are never input features.

Why this target: it directly operationalizes SRS 3.2.8's repeat-customer objective. A 60-day lookback provides purchasing and engagement history while bounding history dependence. A 30-day horizon gives repeat behavior more opportunity than a 7-day immediate-conversion target. These are development choices, not evidence of medicine consumption or real purchase cadence. Compare actual cadence/label maturity before real-data adoption; changing windows requires a target version and fresh evaluation.

Eligibility deliberately excludes customers with no prior completed purchase in the lookback, including new shoppers and long-lapsed purchasers. Return `out_of_scope` for them, not a low probability. Their first-purchase/reactivation models require a separate later decision. A customer need not have recent browsing if purchase history qualifies. The eligible cohort must have complete required source coverage over the lookback; do not select customers using their future activity.

Use recency/frequency of historical purchases, views, sessions and cart activity; optional past monetary aggregates require complete, comparable currency data. Missing behavioral telemetry is not equivalent to zero behavior. A separately trained/versioned purchase-only model can be considered later, never silently substituted at inference. See the contract for feature availability, identity and late-arrival rules.

Excluded targets: high lifetime value, medical need, adherence, clinical risk, likelihood of responding to outreach and causal marketing uplift. A likely repeat purchaser may buy without any intervention; this model cannot prove a promotion helps.

### Output semantics

- `model_probability` is the estimator's predicted probability of `repeat_purchase_30d_v1` for the eligible cohort. Without recalibration, `conversion_probability = model_probability`. If calibration is applied, retain the raw estimator probability and separately identify the calibrated conversion probability/method. Both values are in [0,1]; calibration does not establish real-world validity of synthetic training.
- Optional `lead_score = 100 * conversion_probability`, displayed with documented rounding, is only a monotonic presentation transform. It is not additional model confidence or monetary value. Rank using unrounded probability with opaque ID as a deterministic tie-break, never as a feature.
- High/Medium/Low bands are optional. Thresholds are not specified in the SRS and are not frozen here; they require validation and business capacity/cost decisions. Any later band policy must have a version and preserve the underlying probability.
- Output includes customer ID, T, target/horizon version, model/feature/contract versions, data origin, coverage status and reason, plus nullable probabilities/score. `insufficient_data`, `out_of_scope` or `model_unavailable` returns no fabricated numeric score. Adequate but sparse data may carry a limited-history flag, satisfying EUC-12 without asserting numeric certainty.
- A synthetic-trained model's output is labeled a **synthetic-development estimate**. It is not a validated real-customer conversion probability and is not enabled for operational customer prioritization.

## 7. Sales Analytics / Optimization boundary

Start with deterministic facts: distinct created/completed/cancelled orders, completed units by product, item subtotal by currency, average completed-order item subtotal, historical purchase frequency, and period-over-period counts. State the observation period, coverage and denominator. Recognize sales at completion, using the immutable order-time item amounts; do not call item subtotal net revenue or profit because refunds, taxes, shipping, costs and discounts are not fully modeled.

Identify high/low selling products from explicit rankings and observed units, with stock availability/context where known. Zero sales can reflect unavailable stock, not low customer demand. Demand reports initially describe observed sales; they are not unconstrained demand estimates. Data-backed suggestions can state an observed drop-off or product-performance fact and recommend human investigation. Rules for actual promotions, stock thresholds, reorder quantities or product placement require later policy, cost and lead-time inputs. Do not invent optimization benefits or automate actions. Export/report formatting and partner dashboards are required later work, not implemented here.

## 8. Future forecasting boundary

Retain SRS Figure 27's future-demand step as a requirement needing clarification. Follow TASK's conditional sequencing: first evaluate regular transaction history, stockout coverage, product stability, returns, missing periods and operational horizon. Then agree a forecasting acceptance measure and compare a simple temporal baseline before considering ML. No minimum history is presented as a universal rule; the available history must cover multiple instances of the pattern being modeled and leave credible held-out periods. The 12-month synthetic profile below cannot establish real annual seasonality. Forecasting requires a separate design/task and must distinguish observed sales from stock-constrained demand.

## 9. Recommendation Engine boundary

The SRS's actual recommendation requirement is medicine alternatives, not merely products commonly bought together. Keep the existing `recommendation_engine` package name. Sales popularity, carts and co-purchases cannot establish that two medicines are safe alternatives or appropriate together. Clinical recommendation work remains deferred to verified structured sources and separately approved deterministic safety policies; no modifications to the DDI subsystem belong here. A later non-clinical merchandising recommender would be an explicitly scoped extension, with its own permission and evaluation, not fulfillment of clinical R11.

## 10. Synthetic vs real-data policy and dataset sourcing

| Tier | Intended evidence | Conditions and limitations |
|---|---|---|
| 1: Actual partner application data | Final validation and potential operational training after schema/status/identity contracts stabilize | Authorized use, minimized customer data, dependable event histories and availability timestamps, sufficient positive/negative follow-up, and agreed conversion semantics. No real customer/transaction dataset is established by inspected repository evidence. |
| 2: Suitable public data, only if later needed | External robustness checks or justified pretraining | Need timestamped commerce sessions/events and orders, persistent pseudonymous customers, repeated purchases, item/product links, cancellation/completion semantics, useful history and license permitting the intended use. Inventory coverage is additionally needed for stock-aware claims. A flat purchase-only dataset cannot validate browsing/cart funnel features; domain mismatch must be disclosed. No datasets are named, browsed or downloaded here. |
| 3: Controlled synthetic MedSenseAI commerce data | Development, conformance, deterministic analytics and FYP demonstration | Explicit synthetic provenance at dataset, report and model levels. No claim of real pharmacy/customer sampling, business effectiveness, medical facts or generalization. |

SRS 2.5 acknowledges possible synthetic/public training data; it does not certify any particular source. Do not combine tiers into an unlabeled evaluation result. Public-data performance does not establish local pharmacy validity. Real partner validation remains necessary even after a successful synthetic experiment.

The proposed simulation uses 2,500 opaque synthetic customers, 200 abstract products and about 12 months of events (2025-09-01 through 2026-08-31 UTC). Session/order/event counts emerge from a forward stochastic process rather than enforced conversion quotas. Plan roughly 30,000-70,000 sessions and 100,000-300,000 commerce events; report actual counts and repeat-label prevalence when generated. Seed, hidden customer heterogeneity, skewed product popularity, temporal variation, inventory conservation and missing-data scenarios are specified in the contract. Nothing is generated in MED-SALES-00.

## 11. Evaluation principles and bounded model strategy

The repository declares `scikit-learn>=1.7,<1.9`, NumPy and joblib in the **optional `ddi-training` extra**, not base runtime dependencies. This proves a permitted library family exists, not that sales should import DDI training code or require RDKit. A later sales task should declare a separate minimal optional dependency group using compatible versions and record resolved versions. No dependency edits/installations occur here. XGBoost is not currently declared and is not selected.

Compare only two families later: (1) Logistic Regression with train-fitted scaling/imputation where needed, and (2) HistGradientBoostingClassifier for nonlinear tabular patterns. Add a training-prevalence constant predictor for metric context, not as a third model search. Use one predefined configuration per family; at most one documented validation-driven adjustment per family. No broad hyperparameter search, ensembles of candidates, or optimizing the generator to make a chosen model win.

Use validation **average precision (AP, the selected PR-AUC summary)** as the primary ranking-selection metric because repeat conversions may be imbalanced and customer prioritization emphasizes the positive class. Report prevalence and the precise metric definition; do not interchange AP with trapezoidal PR area. Also report ROC-AUC, precision, recall, F1, confusion matrix, Brier score and a reliability/calibration plot. Select any binary threshold on validation using a declared capacity or cost policy, then freeze it; 0.5 is not an assumed business threshold. Report undefined metrics for single-class periods explicitly rather than producing misleading numbers.

Optional top-decile precision and lift quantify prioritization: for n eligible scored rows in a scoring cohort, k = ceil(0.10*n), precision@k = positives in the top k / k, lift@k = precision@k / cohort prevalence. Zero prevalence makes lift undefined. Rank within each T; summarize across times with denominators. This does not estimate intervention uplift.

Calibration is an acceptance concern, not solved by ranking AP. Inspect Brier/reliability before treating probabilities as meaningful; any recalibration uses validation data only, with an internal chronological separation if needed, never the test period. If calibration is poor or uncertain, disclose it and withhold real probability claims. Synthetic accuracy validates learning under a chosen simulation, not the pharmacy problem. Record errors by purchase-history/coverage cohorts without introducing sensitive demographic features. For ties or immaterial ranking gains prefer the simpler model; there is no invented SRS accuracy target.

### Time-aware split for the proposed synthetic calendar

All boundaries are UTC. Snapshot T is sampled on Mondays inside each interval. Features use [T-60 days, T]; labels use (T,T+30 days]. The declared complete observation ends at 2026-09-01 00:00 UTC, exclusive.

| Role | Allowed observation times T | Availability and use |
|---|---|---|
| Warm-up | 2025-09-01 to before 2025-11-01 | History only; no training rows. |
| Training | 2025-11-01 <= T < 2026-03-01 | Use only labels mature and available before the fitting cutoff 2026-04-01. Fit preprocessors/model on these rows only. |
| Purge gap | 2026-03-01 <= T < 2026-04-01 | No supervised rows; avoids training-label windows extending into validation observation times. |
| Validation | 2026-04-01 <= T < 2026-05-01 | Labels must be mature/available before model-selection cutoff 2026-06-01. Choose model/threshold/calibration policy here. |
| Purge gap | 2026-05-01 <= T < 2026-06-01 | No supervised rows; protects test selection from overlapping label windows. |
| Test | 2026-06-01 <= T < 2026-08-02 | Use complete 30-day follow-up available by dataset freeze. Freeze model and all decisions before this period. |
| Tail | Remaining dates through 2026-08-31 | Outcomes/history only; do not relabel immature rows as negatives. |

Keep the training-fitted candidate for the first benchmark; do not quietly refit on validation before reporting that benchmark. Customer overlap across time partitions is allowed and expected for returning-customer prediction. IDs, memorized customer embeddings and future history are prohibited features. Shared historical facts across partitions are normal when known by T; label windows must never cross the next partition's observation start. Weekly snapshots still have overlapping outcomes within a partition, so report distinct customers, row counts and per-time results; avoid treating all rows as independent when estimating uncertainty. A separate customer-disjoint evaluation would answer a different generalization question and is optional later.

Apply the same chronological logic to real data with dates chosen after coverage inspection. Never randomly split rows for convenience. Keep final test outcomes untouched until all choices are frozen. Fit normalization, imputation, feature selection and any resampling exclusively on training data. Exact late-arrival and label-maturity gates are normative in the contract.

## 12. Partner integration and module boundaries

```text
Partner backend/database or authorized export
                 |
         Thin partner adapter
                 |
     Validated canonical sales contracts
          /           |             \
   sales_funnel   lead_scoring    sales_analytics
                  /        \
        offline training    inference
                |              ^
                +-- saved model bundle --+

Later, separate designs: forecasting and recommendation_engine
```

Follow the existing `src/medsense_ai` layout. Later `sales_data` owns typed canonical contracts, validation, coverage and point-in-time selection; `sales_funnel` owns pure deterministic aggregation. Reuse the existing deferred `lead_scoring` and `sales_analytics` package names. Keep `recommendation_engine`, not a duplicate `recommendations` package. No new package directories are created in this task.

Partner-specific readers/mappings belong in an adapter subpackage outside the analytics core (proposed later: `sales_data/adapters`). `sales_data/contracts` and core analytics/feature code must not import adapters, SQLAlchemy models, partner ORM packages, HTTP routes or medical domain/DDI packages. Core functions consume validated canonical records and explicit configuration. An adapter may read the partner's store and map native IDs/statuses/units; changing that store should require adapter changes only. Persistence format and transport remain unresolved; do not equate these entities with database tables.

Offline training later saves the fitted preprocessing/model bundle with target, feature and contract versions, data-origin/split manifests, dependency versions and evaluation. Inference loads a compatible bundle, validates point-in-time features and returns explicit status/output. It never retrains on incoming records. Library validation and sanitized Python logging apply at each boundary; real API request/response schemas are later transport work.

## 13. Risks and blockers

| Risk/blocker | Consequence and resolution |
|---|---|
| Final partner schemas/status semantics unavailable | Does not block canonical development; blocks real completion mapping, source joins and operational integration. Agree adapter conformance examples later. |
| SRS supplied externally, no revision approval history | Preserve filename/hash and sections; obtain controlled source placement/version confirmation later without treating the other project's docs as requirements. |
| Completion, refunds and partial fulfillment undefined | v1 simulation supports full completion or cancellation. Real exceptions cannot be coerced into this profile; extend/version the contract before net-sales or production scoring claims. |
| Missing telemetry/late records/historical availability | Coverage-aware abstention and censored labels; a current database snapshot cannot establish historical feature availability. |
| Synthetic shortcut learning or unrealistic prevalence | Hidden latent parameters excluded; forward event generation, multiple behavioral regimes, seed checks and honest reporting; no real-world claims. |
| Sparse repeat purchasers or too few positives | Report counts and uncertainty; defer model selection if periods lack both classes rather than manufacture conversions. |
| Customer identity/privacy | Stable pseudonyms are still potentially sensitive; minimize data, isolate source scopes, and agree authorized retention/access/deletion with partner before use. |
| Forecasting intent exceeds current acceptance detail | Record SRS Figure 27 and defer execution under TASK; agree horizon, evidence and validation criteria in a later task. |

## 14. Implementation sequence

1. **MED-SALES-01 - Canonical Sales Contracts, Validation and Conformance Tests.** Implement only typed, implementation-neutral `sales_data` contracts/validators for the v1 profiles defined here, source coverage and point-in-time helpers. Add minimal structural non-medical fixtures and unit tests for IDs, event-specific fields, relationships, duplicates/conflicts, temporal boundaries, unavailable telemetry, cancellation/completion and inventory conservation. Demonstrate two different in-memory source shapes mapping to identical canonical records without importing partner ORM code. No bulk dataset, model training, APIs or DDI changes. Run required dependency, import/startup and automated checks at that implementation phase. Acceptance: invalid/missing/late data is explicitly rejected or marked unavailable and valid adapter variants produce equivalent core inputs.
2. **MED-SALES-02 - Deterministic Funnel Analytics.** Implement mature-cohort counts/formulas and unavailable/unattributed handling using small structural fixtures. Validate hand-checkable paths before large data generation.
3. **MED-SALES-03 - Reproducible Synthetic Commerce Generator and Data QA.** Implement the documented forward process, manifests and consistency reports; generate data only when that task is authorized. No model training in the generator task.
4. **MED-SALES-04 - Point-in-time Lead Features, Labels and Splits.** Freeze feature list and construct `repeat_purchase_30d_v1`, eligibility/censoring and temporal manifests with leakage tests.
5. **MED-SALES-05 - Bounded Lead Model Comparison and Offline Inference.** Compare the two families, document synthetic-only results, and save a versioned model bundle.
6. **MED-SALES-06 - Sales Analytics and Explainable Optimization Policies.** Implement supported KPIs and reviewed descriptive suggestions. Keep business action and report/UI integration separate.
7. Later: partner adapter acceptance and real-data validation; forecasting readiness/requirements resolution; separate recommendation specification and implementation in the user-requested order.

## 15. Explicit decisions made

- The user-designated, fingerprinted SRS governs project capabilities; TASK governs this phase and protected boundaries.
- Funnel/drop-offs are required and deterministic; the exact four stages and 7-day session attribution are engineering conventions.
- Lead scoring is future repeat-purchase classification, not lifetime value or clinical risk. v1 uses 60-day history, 30-day outcomes and identified prior purchasers.
- Canonical records use opaque IDs, explicit provenance/coverage and event-time/availability semantics; no partner or medical primary-key coupling.
- Synthetic data is a declared development tier; no dataset or model is produced now.
- Two declared-library model families and temporal purges provide a bounded later comparison.
- Existing domain package names are retained. Decisions are recorded here; the inspected repository has domain-specific medical decision documents, not a general sales ADR file warranting unrelated updates.

## 16. Explicit unresolved decisions

Partner completion/payment/fulfillment/refund mapping; source identity/session linking; actual authorized data access and retention; real telemetry and historical availability; currency/unit conventions; whether 60/30-day repeat behavior matches real cadence; inclusion of first-time/lapsed customers; lead-priority thresholds and engagement capacity; sales policy/cost/lead-time inputs; forecasting horizon and acceptance; clinical recommendation governance; eventual transport/persistence and separate sales dependency declaration. These are later integration/product decisions, not missing values to fabricate in the canonical core.
