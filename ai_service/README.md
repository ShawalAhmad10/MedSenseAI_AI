# MedSenseAI AI Service

Production-oriented foundation for MedSenseAI's independent Python service, including a deterministic pinned RxNorm CPC identity-ingestion boundary. It does **not** implement drug-interaction, recommendation, dosage, contraindication, or other medical decision logic.

## Safety boundary

Medical and safety-critical results must eventually come from verified structured sources and deterministic logic, with provenance attached. An absent result is unknown—not safe. LLM output is never authoritative medical data.

## Requirements

- Python 3.11+

## Local setup

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -e ".[test]"
Copy-Item .env.example .env
```

Configuration uses environment variables prefixed with `MEDSENSE_`. The local default is SQLite; set `MEDSENSE_DATABASE_URL` to a SQLAlchemy-compatible PostgreSQL URL when a PostgreSQL driver and deployment environment are introduced.

## Run

```powershell
uvicorn medsense_ai.main:app --reload
```

The health endpoint is available at `GET /api/v1/health`. It reports `503 Service Unavailable` when database connectivity cannot be verified.

## Test

```powershell
pytest
```

## RxNorm CPC identity ingestion

The administrative importer requires an exact release and a local extracted `RXNCONSO.RRF`; it never downloads data or selects a latest release.

```powershell
medsense-ingest-rxnorm-cpc --release "<exact-release>" --source-path "C:\path\to\RXNCONSO.RRF" --checksum "sha256:<file-checksum>"
```

See [docs/rxnorm-cpc-ingestion.md](docs/rxnorm-cpc-ingestion.md) before obtaining or importing a release. The repository's test fixture only mimics the documented row structure with synthetic identifiers and names; it is not medical data.

See [docs/architecture.md](docs/architecture.md) for package responsibilities and intentionally deferred work.
The provenance and normalized medical-data schema is documented in [docs/medical-data-foundation.md](docs/medical-data-foundation.md).
