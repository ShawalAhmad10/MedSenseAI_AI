"""SQLAlchemy engine and session lifecycle."""

from collections.abc import Iterator
from contextlib import contextmanager
import logging
from typing import Any

from sqlalchemy import Engine, create_engine, event, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from medsense_ai.database.base import Base

logger = logging.getLogger(__name__)


class Database:
    """Own the SQLAlchemy engine and session factory for one application."""

    def __init__(self, database_url: str) -> None:
        connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
        self.engine: Engine = create_engine(
            database_url,
            connect_args=connect_args,
            pool_pre_ping=True,
        )
        if self.engine.dialect.name == "sqlite":
            self._enable_sqlite_foreign_keys()
        self.session_factory = sessionmaker(
            bind=self.engine,
            class_=Session,
            autoflush=False,
            expire_on_commit=False,
        )

    def _enable_sqlite_foreign_keys(self) -> None:
        """Enable SQLite foreign-key enforcement on every pooled connection."""

        @event.listens_for(self.engine, "connect")
        def set_sqlite_pragma(dbapi_connection: Any, _connection_record: Any) -> None:
            cursor = dbapi_connection.cursor()
            try:
                cursor.execute("PRAGMA foreign_keys=ON")
            finally:
                cursor.close()

    def create_schema(self) -> None:
        """Create tables registered on the shared metadata."""
        from medsense_ai.domain.models import MODEL_TABLES
        from medsense_ai.sales_analytics.live import LiveEventRow  # noqa: F401

        if not MODEL_TABLES:
            raise RuntimeError("No domain models are registered")
        Base.metadata.create_all(bind=self.engine)

    @contextmanager
    def session(self) -> Iterator[Session]:
        """Commit a unit of work, or log, roll back, and re-raise on failure."""
        session = self.session_factory()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            logger.exception("Database transaction failed and was rolled back")
            raise
        finally:
            session.close()

    def is_healthy(self) -> bool:
        """Return true only when a deterministic database query succeeds."""
        try:
            with self.engine.connect() as connection:
                connection.execute(text("SELECT 1"))
        except SQLAlchemyError:
            logger.exception("Database health check failed")
            return False
        return True

    def dispose(self) -> None:
        """Release pooled database resources."""
        self.engine.dispose()
