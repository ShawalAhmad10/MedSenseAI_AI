"""Typed contracts for future deterministic medical-data ingestion pipelines."""

from collections.abc import Iterable
from enum import Enum
from typing import Any, Protocol

from pydantic import BaseModel, ConfigDict, Field


class RecordDisposition(str, Enum):
    """Outcome of validating or reviewing one extracted source record."""

    ACCEPTED = "accepted"
    REVIEW_REQUIRED = "review_required"
    QUARANTINED = "quarantined"


class ExtractedRecord(BaseModel):
    """One untrusted source record after deterministic extraction."""

    model_config = ConfigDict(extra="forbid")

    source_record_identifier: str | None = Field(default=None, min_length=1, max_length=512)
    source_record_type: str = Field(min_length=1, max_length=100)
    source_record_checksum: str | None = Field(default=None, min_length=1, max_length=255)
    payload: dict[str, Any]


class ValidatedRecord(BaseModel):
    """An extracted record plus its validation/review disposition."""

    model_config = ConfigDict(extra="forbid")

    extracted: ExtractedRecord
    disposition: RecordDisposition
    validation_messages: tuple[str, ...] = ()


class NormalizedRecord(BaseModel):
    """A validated record plus deterministic, non-authoritative transformations."""

    model_config = ConfigDict(extra="forbid")

    validated: ValidatedRecord
    normalized_payload: dict[str, Any]
    transformation_description: str | None = Field(default=None, min_length=1)


class MedicalDataIngestionPipeline(Protocol):
    """Required extract-to-persist stages for a source-specific pipeline."""

    def extract(self) -> Iterable[ExtractedRecord]: ...

    def validate(self, record: ExtractedRecord) -> ValidatedRecord: ...

    def normalize(self, record: ValidatedRecord) -> NormalizedRecord: ...

    def stage(self, record: NormalizedRecord) -> None: ...

    def persist(self) -> None: ...
