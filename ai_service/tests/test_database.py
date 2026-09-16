"""Database runtime tests."""

from pathlib import Path

from medsense_ai.database import Database


def test_database_health_check_succeeds_for_sqlite(tmp_path: Path) -> None:
    database = Database(f"sqlite:///{(tmp_path / 'health.db').as_posix()}")
    try:
        database.create_schema()
        assert database.is_healthy() is True
    finally:
        database.dispose()
