"""Tests for the fixture-driven RxNorm CPC identity ingestion boundary.

All names and identifiers are synthetic. Rows only mimic NLM's documented
RXNCONSO RRF structure and contain no interaction or clinical claims.
"""

from hashlib import md5, sha256
import json
from pathlib import Path
import sys

import pytest
from pydantic import ValidationError
from sqlalchemy import event, func, select

import medsense_ai.medical_data_ingestion.rxnorm_cpc as rxnorm_cpc_module
from medsense_ai.medical_data_ingestion import cli as ingestion_cli
from medsense_ai.database import Database
from medsense_ai.domain.enums import IngestionStatus, VerificationStatus
from medsense_ai.domain.models import (
    ActiveIngredient,
    DataSource,
    ExternalIdentifier,
    IngredientAlias,
    IngestionBatch,
    ProvenanceRecord,
    QuarantinedRecord,
    SourceRelease,
)
from medsense_ai.medical_data_ingestion.cli import build_parser
from medsense_ai.medical_data_ingestion.rxnorm_cpc import (
    PIPELINE_VERSION,
    SOURCE_NAME,
    RxNormCpcIngestionFailure,
    RxNormCpcIngestionRequest,
    RxNormCpcIngestionService,
)

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "rxnorm_cpc" / "RXNCONSO.RRF"


@pytest.fixture
def database(tmp_path: Path):
    database = Database(f"sqlite:///{tmp_path / 'ingestion.db'}")
    database.create_schema()
    try:
        yield database
    finally:
        database.dispose()


def _request(
    path: Path = FIXTURE_PATH,
    *,
    release: str = "synthetic-2026-08",
    checksum: str | None = None,
) -> RxNormCpcIngestionRequest:
    return RxNormCpcIngestionRequest(
        release_identifier=release,
        source_path=path,
        source_url="https://example.invalid/pinned/synthetic-2026-08",
        expected_checksum=checksum,
    )


def _write_rows(tmp_path: Path, rows: list[str]) -> Path:
    source_dir = tmp_path / "source"
    source_dir.mkdir(parents=True)
    path = source_dir / "RXNCONSO.RRF"
    path.write_text("\n".join(rows) + "\n", encoding="utf-8")
    return path


def _canonical(
    *,
    rxcui: str = "100001",
    rxaui: str = "A100001",
    name: str = "Ingredient Alpha",
) -> str:
    return (
        f"{rxcui}|ENG||||||{rxaui}||||RXNORM|IN|"
        f"C{rxcui}|{name}||N|4096|"
    )


def _alias(
    *,
    rxcui: str = "100001",
    rxaui: str = "A100002",
    name: str = "Alias Alpha",
) -> str:
    return (
        f"{rxcui}|ENG||||||{rxaui}||||MTHSPL|SU|"
        f"SUBSTANCE_{rxaui}|{name}||N|4096|"
    )


def _count(session, model: type) -> int:
    return session.scalar(select(func.count()).select_from(model)) or 0


def test_explicit_pinned_release_is_required() -> None:
    with pytest.raises(ValidationError):
        RxNormCpcIngestionRequest(release_identifier=" ", source_path=FIXTURE_PATH)

    with pytest.raises(SystemExit):
        build_parser().parse_args(["--source-path", str(FIXTURE_PATH)])

    for unpinned_label in ("latest", "CURRENT", "Newest"):
        with pytest.raises(ValidationError):
            _request(release=unpinned_label)


def test_checksum_format_is_validated() -> None:
    for invalid_checksum in (
        "unlabelled-checksum",
        "md5:1234",
        f"md5:{'0' * 33}",
        f"sha256:{'0' * 63}",
        f"sha256:{'0' * 65}",
    ):
        with pytest.raises(ValidationError):
            _request(checksum=invalid_checksum)


def test_uppercase_checksum_is_normalized(database: Database) -> None:
    checksum = f"SHA256:{sha256(FIXTURE_PATH.read_bytes()).hexdigest().upper()}"

    result = RxNormCpcIngestionService(database).ingest(_request(checksum=checksum))

    assert result.expected_checksum == checksum.lower()


