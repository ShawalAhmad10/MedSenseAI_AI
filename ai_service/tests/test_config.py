"""Configuration validation tests."""

import pytest
from pydantic import ValidationError

from medsense_ai.config import Settings


def test_settings_defaults_are_safe_for_local_development() -> None:
    settings = Settings(_env_file=None)

    assert settings.environment == "development"
    assert settings.database_url.startswith("sqlite:///")
    assert settings.api_prefix == "/api/v1"


def test_settings_reject_invalid_api_prefix() -> None:
    with pytest.raises(ValidationError):
        Settings(api_prefix="api/v1", _env_file=None)
