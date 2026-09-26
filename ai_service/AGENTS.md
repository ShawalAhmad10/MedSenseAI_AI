# MedSenseAI Engineering Instructions

MedSenseAI is a safety-sensitive pharmacy management and decision-support system.

## Medical safety

- Never invent medical information.
- Never use an LLM-generated drug interaction as authoritative data.
- LLM output must never be treated as an authoritative source for drug interactions, contraindications, dosages, active ingredients, or clinical safety decisions.
- Safety-critical results must come from validated structured data and deterministic logic.
- Every interaction and medical result must be traceable to a stored, verified source.
- Unknown interaction != safe interaction. “No information found” must never be interpreted as “safe.”
- Fail closed where appropriate.
- Do not implement placeholder medical decision logic that could be mistaken for real functionality.
- Do not fabricate medical facts or fixtures to make tests pass.

## Development rules

- Never silently fail or silently swallow exceptions. Log failures with useful context and either handle them explicitly or propagate them.
- Use deterministic logic where possible.
- All critical functions require unit tests.
- No feature is complete until tests pass.
- Never delete working functionality to fix unrelated issues.
- Do not modify unrelated files.
- Use typed schemas.
- Validate every API request and response.
- Use Python standard logging.
- Do not hardcode secrets or place secrets inside source code.
- Keep the data layer portable from SQLite development to PostgreSQL production.
- Do not add unnecessary frameworks or dependencies.

## Completion requirements

- Inspect the resulting project structure.
- Resolve required dependencies.
- Run application import/startup checks and all automated tests.
- Fix introduced failures, broken imports, missing configuration, obvious dead code, and duplicated files before declaring work complete.
