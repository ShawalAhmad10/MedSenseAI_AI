# Pakistan Product Mapping Contract

**Status:** synthetic, provider-neutral contract implemented

**Clinical-use status:** this contract prepares product identity candidates only. It
does not ingest Pakistan medicine data, query a DDI provider, create interaction
assertions, interpret interactions, or make a clinical conclusion.

## Architecture and boundary

The implemented path is:

```text
source-preserved Pakistan product
  -> source-preserved product components
  -> canonical MedSenseAI ingredient
  -> optional, versioned RxNorm crosswalk
  -> future versioned DDI-provider crosswalk
  -> future DDI provider (not implemented)
```

The contracts live in `medsense_ai.product_mapping`. They are immutable Pydantic
DTOs with extra fields forbidden. The preparation functions are deterministic and
operate only on validated DTOs. No database change is required for this contract
phase.

All automated fixtures use fictional identifiers such as `pak_product_alpha`,
`ingredient_alpha`, `salt_alpha`, and `moiety_alpha`. They are marked with the
`synthetic_non_clinical` source. They contain no real product, ingredient,
manufacturer, registration, composition, DDI, or pharmacy inventory data.

## Product model

`PakistanMedicineProduct` represents a source product without treating its brand
string as an ingredient identity.

| Field group | Contract behavior |
|---|---|
| Internal identity | `product_identifier` is the MedSenseAI product key. |
| Source identity | `source_type` and `source_product_identifier` preserve the source namespace and record key. |
| Display | `display_name` preserves the source-supplied brand/display value. |
| Optional source fields | `manufacturer`, `registration_number`, `dosage_form`, and `strength_display` remain nullable. Their absence is not filled by inference. |
| Release and provenance | `provenance` requires a source, source release, and source record identifier; checksum and transformation description are preserved when supplied. |
| Lifecycle | `status` distinguishes active, inactive, and unknown source states. |
| Composition | `composition_status` distinguishes complete, incomplete, and unknown composition. A source-declared complete composition must contain at least one component. |
| Review | `review_required` blocks eligibility until resolved. |

Product component identifiers must be unique within the product. Product status,
composition completeness, and review state are data-quality inputs; they are not
clinical assessments.

## Component model

`ProductComponent` preserves each source-listed component independently. It does
not assume that every listed component is active.

The DTO retains:

- raw component name;
- raw salt or other form when supplied;
- raw strength/amount and raw unit when supplied;
- the source-declared role: `active`, `non_active`, or `unknown`;
- component-level source and release provenance;
- a resolved canonical candidate or unresolved candidate identifiers;
- mapping status and human-review requirement;
- an optional explicit, versioned normalization relationship.

A `non_active` component must have the `not_applicable` mapping status and is never
promoted into the active-ingredient set. An `unknown` role is preserved and blocks
the product. Active components must have an explicit mapping outcome.

The supported component mapping outcomes are:

- `exact_ingredient_match`;
- `validated_salt_to_moiety_relationship`;
- `ambiguous_salt_relationship`;
- `unsupported_substance`;
- `unmapped`;
- `review_required`;
- `not_applicable` for explicitly non-active components.

Resolved states require exactly one canonical candidate. Ambiguous states require
multiple sorted, unique candidate identifiers and human review. Unsupported,
unmapped, and non-applicable states cannot carry a resolved identity.

## Canonical ingredient identity

`CanonicalIngredient` is owned by MedSenseAI and contains only:

- a permanent internal ingredient identifier;
- a preferred internal display name;
- lifecycle status;
- provenance explaining how the identity was created;
- review status.

The canonical DTO has no RxNorm or DDI-provider identifier field. An RxCUI or
provider concept can be changed, deprecated, or absent without changing the
MedSenseAI ingredient identity.

## External identity crosswalks

`RxNormIngredientCrosswalk` maps a canonical MedSenseAI identifier to an optional
RxNorm identity. It preserves the RXCUI, RxNorm release, concept type when
available, mapping method/status, mapping provenance, review status, deprecation
time, and superseding mapping identifier. Ambiguous candidates are preserved
without selecting one.

`DDIProviderIngredientCrosswalk` provides the equivalent future provider-neutral
shape for a provider namespace, provider concept identifier, and provider release.
It does not perform lookup and is not a real provider adapter.

Both crosswalks are versioned assertions. Neither external identifier becomes the
internal primary key. Mapped, unmapped, ambiguous, review-required, deprecated,
and superseded states remain distinguishable. Fuzzy-name mapping is not an
available mapping method.

