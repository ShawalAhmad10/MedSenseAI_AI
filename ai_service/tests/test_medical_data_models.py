"""Persistence tests using only explicitly synthetic, non-medical records."""

from collections.abc import Iterator
from pathlib import Path

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from medsense_ai.database import Database
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
    InteractionRecord,
    MedicineProduct,
    ProductIngredient,
    ProvenanceRecord,
    SourceRelease,
)
from medsense_ai.medical_data_ingestion import normalize_medical_name


@pytest.fixture
def medical_database(tmp_path: Path) -> Iterator[Database]:
    database = Database(f"sqlite:///{(tmp_path / 'medical-foundation.db').as_posix()}")
    database.create_schema()
    try:
        yield database
    finally:
        database.dispose()


def add_provenance_chain(
    session: Session,
    *,
    suffix: str = "alpha",
    transformed: bool = False,
) -> tuple[DataSource, SourceRelease, IngestionBatch, ProvenanceRecord]:
    data_source = DataSource(name=f"synthetic_source_{suffix}")
    source_release = SourceRelease(
        data_source=data_source,
        release_identifier=f"release_{suffix}",
        content_checksum=f"checksum_{suffix}",
    )
    batch = IngestionBatch(
        source_release=source_release,
        batch_identifier=f"batch_{suffix}",
        status=IngestionStatus.STAGED,
        pipeline_name="synthetic_pipeline",
        pipeline_version="version_alpha",
        input_checksum=f"input_checksum_{suffix}",
    )
    provenance = ProvenanceRecord(
        ingestion_batch=batch,
        source_record_type="synthetic_record",
        source_record_identifier=f"record_{suffix}",
        source_record_checksum=f"record_checksum_{suffix}",
        transformed=transformed,
        transformation_description="synthetic_transformation" if transformed else None,
        verification_status=VerificationStatus.REVIEW_REQUIRED,
    )
    session.add(provenance)
    session.flush()
    return data_source, source_release, batch, provenance


def add_ingredient(
    session: Session,
    provenance: ProvenanceRecord,
    name: str,
    *,
    status: VerificationStatus = VerificationStatus.REVIEW_REQUIRED,
) -> ActiveIngredient:
    ingredient = ActiveIngredient(
        canonical_name=name,
        normalized_name=normalize_medical_name(name),
        verification_status=status,
        provenance=provenance,
    )
    session.add(ingredient)
    session.flush()
    return ingredient


def test_source_release_batch_and_record_provenance_are_traceable(
    medical_database: Database,
) -> None:
    with medical_database.session() as session:
        data_source, source_release, batch, provenance = add_provenance_chain(
            session, transformed=True
        )
        provenance_id = provenance.id
        assert data_source.id is not None
        assert source_release.id is not None
        assert batch.id is not None

    with medical_database.session() as session:
        stored = session.get(ProvenanceRecord, provenance_id)
        assert stored is not None
        assert stored.ingestion_batch.batch_identifier == "batch_alpha"
        assert stored.ingestion_batch.source_release.release_identifier == "release_alpha"
        assert stored.ingestion_batch.source_release.data_source.name == "synthetic_source_alpha"
        assert stored.transformed is True
        assert stored.transformation_description == "synthetic_transformation"
        assert stored.imported_at is not None


def test_active_ingredient_alias_normalization_and_duplicate_prevention(
    medical_database: Database,
) -> None:
    with medical_database.session() as session:
        _, _, _, provenance = add_provenance_chain(session)
        ingredient = add_ingredient(session, provenance, "ingredient_alpha")
        alias = IngredientAlias(
            ingredient=ingredient,
            alias="  ALIAS   ALPHA  ",
            normalized_alias=normalize_medical_name("  ALIAS   ALPHA  "),
            mapping_status=MappingStatus.MAPPED,
            provenance=provenance,
        )
        session.add(alias)
        ingredient_id = ingredient.id
        provenance_id = provenance.id

    assert normalize_medical_name("  ALIAS   ALPHA  ") == "alias alpha"

    with pytest.raises(IntegrityError):
        with medical_database.session() as session:
            session.add(
                IngredientAlias(
                    ingredient_id=ingredient_id,
                    alias="alias alpha",
                    normalized_alias=normalize_medical_name("alias alpha"),
                    mapping_status=MappingStatus.MAPPED,
                    provenance_id=provenance_id,
                )
            )

    with medical_database.session() as session:
        alias_count = session.scalar(select(func.count()).select_from(IngredientAlias))
        assert alias_count == 1