def test_missing_source_path_fails_without_database_metadata(
    database: Database, tmp_path: Path
) -> None:
    service = RxNormCpcIngestionService(database)
    with pytest.raises(RxNormCpcIngestionFailure) as raised:
        service.ingest(_request(tmp_path / "RXNCONSO.RRF"))

    assert raised.value.result.failure_reason == "source_path_missing_or_not_a_file"
    assert raised.value.result.batch_id is None
    with database.session() as session:
        assert _count(session, IngestionBatch) == 0


def test_cli_returns_nonzero_and_structured_failure_for_missing_file(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], tmp_path: Path
) -> None:
    monkeypatch.setenv("MEDSENSE_DATABASE_URL", "sqlite:///:memory:")
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "medsense-ingest-rxnorm-cpc",
            "--release",
            "synthetic-2026-08",
            "--source-path",
            str(tmp_path / "RXNCONSO.RRF"),
        ],
    )

    exit_code = ingestion_cli.main()
    output = json.loads(capsys.readouterr().out)

    assert exit_code == 1
    assert output["status"] == "failed"
    assert output["failure_reason"] == "source_path_missing_or_not_a_file"


def test_empty_source_fails_closed_and_records_failed_batch(
    database: Database, tmp_path: Path
) -> None:
    source = _write_rows(tmp_path, [_canonical()])
    source.write_text("", encoding="utf-8")

    with pytest.raises(RxNormCpcIngestionFailure) as raised:
        RxNormCpcIngestionService(database).ingest(_request(source))

    assert raised.value.result.failure_reason == "empty_source_file"
    with database.session() as session:
        batch = session.scalar(select(IngestionBatch))
        assert batch is not None
        assert batch.status == IngestionStatus.FAILED
        assert _count(session, ActiveIngredient) == 0


@pytest.mark.parametrize("algorithm", ["sha256", "md5"])
def test_checksum_success(database: Database, algorithm: str) -> None:
    content = FIXTURE_PATH.read_bytes()
    if algorithm == "sha256":
        checksum = f"sha256:{sha256(content).hexdigest()}"
    else:
        checksum = f"md5:{md5(content, usedforsecurity=False).hexdigest()}"

    result = RxNormCpcIngestionService(database).ingest(_request(checksum=checksum))

    assert result.status == "completed"
    assert result.expected_checksum == checksum
    assert result.actual_checksum == f"sha256:{sha256(content).hexdigest()}"
    with database.session() as session:
        provenance = session.scalar(select(ProvenanceRecord))
        ingredient = session.scalar(select(ActiveIngredient))
        assert provenance is not None
        assert ingredient is not None
        assert provenance.verification_status == VerificationStatus.VERIFIED
        assert ingredient.verification_status == VerificationStatus.VERIFIED


def test_checksum_mismatch_is_a_hard_failure(database: Database) -> None:
    with pytest.raises(RxNormCpcIngestionFailure) as raised:
        RxNormCpcIngestionService(database).ingest(
            _request(checksum=f"sha256:{'0' * 64}")
        )

    assert raised.value.result.failure_reason == "checksum_mismatch"
    assert raised.value.result.rows_extracted == 0
    with database.session() as session:
        assert _count(session, DataSource) == 0
        assert _count(session, IngestionBatch) == 0


