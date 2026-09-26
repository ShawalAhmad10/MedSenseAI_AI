# MedSenseAI AI Service

This directory contains the Python AI/runtime layer used by the integrated MedSenseAI FYP.

## Current Integrated Runtime

The integrated application uses one operational PostgreSQL database:

`medsenseai_pharm`

There is no separate operational AI database in the current application flow.

## Services

### Main AI Service

Application:

`medsense_ai.main:app`

Port:

`8000`

Health endpoint:

`GET /api/v1/health`

Current responsibilities include the integrated DDI and prescription/OCR workflows.

### Lead Scoring Runtime

Application:

`medsense_ai.lead_runtime:app`

Port:

`8002`

Health endpoint:

`GET /api/v1/lead-runtime/health`

The Express backend supplies application customer and order features to this runtime for inference.

The current lead model was trained using synthetic-development commerce histories.

Therefore the score is suitable for FYP/development demonstration and must not be described as a validated real-world conversion probability.

### Historical Sales Demo Service

`medsense_ai.sales_api:app`, historically run on port `8001`, is a synthetic-development demonstration service.

It is not required by the current integrated application and should not be started during normal application runtime.

## Database

Current operational database:

`medsenseai_pharm`

Example configuration:

```env
MEDSENSE_DATABASE_URL=postgresql+psycopg://postgres:CHANGE_ME@localhost:5432/medsenseai_pharm
MEDSENSE_API_PREFIX=/api/v1
MEDSENSE_DDI_MODEL_DIR=artifacts/ddi/model
MEDSENSE_DDI_KNOWN_INTERACTION_SOURCE=external/db_drug_interactions.csv
```

The PostgreSQL Python driver is supplied through:

`psycopg[binary]>=3.2,<4.0`

## Local Setup

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -e ".[test]"
Copy-Item .env.example .env
```

Update the local `.env` with the correct PostgreSQL credentials before starting the service.

## Run Main AI Service

```powershell
$env:PYTHONPATH="src"
python -m uvicorn medsense_ai.main:app --host 127.0.0.1 --port 8000
```

## Run Lead Runtime

The lead model uses its dependency-compatible Python environment.

```powershell
$env:PYTHONPATH="src"
python -m uvicorn medsense_ai.lead_runtime:app --host 127.0.0.1 --port 8002
```

## Safety Boundary

DDI and OCR features are FYP decision-support workflows.

An absent or unresolved interaction result must not be interpreted as proof of safety.

OCR output remains subject to human review and correction.

The lead-scoring model has explicit synthetic-development training provenance.

## Historical Documentation

Files under `docs/` include engineering reports from earlier project stages.

Some historical documents describe SQLite, synthetic-only DDI, or features that had not yet been integrated at the time they were written.

Those files are retained as development evidence.

For the current integrated architecture use:

- repository root `README.md`
- repository root `CURRENT_SYSTEM_STATUS.md`
- this `ai_service/README.md`