"""Deterministic product eligibility and candidate-pair preparation."""

from __future__ import annotations

from collections import defaultdict

from medsense_ai.product_mapping.contracts import (
    CandidateIngredientPair,
    CandidatePairContribution,
    CandidatePairExpansionResult,
    CanonicalIngredient,
    CanonicalIngredientStatus,
    ComponentMappingStatus,
    ComponentRole,
    EligibilityIssue,
    PairExpansionStatus,
    PakistanMedicineProduct,
    ProductCompositionStatus,
    ProductDDIEligibilityResult,
    ProductDDIEligibilityStatus,
    ProductStatus,
    ResolvedProductIngredient,
    ReviewStatus,
    SameIngredientOverlap,
)


_ISSUE_PRIORITY = {
    ProductDDIEligibilityStatus.INCOMPLETE_PRODUCT_COMPOSITION: 0,
    ProductDDIEligibilityStatus.UNKNOWN_COMPONENT_ROLE: 1,
    ProductDDIEligibilityStatus.AMBIGUOUS_MAPPING: 2,
    ProductDDIEligibilityStatus.UNSUPPORTED_COMPONENT: 3,
    ProductDDIEligibilityStatus.UNRESOLVED_COMPONENT: 4,
    ProductDDIEligibilityStatus.REVIEW_REQUIRED: 5,
}


def evaluate_product_ddi_eligibility(
    product: PakistanMedicineProduct,
) -> ProductDDIEligibilityResult:
    """Evaluate source/mapping readiness without making a clinical assessment."""

    issues: list[EligibilityIssue] = []
    resolved_by_identifier: dict[str, CanonicalIngredient] = {}
    component_ids_by_ingredient: dict[str, list[str]] = defaultdict(list)

    if product.composition_status is not ProductCompositionStatus.COMPLETE:
        issues.append(
            _issue(
                ProductDDIEligibilityStatus.INCOMPLETE_PRODUCT_COMPOSITION,
                "product composition is not source-declared complete",
            )
        )

    if product.status is not ProductStatus.ACTIVE or product.review_required:
        issues.append(
            _issue(
                ProductDDIEligibilityStatus.REVIEW_REQUIRED,
                "product lifecycle or product-level review is unresolved",
            )
        )

    active_component_seen = False
    unknown_component_role_seen = False
    for component in sorted(product.components, key=lambda item: item.component_identifier):
        if component.role is ComponentRole.UNKNOWN:
            unknown_component_role_seen = True
            issues.append(
                _issue(
                    ProductDDIEligibilityStatus.UNKNOWN_COMPONENT_ROLE,
                    "component role is unknown",
                    component.component_identifier,
                )
            )
            continue
        if component.role is ComponentRole.NON_ACTIVE:
            continue

        active_component_seen = True
        status = component.mapping_status
        if status is ComponentMappingStatus.AMBIGUOUS_SALT_RELATIONSHIP:
            issues.append(
                _issue(
                    ProductDDIEligibilityStatus.AMBIGUOUS_MAPPING,
                    "component mapping is ambiguous",
                    component.component_identifier,
                )
            )
            continue
        if status is ComponentMappingStatus.UNSUPPORTED_SUBSTANCE:
            issues.append(
                _issue(
                    ProductDDIEligibilityStatus.UNSUPPORTED_COMPONENT,
                    "component is outside the supported identity scope",
                    component.component_identifier,
                )
            )
            continue
        if status is ComponentMappingStatus.UNMAPPED:
            issues.append(
                _issue(
                    ProductDDIEligibilityStatus.UNRESOLVED_COMPONENT,
                    "component has no resolved canonical ingredient",
                    component.component_identifier,
                )
            )
            continue
        if status is ComponentMappingStatus.REVIEW_REQUIRED:
            issues.append(
                _issue(
                    ProductDDIEligibilityStatus.REVIEW_REQUIRED,
                    "component mapping requires review",
                    component.component_identifier,
                )
            )
            continue

        candidate = component.normalized_candidate
        if candidate is None:
            issues.append(
                _issue(
                    ProductDDIEligibilityStatus.UNRESOLVED_COMPONENT,
                    "component has no resolved canonical ingredient",
                    component.component_identifier,
                )
            )
            continue
        if candidate.status is not CanonicalIngredientStatus.ACTIVE:
            issues.append(
                _issue(
                    ProductDDIEligibilityStatus.UNSUPPORTED_COMPONENT,
                    "canonical ingredient lifecycle is not active",
                    component.component_identifier,
                )
            )
            continue
        if component.human_review_required or candidate.review_status is ReviewStatus.REQUIRED:
            issues.append(
                _issue(
                    ProductDDIEligibilityStatus.REVIEW_REQUIRED,
                    "component or canonical ingredient requires review",
                    component.component_identifier,
                )
            )
            continue

        identifier = candidate.ingredient_identifier
        prior = resolved_by_identifier.get(identifier)
        if prior is not None and prior != candidate:
            issues.append(
                _issue(
                    ProductDDIEligibilityStatus.AMBIGUOUS_MAPPING,
                    "duplicate canonical identity has conflicting metadata",
                    component.component_identifier,
                )
            )
            continue
        resolved_by_identifier[identifier] = candidate
        component_ids_by_ingredient[identifier].append(component.component_identifier)

    if not active_component_seen and not unknown_component_role_seen:
        issues.append(
            _issue(
                ProductDDIEligibilityStatus.INCOMPLETE_PRODUCT_COMPOSITION,
                "product has no source-identified active component",
            )
        )

    resolved = tuple(
        ResolvedProductIngredient(
            ingredient=resolved_by_identifier[identifier],
            component_identifiers=tuple(sorted(set(component_ids_by_ingredient[identifier]))),
        )
        for identifier in sorted(resolved_by_identifier)
    )
    ordered_issues = tuple(
        sorted(
            issues,
            key=lambda issue: (
                _ISSUE_PRIORITY[issue.status],
                issue.component_identifier or "",
                issue.detail,
            ),
        )
    )
    status = (
        ProductDDIEligibilityStatus.READY_FOR_PROVIDER_LOOKUP
        if not ordered_issues
        else ordered_issues[0].status
    )
    return ProductDDIEligibilityResult(
        product_identifier=product.product_identifier,
        status=status,
        resolved_ingredients=resolved,
        issues=ordered_issues,
    )


