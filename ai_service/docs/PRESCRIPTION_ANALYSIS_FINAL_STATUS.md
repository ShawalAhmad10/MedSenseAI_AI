# MedSenseAI Prescription Analysis Final Status

**Date:** 2026-09-09
**Status:** ENGINEERING COMPLETE
**Core status:** FROZEN FOR CURRENT FYP SCOPE

## Purpose

Prescription Analysis is the deterministic evidence-structuring layer between
the frozen OCR core and downstream medicine/Product mapping.

Flow:

OCRResult
→ Prescription Analysis
→ medication candidates + instruction evidence
→ Product mapping
→ authoritative pharmacy Product
→ confirmation where required
→ cart
→ centralized DDI

Prescription Analysis does not perform DDI directly.

## Implemented scope

The module provides:

- source-preserved medication-like candidate extraction;
- explicit strength/unit extraction from medication-like OCR lines;
- multi-word medication candidate support;
- deterministic source-line ordering;
- exact OCR source-line preservation;
- OCR line confidence preservation;
- instruction-like line detection;
- separate preservation of instruction evidence;
- propagation of OCR review requirements;
- review escalation when OCR confidence is missing;
- review escalation for suspicious OCR-name characters;
- blocked handling for unusable OCR states;
- deterministic handling of documents with no medication candidates;
- duplicate source lines preserved as distinct evidence;
- stable candidate identifiers based on source-line position.

## Safety properties

The module deliberately does NOT:

- correct medicine spelling;
- guess medicine names;
- use a medication dictionary to identify candidates;
- fuzzy-match uncertain medicine text;
- resolve RxNorm identities;
- resolve Product IDs;
- normalize ingredients or salts;
- clinically interpret instructions;
- infer dose, frequency, route, or duration;
- associate an instruction with a particular medicine automatically;
- make prescribing recommendations;
- make a DDI decision;
- send raw OCR text directly to DDI.

Instruction lines are preserved as unlinked evidence only.

## Example

Source OCR:

`Amoxicillin 250 mg`

Structured evidence:

- raw name: `Amoxicillin`
- raw strength: `250 mg`
- exact source line preserved
- OCR source confidence preserved

For uncertain OCR such as:

`Amoxici?lin 500 mg`

the text remains:

`Amoxici?lin`

It is not changed to `Amoxicillin`.

The candidate is instead marked for review.

## Supported structural strength examples

Current deterministic parser covers forms such as:

- `500 mg`
- `250 mcg`
- `1 g`
- `5 mL`
- `1000 IU`
- `1%`
- `125 mg/5 mL`

These are structural evidence patterns and are not proof that preceding text is
an authoritative medication identity.

## Instruction handling

Instruction-like lines such as:

- `Take one tablet twice daily`
- `Take after meals`
- `Continue for 5 days`
- `Use as directed`

are not medication candidates.

They are preserved separately as raw instruction evidence.

The module does not automatically link an instruction to a medication.

## Validation

Targeted Prescription Analysis test suite:

**25 passed**

Coverage includes:

- clean single candidate;
- multiple candidates;
- multi-word names;
- supported strength/unit forms;
- instruction exclusion from medication candidates;
- numeric instruction lines;
- headers;
- missing strength;
- suspicious OCR text;
- missing line confidence;
- OCR review propagation;
- no-text OCR;
- exact evidence preservation;
- duplicate evidence;
- stable ordering;
- no identity normalization;
- instruction preservation;
- instruction non-linking;
- instruction-only documents;
- instruction confidence review propagation.

## Boundaries

This is an engineering/FYP evidence-extraction layer.

It does not establish:

- clinical correctness;
- real-world prescription accuracy;
- real handwriting accuracy;
- production pharmacy readiness;
- regulatory approval.

Real prescriptions require human review according to the OCR and downstream
mapping safety policies.

## Freeze decision

The standalone Prescription Analysis core is ENGINEERING FROZEN for the
current FYP scope after regression verification.

Future changes require a documented reason such as:

- reproducible extraction defect;
- approved new prescription format;
- approved real-world evaluation data;
- approved contract evolution.

The next layer is Prescription Candidate → Product Mapping / Confirmation.
