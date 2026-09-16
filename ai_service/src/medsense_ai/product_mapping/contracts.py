"""Provider-neutral medicine product and ingredient-mapping contracts.

The contracts in this module preserve source statements and mapping uncertainty.
They contain no real medicine data, interaction assertions, or clinical logic.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator


class ProductSourceType(str, Enum):
    """Declared origin of a product record."""

    PHARMACY_MASTER = "pharmacy_master"
    REGULATORY_FEED = "regulatory_feed"
    COMMERCIAL_FEED = "commercial_feed"
    PHARMACIST_CURATED = "pharmacist_curated"
    SYNTHETIC = "synthetic"


class ProductStatus(str, Enum):
    """Source-preserved product lifecycle state."""

    ACTIVE = "active"
    INACTIVE = "inactive"
    UNKNOWN = "unknown"


class ProductCompositionStatus(str, Enum):
    """Whether the source claims that the component list is complete."""

    COMPLETE = "complete"
    INCOMPLETE = "incomplete"
    UNKNOWN = "unknown"


class ComponentRole(str, Enum):
    """Role asserted by the product source, without role inference."""

    ACTIVE = "active"
    NON_ACTIVE = "non_active"
    UNKNOWN = "unknown"


class ReviewStatus(str, Enum):
    """Human-review lifecycle for a source or mapping assertion."""

    NOT_REQUIRED = "not_required"
    REQUIRED = "required"
    COMPLETED = "completed"


class CanonicalIngredientStatus(str, Enum):
    """Lifecycle of a MedSenseAI-owned canonical ingredient identity."""

    ACTIVE = "active"
    DEPRECATED = "deprecated"
    RETIRED = "retired"
    UNKNOWN = "unknown"


class ComponentMappingStatus(str, Enum):
    """Non-clinical outcome of mapping one source component."""

    EXACT_INGREDIENT_MATCH = "exact_ingredient_match"
    VALIDATED_SALT_TO_MOIETY_RELATIONSHIP = (
        "validated_salt_to_moiety_relationship"
    )
    AMBIGUOUS_SALT_RELATIONSHIP = "ambiguous_salt_relationship"
    UNSUPPORTED_SUBSTANCE = "unsupported_substance"
    UNMAPPED = "unmapped"
    REVIEW_REQUIRED = "review_required"
    NOT_APPLICABLE = "not_applicable"


class CrosswalkMappingMethod(str, Enum):
    """Allowed explicit mapping methods; fuzzy-name inference is absent."""

    AUTHORITATIVE_CROSSWALK = "authoritative_crosswalk"
    EXACT_SOURCE_IDENTIFIER = "exact_source_identifier"
    HUMAN_VERIFIED = "human_verified"
    NO_MATCH = "no_match"


class CrosswalkMappingStatus(str, Enum):
    """Versioned external-identity mapping lifecycle."""

    MAPPED = "mapped"
    UNMAPPED = "unmapped"
    AMBIGUOUS = "ambiguous"
    REVIEW_REQUIRED = "review_required"
    DEPRECATED = "deprecated"
    SUPERSEDED = "superseded"


class SubstanceKind(str, Enum):
    """Source-declared substance granularity."""

    PRECISE_SUBSTANCE = "precise_substance"
    ACTIVE_MOIETY = "active_moiety"
    BASE = "base"
    SALT = "salt"
    ESTER = "ester"
    HYDRATE_SOLVATE = "hydrate_solvate"
    UNKNOWN = "unknown"


class SubstanceRelationshipType(str, Enum):
    """Explicit non-clinical substance relationship type."""

    EXACT_IDENTITY = "exact_identity"
    PRECISE_TO_ACTIVE_MOIETY = "precise_to_active_moiety"
    SALT_TO_ACTIVE_MOIETY = "salt_to_active_moiety"
    ESTER_TO_ACTIVE_MOIETY = "ester_to_active_moiety"
    HYDRATE_SOLVATE_TO_PARENT = "hydrate_solvate_to_parent"
    UNKNOWN = "unknown"


class RelationshipLifecycleStatus(str, Enum):
    """Lifecycle for a versioned normalization relationship."""

    CURRENT = "current"
    DEPRECATED = "deprecated"
    SUPERSEDED = "superseded"


class ProductDDIEligibilityStatus(str, Enum):
    """Pre-provider product eligibility; none of these are safety outcomes."""

    READY_FOR_PROVIDER_LOOKUP = "ready_for_provider_lookup"
    INCOMPLETE_PRODUCT_COMPOSITION = "incomplete_product_composition"
    UNRESOLVED_COMPONENT = "unresolved_component"
    AMBIGUOUS_MAPPING = "ambiguous_mapping"
    UNSUPPORTED_COMPONENT = "unsupported_component"
    UNKNOWN_COMPONENT_ROLE = "unknown_component_role"
    REVIEW_REQUIRED = "review_required"


class PairExpansionStatus(str, Enum):
    """Whether non-clinical provider-lookup candidates were prepared."""

    CANDIDATES_GENERATED = "candidates_generated"
    BLOCKED_BY_ELIGIBILITY = "blocked_by_eligibility"


class SourceProvenance(BaseModel):
    """Source and release evidence for one product or mapping assertion."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    source_name: str = Field(min_length=1, max_length=200)
    source_release_identifier: str = Field(min_length=1, max_length=255)
    source_record_identifier: str = Field(min_length=1, max_length=512)
    source_record_checksum: str | None = Field(default=None, min_length=1, max_length=255)
    transformation_description: str | None = Field(
        default=None, min_length=1, max_length=1000
    )


