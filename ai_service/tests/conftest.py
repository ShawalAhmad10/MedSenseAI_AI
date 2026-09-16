"""Shared test fixtures."""

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from medsense_ai.config import Settings
from medsense_ai.main import create_app


@pytest.fixture
def client(tmp_path: Path) -> Iterator[TestClient]:
    settings = Settings(
        environment="test",
        database_url=f"sqlite:///{(tmp_path / 'test.db').as_posix()}",
    )
    with TestClient(create_app(settings)) as test_client:
        yield test_client