def test_active_ingredient_normalized_names_are_unique(
    medical_database: Database,
) -> None:
    with medical_database.session() as session:
        _, _, _, provenance = add_provenance_chain(session)
        add_ingredient(session, provenance, "INGREDIENT_ALPHA")
        provenance_id = provenance.id

    with pytest.raises(IntegrityError):
        with medical_database.session() as session:
            session.add(
                ActiveIngredient(
                    canonical_name="ingredient_alpha",
                    normalized_name=normalize_medical_name("ingredient_alpha"),
                    provenance_id=provenance_id,
                )
            )


def test_products_support_one_or_multiple_ingredients(medical_database: Database) -> None:
    with medical_database.session() as session:
        _, _, _, provenance = add_provenance_chain(session)
        ingredient_alpha = add_ingredient(session, provenance, "ingredient_alpha")
        ingredient_beta = add_ingredient(session, provenance, "ingredient_beta")
        product_single = MedicineProduct(
            product_name="product_alpha",
            normalized_name="product_alpha",
            manufacturer="manufacturer_alpha",
            market_country_code="ZZ",
            provenance=provenance,
        )
        product_combination = MedicineProduct(
            product_name="product_combination_alpha",
            normalized_name="product_combination_alpha",
            provenance=provenance,
        )
        session.add_all(
            [
                ProductIngredient(
                    product=product_single,
                    ingredient=ingredient_alpha,
                    source_ingredient_name="ingredient_alpha",
                    normalized_source_name="ingredient_alpha",
                    mapping_status=MappingStatus.MAPPED,
                    provenance=provenance,
                ),
                ProductIngredient(
                    product=product_combination,
                    ingredient=ingredient_alpha,
                    source_ingredient_name="ingredient_alpha",
                    normalized_source_name="ingredient_alpha",
                    mapping_status=MappingStatus.MAPPED,
                    provenance=provenance,
                ),
                ProductIngredient(
                    product=product_combination,
                    ingredient=ingredient_beta,
                    source_ingredient_name="ingredient_beta",
                    normalized_source_name="ingredient_beta",
                    mapping_status=MappingStatus.MAPPED,
                    provenance=provenance,
                ),
            ]
        )
        session.flush()
        single_id = product_single.id
        combination_id = product_combination.id

    with medical_database.session() as session:
        single_count = session.scalar(
            select(func.count())
            .select_from(ProductIngredient)
            .where(ProductIngredient.product_id == single_id)
        )
        combination_count = session.scalar(
            select(func.count())
            .select_from(ProductIngredient)
            .where(ProductIngredient.product_id == combination_id)
        )
        assert single_count == 1
        assert combination_count == 2


def test_interaction_record_preserves_source_data_and_provenance(
    medical_database: Database,
) -> None:
    with medical_database.session() as session:
        _, _, _, provenance = add_provenance_chain(session)
        ingredient_alpha = add_ingredient(session, provenance, "ingredient_alpha")
        ingredient_beta = add_ingredient(session, provenance, "ingredient_beta")
        interaction = InteractionRecord(
            ingredient_a=ingredient_alpha,
            ingredient_b=ingredient_beta,
            source_native_classification="classification_alpha",
            source_native_description="synthetic_description_alpha",
            source_native_evidence="synthetic_evidence_alpha",
            verification_status=VerificationStatus.REVIEW_REQUIRED,
            provenance=provenance,
        )
        session.add(interaction)
        session.flush()
        interaction_id = interaction.id

    with medical_database.session() as session:
        stored = session.get(InteractionRecord, interaction_id)
        assert stored is not None
        assert stored.source_native_classification == "classification_alpha"
        assert stored.source_native_description == "synthetic_description_alpha"
        assert stored.provenance.source_record_identifier == "record_alpha"
        assert stored.provenance.ingestion_batch.source_release.data_source.name == (
            "synthetic_source_alpha"
        )


@pytest.mark.parametrize("pair_kind", ["self", "reversed"])
def test_interaction_pairs_require_distinct_canonical_order(
    medical_database: Database,
    pair_kind: str,
) -> None:
    with medical_database.session() as session:
        _, _, _, provenance = add_provenance_chain(session)
        ingredient_alpha = add_ingredient(session, provenance, "ingredient_alpha")
        ingredient_beta = add_ingredient(session, provenance, "ingredient_beta")
        provenance_id = provenance.id
        ingredient_alpha_id = ingredient_alpha.id
        ingredient_beta_id = ingredient_beta.id

    ingredient_a_id = ingredient_alpha_id if pair_kind == "self" else ingredient_beta_id
    ingredient_b_id = ingredient_alpha_id
    with pytest.raises(IntegrityError):
        with medical_database.session() as session:
            session.add(
                InteractionRecord(
                    ingredient_a_id=ingredient_a_id,
                    ingredient_b_id=ingredient_b_id,
                    provenance_id=provenance_id,
                )
            )