class CanonicalIngredient(BaseModel):
    """MedSenseAI-owned ingredient identity, independent of RxNorm."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    ingredient_identifier: str = Field(min_length=1, max_length=255)
    preferred_display_name: str = Field(min_length=1, max_length=500)
    status: CanonicalIngredientStatus
    creation_provenance: SourceProvenance
    review_status: ReviewStatus


class SubstanceReference(BaseModel):
    """Opaque source substance identity at a declared granularity."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    substance_identifier: str = Field(min_length=1, max_length=255)
    display_name: str = Field(min_length=1, max_length=500)
    kind: SubstanceKind
    provenance: SourceProvenance


class SubstanceNormalizationRelationship(BaseModel):
    """Explicit and versioned relationship; never inferred from names."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    relationship_identifier: str = Field(min_length=1, max_length=255)
    relationship_version: str = Field(min_length=1, max_length=255)
    precise_substance: SubstanceReference
    active_moiety_or_base: SubstanceReference | None = None
    relationship_type: SubstanceRelationshipType
    mapping_status: ComponentMappingStatus
    provenance: SourceProvenance
    review_status: ReviewStatus
    lifecycle_status: RelationshipLifecycleStatus = RelationshipLifecycleStatus.CURRENT
    superseded_by_relationship_identifier: str | None = Field(
        default=None, min_length=1, max_length=255
    )

    @model_validator(mode="after")
    def validate_relationship(self) -> SubstanceNormalizationRelationship:
        target = self.active_moiety_or_base

        if self.mapping_status is ComponentMappingStatus.EXACT_INGREDIENT_MATCH:
            if self.relationship_type is not SubstanceRelationshipType.EXACT_IDENTITY:
                raise ValueError("exact mappings require an explicit exact-identity relationship")
            if target is None:
                raise ValueError("exact relationships require a target substance")

        if (
            self.mapping_status
            is ComponentMappingStatus.VALIDATED_SALT_TO_MOIETY_RELATIONSHIP
        ):
            if self.relationship_type is not SubstanceRelationshipType.SALT_TO_ACTIVE_MOIETY:
                raise ValueError(
                    "validated salt mappings require a salt-to-active-moiety relationship"
                )
            if self.precise_substance.kind is not SubstanceKind.SALT:
                raise ValueError("validated salt mappings require a source salt substance")
            if target is None or target.kind not in {
                SubstanceKind.ACTIVE_MOIETY,
                SubstanceKind.BASE,
            }:
                raise ValueError(
                    "validated salt mappings require an active-moiety or base target"
                )
            if self.review_status is ReviewStatus.REQUIRED:
                raise ValueError("a validated salt mapping cannot still require review")
            if self.lifecycle_status is not RelationshipLifecycleStatus.CURRENT:
                raise ValueError("a validated salt mapping must use a current relationship")

        if self.mapping_status is ComponentMappingStatus.AMBIGUOUS_SALT_RELATIONSHIP:
            if self.precise_substance.kind is not SubstanceKind.SALT:
                raise ValueError("ambiguous salt relationships require a source salt")
            if self.review_status is not ReviewStatus.REQUIRED:
                raise ValueError("ambiguous salt relationships require human review")

        if self.lifecycle_status is RelationshipLifecycleStatus.SUPERSEDED:
            replacement = self.superseded_by_relationship_identifier
            if replacement is None:
                raise ValueError("superseded relationships require a replacement identifier")
            if replacement == self.relationship_identifier:
                raise ValueError("a relationship cannot supersede itself")
        elif self.superseded_by_relationship_identifier is not None:
            raise ValueError("only superseded relationships may identify a replacement")

        return self


class ProductComponent(BaseModel):
    """One source-preserved product component and its mapping state."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    component_identifier: str = Field(min_length=1, max_length=255)
    raw_component_name: str = Field(min_length=1, max_length=1000)
    raw_salt_or_form: str | None = Field(default=None, min_length=1, max_length=1000)
    raw_strength_amount: str | None = Field(default=None, min_length=1, max_length=500)
    raw_unit: str | None = Field(default=None, min_length=1, max_length=100)
    role: ComponentRole
    provenance: SourceProvenance
    normalized_candidate: CanonicalIngredient | None = None
    candidate_ingredient_identifiers: tuple[str, ...] = ()
    mapping_status: ComponentMappingStatus
    human_review_required: bool
    normalization_relationship: SubstanceNormalizationRelationship | None = None

    @model_validator(mode="after")
    def validate_mapping_state(self) -> ProductComponent:
        candidates = self.candidate_ingredient_identifiers
        if any(not value.strip() or len(value) > 255 for value in candidates):
            raise ValueError("candidate ingredient identifiers must be non-blank")
        if tuple(sorted(set(candidates))) != candidates:
            raise ValueError("candidate ingredient identifiers must be sorted and unique")

        resolved_statuses = {
            ComponentMappingStatus.EXACT_INGREDIENT_MATCH,
            ComponentMappingStatus.VALIDATED_SALT_TO_MOIETY_RELATIONSHIP,
        }
        empty_statuses = {
            ComponentMappingStatus.UNSUPPORTED_SUBSTANCE,
            ComponentMappingStatus.UNMAPPED,
            ComponentMappingStatus.NOT_APPLICABLE,
        }

        if self.mapping_status in resolved_statuses:
            if self.normalized_candidate is None or candidates:
                raise ValueError("resolved mappings require one canonical candidate")
            if self.human_review_required:
                raise ValueError("resolved mappings cannot still require human review")

        if self.mapping_status in empty_statuses:
            if self.normalized_candidate is not None or candidates:
                raise ValueError("unresolved or inapplicable mappings cannot resolve a candidate")

        if self.mapping_status is ComponentMappingStatus.AMBIGUOUS_SALT_RELATIONSHIP:
            if self.normalized_candidate is not None or len(candidates) < 2:
                raise ValueError("ambiguous mappings require at least two candidates")
            if not self.human_review_required:
                raise ValueError("ambiguous mappings require human review")

        if self.mapping_status is ComponentMappingStatus.REVIEW_REQUIRED:
            if self.normalized_candidate is not None:
                raise ValueError("review-required mappings cannot be resolved")
            if not self.human_review_required:
                raise ValueError("review-required mappings require human review")

        if self.role is ComponentRole.NON_ACTIVE:
            if self.mapping_status is not ComponentMappingStatus.NOT_APPLICABLE:
                raise ValueError("non-active components must not be mapped as active ingredients")
            if self.normalization_relationship is not None:
                raise ValueError("non-active components cannot carry active normalization")
        elif (
            self.role is ComponentRole.ACTIVE
            and self.mapping_status is ComponentMappingStatus.NOT_APPLICABLE
        ):
            raise ValueError("active components require an explicit mapping outcome")

        relationship = self.normalization_relationship
        if (
            self.mapping_status
            is ComponentMappingStatus.VALIDATED_SALT_TO_MOIETY_RELATIONSHIP
        ):
            if relationship is None:
                raise ValueError(
                    "validated salt normalization requires an explicit versioned relationship"
                )
            if relationship.mapping_status is not self.mapping_status:
                raise ValueError("component and relationship mapping statuses must match")
        elif relationship is not None and relationship.mapping_status is not self.mapping_status:
            raise ValueError("component and relationship mapping statuses must match")

        return self


