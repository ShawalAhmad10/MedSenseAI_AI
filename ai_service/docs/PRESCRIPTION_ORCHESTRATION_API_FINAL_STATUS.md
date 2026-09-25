# Prescription Orchestration & API Final Status

**Status:** ENGINEERING COMPLETE / FROZEN FOR CURRENT FYP SCOPE
**Date:** 2026-09-09

## Flow

Prescription image
→ validated PNG/JPEG input
→ DOCUMENT_BASIC_V1 preprocessing
→ PaddleOCR
→ frozen OCR confidence policy
→ Prescription Analysis
→ authoritative Partner Product matching
→ explicit confirmation required

The AI service does not automatically add products to cart and does not
perform prescription-owned DDI.

## Validation

Prescription orchestration targeted tests:

- 11 passed

Prescription API targeted tests:

- 9 passed

Broader prescription/OCR/product regression:

- 106 passed

No failures.

## Real Runtime Validation

Unified Python 3.12 runtime verified with:

- FastAPI
- Uvicorn
- PaddleOCR
- PaddlePaddle 3.3.1
- scikit-learn
- joblib
- SQLAlchemy
- MedSenseAI DDI runtime imports

A real FastAPI prescription request was executed using the frozen PaddleOCR
models.

Observed runtime:

- HTTP request completed successfully
- approximately 25 seconds end-to-end
- OCR status: SUCCESS
- OCR review_required: false
- detected text:
  - PRESCRIPTION
  - Amoxicillin 250 mg
- Prescription Analysis status: ANALYZED
- candidate:
  - Amoxicillin
  - 250 mg
- Product match status: UNIQUE_CANDIDATE
- Product ID: 10
- strength evidence: MATCHED
- confirmation_required: true
- review_required: false

## Safety Boundaries

The prescription pipeline does not:

- fuzzy-correct medication names;
- invent products;
- auto-confirm products;
- directly mutate cart state;
- directly perform DDI;
- bypass human confirmation.

Downstream architecture remains:

confirmed authoritative Product
→ normal partner cart
→ centralized cart-level DDI.

## Next Integration Layer

Partner PostgreSQL Product rows
→ partner Node backend
→ Prescription API
→ frontend Product confirmation
→ normal cart
→ centralized DDI warning.
