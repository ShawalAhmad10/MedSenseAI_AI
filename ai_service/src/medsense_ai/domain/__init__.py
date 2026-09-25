"""Medical-data domain models and lifecycle states; no decision logic."""

from medsense_ai.domain.enums import (
    IdentifiedEntityType,
    IngestionStatus,
    InteractionAssessmentStatus,
    MappingStatus,
    VerificationStatus,
)

__all__ = [
    "IdentifiedEntityType",
    "IngestionStatus",
    "InteractionAssessmentStatus",
    "MappingStatus",
    "VerificationStatus",
]
