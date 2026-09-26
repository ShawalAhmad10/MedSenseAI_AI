# MedSenseAI Prescription Product Mapping Final Status

**Date:** 2026-09-09
**Status:** ENGINEERING COMPLETE
**Core status:** FROZEN FOR CURRENT FYP SCOPE

## Purpose

This layer connects source-preserved Prescription Analysis medication candidates
to authoritative amnaMedcopy pharmacy Product candidates.

Flow:

OCR
→ Prescription Analysis
→ MedicationCandidate
→ Prescription Product Matcher
→ authoritative Product candidate(s)
→ explicit confirmation
→ Cart
→ centralized DDI

This module does not add products to the cart and does not perform DDI.

## Authoritative partner contract

Matching uses validated partner Product records with:

- `product_id`
- `product_title`
- `product_generic_name`
- `product_salt`
- `product_requires_rx`
- `product_status`

`product_id` remains the authoritative Product identity.

## Matching policy

Prescription candidate identity matching is deliberately conservative.

The matcher:

- uses exact deterministic normalized-name matching;
- matches only against `product_generic_name` and `product_salt`;
- does not use `product_title` as authoritative medicine identity;
- excludes inactive Products;
- compares explicit strength evidence where Product source text declares strength;
- preserves missing Product strength as unknown;
- excludes explicitly contradictory Product strength;
- returns deterministic Product ordering;
- never automatically confirms or selects a Product.

## Outcomes

The matcher returns one of:

### UNIQUE_CANDIDATE

Exactly one active authoritative Product satisfies the governed matching rules.

This still requires explicit confirmation before cart addition.

### AMBIGUOUS_CANDIDATES

Multiple authoritative Products satisfy the matching rules.

Human review/selection is required.

### UNMAPPED

No authoritative active Product satisfies the matching rules.

No Product is invented or selected.

### SOURCE_REVIEW_REQUIRED

The upstream prescription candidate itself requires review.

Product matching is blocked.

## Anti-hallucination policy

The module does NOT:

- fuzzy-match medicine names;
- repair OCR spelling;
- infer a Product from a brand/display title;
- guess missing medicine identity;
- guess strength;
- resolve ambiguity automatically;
- select the first Product automatically;
- add Products to cart automatically;
- invoke DDI directly.

Example:

`Amoxcillin 250 mg`

does not silently become:

`Amoxicillin 250 mg`

It remains unmapped/review-required unless a governed exact source match exists.

## Strength evidence

Supported deterministic examples include:

- `250 mg`
- `500 mcg`
- `1 g`
- `5 mL`
- `1000 IU`
- `1%`
- `125 mg/5 mL`

Ratio strengths preserve denominator evidence.

Therefore:

`125 mg/5 mL`

does not match:

`125 mg/10 mL`

when the Product explicitly declares the conflicting strength.

## Confirmation boundary

Even `UNIQUE_CANDIDATE` is not an automatic purchase decision.

The intended downstream flow is:

unique candidate
→ explicit user/pharmacist confirmation
→ authoritative Product row
→ normal Cart
→ centralized cart-level DDI

## Validation

Targeted Prescription Product Matcher suite:

**16 passed**

Broader regression covering:

- Prescription Product Matcher
- Prescription Analysis
- Product Mapping contracts
- Product Mapping preparation

Result:

**62 passed**

Coverage includes:

- exact generic-name matching;
- exact salt matching;
- deterministic case/whitespace normalization;
- no fuzzy typo correction;
- no Product-title identity inference;
- inactive Product exclusion;
- explicit strength mismatch rejection;
- strength match evidence;
- absent Product-strength handling;
- ambiguous Product results;
- source-review blocking;
- candidates without strength;
- deterministic ordering;
- mandatory confirmation;
- liquid ratio-strength equality;
- liquid ratio-strength denominator mismatch.

## Existing integration alignment

The matcher does not replace the existing partner Product adapter.

Existing partner architecture remains:

authoritative Product row
→ structural Product adapter
→ governed `product_salt`
→ existing exact DDI ingredient resolver
→ cart-level DDI

Prescription Product Matching operates before that boundary.

## Boundaries

This is an engineering/FYP Product-candidate matching layer.

It does not establish:

- clinical correctness;
- prescription correctness;
- real-world pharmacy Product coverage;
- regulatory approval;
- safe dispensing without human review.

## Freeze decision

The standalone Prescription → Partner Product Mapping core is
ENGINEERING FROZEN for the current FYP scope after regression verification.

Future changes require a documented reason such as:

- reproducible matching defect;
- approved partner Product-contract change;
- governed new identity source;
- approved real-world Product-matching evaluation.

The next layer is:

Product confirmation
→ Cart handoff
→ centralized DDI.