class PakistanMedicineProduct(BaseModel):
    """Source-preserving product contract with optional source fields."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    product_identifier: str = Field(min_length=1, max_length=255)
    source_type: ProductSourceType
    source_product_identifier: str = Field(min_length=1, max_length=512)
    display_name: str = Field(min_length=1, max_length=1000)
    manufacturer: str | None = Field(default=None, min_length=1, max_length=1000)
    registration_number: str | None = Field(default=None, min_length=1, max_length=255)
    dosage_form: str | None = Field(default=None, min_length=1, max_length=500)
    strength_display: str | None = Field(default=None, min_length=1, max_length=1000)
    provenance: SourceProvenance
    status: ProductStatus
    composition_status: ProductCompositionStatus
    review_required: bool
    components: tuple[ProductComponent, ...]

    @model_validator(mode="after")
    def validate_components(self) -> PakistanMedicineProduct:
        identifiers = tuple(component.component_identifier for component in self.components)
        if len(identifiers) != len(set(identifiers)):
            raise ValueError("component identifiers must be unique within a product")
        if self.composition_status is ProductCompositionStatus.COMPLETE and not self.components:
            raise ValueError("a complete composition requires at least one component")
        return self


class RxNormIngredientCrosswalk(BaseModel):
    """Versioned mapping from a canonical ingredient to an optional RxNorm identity."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    mapping_identifier: str = Field(min_length=1, max_length=255)
    canonical_ingredient_identifier: str = Field(min_length=1, max_length=255)
    rxnorm_rxcui: str | None = Field(default=None, min_length=1, max_length=64)
    candidate_rxnorm_rxcuis: tuple[str, ...] = ()
    rxnorm_release_identifier: str = Field(min_length=1, max_length=255)
    rxnorm_concept_type: str | None = Field(default=None, min_length=1, max_length=50)
    mapping_method: CrosswalkMappingMethod
    mapping_status: CrosswalkMappingStatus
    mapping_provenance: SourceProvenance
    review_status: ReviewStatus
    deprecated_at: AwareDatetime | None = None
    superseded_by_mapping_identifier: str | None = Field(
        default=None, min_length=1, max_length=255
    )

    @model_validator(mode="after")
    def validate_crosswalk(self) -> RxNormIngredientCrosswalk:
        _validate_external_mapping(
            mapping_identifier=self.mapping_identifier,
            resolved_identifier=self.rxnorm_rxcui,
            candidate_identifiers=self.candidate_rxnorm_rxcuis,
            mapping_method=self.mapping_method,
            mapping_status=self.mapping_status,
            review_status=self.review_status,
            deprecated_at=self.deprecated_at,
            superseded_by_mapping_identifier=self.superseded_by_mapping_identifier,
        )
        if self.rxnorm_concept_type is not None and self.rxnorm_rxcui is None:
            raise ValueError("an RxNorm concept type requires a resolved RXCUI")
        return self


