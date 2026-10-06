"""Validated application configuration."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Settings loaded from environment variables and an optional local .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="MEDSENSE_",
        extra="ignore",
    )

    environment: Literal["development", "test", "staging", "production"] = "development"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"
    database_url: str = Field(min_length=1)
    api_prefix: str = Field(default="/api/v1", pattern=r"^/[A-Za-z0-9/_-]*[A-Za-z0-9_-]$")
    ddi_model_dir: Path = Path("artifacts/ddi/model")
    ddi_known_interaction_source: Path = Path("external/db_drug_interactions.csv")
    integration_api_key: SecretStr | None = None


@lru_cache
def get_settings() -> Settings:
    """Return one validated settings instance per process."""
    return Settings()