def test_file_replacement_after_checksum_fails_before_identity_persistence(
    database: Database, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    source = _write_rows(tmp_path, [_canonical()])
    original_content = source.read_bytes()
    expected = f"sha256:{sha256(original_content).hexdigest()}"
    service = RxNormCpcIngestionService(database)
    calculate_checksums = service._calculate_checksums

    def calculate_then_replace(path: Path, configured_checksum: str | None):
        checksums = calculate_checksums(path, configured_checksum)
        path.write_text(_canonical(name="Ingredient Replaced") + "\n", encoding="utf-8")
        return checksums

    monkeypatch.setattr(service, "_calculate_checksums", calculate_then_replace)
    with pytest.raises(RxNormCpcIngestionFailure) as raised:
        service.ingest(_request(source, checksum=expected))

    assert raised.value.result.failure_reason == "source_file_changed_after_checksum"
    with database.session() as session:
        batch = session.scalar(select(IngestionBatch))
        assert batch is not None
        assert batch.status == IngestionStatus.FAILED
        assert _count(session, ActiveIngredient) == 0
        assert _count(session, ProvenanceRecord) == 0


def test_valid_fixture_extracts_normalizes_persists_and_summarizes(
    database: Database,
) -> None:
    result = RxNormCpcIngestionService(database).ingest(_request())

    assert result.status == "completed"
    assert result.source == SOURCE_NAME
    assert result.release == "synthetic-2026-08"
    assert result.batch_id is not None
    assert result.started_at <= result.completed_at
    assert result.parser_version == PIPELINE_VERSION
    assert result.rows_extracted == 3
    assert result.rows_validated == 3
    assert result.rows_normalized == 2
    assert result.rows_persisted == 2
    assert result.rows_skipped_as_exact_duplicates == 0
    assert result.rows_quarantined == 0
    assert result.rows_ignored_out_of_scope == 1
    assert result.failure_reason is None

    with database.session() as session:
        ingredient = session.scalar(select(ActiveIngredient))
        alias = session.scalar(select(IngredientAlias))
        assert ingredient is not None
        assert ingredient.canonical_name == "Ingredient Alpha"
        assert ingredient.normalized_name == "ingredient alpha"
        assert ingredient.verification_status == VerificationStatus.UNVERIFIED
        assert alias is not None
        assert alias.alias == "Alias Alpha"
        assert alias.normalized_alias == "alias alpha"
        assert alias.ingredient_id == ingredient.id


def test_officially_blank_rxnorm_fields_are_not_used_as_preference_flags(
    database: Database,
) -> None:
    first_row = FIXTURE_PATH.read_text(encoding="utf-8").splitlines()[0]
    fields = first_row.split("|")

    result = RxNormCpcIngestionService(database).ingest(_request())

    assert fields[2:7] == ["", "", "", "", ""]
    assert result.rows_persisted == 2


def test_unexpected_values_in_documented_unpopulated_fields_are_quarantined(
    database: Database, tmp_path: Path
) -> None:
    source = _write_rows(
        tmp_path,
        ["100001|ENG|P|L1|PF|S1|Y|A100001||||RXNORM|IN|C1|Ingredient Alpha|0|N|4096|"],
    )

    result = RxNormCpcIngestionService(database).ingest(_request(source))

    assert result.rows_persisted == 0
    assert result.quarantine_reasons == {"unexpected_rxnorm_field_value": 1}


def test_crlf_short_extra_and_blank_rows_have_deterministic_outcomes(
    database: Database, tmp_path: Path
) -> None:
    source = tmp_path / "RXNCONSO.RRF"
    source.write_bytes(
        (
            _canonical()
            + "\r\n"
            + "short|row|\r\n"
            + _canonical(rxcui="100002", rxaui="A100003")
            + "EXTRA|\r\n"
            + "\r\n"
        ).encode("utf-8")
    )

    result = RxNormCpcIngestionService(database).ingest(_request(source))

    assert result.rows_extracted == 4
    assert result.rows_validated == 1
    assert result.rows_persisted == 1
    assert result.rows_quarantined == 3
    assert result.quarantine_reasons == {"malformed_rrf_row": 3}


def test_invalid_utf8_fails_closed_without_partial_identity(
    database: Database, tmp_path: Path
) -> None:
    source = tmp_path / "RXNCONSO.RRF"
    source.write_bytes(_canonical().encode("utf-8") + b"\n\xff\n")

    with pytest.raises(RxNormCpcIngestionFailure) as raised:
        RxNormCpcIngestionService(database).ingest(_request(source))

    assert raised.value.result.failure_reason == "invalid_utf8_source_file"
    with database.session() as session:
        assert _count(session, ActiveIngredient) == 0
        assert _count(session, ProvenanceRecord) == 0


def test_source_identifier_and_full_provenance_chain_are_linked(
    database: Database,
) -> None:
    result = RxNormCpcIngestionService(database).ingest(_request())

    with database.session() as session:
        identifier = session.scalar(select(ExternalIdentifier))
        assert identifier is not None
        assert identifier.identifier_namespace == "RXCUI"
        assert identifier.identifier_value == "100001"
        assert identifier.provenance.source_record_identifier == "A100001"
        batch = identifier.provenance.ingestion_batch
        assert batch.id == result.batch_id
        assert batch.pipeline_version == PIPELINE_VERSION
        assert batch.source_file_name == "RXNCONSO.RRF"
        assert batch.input_checksum == result.actual_checksum
        release = batch.source_release
        assert release.release_identifier == result.release
        assert release.content_checksum == result.actual_checksum
        assert release.source_uri == "https://example.invalid/pinned/synthetic-2026-08"
        assert release.data_source.name == SOURCE_NAME
        # MTHSPL CODE is deliberately not reinterpreted as a UNII.
        assert session.scalars(select(ExternalIdentifier)).all() == [identifier]


def test_same_release_rerun_is_idempotent(database: Database) -> None:
    service = RxNormCpcIngestionService(database)
    first = service.ingest(_request())
    second = service.ingest(_request())

    assert first.rows_persisted == 2
    assert second.rows_persisted == 0
    assert second.rows_skipped_as_exact_duplicates == 2
    with database.session() as session:
        assert _count(session, ActiveIngredient) == 1
        assert _count(session, IngredientAlias) == 1
        assert _count(session, ExternalIdentifier) == 1
        assert _count(session, ProvenanceRecord) == 2
        assert _count(session, IngestionBatch) == 2


def test_new_release_preserves_new_assertions_without_duplicate_identity(
    database: Database,
) -> None:
    service = RxNormCpcIngestionService(database)
    service.ingest(_request(release="synthetic-2026-08"))
    result = service.ingest(_request(release="synthetic-2026-09"))

    assert result.rows_persisted == 2
    with database.session() as session:
        assert _count(session, SourceRelease) == 2
        assert _count(session, ActiveIngredient) == 1
        assert _count(session, ExternalIdentifier) == 2
        assert _count(session, IngredientAlias) == 2
        assert _count(session, ProvenanceRecord) == 4


def test_same_release_with_different_file_is_rejected_before_new_batch(
    database: Database, tmp_path: Path
) -> None:
    service = RxNormCpcIngestionService(database)
    service.ingest(_request())
    changed = _write_rows(tmp_path, [_canonical(name="Ingredient Changed")])

    with pytest.raises(RxNormCpcIngestionFailure) as raised:
        service.ingest(_request(changed))

    assert raised.value.result.failure_reason == "release_checksum_conflict"
    assert raised.value.result.batch_id is None
    with database.session() as session:
        assert _count(session, IngestionBatch) == 1
        assert _count(session, ActiveIngredient) == 1


def test_new_release_conflicting_identity_is_quarantined_not_overwritten(
    database: Database, tmp_path: Path
) -> None:
    service = RxNormCpcIngestionService(database)
    service.ingest(_request())
    changed = _write_rows(tmp_path, [_canonical(name="Ingredient Changed")])

    result = service.ingest(_request(changed, release="synthetic-2026-09"))

    assert result.status == "completed"
    assert result.rows_persisted == 0
    assert result.rows_quarantined == 1
    assert result.quarantine_reasons == {"conflicting_existing_identifier": 1}
    with database.session() as session:
        ingredient = session.scalar(select(ActiveIngredient))
        assert ingredient is not None
        assert ingredient.canonical_name == "Ingredient Alpha"
        assert _count(session, QuarantinedRecord) == 1


def test_same_normalized_name_with_different_rxcuis_quarantines_both(
    database: Database, tmp_path: Path
) -> None:
    source = _write_rows(
        tmp_path,
        [
            _canonical(rxcui="100001", rxaui="A100001", name="Ingredient Shared"),
            _canonical(rxcui="100002", rxaui="A100002", name="INGREDIENT   SHARED"),
        ],
    )

    result = RxNormCpcIngestionService(database).ingest(_request(source))

    assert result.rows_persisted == 0
    assert result.rows_quarantined == 2
    assert result.quarantine_reasons == {"ambiguous_normalized_identity": 2}


def test_same_normalized_name_and_rxcui_remains_one_identity(
    database: Database, tmp_path: Path
) -> None:
    source = _write_rows(
        tmp_path,
        [_canonical(), _alias(name="INGREDIENT   ALPHA")],
    )

    result = RxNormCpcIngestionService(database).ingest(_request(source))

    assert result.rows_persisted == 2
    with database.session() as session:
        assert _count(session, ActiveIngredient) == 1
        assert _count(session, IngredientAlias) == 1


def test_alias_shared_by_different_rxcuis_is_fully_quarantined(
    database: Database, tmp_path: Path
) -> None:
    source = _write_rows(
        tmp_path,
        [
            _canonical(rxcui="100001", rxaui="A100001", name="Ingredient Alpha"),
            _alias(rxcui="100001", rxaui="A100002", name="Alias Shared"),
            _canonical(rxcui="100002", rxaui="A100003", name="Ingredient Beta"),
            _alias(rxcui="100002", rxaui="A100004", name="ALIAS   SHARED"),
        ],
    )

    result = RxNormCpcIngestionService(database).ingest(_request(source))

    assert result.rows_persisted == 2
    assert result.rows_quarantined == 2
    assert result.quarantine_reasons == {"ambiguous_normalized_alias": 2}
    with database.session() as session:
        assert _count(session, ActiveIngredient) == 2
        assert _count(session, IngredientAlias) == 0


def test_alias_colliding_with_another_canonical_is_quarantined(
    database: Database, tmp_path: Path
) -> None:
    source = _write_rows(
        tmp_path,
        [
            _canonical(rxcui="100001", rxaui="A100001", name="Ingredient Alpha"),
            _alias(rxcui="100001", rxaui="A100002", name="Ingredient Beta"),
            _canonical(rxcui="100002", rxaui="A100003", name="Ingredient Beta"),
        ],
    )

    result = RxNormCpcIngestionService(database).ingest(_request(source))

    assert result.rows_persisted == 2
    assert result.rows_quarantined == 1
    assert result.quarantine_reasons == {"ambiguous_normalized_alias": 1}
    with database.session() as session:
        assert _count(session, ActiveIngredient) == 2
        assert _count(session, IngredientAlias) == 0


def test_existing_alias_blocks_conflicting_new_canonical_identity(
    database: Database, tmp_path: Path
) -> None:
    service = RxNormCpcIngestionService(database)
    first_source = _write_rows(
        tmp_path,
        [_canonical(), _alias(name="Shared Identity Name")],
    )
    service.ingest(_request(first_source, release="synthetic-2026-08"))
    second_dir = tmp_path / "second"
    second_source = _write_rows(
        second_dir,
        [
            _canonical(
                rxcui="100002",
                rxaui="A100003",
                name="Shared Identity Name",
            )
        ],
    )

    result = service.ingest(
        _request(second_source, release="synthetic-2026-09")
    )

    assert result.rows_persisted == 0
    assert result.quarantine_reasons == {"ambiguous_existing_identity": 1}
    with database.session() as session:
        assert _count(session, ActiveIngredient) == 1


def test_existing_canonical_blocks_conflicting_new_alias(
    database: Database, tmp_path: Path
) -> None:
    service = RxNormCpcIngestionService(database)
    first_source = _write_rows(
        tmp_path,
        [
            _canonical(
                rxcui="100002",
                rxaui="A100003",
                name="Shared Identity Name",
            )
        ],
    )
    service.ingest(_request(first_source, release="synthetic-2026-08"))
    second_dir = tmp_path / "second"
    second_source = _write_rows(
        second_dir,
        [_canonical(), _alias(name="Shared Identity Name")],
    )

    result = service.ingest(
        _request(second_source, release="synthetic-2026-09")
    )

    assert result.rows_persisted == 1
    assert result.quarantine_reasons == {"ambiguous_existing_alias": 1}
    with database.session() as session:
        assert _count(session, ActiveIngredient) == 2
        assert _count(session, IngredientAlias) == 0


def test_only_in_and_explicit_mthspl_alias_scope_is_imported(
    database: Database, tmp_path: Path
) -> None:
    source = _write_rows(
        tmp_path,
        [
            _canonical(),
            _canonical(rxcui="200001", rxaui="A200001").replace("|IN|", "|PIN|"),
            _canonical(rxcui="200002", rxaui="A200002").replace("|IN|", "|MIN|"),
            _canonical(rxcui="200003", rxaui="A200003").replace("|IN|", "|SCD|"),
            _canonical(rxcui="200004", rxaui="A200004").replace("|IN|", "|SBD|"),
        ],
    )

    result = RxNormCpcIngestionService(database).ingest(_request(source))

    assert result.rows_persisted == 1
    assert result.rows_ignored_out_of_scope == 4
    with database.session() as session:
        assert _count(session, ActiveIngredient) == 1


def test_malformed_and_unresolved_rows_are_quarantined_with_reasons(
    database: Database, tmp_path: Path
) -> None:
    source = _write_rows(
        tmp_path,
        [
            "not-a-valid-rrf-row",
            _alias(rxcui="900001", rxaui="A900001", name="Alias Unresolved"),
            _canonical(rxcui="900002", rxaui="", name="Ingredient Missing Identifier"),
        ],
    )

    result = RxNormCpcIngestionService(database).ingest(_request(source))

    assert result.status == "completed"
    assert result.rows_persisted == 0
    assert result.rows_quarantined == 3
    assert result.quarantine_reasons == {
        "malformed_rrf_row": 1,
        "missing_required_field": 1,
        "unresolved_semantic_mapping": 1,
    }
    with database.session() as session:
        records = session.scalars(
            select(QuarantinedRecord).order_by(QuarantinedRecord.source_line_number)
        ).all()
        assert len(records) == 3
        assert records[0].source_record_identifier is None
        assert {record.reason_code for record in records} == set(
            result.quarantine_reasons
        )


def test_conflicting_duplicate_concept_is_quarantined_without_partial_mapping(
    database: Database, tmp_path: Path
) -> None:
    source = _write_rows(
        tmp_path,
        [
            _canonical(rxaui="A100001", name="Ingredient Alpha"),
            _canonical(rxaui="A100003", name="Ingredient Beta"),
            _alias(),
        ],
    )

    result = RxNormCpcIngestionService(database).ingest(_request(source))

    assert result.rows_quarantined == 3
    assert result.quarantine_reasons == {"conflicting_canonical_concept": 3}
    with database.session() as session:
        assert _count(session, ActiveIngredient) == 0
        assert _count(session, IngredientAlias) == 0
        assert _count(session, ExternalIdentifier) == 0
        assert _count(session, QuarantinedRecord) == 3


def test_duplicate_source_identifier_conflict_is_quarantined(
    database: Database, tmp_path: Path
) -> None:
    source = _write_rows(
        tmp_path,
        [
            _canonical(rxaui="A100001", name="Ingredient Alpha"),
            _canonical(rxaui="A100001", name="Ingredient Beta"),
        ],
    )

    result = RxNormCpcIngestionService(database).ingest(_request(source))

    assert result.rows_quarantined == 2
    assert result.quarantine_reasons == {"duplicate_source_identifier_conflict": 2}


def test_summary_counts_reconcile_for_every_successful_row_disposition(
    database: Database, tmp_path: Path
) -> None:
    alias = _alias()
    source = _write_rows(
        tmp_path,
        [
            _canonical(),
            alias,
            alias,
            _canonical(rxcui="200001", rxaui="A200001").replace("|IN|", "|SCD|"),
            "malformed",
            _canonical(rxcui="300001", rxaui="", name="Ingredient Missing Identifier"),
            _alias(rxcui="400001", rxaui="A400001", name="Alias Unresolved"),
        ],
    )

    result = RxNormCpcIngestionService(database).ingest(_request(source))

    assert result.rows_extracted == 7
    assert result.rows_validated == 6
    assert result.rows_normalized == 4
    assert result.rows_persisted == 2
    assert result.rows_skipped_as_exact_duplicates == 1
    assert result.rows_quarantined == 3
    assert result.rows_ignored_out_of_scope == 1
    assert result.quarantine_reasons == {
        "malformed_rrf_row": 1,
        "missing_required_field": 1,
        "unresolved_semantic_mapping": 1,
    }
    assert result.rows_extracted == result.rows_validated + 1
    assert result.rows_validated == (
        result.rows_ignored_out_of_scope + result.rows_normalized + 1
    )
    assert result.rows_normalized == (
        result.rows_persisted
        + result.rows_skipped_as_exact_duplicates
        + 1
    )


def test_metadata_transaction_rolls_back_source_release_and_batch_together(
    database: Database, monkeypatch: pytest.MonkeyPatch
) -> None:
    fixed_hex = "f" * 32
    with database.session() as session:
        existing_source = DataSource(name="synthetic_existing_source")
        existing_release = SourceRelease(
            data_source=existing_source,
            release_identifier="synthetic_existing_release",
        )
        session.add(
            IngestionBatch(
                source_release=existing_release,
                batch_identifier=f"rxnorm-cpc-{fixed_hex}",
                pipeline_name="synthetic_existing_pipeline",
                pipeline_version="synthetic_existing_version",
            )
        )

    class FixedUuid:
        hex = fixed_hex

    monkeypatch.setattr(rxnorm_cpc_module, "uuid4", lambda: FixedUuid())
    with pytest.raises(RxNormCpcIngestionFailure) as raised:
        RxNormCpcIngestionService(database).ingest(_request())

    assert raised.value.result.failure_reason == "metadata_persistence_failed"
    assert raised.value.result.batch_id is None
    with database.session() as session:
        assert session.scalar(
            select(DataSource).where(DataSource.name == SOURCE_NAME)
        ) is None
        assert _count(session, DataSource) == 1
        assert _count(session, SourceRelease) == 1
        assert _count(session, IngestionBatch) == 1


@pytest.mark.parametrize("failing_model", [DataSource, SourceRelease, IngestionBatch])
def test_each_metadata_insert_failure_rolls_back_the_metadata_transaction(
    database: Database, failing_model: type
) -> None:
    def fail_insert(*_args) -> None:
        raise RuntimeError("synthetic metadata insert failure")

    event.listen(failing_model, "before_insert", fail_insert)
    try:
        with pytest.raises(RxNormCpcIngestionFailure) as raised:
            RxNormCpcIngestionService(database).ingest(_request())
    finally:
        event.remove(failing_model, "before_insert", fail_insert)

    assert raised.value.result.failure_reason == "metadata_persistence_failed"
    with database.session() as session:
        assert _count(session, DataSource) == 0
        assert _count(session, SourceRelease) == 0
        assert _count(session, IngestionBatch) == 0


@pytest.mark.parametrize(
    "failing_model",
    [ProvenanceRecord, ActiveIngredient, ExternalIdentifier, IngredientAlias],
)
def test_each_identity_insert_failure_rolls_back_the_data_transaction(
    database: Database, failing_model: type
) -> None:
    def fail_insert(*_args) -> None:
        raise RuntimeError("synthetic identity insert failure")

    event.listen(failing_model, "before_insert", fail_insert)
    try:
        with pytest.raises(RxNormCpcIngestionFailure):
            RxNormCpcIngestionService(database).ingest(_request())
    finally:
        event.remove(failing_model, "before_insert", fail_insert)

    with database.session() as session:
        batch = session.scalar(select(IngestionBatch))
        assert batch is not None
        assert batch.status == IngestionStatus.FAILED
        assert _count(session, ActiveIngredient) == 0
        assert _count(session, IngredientAlias) == 0
        assert _count(session, ExternalIdentifier) == 0
        assert _count(session, ProvenanceRecord) == 0


def test_quarantine_persistence_failure_rolls_back_entire_data_transaction(
    database: Database, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    source = _write_rows(tmp_path, ["malformed", _canonical()])
    service = RxNormCpcIngestionService(database)
    persist_quarantine = service._persist_quarantine

    def persist_then_fail(*args, **kwargs):
        persist_quarantine(*args, **kwargs)
        args[0].flush()
        raise RuntimeError("synthetic quarantine persistence failure")

    monkeypatch.setattr(service, "_persist_quarantine", persist_then_fail)
    with pytest.raises(RxNormCpcIngestionFailure):
        service.ingest(_request(source))

    with database.session() as session:
        batch = session.scalar(select(IngestionBatch))
        assert batch is not None
        assert batch.status == IngestionStatus.FAILED
        assert _count(session, QuarantinedRecord) == 0
        assert _count(session, ActiveIngredient) == 0
        assert _count(session, ProvenanceRecord) == 0


def test_persistence_failure_rolls_back_all_dataset_rows_and_marks_batch_failed(
    database: Database, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    service = RxNormCpcIngestionService(database)
    original = service._persist_concept
    source = _write_rows(tmp_path, ["malformed", _canonical()])

    def persist_then_fail(*args, **kwargs):
        original(*args, **kwargs)
        raise RuntimeError("synthetic transaction failure")

    monkeypatch.setattr(service, "_persist_concept", persist_then_fail)
    with pytest.raises(RxNormCpcIngestionFailure) as raised:
        service.ingest(_request(source))

    assert raised.value.result.status == "failed"
    assert raised.value.result.failure_reason == "ingestion_failed"
    assert raised.value.result.rows_persisted == 0
    with database.session() as session:
        batch = session.scalar(select(IngestionBatch))
        assert batch is not None
        assert batch.status == IngestionStatus.FAILED
        assert batch.completed_at is not None
        assert _count(session, ActiveIngredient) == 0
        assert _count(session, IngredientAlias) == 0
        assert _count(session, ExternalIdentifier) == 0
        assert _count(session, ProvenanceRecord) == 0
        assert _count(session, QuarantinedRecord) == 0