def expand_candidate_ingredient_pairs(
    product_one: PakistanMedicineProduct,
    product_two: PakistanMedicineProduct,
) -> CandidatePairExpansionResult:
    """Prepare deduplicated canonical pairs only when both products are eligible."""

    if product_one.product_identifier == product_two.product_identifier:
        raise ValueError("candidate expansion requires two distinct products")

    product_a, product_b = sorted(
        (product_one, product_two), key=lambda product: product.product_identifier
    )
    eligibility_a = evaluate_product_ddi_eligibility(product_a)
    eligibility_b = evaluate_product_ddi_eligibility(product_b)
    if not all(
        result.status is ProductDDIEligibilityStatus.READY_FOR_PROVIDER_LOOKUP
        for result in (eligibility_a, eligibility_b)
    ):
        return CandidatePairExpansionResult(
            status=PairExpansionStatus.BLOCKED_BY_ELIGIBILITY,
            product_a_eligibility=eligibility_a,
            product_b_eligibility=eligibility_b,
            candidate_pairs=(),
            same_ingredient_overlaps=(),
        )

    canonical_by_identifier: dict[str, CanonicalIngredient] = {}
    contributions_by_pair: dict[tuple[str, str], list[CandidatePairContribution]] = (
        defaultdict(list)
    )
    overlaps: list[SameIngredientOverlap] = []

    for ingredient_a in eligibility_a.resolved_ingredients:
        for ingredient_b in eligibility_b.resolved_ingredients:
            identifier_a = ingredient_a.ingredient.ingredient_identifier
            identifier_b = ingredient_b.ingredient.ingredient_identifier
            canonical_by_identifier[identifier_a] = ingredient_a.ingredient
            canonical_by_identifier[identifier_b] = ingredient_b.ingredient
            if identifier_a == identifier_b:
                overlaps.append(
                    SameIngredientOverlap(
                        ingredient=ingredient_a.ingredient,
                        product_a_identifier=product_a.product_identifier,
                        product_a_component_identifiers=ingredient_a.component_identifiers,
                        product_b_identifier=product_b.product_identifier,
                        product_b_component_identifiers=ingredient_b.component_identifiers,
                    )
                )
                continue

            key = tuple(sorted((identifier_a, identifier_b)))
            contributions_by_pair[key].append(
                CandidatePairContribution(
                    product_a_identifier=product_a.product_identifier,
                    product_a_ingredient_identifier=identifier_a,
                    product_a_component_identifiers=ingredient_a.component_identifiers,
                    product_b_identifier=product_b.product_identifier,
                    product_b_ingredient_identifier=identifier_b,
                    product_b_component_identifiers=ingredient_b.component_identifiers,
                )
            )

    pairs = tuple(
        CandidateIngredientPair(
            pair_identifier=f"candidate::{key[0]}::{key[1]}",
            ingredient_a=canonical_by_identifier[key[0]],
            ingredient_b=canonical_by_identifier[key[1]],
            contributions=tuple(
                sorted(
                    contributions_by_pair[key],
                    key=lambda item: (
                        item.product_a_ingredient_identifier,
                        item.product_b_ingredient_identifier,
                    ),
                )
            ),
        )
        for key in sorted(contributions_by_pair)
    )
    return CandidatePairExpansionResult(
        status=PairExpansionStatus.CANDIDATES_GENERATED,
        product_a_eligibility=eligibility_a,
        product_b_eligibility=eligibility_b,
        candidate_pairs=pairs,
        same_ingredient_overlaps=tuple(
            sorted(
                overlaps,
                key=lambda item: item.ingredient.ingredient_identifier,
            )
        ),
    )


def _issue(
    status: ProductDDIEligibilityStatus,
    detail: str,
    component_identifier: str | None = None,
) -> EligibilityIssue:
    return EligibilityIssue(
        status=status,
        component_identifier=component_identifier,
        detail=detail,
    )