class DDIProviderIngredientCrosswalk(BaseModel):
    """Future versioned mapping from a canonical ingredient to a DDI provider."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    mapping_identifier: str = Field(min_length=1, max_length=255)
    canonical_ingredient_identifier: str = Field(min_length=1, max_length=255)
    provider_namespace: str = Field(min_length=1, max_length=100)
    provider_concept_identifier: str | None = Field(
        default=None, min_length=1, max_length=255
    )
    candidate_provider_concept_identifiers: tuple[str, ...] = ()
    provider_release_identifier: str = Field(min_length=1, max_length=255)
    mapping_method: CrosswalkMappingMethod
    mapping_status: CrosswalkMappingStatus
    mapping_provenance: SourceProvenance
    review_status: ReviewStatus
    deprecated_at: AwareDatetime | None = None
    superseded_by_mapping_identifier: str | None = Field(
        default=None, min_length=1, max_length=255
    )

    @model_validator(mode="after")
    def validate_crosswalk(self) -> DDIProviderIngredientCrosswalk:
        _validate_external_mapping(
            mapping_identifier=self.mapping_identifier,
            resolved_identifier=self.provider_concept_identifier,
            candidate_identifiers=self.candidate_provider_concept_identifiers,
            mapping_method=self.mapping_method,
            mapping_status=self.mapping_status,
            review_status=self.review_status,
            deprecated_at=self.deprecated_at,
            superseded_by_mapping_identifier=self.superseded_by_mapping_identifier,
        )
        return self


class EligibilityIssue(BaseModel):
    """One source or mapping reason preventing complete product eligibility."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    status: ProductDDIEligibilityStatus
    component_identifier: str | None = Field(default=None, min_length=1, max_length=255)
    detail: str = Field(min_length=1, max_length=1000)

    @model_validator(mode="after")
    def reject_ready_issue(self) -> EligibilityIssue:
        if self.status is ProductDDIEligibilityStatus.READY_FOR_PROVIDER_LOOKUP:
            raise ValueError("ready-for-provider-lookup is not an eligibility issue")
        return self


