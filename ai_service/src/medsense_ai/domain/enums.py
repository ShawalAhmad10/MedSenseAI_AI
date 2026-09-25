"""Typed lifecycle states for medical data and ingestion records."""

from enum import Enum


class VerificationStatus(str, Enum):
    """Human or source-verification state for a stored assertion."""

    UNVERIFIED = "unverified"
    REVIEW_REQUIRED = "review_required"
    VERIFIED = "verified"
    REJECTED = "rejected"


class IngestionStatus(str, Enum):
    """Lifecycle state of a deterministic ingestion batch."""

    PENDING = "pending"
    EXTRACTING = "extracting"
    VALIDATING = "validating"
    STAGED = "staged"
    QUARANTINED = "quarantined"
    COMPLETED = "completed"
    FAILED = "failed"


class MappingStatus(str, Enum):
    """Resolution state for a source name mapped to a normalized entity."""

    MAPPED = "mapped"
    REVIEW_REQUIRED = "review_required"
    UNRESOLVED = "unresolved"


class IdentifiedEntityType(str, Enum):
    """Entity types supported by source-specific identifiers."""

    ACTIVE_INGREDIENT = "active_ingredient"
    MEDICINE_PRODUCT = "medicine_product"


class InteractionAssessmentStatus(str, Enum):
    """Required outcome vocabulary for the future interaction engine.

    This enum is a contract only. No interaction lookup or decision behavior is
    implemented in this phase.
    """

    INTERACTION_FOUND = "interaction_found"
    NO_ASSERTION_AVAILABLE = "no_assertion_available"
    UNRESOLVED_DRUG = "unresolved_drug"
    INSUFFICIENT_DATA = "insufficient_data"
