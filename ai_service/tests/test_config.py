"""Configuration validation tests."""

import pytest
from pydantic import ValidationError

from medsense_ai.config import Settings



def test_settings_defaults_are_safe_for_local_development(monkeypatch) -> None:
    """Require an explicit operational DB URL; never silently fall back to SQLite."""

    import pytest
    from pydantic import ValidationError

    monkeypatch.delenv("MEDSENSE_DATABASE_URL", raising=False)
    monkeypatch.delenv("MEDSENSE_ENVIRONMENT", raising=False)

    with pytest.raises(ValidationError):
        Settings(_env_file=None)

    monkeypatch.setenv(
        "MEDSENSE_DATABASE_URL",
        "postgresql+psycopg://postgres:test@localhost:5432/medsenseai_test",
    )

    settings = Settings(_env_file=None)

    assert settings.environment == "development"
    assert settings.database_url.startswith("postgresql+psycopg://")


def test_settings_reject_invalid_api_prefix() -> None:
    with pytest.raises(ValidationError):
        Settings(api_prefix="api/v1", _env_file=None)