class ResolvedProductIngredient(BaseModel):
    """One deduplicated canonical ingredient with all contributing components."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    ingredient: CanonicalIngredient
    component_identifiers: tuple[str, ...]

    @model_validator(mode="after")
    def validate_components(self) -> ResolvedProductIngredient:
        if not self.component_identifiers:
            raise ValueError("a resolved ingredient requires source components")
        if tuple(sorted(set(self.component_identifiers))) != self.component_identifiers:
            raise ValueError("resolved component identifiers must be sorted and unique")
        return self


class ProductDDIEligibilityResult(BaseModel):
    """Typed product preparation result, without a clinical conclusion."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    product_identifier: str = Field(min_length=1, max_length=255)
    status: ProductDDIEligibilityStatus
    resolved_ingredients: tuple[ResolvedProductIngredient, ...]
    issues: tuple[EligibilityIssue, ...]

    @model_validator(mode="after")
    def validate_result(self) -> ProductDDIEligibilityResult:
        identifiers = tuple(
            item.ingredient.ingredient_identifier for item in self.resolved_ingredients
        )
        if tuple(sorted(set(identifiers))) != identifiers:
            raise ValueError("resolved ingredients must be sorted and unique")
        if self.status is ProductDDIEligibilityStatus.READY_FOR_PROVIDER_LOOKUP:
            if self.issues or not self.resolved_ingredients:
                raise ValueError("ready products require resolved ingredients and no issues")
        elif not self.issues:
            raise ValueError("ineligible products require at least one issue")
        return self