def test_external_identifiers_are_unique_within_a_source_assertion(
    medical_database: Database,
) -> None:
    with medical_database.session() as session:
        _, _, _, provenance = add_provenance_chain(session)
        ingredient_alpha = add_ingredient(session, provenance, "ingredient_alpha")
        ingredient_beta = add_ingredient(session, provenance, "ingredient_beta")
        identifier = ExternalIdentifier(
            entity_type=IdentifiedEntityType.ACTIVE_INGREDIENT,
            identifier_namespace="namespace_alpha",
            identifier_value="identifier_alpha",
            ingredient=ingredient_alpha,
            provenance=provenance,
        )
        session.add(identifier)
        ingredient_beta_id = ingredient_beta.id
        provenance_id = provenance.id

    with pytest.raises(IntegrityError):
        with medical_database.session() as session:
            session.add(
                ExternalIdentifier(
                    entity_type=IdentifiedEntityType.ACTIVE_INGREDIENT,
                    identifier_namespace="namespace_alpha",
                    identifier_value="identifier_alpha",
                    ingredient_id=ingredient_beta_id,
                    provenance_id=provenance_id,
                )
            )


def test_sqlite_foreign_keys_are_enforced_and_session_recovers(
    medical_database: Database,
) -> None:
    with pytest.raises(IntegrityError):
        with medical_database.session() as session:
            session.add(
                ActiveIngredient(
                    canonical_name="ingredient_alpha",
                    normalized_name="ingredient_alpha",
                    provenance_id=999_999,
                )
            )

    with medical_database.session() as session:
        _, _, _, provenance = add_provenance_chain(session, suffix="recovery")
        ingredient = add_ingredient(session, provenance, "ingredient_recovery")
        ingredient_id = ingredient.id

    with medical_database.session() as session:
        assert session.get(ActiveIngredient, ingredient_id) is not None


def test_review_and_unresolved_states_do_not_guess_mappings(
    medical_database: Database,
) -> None:
    with medical_database.session() as session:
        _, _, _, provenance = add_provenance_chain(session)
        ingredient = add_ingredient(session, provenance, "ingredient_alpha")
        alias = IngredientAlias(
            ingredient=ingredient,
            alias="alias_review_alpha",
            normalized_alias="alias_review_alpha",
            mapping_status=MappingStatus.REVIEW_REQUIRED,
            provenance=provenance,
        )
        product = MedicineProduct(
            product_name="product_alpha",
            normalized_name="product_alpha",
            provenance=provenance,
        )
        unresolved = ProductIngredient(
            product=product,
            ingredient=None,
            source_ingredient_name="unresolved_name_alpha",
            normalized_source_name="unresolved_name_alpha",
            mapping_status=MappingStatus.UNRESOLVED,
            provenance=provenance,
        )
        session.add_all([alias, unresolved])
        session.flush()
        product_id = product.id
        provenance_id = provenance.id

    with medical_database.session() as session:
        stored = session.scalar(
            select(ProductIngredient).where(ProductIngredient.product_id == product_id)
        )
        assert stored is not None
        assert stored.ingredient_id is None
        assert stored.mapping_status is MappingStatus.UNRESOLVED

    with pytest.raises(IntegrityError):
        with medical_database.session() as session:
            session.add(
                ProductIngredient(
                    product_id=product_id,
                    ingredient_id=None,
                    source_ingredient_name="invalid_mapped_name",
                    normalized_source_name="invalid_mapped_name",
                    mapping_status=MappingStatus.MAPPED,
                    provenance_id=provenance_id,
                )
            )


def test_transformation_metadata_is_required_when_marked_transformed(
    medical_database: Database,
) -> None:
    with medical_database.session() as session:
        _, _, batch, _ = add_provenance_chain(session)
        batch_id = batch.id

    with pytest.raises(IntegrityError):
        with medical_database.session() as session:
            session.add(
                ProvenanceRecord(
                    ingestion_batch_id=batch_id,
                    source_record_type="synthetic_invalid_transformation",
                    source_record_identifier="record_invalid_transformation",
                    transformed=True,
                    transformation_description=None,
                )
            )


def test_terminal_ingestion_status_requires_completion_timestamp(
    medical_database: Database,
) -> None:
    with medical_database.session() as session:
        data_source = DataSource(name="synthetic_source_terminal")
        source_release = SourceRelease(
            data_source=data_source,
            release_identifier="release_terminal",
        )
        session.add(source_release)
        session.flush()
        source_release_id = source_release.id

    with pytest.raises(IntegrityError):
        with medical_database.session() as session:
            session.add(
                IngestionBatch(
                    source_release_id=source_release_id,
                    batch_identifier="batch_terminal",
                    status=IngestionStatus.COMPLETED,
                    pipeline_name="synthetic_pipeline",
                    pipeline_version="version_alpha",
                    completed_at=None,
                )
            )
