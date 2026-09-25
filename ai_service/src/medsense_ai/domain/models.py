"""Normalized medical-data and provenance persistence models.

The models contain no medical facts and implement no clinical decision logic.
"""

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum as SqlEnum,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from medsense_ai.database.base import Base
from medsense_ai.domain.enums import (
    IdentifiedEntityType,
    IngestionStatus,
    MappingStatus,
    VerificationStatus,
)


def utc_now() -> datetime:
    """Return a timezone-aware UTC timestamp for portable Python-side defaults."""
    return datetime.now(timezone.utc)


def enum_type(enum_class: type[Any], name: str) -> SqlEnum[Any]:
    """Create a portable string-backed SQLAlchemy enum with a CHECK constraint."""
    return SqlEnum(
        enum_class,
        name=name,
        native_enum=False,
        create_constraint=True,
        validate_strings=True,
        values_callable=lambda members: [member.value for member in members],
    )


class TimestampMixin:
    """Creation and update timestamps shared by mutable records."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )


class DataSource(TimestampMixin, Base):
    """A declared provider or origin of imported medical data."""

    __tablename__ = "data_sources"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text)
    homepage_url: Mapped[str | None] = mapped_column(String(2048))
    license_identifier: Mapped[str | None] = mapped_column(String(255))

    releases: Mapped[list["SourceRelease"]] = relationship(
        back_populates="data_source", passive_deletes=True
    )

    __table_args__ = (CheckConstraint("length(trim(name)) > 0", name="ck_data_source_name"),)


class SourceRelease(TimestampMixin, Base):
    """A source dataset version, release, or explicitly unknown release."""

    __tablename__ = "source_releases"

    id: Mapped[int] = mapped_column(primary_key=True)
    data_source_id: Mapped[int] = mapped_column(
        ForeignKey("data_sources.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    release_identifier: Mapped[str | None] = mapped_column(String(255))
    source_uri: Mapped[str | None] = mapped_column(String(2048))
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    retrieved_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    content_checksum: Mapped[str | None] = mapped_column(String(255))

    data_source: Mapped[DataSource] = relationship(back_populates="releases")
    ingestion_batches: Mapped[list["IngestionBatch"]] = relationship(
        back_populates="source_release", passive_deletes=True
    )

    __table_args__ = (
        UniqueConstraint(
            "data_source_id", "release_identifier", name="uq_source_release_identifier"
        ),
    )


class IngestionBatch(Base):
    """One reproducible run of a deterministic source ingestion pipeline."""

    __tablename__ = "ingestion_batches"

    id: Mapped[int] = mapped_column(primary_key=True)
    batch_identifier: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    source_release_id: Mapped[int] = mapped_column(
        ForeignKey("source_releases.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    status: Mapped[IngestionStatus] = mapped_column(
        enum_type(IngestionStatus, "ingestion_status"),
        default=IngestionStatus.PENDING,
        nullable=False,
        index=True,
    )
    pipeline_name: Mapped[str] = mapped_column(String(200), nullable=False)
    pipeline_version: Mapped[str] = mapped_column(String(100), nullable=False)
    input_checksum: Mapped[str | None] = mapped_column(String(255))
    expected_checksum: Mapped[str | None] = mapped_column(String(255))
    source_file_name: Mapped[str | None] = mapped_column(String(512))
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)

    source_release: Mapped[SourceRelease] = relationship(back_populates="ingestion_batches")
    provenance_records: Mapped[list["ProvenanceRecord"]] = relationship(
        back_populates="ingestion_batch", passive_deletes=True
    )
    quarantined_records: Mapped[list["QuarantinedRecord"]] = relationship(
        back_populates="ingestion_batch", passive_deletes=True
    )

    __table_args__ = (
        CheckConstraint(
            "length(trim(batch_identifier)) > 0", name="ck_ingestion_batch_identifier"
        ),
        CheckConstraint("length(trim(pipeline_name)) > 0", name="ck_ingestion_pipeline_name"),
        CheckConstraint(
            "length(trim(pipeline_version)) > 0", name="ck_ingestion_pipeline_version"
        ),
        CheckConstraint(
            "completed_at IS NULL OR completed_at >= started_at",
            name="ck_ingestion_completion_time",
        ),
        CheckConstraint(
            "status NOT IN ('completed', 'failed') OR completed_at IS NOT NULL",
            name="ck_ingestion_terminal_timestamp",
        ),
    )


class ProvenanceRecord(Base):
    """Record-level trace linking a stored assertion to an ingestion batch."""

    __tablename__ = "provenance_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    ingestion_batch_id: Mapped[int] = mapped_column(
        ForeignKey("ingestion_batches.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    source_record_type: Mapped[str] = mapped_column(String(100), nullable=False)
    source_record_identifier: Mapped[str | None] = mapped_column(String(512))
    source_record_checksum: Mapped[str | None] = mapped_column(String(255))
    imported_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    transformed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    transformation_description: Mapped[str | None] = mapped_column(Text)
    verification_status: Mapped[VerificationStatus] = mapped_column(
        enum_type(VerificationStatus, "verification_status"),
        default=VerificationStatus.UNVERIFIED,
        nullable=False,
        index=True,
    )
    review_notes: Mapped[str | None] = mapped_column(Text)

    ingestion_batch: Mapped[IngestionBatch] = relationship(back_populates="provenance_records")

    __table_args__ = (
        UniqueConstraint(
            "ingestion_batch_id",
            "source_record_type",
            "source_record_identifier",
            name="uq_provenance_source_record",
        ),
        CheckConstraint(
            "length(trim(source_record_type)) > 0", name="ck_provenance_record_type"
        ),
        CheckConstraint(
            "(NOT transformed AND transformation_description IS NULL) "
            "OR (transformed AND transformation_description IS NOT NULL "
            "AND length(trim(transformation_description)) > 0)",
            name="ck_provenance_transformation",
        ),
        Index(
            "ix_provenance_source_identifier",
            "source_record_type",
            "source_record_identifier",
        ),
    )


class QuarantinedRecord(Base):
    """A rejected source row retained for deterministic review and audit."""

    __tablename__ = "quarantined_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    ingestion_batch_id: Mapped[int] = mapped_column(
        ForeignKey("ingestion_batches.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    source_record_type: Mapped[str] = mapped_column(String(100), nullable=False)
    source_record_identifier: Mapped[str | None] = mapped_column(String(512))
    source_record_checksum: Mapped[str] = mapped_column(String(255), nullable=False)
    source_line_number: Mapped[int] = mapped_column(nullable=False)
    reason_code: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    reason_detail: Mapped[str] = mapped_column(Text, nullable=False)
    quarantined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )

    ingestion_batch: Mapped[IngestionBatch] = relationship(
        back_populates="quarantined_records"
    )

    __table_args__ = (
        CheckConstraint(
            "length(trim(source_record_type)) > 0",
            name="ck_quarantined_record_type",
        ),
        CheckConstraint(
            "length(trim(source_record_checksum)) > 0",
            name="ck_quarantined_record_checksum",
        ),
        CheckConstraint(
            "source_line_number > 0", name="ck_quarantined_record_line_number"
        ),
        CheckConstraint(
            "length(trim(reason_code)) > 0", name="ck_quarantined_reason_code"
        ),
        CheckConstraint(
            "length(trim(reason_detail)) > 0", name="ck_quarantined_reason_detail"
        ),
    )


class ActiveIngredient(TimestampMixin, Base):
    """A normalized active-ingredient identity, independent of brand products."""

    __tablename__ = "active_ingredients"

    id: Mapped[int] = mapped_column(primary_key=True)
    canonical_name: Mapped[str] = mapped_column(String(500), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(500), nullable=False, unique=True)
    verification_status: Mapped[VerificationStatus] = mapped_column(
        enum_type(VerificationStatus, "ingredient_verification_status"),
        default=VerificationStatus.REVIEW_REQUIRED,
        nullable=False,
        index=True,
    )
    provenance_id: Mapped[int] = mapped_column(
        ForeignKey("provenance_records.id", ondelete="RESTRICT"), nullable=False, index=True
    )

    provenance: Mapped[ProvenanceRecord] = relationship()
    aliases: Mapped[list["IngredientAlias"]] = relationship(
        back_populates="ingredient", passive_deletes=True
    )

    __table_args__ = (
        CheckConstraint(
            "length(trim(canonical_name)) > 0", name="ck_ingredient_canonical_name"
        ),
        CheckConstraint(
            "length(trim(normalized_name)) > 0", name="ck_ingredient_normalized_name"
        ),
    )


class IngredientAlias(TimestampMixin, Base):
    """A source-supported alias mapped to a normalized active ingredient."""

    __tablename__ = "ingredient_aliases"

    id: Mapped[int] = mapped_column(primary_key=True)
    ingredient_id: Mapped[int] = mapped_column(
        ForeignKey("active_ingredients.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    alias: Mapped[str] = mapped_column(String(500), nullable=False)
    normalized_alias: Mapped[str] = mapped_column(String(500), nullable=False)
    mapping_status: Mapped[MappingStatus] = mapped_column(
        enum_type(MappingStatus, "alias_mapping_status"),
        default=MappingStatus.REVIEW_REQUIRED,
        nullable=False,
        index=True,
    )
    provenance_id: Mapped[int] = mapped_column(
        ForeignKey("provenance_records.id", ondelete="RESTRICT"), nullable=False, index=True
    )

    ingredient: Mapped[ActiveIngredient] = relationship(back_populates="aliases")
    provenance: Mapped[ProvenanceRecord] = relationship()

    __table_args__ = (
        UniqueConstraint(
            "ingredient_id",
            "normalized_alias",
            "provenance_id",
            name="uq_ingredient_alias_assertion",
        ),
        CheckConstraint("length(trim(alias)) > 0", name="ck_ingredient_alias"),
        CheckConstraint(
            "length(trim(normalized_alias)) > 0", name="ck_ingredient_alias_normalized"
        ),
        CheckConstraint(
            "mapping_status <> 'unresolved'", name="ck_alias_has_mapping_candidate"
        ),
    )


class MedicineProduct(TimestampMixin, Base):
    """A market or brand product that may contain one or more ingredients."""

    __tablename__ = "medicine_products"

    id: Mapped[int] = mapped_column(primary_key=True)
    product_name: Mapped[str] = mapped_column(String(500), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    manufacturer: Mapped[str | None] = mapped_column(String(500))
    market_country_code: Mapped[str | None] = mapped_column(String(2))
    verification_status: Mapped[VerificationStatus] = mapped_column(
        enum_type(VerificationStatus, "product_verification_status"),
        default=VerificationStatus.UNVERIFIED,
        nullable=False,
        index=True,
    )
    provenance_id: Mapped[int] = mapped_column(
        ForeignKey("provenance_records.id", ondelete="RESTRICT"), nullable=False, index=True
    )

    provenance: Mapped[ProvenanceRecord] = relationship()
    ingredients: Mapped[list["ProductIngredient"]] = relationship(
        back_populates="product", passive_deletes=True
    )

    __table_args__ = (
        CheckConstraint("length(trim(product_name)) > 0", name="ck_product_name"),
        CheckConstraint(
            "length(trim(normalized_name)) > 0", name="ck_product_normalized_name"
        ),
        CheckConstraint(
            "market_country_code IS NULL OR length(market_country_code) = 2",
            name="ck_product_country_code",
        ),
    )


class ProductIngredient(TimestampMixin, Base):
    """A source assertion connecting a product to a normalized or unresolved ingredient."""

    __tablename__ = "product_ingredients"

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(
        ForeignKey("medicine_products.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    ingredient_id: Mapped[int | None] = mapped_column(
        ForeignKey("active_ingredients.id", ondelete="RESTRICT"), index=True
    )
    source_ingredient_name: Mapped[str] = mapped_column(String(500), nullable=False)
    normalized_source_name: Mapped[str] = mapped_column(String(500), nullable=False)
    mapping_status: Mapped[MappingStatus] = mapped_column(
        enum_type(MappingStatus, "product_ingredient_mapping_status"),
        default=MappingStatus.UNRESOLVED,
        nullable=False,
        index=True,
    )
    provenance_id: Mapped[int] = mapped_column(
        ForeignKey("provenance_records.id", ondelete="RESTRICT"), nullable=False, index=True
    )

    product: Mapped[MedicineProduct] = relationship(back_populates="ingredients")
    ingredient: Mapped[ActiveIngredient | None] = relationship()
    provenance: Mapped[ProvenanceRecord] = relationship()

    __table_args__ = (
        UniqueConstraint(
            "product_id",
            "normalized_source_name",
            "provenance_id",
            name="uq_product_ingredient_assertion",
        ),
        CheckConstraint(
            "length(trim(source_ingredient_name)) > 0",
            name="ck_product_ingredient_source_name",
        ),
        CheckConstraint(
            "length(trim(normalized_source_name)) > 0",
            name="ck_product_ingredient_normalized_name",
        ),
        CheckConstraint(
            "(mapping_status = 'mapped' AND ingredient_id IS NOT NULL) "
            "OR (mapping_status = 'unresolved' AND ingredient_id IS NULL) "
            "OR mapping_status = 'review_required'",
            name="ck_product_ingredient_mapping",
        ),
    )


class ExternalIdentifier(TimestampMixin, Base):
    """A source-specific identifier for an ingredient or product."""

    __tablename__ = "external_identifiers"

    id: Mapped[int] = mapped_column(primary_key=True)
    entity_type: Mapped[IdentifiedEntityType] = mapped_column(
        enum_type(IdentifiedEntityType, "identified_entity_type"), nullable=False
    )
    identifier_namespace: Mapped[str] = mapped_column(String(200), nullable=False)
    identifier_value: Mapped[str] = mapped_column(String(512), nullable=False)
    ingredient_id: Mapped[int | None] = mapped_column(
        ForeignKey("active_ingredients.id", ondelete="RESTRICT"), index=True
    )
    product_id: Mapped[int | None] = mapped_column(
        ForeignKey("medicine_products.id", ondelete="RESTRICT"), index=True
    )
    provenance_id: Mapped[int] = mapped_column(
        ForeignKey("provenance_records.id", ondelete="RESTRICT"), nullable=False, index=True
    )

    ingredient: Mapped[ActiveIngredient | None] = relationship()
    product: Mapped[MedicineProduct | None] = relationship()
    provenance: Mapped[ProvenanceRecord] = relationship()

    __table_args__ = (
        UniqueConstraint(
            "provenance_id",
            "entity_type",
            "identifier_namespace",
            "identifier_value",
            name="uq_provenance_external_identifier",
        ),
        CheckConstraint(
            "length(trim(identifier_namespace)) > 0",
            name="ck_external_identifier_namespace",
        ),
        CheckConstraint(
            "length(trim(identifier_value)) > 0", name="ck_external_identifier_value"
        ),
        CheckConstraint(
            "(entity_type = 'active_ingredient' AND ingredient_id IS NOT NULL "
            "AND product_id IS NULL) OR "
            "(entity_type = 'medicine_product' AND product_id IS NOT NULL "
            "AND ingredient_id IS NULL)",
            name="ck_external_identifier_entity",
        ),
    )


class InteractionRecord(TimestampMixin, Base):
    """A source-preserved assertion about an ordered pair of ingredients.

    Absence of a row is not evidence of safety. No lookup behavior is defined
    by this persistence model.
    """

    __tablename__ = "interaction_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    ingredient_a_id: Mapped[int] = mapped_column(
        ForeignKey("active_ingredients.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    ingredient_b_id: Mapped[int] = mapped_column(
        ForeignKey("active_ingredients.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    source_native_classification: Mapped[str | None] = mapped_column(String(500))
    source_native_description: Mapped[str | None] = mapped_column(Text)
    source_native_evidence: Mapped[str | None] = mapped_column(Text)
    verification_status: Mapped[VerificationStatus] = mapped_column(
        enum_type(VerificationStatus, "interaction_verification_status"),
        default=VerificationStatus.UNVERIFIED,
        nullable=False,
        index=True,
    )
    provenance_id: Mapped[int] = mapped_column(
        ForeignKey("provenance_records.id", ondelete="RESTRICT"), nullable=False, index=True
    )

    ingredient_a: Mapped[ActiveIngredient] = relationship(foreign_keys=[ingredient_a_id])
    ingredient_b: Mapped[ActiveIngredient] = relationship(foreign_keys=[ingredient_b_id])
    provenance: Mapped[ProvenanceRecord] = relationship()

    __table_args__ = (
        UniqueConstraint(
            "provenance_id",
            "ingredient_a_id",
            "ingredient_b_id",
            name="uq_interaction_source_assertion",
        ),
        CheckConstraint(
            "ingredient_a_id < ingredient_b_id", name="ck_interaction_canonical_pair"
        ),
        Index("ix_interaction_ingredient_pair", "ingredient_a_id", "ingredient_b_id"),
    )


MODEL_TABLES = (
    DataSource,
    SourceRelease,
    IngestionBatch,
    ProvenanceRecord,
    QuarantinedRecord,
    ActiveIngredient,
    IngredientAlias,
    MedicineProduct,
    ProductIngredient,
    ExternalIdentifier,
    InteractionRecord,
)