class CandidatePairContribution(BaseModel):
    """Product/component path that contributed one canonical pair candidate."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    product_a_identifier: str = Field(min_length=1, max_length=255)
    product_a_ingredient_identifier: str = Field(min_length=1, max_length=255)
    product_a_component_identifiers: tuple[str, ...]
    product_b_identifier: str = Field(min_length=1, max_length=255)
    product_b_ingredient_identifier: str = Field(min_length=1, max_length=255)
    product_b_component_identifiers: tuple[str, ...]

    @model_validator(mode="after")
    def validate_contribution(self) -> CandidatePairContribution:
        if self.product_a_identifier >= self.product_b_identifier:
            raise ValueError("candidate contribution product identifiers must be ordered")
        for identifiers in (
            self.product_a_component_identifiers,
            self.product_b_component_identifiers,
        ):
            if not identifiers or tuple(sorted(set(identifiers))) != identifiers:
                raise ValueError("contributing component identifiers must be sorted and unique")
        return self


class CandidateIngredientPair(BaseModel):
    """Deduplicated ingredient pair prepared for a future provider mapping step."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    pair_identifier: str = Field(min_length=1, max_length=600)
    ingredient_a: CanonicalIngredient
    ingredient_b: CanonicalIngredient
    contributions: tuple[CandidatePairContribution, ...]

    @model_validator(mode="after")
    def validate_pair(self) -> CandidateIngredientPair:
        identifier_a = self.ingredient_a.ingredient_identifier
        identifier_b = self.ingredient_b.ingredient_identifier
        if identifier_a >= identifier_b:
            raise ValueError("candidate ingredient identifiers must be distinct and ordered")
        expected = f"candidate::{identifier_a}::{identifier_b}"
        if self.pair_identifier != expected:
            raise ValueError("candidate pair identifier must be deterministic")
        if not self.contributions:
            raise ValueError("a candidate pair requires source contributions")
        for contribution in self.contributions:
            if {
                contribution.product_a_ingredient_identifier,
                contribution.product_b_ingredient_identifier,
            } != {identifier_a, identifier_b}:
                raise ValueError("pair contributions must match the canonical pair")
        contribution_keys = tuple(
            (
                contribution.product_a_identifier,
                contribution.product_a_ingredient_identifier,
                contribution.product_a_component_identifiers,
                contribution.product_b_identifier,
                contribution.product_b_ingredient_identifier,
                contribution.product_b_component_identifiers,
            )
            for contribution in self.contributions
        )
        if tuple(sorted(set(contribution_keys))) != contribution_keys:
            raise ValueError("pair contributions must be sorted and unique")
        return self


class SameIngredientOverlap(BaseModel):
    """Same canonical identity found in both products; not a DDI assertion."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    ingredient: CanonicalIngredient
    product_a_identifier: str = Field(min_length=1, max_length=255)
    product_a_component_identifiers: tuple[str, ...]
    product_b_identifier: str = Field(min_length=1, max_length=255)
    product_b_component_identifiers: tuple[str, ...]

    @model_validator(mode="after")
    def validate_overlap(self) -> SameIngredientOverlap:
        if self.product_a_identifier >= self.product_b_identifier:
            raise ValueError("overlap product identifiers must be ordered")
        for identifiers in (
            self.product_a_component_identifiers,
            self.product_b_component_identifiers,
        ):
            if not identifiers or tuple(sorted(set(identifiers))) != identifiers:
                raise ValueError("overlap component identifiers must be sorted and unique")
        return self


class CandidatePairExpansionResult(BaseModel):
    """Deterministic pre-provider expansion result with fail-closed gating."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    status: PairExpansionStatus
    product_a_eligibility: ProductDDIEligibilityResult
    product_b_eligibility: ProductDDIEligibilityResult
    candidate_pairs: tuple[CandidateIngredientPair, ...]
    same_ingredient_overlaps: tuple[SameIngredientOverlap, ...]

    @model_validator(mode="after")
    def validate_expansion(self) -> CandidatePairExpansionResult:
        both_ready = all(
            result.status is ProductDDIEligibilityStatus.READY_FOR_PROVIDER_LOOKUP
            for result in (self.product_a_eligibility, self.product_b_eligibility)
        )
        if self.status is PairExpansionStatus.CANDIDATES_GENERATED and not both_ready:
            raise ValueError("candidate generation requires two eligible products")
        if self.status is PairExpansionStatus.CANDIDATES_GENERATED:
            if not self.candidate_pairs and not self.same_ingredient_overlaps:
                raise ValueError("candidate generation requires a pair or overlap outcome")
            pair_identifiers = tuple(
                pair.pair_identifier for pair in self.candidate_pairs
            )
            if tuple(sorted(set(pair_identifiers))) != pair_identifiers:
                raise ValueError("candidate pairs must be sorted and unique")
            overlap_identifiers = tuple(
                overlap.ingredient.ingredient_identifier
                for overlap in self.same_ingredient_overlaps
            )
            if tuple(sorted(set(overlap_identifiers))) != overlap_identifiers:
                raise ValueError("same-ingredient overlaps must be sorted and unique")
        if self.status is PairExpansionStatus.BLOCKED_BY_ELIGIBILITY:
            if both_ready:
                raise ValueError("eligible products cannot have blocked expansion")
            if self.candidate_pairs or self.same_ingredient_overlaps:
                raise ValueError("blocked expansion cannot emit lookup candidates or overlaps")
        return self


