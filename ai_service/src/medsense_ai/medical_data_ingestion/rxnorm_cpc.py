"""Deterministic ingestion of a pinned local RxNorm CPC RXNCONSO file.

This module imports identity assertions only. It contains no interaction,
dosage, contraindication, recommendation, or other clinical decision logic.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from collections.abc import Callable, Iterable, Iterator
from dataclasses import dataclass, field
from datetime import datetime, timezone
import hashlib
import logging
from pathlib import Path
import re
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from medsense_ai.database.runtime import Database
from medsense_ai.domain.enums import (
    IdentifiedEntityType,
    IngestionStatus,
    MappingStatus,
    VerificationStatus,
)
from medsense_ai.domain.models import (
    ActiveIngredient,
    DataSource,
    ExternalIdentifier,
    IngredientAlias,
    IngestionBatch,
    ProvenanceRecord,
    QuarantinedRecord,
    SourceRelease,
    utc_now,
)
from medsense_ai.medical_data_ingestion.normalization import normalize_medical_name

logger = logging.getLogger(__name__)

SOURCE_NAME = "RxNorm Current Prescribable Content"
SOURCE_HOMEPAGE = "https://www.nlm.nih.gov/research/umls/rxnorm/docs/prescribe.html"
SOURCE_LICENSE = "Public domain (RxNorm CPC)"
PIPELINE_NAME = "rxnorm_cpc_rxnconso_identity"
PIPELINE_VERSION = "1.0.1"
SOURCE_RECORD_TYPE = "RXNCONSO"
RXCUI_NAMESPACE = "RXCUI"

RXNCONSO_FIELDS = (
    "RXCUI",
    "LAT",
    "TS",
    "LUI",
    "STT",
    "SUI",
    "ISPREF",
    "RXAUI",
    "SAUI",
    "SCUI",
    "SDUI",
    "SAB",
    "TTY",
    "CODE",
    "STR",
    "SRL",
    "SUPPRESS",
    "CVF",
)
RXNCONSO_UNPOPULATED_FIELDS = ("TS", "LUI", "STT", "SUI", "ISPREF", "SRL")

_CHECKSUM_PATTERN = re.compile(r"^(md5:[0-9a-fA-F]{32}|sha256:[0-9a-fA-F]{64})$")
_UNPINNED_RELEASE_LABELS = frozenset({"current", "latest", "newest"})


class RxNormCpcIngestionRequest(BaseModel):
    """Validated, explicitly pinned local ingestion request."""

    model_config = ConfigDict(extra="forbid")

    release_identifier: str = Field(min_length=1, max_length=255)
    source_path: Path
    source_url: HttpUrl | None = None
    expected_checksum: str | None = None

    @field_validator("release_identifier")
    @classmethod
    def normalize_release_identifier(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("release_identifier must not be blank")
        if value.casefold() in _UNPINNED_RELEASE_LABELS:
            raise ValueError("release_identifier must identify an explicit pinned release")
        return value

    @field_validator("expected_checksum")
    @classmethod
    def normalize_expected_checksum(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip().lower()
        if not _CHECKSUM_PATTERN.fullmatch(value):
            raise ValueError(
                "expected_checksum must be md5:<32 hex characters> or "
                "sha256:<64 hex characters>"
            )
        return value


class RxNormCpcIngestionResult(BaseModel):
    """Structured, non-clinical outcome of one ingestion attempt."""

    model_config = ConfigDict(extra="forbid")

    status: Literal["completed", "failed"]
    source: str
    release: str
    batch_identifier: str
    batch_id: int | None = None
    started_at: datetime
    completed_at: datetime
    source_file_name: str
    expected_checksum: str | None = None
    actual_checksum: str | None = None
    parser_version: str
    rows_extracted: int = 0
    rows_validated: int = 0
    rows_normalized: int = 0
    rows_persisted: int = 0
    rows_skipped_as_exact_duplicates: int = 0
    rows_quarantined: int = 0
    rows_ignored_out_of_scope: int = 0
    quarantine_reasons: dict[str, int] = Field(default_factory=dict)
    failure_reason: str | None = None


class RxNormCpcIngestionFailure(RuntimeError):
    """Raised for a fail-closed ingestion attempt with a structured result."""

    def __init__(self, result: RxNormCpcIngestionResult) -> None:
        super().__init__(result.failure_reason or "RxNorm CPC ingestion failed")
        self.result = result


class _PipelineFailure(RuntimeError):
    """Internal deterministic pipeline failure with a non-sensitive reason code."""

    def __init__(self, reason_code: str) -> None:
        super().__init__(reason_code)
        self.reason_code = reason_code


@dataclass(frozen=True)
class _ExtractedRow:
    line_number: int
    raw_line: str
    fields: dict[str, str] | None
    parse_error: str | None = None

    @property
    def source_record_identifier(self) -> str | None:
        if self.fields is None:
            return None
        return self.fields.get("RXAUI") or None

    @property
    def checksum(self) -> str:
        digest = hashlib.sha256(self.raw_line.encode("utf-8")).hexdigest()
        return f"sha256:{digest}"


@dataclass(frozen=True)
class _NormalizedRow:
    extracted: _ExtractedRow
    rxcui: str
    name: str
    normalized_name: str
    kind: Literal["canonical", "alias"]


@dataclass(frozen=True)
class _Quarantine:
    extracted: _ExtractedRow
    reason_code: str
    reason_detail: str


@dataclass
class _StagedConcept:
    rxcui: str
    canonical: _NormalizedRow
    aliases: list[_NormalizedRow]


@dataclass
class _Stage:
    concepts: list[_StagedConcept] = field(default_factory=list)
    quarantines: list[_Quarantine] = field(default_factory=list)


@dataclass
class _Counts:
    extracted: int = 0
    validated: int = 0
    normalized: int = 0
    persisted: int = 0
    skipped: int = 0
    quarantined: int = 0
    ignored: int = 0
    reasons: Counter[str] = field(default_factory=Counter)

    def quarantine(self, reason_code: str) -> None:
        self.quarantined += 1
        self.reasons[reason_code] += 1


class RxNormCpcIngestionService:
    """Import a pinned CPC RXNCONSO file through explicit deterministic stages."""

    def __init__(self, database: Database) -> None:
        self.database = database

    def ingest(self, request: RxNormCpcIngestionRequest) -> RxNormCpcIngestionResult:
        """Run extraction through persistence or fail with a structured result."""
        started_at = utc_now()
        batch_identifier = f"rxnorm-cpc-{uuid4().hex}"
        source_file_name = request.source_path.name
        counts = _Counts()

        if not request.source_path.is_file():
            self._fail_preflight(
                request,
                batch_identifier,
                started_at,
                source_file_name,
                "source_path_missing_or_not_a_file",
                counts,
            )

        if request.source_path.name.upper() != "RXNCONSO.RRF":
            self._fail_preflight(
                request,
                batch_identifier,
                started_at,
                source_file_name,
                "unsupported_source_file_expected_RXNCONSO.RRF",
                counts,
            )

        try:
            actual_sha256, verification_checksum = self._calculate_checksums(
                request.source_path, request.expected_checksum
            )
        except OSError:
            logger.exception("Unable to read RxNorm CPC source file %s", source_file_name)
            self._fail_preflight(
                request,
                batch_identifier,
                started_at,
                source_file_name,
                "source_file_read_failed",
                counts,
            )
        if (
            request.expected_checksum is not None
            and verification_checksum != request.expected_checksum
        ):
            logger.error(
                "RxNorm CPC checksum mismatch for release %s and file %s",
                request.release_identifier,
                source_file_name,
            )
            self._fail_preflight(
                request,
                batch_identifier,
                started_at,
                source_file_name,
                "checksum_mismatch",
                counts,
                actual_sha256,
            )

        try:
            batch_id, release_id = self._create_batch_metadata(
                request, batch_identifier, actual_sha256, started_at
            )
        except ValueError as exc:
            logger.error(
                "RxNorm CPC release conflict for release %s: %s",
                request.release_identifier,
                exc,
            )
            self._fail_preflight(
                request,
                batch_identifier,
                started_at,
                source_file_name,
                "release_checksum_conflict",
                counts,
                actual_sha256,
            )
        except Exception:
            logger.exception("Unable to create RxNorm CPC ingestion metadata")
            self._fail_preflight(
                request,
                batch_identifier,
                started_at,
                source_file_name,
                "metadata_persistence_failed",
                counts,
                actual_sha256,
            )

        try:
            parsed_sha256 = hashlib.sha256()
            extracted_rows = self._extract(
                request.source_path, counts, parsed_sha256.update
            )
            stage = self._validate_normalize_and_stage(extracted_rows, counts)
            if f"sha256:{parsed_sha256.hexdigest()}" != actual_sha256:
                raise _PipelineFailure("source_file_changed_after_checksum")
            if counts.extracted == 0:
                raise _PipelineFailure("empty_source_file")
            if not stage.concepts and counts.quarantined == 0:
                raise _PipelineFailure("no_supported_identity_rows")
            self._persist_stage(batch_id, release_id, stage, counts)
        except Exception as exc:
            logger.exception(
                "RxNorm CPC ingestion failed for batch %s; data transaction rolled back",
                batch_identifier,
            )
            counts.persisted = 0
            failure_reason = (
                exc.reason_code if isinstance(exc, _PipelineFailure) else "ingestion_failed"
            )
            self._mark_batch_failed(batch_id, failure_reason)
            result = self._result(
                request=request,
                status="failed",
                batch_identifier=batch_identifier,
                batch_id=batch_id,
                started_at=started_at,
                source_file_name=source_file_name,
                actual_checksum=actual_sha256,
                counts=counts,
                failure_reason=failure_reason,
            )
            raise RxNormCpcIngestionFailure(result) from exc

        logger.info(
            "Completed RxNorm CPC identity ingestion batch %s: persisted=%d, "
            "skipped=%d, quarantined=%d",
            batch_identifier,
            counts.persisted,
            counts.skipped,
            counts.quarantined,
        )
        return self._result(
            request=request,
            status="completed",
            batch_identifier=batch_identifier,
            batch_id=batch_id,
            started_at=started_at,
            source_file_name=source_file_name,
            actual_checksum=actual_sha256,
            counts=counts,
        )

    @staticmethod
    def _calculate_checksums(path: Path, expected: str | None) -> tuple[str, str]:
        sha256 = hashlib.sha256()
        verification = (
            hashlib.md5(usedforsecurity=False)
            if expected and expected.startswith("md5:")
            else hashlib.sha256()
        )
        with path.open("rb") as source_file:
            for chunk in iter(lambda: source_file.read(1024 * 1024), b""):
                sha256.update(chunk)
                verification.update(chunk)
        actual_sha256 = f"sha256:{sha256.hexdigest()}"
        prefix = "md5" if expected and expected.startswith("md5:") else "sha256"
        return actual_sha256, f"{prefix}:{verification.hexdigest()}"

    def _create_batch_metadata(
        self,
        request: RxNormCpcIngestionRequest,
        batch_identifier: str,
        actual_checksum: str,
        started_at: datetime,
    ) -> tuple[int, int]:
        with self.database.session() as session:
            source = session.scalar(select(DataSource).where(DataSource.name == SOURCE_NAME))
            if source is None:
                source = DataSource(
                    name=SOURCE_NAME,
                    description="Pinned monthly RxNorm CPC identity source",
                    homepage_url=SOURCE_HOMEPAGE,
                    license_identifier=SOURCE_LICENSE,
                )
                session.add(source)
                session.flush()

            release = session.scalar(
                select(SourceRelease).where(
                    SourceRelease.data_source_id == source.id,
                    SourceRelease.release_identifier == request.release_identifier,
                )
            )
            if release is not None and release.content_checksum != actual_checksum:
                raise ValueError("the pinned release already exists with a different checksum")
            if release is None:
                release = SourceRelease(
                    data_source_id=source.id,
                    release_identifier=request.release_identifier,
                    source_uri=str(request.source_url) if request.source_url else None,
                    content_checksum=actual_checksum,
                )
                session.add(release)
                session.flush()

            batch = IngestionBatch(
                batch_identifier=batch_identifier,
                source_release_id=release.id,
                status=IngestionStatus.PENDING,
                pipeline_name=PIPELINE_NAME,
                pipeline_version=PIPELINE_VERSION,
                input_checksum=actual_checksum,
                expected_checksum=request.expected_checksum,
                source_file_name=request.source_path.name,
                started_at=started_at,
                notes=(
                    "Deterministic RxNorm CPC RXNCONSO identity import; "
                    "contains no clinical assertions"
                ),
            )
            session.add(batch)
            session.flush()
            return batch.id, release.id

    @staticmethod
    def _extract(
        path: Path,
        counts: _Counts,
        record_input_bytes: Callable[[bytes], None],
    ) -> Iterator[_ExtractedRow]:
        with path.open("rb") as source_file:
            for line_number, raw_line_bytes in enumerate(source_file, start=1):
                record_input_bytes(raw_line_bytes)
                try:
                    raw_line_with_ending = raw_line_bytes.decode("utf-8")
                except UnicodeDecodeError as exc:
                    raise _PipelineFailure("invalid_utf8_source_file") from exc
                raw_line = raw_line_with_ending.rstrip("\r\n")
                counts.extracted += 1
                if not raw_line.endswith("|"):
                    yield _ExtractedRow(
                        line_number=line_number,
                        raw_line=raw_line,
                        fields=None,
                        parse_error="row is not pipe-terminated",
                    )
                    continue
                values = raw_line.split("|")
                if values[-1] != "" or len(values) != len(RXNCONSO_FIELDS) + 1:
                    yield _ExtractedRow(
                        line_number=line_number,
                        raw_line=raw_line,
                        fields=None,
                        parse_error=(
                            f"expected {len(RXNCONSO_FIELDS)} pipe-delimited fields"
                        ),
                    )
                    continue
                yield _ExtractedRow(
                    line_number=line_number,
                    raw_line=raw_line,
                    fields=dict(zip(RXNCONSO_FIELDS, values[:-1], strict=True)),
                )

    def _validate_normalize_and_stage(
        self, rows: Iterable[_ExtractedRow], counts: _Counts
    ) -> _Stage:
        stage = _Stage()
        candidates: list[_NormalizedRow] = []

        for row in rows:
            if row.fields is None:
                self._add_quarantine(
                    stage,
                    counts,
                    row,
                    "malformed_rrf_row",
                    row.parse_error or "row could not be parsed",
                )
                continue
            counts.validated += 1
            fields = row.fields
            candidate_kind = self._candidate_kind(fields)
            if candidate_kind is None:
                counts.ignored += 1
                continue
            if not self._is_active_cpc_english_row(fields):
                counts.ignored += 1
                continue
            if any(fields[name] for name in RXNCONSO_UNPOPULATED_FIELDS):
                self._add_quarantine(
                    stage,
                    counts,
                    row,
                    "unexpected_rxnorm_field_value",
                    "a field documented as unpopulated by RxNorm contains a value",
                )
                continue
            missing = [name for name in ("RXCUI", "RXAUI", "STR") if not fields[name].strip()]
            if missing:
                self._add_quarantine(
                    stage,
                    counts,
                    row,
                    "missing_required_field",
                    f"missing required field(s): {', '.join(missing)}",
                )
                continue
            if (
                len(fields["RXCUI"]) > 512
                or len(fields["RXAUI"]) > 512
                or len(fields["STR"]) > 500
            ):
                self._add_quarantine(
                    stage,
                    counts,
                    row,
                    "field_length_exceeded",
                    "RXCUI, RXAUI, or STR exceeds the persistence contract",
                )
                continue
            try:
                normalized_name = normalize_medical_name(fields["STR"])
            except ValueError:
                self._add_quarantine(
                    stage,
                    counts,
                    row,
                    "invalid_normalized_name",
                    "source name cannot be deterministically normalized",
                )
                continue
            if len(normalized_name) > 500:
                self._add_quarantine(
                    stage,
                    counts,
                    row,
                    "field_length_exceeded",
                    "normalized STR exceeds the persistence contract",
                )
                continue
            counts.normalized += 1
            candidates.append(
                _NormalizedRow(
                    extracted=row,
                    rxcui=fields["RXCUI"],
                    name=fields["STR"],
                    normalized_name=normalized_name,
                    kind=candidate_kind,
                )
            )

        candidates = self._resolve_source_identifier_duplicates(candidates, stage, counts)
        canonical_by_rxcui: dict[str, list[_NormalizedRow]] = defaultdict(list)
        aliases_by_rxcui: dict[str, list[_NormalizedRow]] = defaultdict(list)
        for candidate in candidates:
            target = canonical_by_rxcui if candidate.kind == "canonical" else aliases_by_rxcui
            target[candidate.rxcui].append(candidate)

        selected: dict[str, _NormalizedRow] = {}
        for rxcui in sorted(set(canonical_by_rxcui) | set(aliases_by_rxcui)):
            canonicals = canonical_by_rxcui[rxcui]
            aliases = aliases_by_rxcui[rxcui]
            if not canonicals:
                for alias in aliases:
                    self._add_quarantine(
                        stage,
                        counts,
                        alias.extracted,
                        "unresolved_semantic_mapping",
                        "alias has no accepted RxNorm normalized ingredient concept",
                    )
                continue
            if len(canonicals) != 1:
                for row in canonicals + aliases:
                    self._add_quarantine(
                        stage,
                        counts,
                        row.extracted,
                        "conflicting_canonical_concept",
                        "one RXCUI has multiple RxNorm normalized IN atoms",
                    )
                continue
            selected[rxcui] = canonicals[0]

        by_name: dict[str, list[str]] = defaultdict(list)
        for rxcui, row in selected.items():
            by_name[row.normalized_name].append(rxcui)
        conflicting_rxcuis = {
            rxcui for rxcuis in by_name.values() if len(rxcuis) > 1 for rxcui in rxcuis
        }

        alias_rxcuis_by_name: dict[str, set[str]] = defaultdict(set)
        for rxcui, aliases in aliases_by_rxcui.items():
            if rxcui in selected and rxcui not in conflicting_rxcuis:
                for alias in aliases:
                    alias_rxcuis_by_name[alias.normalized_name].add(rxcui)

        ambiguous_alias_names = {
            name for name, rxcuis in alias_rxcuis_by_name.items() if len(rxcuis) > 1
        }
        for name, rxcuis in alias_rxcuis_by_name.items():
            canonical_rxcuis = set(by_name.get(name, ()))
            if canonical_rxcuis - rxcuis or any(
                canonical_rxcui != alias_rxcui
                for canonical_rxcui in canonical_rxcuis
                for alias_rxcui in rxcuis
            ):
                ambiguous_alias_names.add(name)

        for rxcui, canonical in sorted(selected.items()):
            aliases = aliases_by_rxcui[rxcui]
            if rxcui in conflicting_rxcuis:
                for row in [canonical, *aliases]:
                    self._add_quarantine(
                        stage,
                        counts,
                        row.extracted,
                        "ambiguous_normalized_identity",
                        "different RXCUIs normalize to the same ingredient name",
                    )
                continue

            accepted_aliases: list[_NormalizedRow] = []
            for alias in aliases:
                if alias.normalized_name in ambiguous_alias_names:
                    self._add_quarantine(
                        stage,
                        counts,
                        alias.extracted,
                        "ambiguous_normalized_alias",
                        "alias resolves to more than one RXCUI identity",
                    )
                else:
                    accepted_aliases.append(alias)

            stage.concepts.append(
                _StagedConcept(
                    rxcui=rxcui,
                    canonical=canonical,
                    aliases=sorted(
                        accepted_aliases,
                        key=lambda row: row.extracted.source_record_identifier or "",
                    ),
                )
            )
        return stage

    @staticmethod
    def _candidate_kind(fields: dict[str, str]) -> Literal["canonical", "alias"] | None:
        if fields["SAB"] == "RXNORM" and fields["TTY"] == "IN":
            return "canonical"
        if fields["SAB"] == "MTHSPL" and fields["TTY"] == "SU":
            return "alias"
        return None

    @staticmethod
    def _is_active_cpc_english_row(fields: dict[str, str]) -> bool:
        return (
            fields["LAT"] == "ENG"
            and fields["SUPPRESS"] == "N"
            and fields["CVF"] == "4096"
        )

    def _resolve_source_identifier_duplicates(
        self,
        rows: list[_NormalizedRow],
        stage: _Stage,
        counts: _Counts,
    ) -> list[_NormalizedRow]:
        grouped: dict[str, list[_NormalizedRow]] = defaultdict(list)
        for row in rows:
            grouped[row.extracted.source_record_identifier or ""].append(row)

        resolved: list[_NormalizedRow] = []
        for source_identifier in sorted(grouped):
            group = grouped[source_identifier]
            if len(group) == 1:
                resolved.append(group[0])
            elif len({row.extracted.checksum for row in group}) == 1:
                resolved.append(group[0])
                counts.skipped += len(group) - 1
            else:
                for row in group:
                    self._add_quarantine(
                        stage,
                        counts,
                        row.extracted,
                        "duplicate_source_identifier_conflict",
                        "RXAUI is repeated with conflicting source content",
                    )
        return resolved

    def _persist_stage(
        self,
        batch_id: int,
        release_id: int,
        stage: _Stage,
        counts: _Counts,
    ) -> None:
        with self.database.session() as session:
            batch = session.get(IngestionBatch, batch_id)
            if batch is None:
                raise RuntimeError("ingestion batch metadata disappeared")
            batch.status = IngestionStatus.STAGED
            verification_status = (
                VerificationStatus.VERIFIED
                if batch.expected_checksum is not None
                else VerificationStatus.UNVERIFIED
            )

            for quarantine in stage.quarantines:
                self._persist_quarantine(session, batch_id, quarantine)

            prior_records = self._prior_release_records(session, release_id)
            for concept in stage.concepts:
                self._persist_concept(
                    session,
                    batch_id,
                    concept,
                    prior_records,
                    stage,
                    counts,
                    verification_status,
                )

            # Database-state conflicts discovered during persistence are retained too.
            for quarantine in stage.quarantines:
                if quarantine.extracted.line_number < 0:
                    self._persist_quarantine(session, batch_id, quarantine)

            batch.status = IngestionStatus.COMPLETED
            batch.completed_at = utc_now()

    @staticmethod
    def _prior_release_records(
        session: Session, release_id: int
    ) -> dict[tuple[str, str], set[str | None]]:
        rows = session.execute(
            select(
                ProvenanceRecord.source_record_type,
                ProvenanceRecord.source_record_identifier,
                ProvenanceRecord.source_record_checksum,
            )
            .join(IngestionBatch)
            .where(IngestionBatch.source_release_id == release_id)
        )
        prior: dict[tuple[str, str], set[str | None]] = defaultdict(set)
        for record_type, identifier, checksum in rows:
            if identifier is not None:
                prior[(record_type, identifier)].add(checksum)
        return prior

    def _persist_concept(
        self,
        session: Session,
        batch_id: int,
        concept: _StagedConcept,
        prior_records: dict[tuple[str, str], set[str | None]],
        stage: _Stage,
        counts: _Counts,
        verification_status: VerificationStatus,
    ) -> None:
        canonical = concept.canonical
        existing_ingredients = list(
            session.scalars(
                select(ActiveIngredient)
                .join(ExternalIdentifier, ExternalIdentifier.ingredient_id == ActiveIngredient.id)
                .where(
                    ExternalIdentifier.entity_type == IdentifiedEntityType.ACTIVE_INGREDIENT,
                    ExternalIdentifier.identifier_namespace == RXCUI_NAMESPACE,
                    ExternalIdentifier.identifier_value == concept.rxcui,
                )
            ).unique()
        )
        if len(existing_ingredients) > 1:
            self._quarantine_concept_during_persistence(
                stage,
                counts,
                concept,
                "conflicting_existing_identifier",
                "RXCUI is already linked to multiple ingredient records",
            )
            return

        ingredient = existing_ingredients[0] if existing_ingredients else None
        if ingredient is not None and ingredient.normalized_name != canonical.normalized_name:
            self._quarantine_concept_during_persistence(
                stage,
                counts,
                concept,
                "conflicting_existing_identifier",
                "RXCUI is already linked to a different normalized ingredient name",
            )
            return

        same_name = session.scalar(
            select(ActiveIngredient).where(
                ActiveIngredient.normalized_name == canonical.normalized_name
            )
        )
        if same_name is not None and (ingredient is None or same_name.id != ingredient.id):
            self._quarantine_concept_during_persistence(
                stage,
                counts,
                concept,
                "ambiguous_existing_identity",
                "normalized name is already assigned to a different ingredient identity",
            )
            return

        existing_alias_query = select(IngredientAlias).where(
            IngredientAlias.normalized_alias == canonical.normalized_name
        )
        if ingredient is not None:
            existing_alias_query = existing_alias_query.where(
                IngredientAlias.ingredient_id != ingredient.id
            )
        if session.scalar(existing_alias_query) is not None:
            self._quarantine_concept_during_persistence(
                stage,
                counts,
                concept,
                "ambiguous_existing_identity",
                "normalized name conflicts with an existing ingredient alias",
            )
            return

        canonical_state = self._prior_record_state(canonical, prior_records)
        if canonical_state == "conflict":
            self._quarantine_concept_during_persistence(
                stage,
                counts,
                concept,
                "same_release_source_record_conflict",
                "the same RXAUI has different content in this pinned release",
            )
            return

        if canonical_state == "exact":
            if ingredient is None:
                self._quarantine_concept_during_persistence(
                    stage,
                    counts,
                    concept,
                    "inconsistent_existing_provenance",
                    "prior source provenance exists without its ingredient identity",
                )
                return
            counts.skipped += 1
        else:
            provenance = self._new_provenance(
                session, batch_id, canonical, verification_status
            )
            if ingredient is None:
                ingredient = ActiveIngredient(
                    canonical_name=canonical.name,
                    normalized_name=canonical.normalized_name,
                    verification_status=verification_status,
                    provenance=provenance,
                )
                session.add(ingredient)
                session.flush()
            session.add(
                ExternalIdentifier(
                    entity_type=IdentifiedEntityType.ACTIVE_INGREDIENT,
                    identifier_namespace=RXCUI_NAMESPACE,
                    identifier_value=concept.rxcui,
                    ingredient_id=ingredient.id,
                    provenance=provenance,
                )
            )
            counts.persisted += 1

        if ingredient is None:
            raise RuntimeError("accepted concept has no ingredient identity")
        for alias in concept.aliases:
            state = self._prior_record_state(alias, prior_records)
            if state == "exact":
                counts.skipped += 1
                continue
            if state == "conflict":
                self._quarantine_during_persistence(
                    stage,
                    counts,
                    alias.extracted,
                    "same_release_source_record_conflict",
                    "the same RXAUI has different content in this pinned release",
                )
                continue
            conflicting_alias = session.scalar(
                select(IngredientAlias).where(
                    IngredientAlias.normalized_alias == alias.normalized_name,
                    IngredientAlias.ingredient_id != ingredient.id,
                )
            )
            conflicting_canonical = session.scalar(
                select(ActiveIngredient).where(
                    ActiveIngredient.normalized_name == alias.normalized_name,
                    ActiveIngredient.id != ingredient.id,
                )
            )
            if conflicting_alias is not None or conflicting_canonical is not None:
                self._quarantine_during_persistence(
                    stage,
                    counts,
                    alias.extracted,
                    "ambiguous_existing_alias",
                    "normalized alias is already mapped to a different ingredient",
                )
                continue
            provenance = self._new_provenance(
                session, batch_id, alias, verification_status
            )
            session.add(
                IngredientAlias(
                    ingredient_id=ingredient.id,
                    alias=alias.name,
                    normalized_alias=alias.normalized_name,
                    mapping_status=MappingStatus.MAPPED,
                    provenance=provenance,
                )
            )
            counts.persisted += 1

    @staticmethod
    def _prior_record_state(
        row: _NormalizedRow,
        prior_records: dict[tuple[str, str], set[str | None]],
    ) -> Literal["new", "exact", "conflict"]:
        identifier = row.extracted.source_record_identifier
        if identifier is None:
            raise RuntimeError("accepted source row has no RXAUI")
        checksums = prior_records.get((SOURCE_RECORD_TYPE, identifier))
        if not checksums:
            return "new"
        if row.extracted.checksum in checksums:
            return "exact"
        return "conflict"

    @staticmethod
    def _new_provenance(
        session: Session,
        batch_id: int,
        row: _NormalizedRow,
        verification_status: VerificationStatus,
    ) -> ProvenanceRecord:
        provenance = ProvenanceRecord(
            ingestion_batch_id=batch_id,
            source_record_type=SOURCE_RECORD_TYPE,
            source_record_identifier=row.extracted.source_record_identifier,
            source_record_checksum=row.extracted.checksum,
            transformed=True,
            transformation_description=(
                "Unicode NFKC normalization, case folding, and whitespace collapse; "
                "identity mapping follows the explicit source RXCUI"
            ),
            verification_status=verification_status,
        )
        session.add(provenance)
        session.flush()
        return provenance

    @staticmethod
    def _persist_quarantine(
        session: Session, batch_id: int, quarantine: _Quarantine
    ) -> None:
        session.add(
            QuarantinedRecord(
                ingestion_batch_id=batch_id,
                source_record_type=SOURCE_RECORD_TYPE,
                source_record_identifier=quarantine.extracted.source_record_identifier,
                source_record_checksum=quarantine.extracted.checksum,
                source_line_number=abs(quarantine.extracted.line_number),
                reason_code=quarantine.reason_code,
                reason_detail=quarantine.reason_detail,
            )
        )

    @staticmethod
    def _add_quarantine(
        stage: _Stage,
        counts: _Counts,
        row: _ExtractedRow,
        reason_code: str,
        reason_detail: str,
    ) -> None:
        stage.quarantines.append(_Quarantine(row, reason_code, reason_detail))
        counts.quarantine(reason_code)

    @staticmethod
    def _quarantine_during_persistence(
        stage: _Stage,
        counts: _Counts,
        row: _ExtractedRow,
        reason_code: str,
        reason_detail: str,
    ) -> None:
        # Negative line numbers mark issues discovered after initial quarantine persistence.
        marked = _ExtractedRow(
            line_number=-row.line_number,
            raw_line=row.raw_line,
            fields=row.fields,
            parse_error=row.parse_error,
        )
        stage.quarantines.append(_Quarantine(marked, reason_code, reason_detail))
        counts.quarantine(reason_code)

    def _quarantine_concept_during_persistence(
        self,
        stage: _Stage,
        counts: _Counts,
        concept: _StagedConcept,
        reason_code: str,
        reason_detail: str,
    ) -> None:
        for row in [concept.canonical, *concept.aliases]:
            self._quarantine_during_persistence(
                stage, counts, row.extracted, reason_code, reason_detail
            )

    def _mark_batch_failed(self, batch_id: int, failure_reason: str) -> None:
        try:
            with self.database.session() as session:
                batch = session.get(IngestionBatch, batch_id)
                if batch is None:
                    raise RuntimeError("cannot mark missing ingestion batch as failed")
                batch.status = IngestionStatus.FAILED
                batch.completed_at = utc_now()
                batch.notes = f"{batch.notes}; failure_reason={failure_reason}"
        except Exception:
            logger.exception("Failed to record terminal state for ingestion batch %s", batch_id)
            raise

    def _fail_preflight(
        self,
        request: RxNormCpcIngestionRequest,
        batch_identifier: str,
        started_at: datetime,
        source_file_name: str,
        failure_reason: str,
        counts: _Counts,
        actual_checksum: str | None = None,
    ) -> None:
        result = self._result(
            request=request,
            status="failed",
            batch_identifier=batch_identifier,
            batch_id=None,
            started_at=started_at,
            source_file_name=source_file_name,
            actual_checksum=actual_checksum,
            counts=counts,
            failure_reason=failure_reason,
        )
        raise RxNormCpcIngestionFailure(result)

    @staticmethod
    def _result(
        *,
        request: RxNormCpcIngestionRequest,
        status: Literal["completed", "failed"],
        batch_identifier: str,
        batch_id: int | None,
        started_at: datetime,
        source_file_name: str,
        actual_checksum: str | None,
        counts: _Counts,
        failure_reason: str | None = None,
    ) -> RxNormCpcIngestionResult:
        return RxNormCpcIngestionResult(
            status=status,
            source=SOURCE_NAME,
            release=request.release_identifier,
            batch_identifier=batch_identifier,
            batch_id=batch_id,
            started_at=started_at,
            completed_at=datetime.now(timezone.utc),
            source_file_name=source_file_name,
            expected_checksum=request.expected_checksum,
            actual_checksum=actual_checksum,
            parser_version=PIPELINE_VERSION,
            rows_extracted=counts.extracted,
            rows_validated=counts.validated,
            rows_normalized=counts.normalized,
            rows_persisted=counts.persisted,
            rows_skipped_as_exact_duplicates=counts.skipped,
            rows_quarantined=counts.quarantined,
            rows_ignored_out_of_scope=counts.ignored,
            quarantine_reasons=dict(sorted(counts.reasons.items())),
            failure_reason=failure_reason,
        )
