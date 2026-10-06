# MedSenseAI Current Integrated System Status

This document describes the current integrated MedSenseAI FYP runtime.

## Operational Database

The application uses one PostgreSQL database:

`medsenseai_pharm`

As of 3 October 2026, backend and both AI services use the local `public` schema. Active Neon connections are removed. The final snapshot contains 117 products, 20 brands, 5 suppliers, 4 customers, 234 stock batches, 51 invoices and 9 invoice returns. See [FINAL_POSTGRESQL.md](FINAL_POSTGRESQL.md) for verification and sharing requirements.

Backend business data and integrated AI workflows operate around this database.

Historical SQLite databases are not part of the current operational application architecture.

## Runtime Services

| Component | Port | Purpose |
| --- | ---: | --- |
| React / Vite frontend | 5173 | Customer storefront and pharmacist UI |
| Express backend | 5005 | Main application and business APIs |
| Main FastAPI AI service | 8000 | DDI and prescription/OCR integration |
| Lead scoring runtime | 8002 | Lead-model inference |
| PostgreSQL | 5432 | Authoritative operational database |

Port `8001` belongs to a historical synthetic-development Sales API.

It is not part of the normal integrated application runtime.

## Feature Data Boundaries

### Drug-Drug Interaction

The integrated checkout flow uses authoritative application product identity and the governed DDI service.

The feature is an FYP decision-support implementation and must not be represented as a replacement for a licensed clinical interaction database or pharmacist judgement.

### Prescription OCR

Real uploaded prescription images are processed by the OCR workflow.

Extracted medicine information remains subject to review and correction before downstream use.

### Lead Scoring

Application inference features are constructed from real application customer and invoice/order history.

The current model itself was trained using synthetic-development commerce histories.

Therefore the score must not be represented as a validated real-world conversion or repeat-purchase probability.

### Sales Analytics

Integrated analytics use application invoice, product and sales information exposed by the Express backend.

Historical synthetic Sales API demo endpoints on port `8001` are not required by the current Analytics page.

### Sales Optimization

Sales Optimization uses application sales, stock and product information to produce operational review signals.

It does not automatically modify product prices, inventory or promotional policy.

### Storefront Funnel

Storefront funnel events are recorded from application activity such as product views, cart activity, checkout start and order lifecycle events.

### AI Assistant

The pharmacist assistant uses bounded operational intent handling and retrieves evidence from authoritative application data.

It is read-only and does not independently authorize clinical treatment or alter protected pharmacy records.

### Refill and Recommendation Workflows

Refill and medicine recommendation workflows operate within application purchase, catalogue, stock and DDI boundaries.

## Documentation Precedence

Several documents inside `ai_service/docs/` were created during earlier development phases.

They are preserved as historical engineering evidence.

If a historical document conflicts with this file, the current integrated architecture is described by:

1. root `README.md`
2. root `CURRENT_SYSTEM_STATUS.md`
3. `ai_service/README.md`