def _validate_external_mapping(
    *,
    mapping_identifier: str,
    resolved_identifier: str | None,
    candidate_identifiers: tuple[str, ...],
    mapping_method: CrosswalkMappingMethod,
    mapping_status: CrosswalkMappingStatus,
    review_status: ReviewStatus,
    deprecated_at: datetime | None,
    superseded_by_mapping_identifier: str | None,
) -> None:
    if any(not value.strip() or len(value) > 255 for value in candidate_identifiers):
        raise ValueError("candidate external identifiers must be non-blank")
    if tuple(sorted(set(candidate_identifiers))) != candidate_identifiers:
        raise ValueError("candidate external identifiers must be sorted and unique")

    resolved_states = {
        CrosswalkMappingStatus.MAPPED,
        CrosswalkMappingStatus.DEPRECATED,
        CrosswalkMappingStatus.SUPERSEDED,
    }
    if mapping_status in resolved_states:
        if resolved_identifier is None or candidate_identifiers:
            raise ValueError("resolved crosswalks require one external identifier")
        if mapping_method is CrosswalkMappingMethod.NO_MATCH:
            raise ValueError("resolved crosswalks cannot use the no-match method")

    if mapping_status is CrosswalkMappingStatus.UNMAPPED:
        if resolved_identifier is not None or candidate_identifiers:
            raise ValueError("unmapped crosswalks cannot contain external identifiers")
        if mapping_method is not CrosswalkMappingMethod.NO_MATCH:
            raise ValueError("unmapped crosswalks require the no-match method")

    if mapping_status is CrosswalkMappingStatus.AMBIGUOUS:
        if resolved_identifier is not None or len(candidate_identifiers) < 2:
            raise ValueError("ambiguous crosswalks require at least two candidates")
        if review_status is not ReviewStatus.REQUIRED:
            raise ValueError("ambiguous crosswalks require review")

    if mapping_status is CrosswalkMappingStatus.REVIEW_REQUIRED:
        if resolved_identifier is not None or not candidate_identifiers:
            raise ValueError("review-required crosswalks need unresolved candidates")
        if review_status is not ReviewStatus.REQUIRED:
            raise ValueError("review-required crosswalks require review")

    deprecated_states = {
        CrosswalkMappingStatus.DEPRECATED,
        CrosswalkMappingStatus.SUPERSEDED,
    }
    if mapping_status in deprecated_states:
        if deprecated_at is None:
            raise ValueError("deprecated crosswalks require a deprecation time")
    elif deprecated_at is not None:
        raise ValueError("only deprecated or superseded crosswalks may be dated")

    if mapping_status is CrosswalkMappingStatus.SUPERSEDED:
        if superseded_by_mapping_identifier is None:
            raise ValueError("superseded crosswalks require a replacement")
        if superseded_by_mapping_identifier == mapping_identifier:
            raise ValueError("a crosswalk cannot supersede itself")
    elif superseded_by_mapping_identifier is not None:
        raise ValueError("only superseded crosswalks may identify a replacement")