## Salt, moiety, and precise-substance safety

`SubstanceReference` represents the source-declared identity level:

- precise substance;
- active moiety;
- base;
- salt;
- ester;
- hydrate/solvate;
- unknown.

`SubstanceNormalizationRelationship` connects a precise substance to a moiety or
base only through an explicit relationship identifier, relationship version,
relationship type, provenance, review status, and lifecycle status. Supported
relationship types include exact identity, precise-to-moiety, salt-to-moiety,
ester-to-moiety, hydrate/solvate-to-parent, and unknown.

A validated salt-to-moiety component is rejected unless it carries a current,
explicit relationship from a source-declared salt to a source-declared active
moiety or base. Raw strings never create that relationship. Ambiguous and unknown
relationships stay review-required. Deprecated or superseded relationships cannot
silently serve as current validated normalization.

These relationships express identity normalization evidence only. They do not
encode clinical equivalence, dosing equivalence, substitutability, or an
interaction conclusion.

## Combination-product expansion

`expand_candidate_ingredient_pairs` first evaluates both products. It emits
candidates only when every product gate passes. For eligible products, it:

1. resolves each active component independently;
2. reconciles duplicate component assertions by immutable canonical ingredient ID;
3. preserves all contributing component identifiers;
4. creates the Cartesian product across the two deduplicated ingredient sets;
5. orders each ingredient pair lexically by canonical identifier;
6. orders and deduplicates the complete candidate list deterministically;
7. records the product/component contribution path for every candidate;
8. removes same-ingredient self-pairs and records them separately as
   `SameIngredientOverlap`.

For example, a synthetic product containing `ingredient_alpha` and
`ingredient_beta` compared with a synthetic product containing
`ingredient_gamma` yields:

```text
ingredient_alpha <-> ingredient_gamma
ingredient_beta  <-> ingredient_gamma
```

The output is a pre-provider candidate set. It contains no assertion that an
interaction exists or does not exist and no clinical classification.

If either product is partial, ambiguous, unsupported, unresolved, role-unknown,
or review-required, expansion returns `blocked_by_eligibility` with no candidate
pairs. A resolved subset can remain visible in the product eligibility result for
audit, but it is not sent onward as a complete product check.

## DDI eligibility gate

`evaluate_product_ddi_eligibility` returns a typed result with all discovered
issues and a deterministic primary status:

| Outcome | Meaning |
|---|---|
| `ready_for_provider_lookup` | Composition is declared complete, at least one active component is identified, every active component resolves, lifecycle/review gates pass, and duplicate canonical identities reconcile. |
| `incomplete_product_composition` | Composition is incomplete/unknown or no active component is source-identified. |
| `unresolved_component` | An active component has no accepted canonical mapping. |
| `ambiguous_mapping` | A component has multiple unresolved identity candidates or duplicate canonical metadata conflicts. |
| `unsupported_component` | A component or canonical identity is outside the supported lifecycle/scope. |
| `unknown_component_role` | The source did not establish whether a component is active. |
| `review_required` | Product, component, or canonical-identity review remains open. |

The gate verifies that source/release provenance exists by DTO validation,
composition is declared complete, roles are known, required active components are
mapped, salt relationships are explicit where claimed, lifecycle and review states
are acceptable, and duplicate identities are reconciled deterministically.

Unknown states fail closed. The vocabulary deliberately contains no `safe`,
`no_interaction`, severity, recommendation, or clinical-conclusion outcome.

## Unresolved and review-required semantics

`unmapped` means no acceptable canonical identity is asserted. `ambiguous` means
multiple candidates remain. `unsupported` means the source assertion is retained
but is outside the implemented identity scope. `review_required` means an
assertion cannot be promoted until governed review completes. None is converted
to a negative DDI result.

Source-preserved product and component records remain available for audit when
eligibility fails. Pair preparation does not discard those records, guess a brand
composition, strip a salt suffix, or continue with a partial combination.

## Future pharmacy and DRAP integration boundary

This implementation deliberately has no DRAP adapter, scraper, downloader,
pharmacy connector, database ingestion path, external network call, or production
export. The source-type enum describes future origins; it does not authorize any
source.

A later real-data integration requires a separately approved source contract,
access and reuse rights, versioned delivery, structured schema, source integrity
checks, correction/deletion behavior, pharmacy governance, and qualified human
review. Real product records must enter through an adapter that creates these DTOs
without discarding raw values or uncertainty. DDI-provider mapping and lookup are
separate later phases and remain subject to the provider acceptance specification.
