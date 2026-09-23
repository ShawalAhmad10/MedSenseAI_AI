"""Typed cart-level DDI evaluation over authoritative partner Product records."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable
from enum import Enum
import hashlib
import itertools
import json

from pydantic import BaseModel, ConfigDict, Field, model_validator

from medsense_ai.ddi_runtime import RuntimeDDIResult, RuntimeDDIService, RuntimeDDIStatus
from medsense_ai.integrations.amna_medcopy.contracts import (
    PartnerProductProvenance,
    PartnerProductRecord,
)
from medsense_ai.integrations.amna_medcopy.ddi_bridge import (
    ExactDDIIngredientResolver,
    IngredientResolutionState,
    ResolvedDDIIngredient,
)
from medsense_ai.integrations.amna_medcopy.ddi_rxcui_sidecar import (
    ExactRxCUIIdentityResolver,
    RxCUIInteractionEvidenceIndex,
)
from medsense_ai.integrations.amna_medcopy.product_adapter import (
    PartnerProductAdaptationError,
    adapt_partner_product,
)


class CartDDIStatus(str, Enum):
    CLEAR_WITH_LIMITATIONS = "CLEAR_WITH_LIMITATIONS"
    WARNING_REVIEW_REQUIRED = "WARNING_REVIEW_REQUIRED"
    UNRESOLVED_REVIEW_REQUIRED = "UNRESOLVED_REVIEW_REQUIRED"
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE"


class PartnerCartCheckRequest(BaseModel):
    # JSON arrays are the wire representation of this immutable tuple. Nested
    # Product records retain their own strict scalar validation.
    model_config = ConfigDict(extra="forbid", frozen=True)

    products: tuple[PartnerProductRecord, ...] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def validate_product_identity(self) -> PartnerCartCheckRequest:
        identifiers = tuple(product.product_id for product in self.products)
        if len(set(identifiers)) != len(identifiers):
            raise ValueError("products must contain unique authoritative product_id values")
        return self


class CartProductResolution(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    product_id: int
    product_title: str | None
    product_status: int
    product_requires_rx: bool | None
    ingredient: ResolvedDDIIngredient
    structural_adaptation_succeeded: bool
    structural_limitation: str | None = None


class CartPairResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    product_ids_a: tuple[int, ...]
    product_ids_b: tuple[int, ...]
    ingredient_a: str
    ingredient_b: str
    identity_namespace_a: str
    identity_namespace_b: str
    identity_id_a: str
    identity_id_b: str
    rxcui_a: str | None = None
    rxcui_b: str | None = None
    severity: str | None = None
    state: RuntimeDDIStatus
    model_version: str | None
    model_warning_score: float | None
    selected_threshold: float | None
    model_warning_triggered: bool | None
    warning_triggered: bool
    known_dataset_record_found: bool
    known_interaction_descriptions: tuple[str, ...]
    evidence_source_identifier: str | None
    evidence_record_identifiers: tuple[str, ...]
    review_required: bool
    message: str
    limitations: tuple[str, ...]


class PartnerCartCheckResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    status: CartDDIStatus
    request_snapshot_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    request_snapshot_identifier: str
    bridge_schema_version: str | None
    bridge_payload_sha256: str | None
    products: tuple[CartProductResolution, ...]
    pairs: tuple[CartPairResult, ...]
    review_required: bool
    checkout_allowed: bool
    message: str
    limitations: tuple[str, ...]

    @model_validator(mode="after")
    def validate_policy(self) -> PartnerCartCheckResponse:
        allowed = self.status is CartDDIStatus.CLEAR_WITH_LIMITATIONS
        if self.checkout_allowed != allowed:
            raise ValueError("checkout_allowed must follow the conservative cart DDI policy")
        if self.review_required == allowed:
            raise ValueError("only CLEAR_WITH_LIMITATIONS may omit required review")
        return self


CART_LIMITATIONS = (
    "This exact-identity DDI screen is decision support, not a clinical safety guarantee.",
    "No model warning or absent exact evidence does not establish safety or absence of interaction.",
    "Unknown, ambiguous, unsupported, or unavailable ingredient identity requires review.",
    "Prescription requirement and Product lifecycle status do not determine DDI risk.",
)


def _ddinter_severity(levels: tuple[str, ...]) -> str:
    """Return one exact source severity without inventing a severity ranking."""

    canonical = {
        "minor": "Minor",
        "moderate": "Moderate",
        "major": "Major",
        "unknown": "Unknown",
    }

    resolved: set[str] = set()

    for raw_level in levels:
        normalized = str(raw_level).strip().casefold()

        if not normalized:
            continue

        mapped = canonical.get(normalized)

        if mapped is None:
            return "Unknown"

        resolved.add(mapped)

    if len(resolved) != 1:
        return "Unknown"

    return next(iter(resolved))


def _canonical_json(value: object) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def request_snapshot(request: PartnerCartCheckRequest) -> tuple[str, str]:
    payload = {
        "schema": "amna-partner-cart-product-snapshot-v1",
        "products": [
            product.model_dump(mode="json")
            for product in sorted(request.products, key=lambda item: item.product_id)
        ],
    }
    digest = hashlib.sha256(_canonical_json(payload)).hexdigest()
    return digest, f"request-sha256:{digest}"


def _record_checksum(record: PartnerProductRecord) -> str:
    digest = hashlib.sha256(_canonical_json(record.model_dump(mode="json"))).hexdigest()
    return f"sha256:{digest}"


class PartnerCartDDIService:
    """Side-effect-free cart evaluation once immutable runtime artifacts are loaded."""

    def __init__(
        self,
        *,
        resolver: ExactDDIIngredientResolver,
        runtime_service: RuntimeDDIService,
        rxcui_identity_resolver: ExactRxCUIIdentityResolver | None = None,
        rxcui_evidence_index: RxCUIInteractionEvidenceIndex | None = None,
    ) -> None:
        self._resolver = resolver
        self._runtime = runtime_service
        self._rxcui_identity_resolver = rxcui_identity_resolver
        self._rxcui_evidence_index = rxcui_evidence_index

    def evaluate(self, request: PartnerCartCheckRequest) -> PartnerCartCheckResponse:
        digest, snapshot_identifier = request_snapshot(request)
        product_results: list[CartProductResolution] = []
        product_ids_by_token: dict[str, list[int]] = defaultdict(list)
        identity_by_token: dict[str, ResolvedDDIIngredient] = {}
        product_ids_by_rxcui: dict[str, list[int]] = defaultdict(list)
        identity_name_by_rxcui: dict[str, str] = {}

        for record in sorted(request.products, key=lambda item: item.product_id):
            structural_succeeded = True
            structural_limitation = None
            try:
                adapt_partner_product(
                    record,
                    PartnerProductProvenance(
                        source_release_identifier=snapshot_identifier,
                        source_record_checksum=_record_checksum(record),
                    ),
                )
            except PartnerProductAdaptationError as exc:
                structural_succeeded = False
                structural_limitation = str(exc)

            ingredient = self._resolver.resolve(record.product_salt)

            sidecar_identity = None

            if self._rxcui_identity_resolver is not None:
                sidecar_identity = self._rxcui_identity_resolver.resolve(
                    record.product_salt
                )

            if ingredient.state is IngredientResolutionState.RESOLVED:
                assert ingredient.frozen_model_token is not None
                assert ingredient.identity_namespace is not None
                assert ingredient.identity_id is not None

                product_ids_by_token[
                    ingredient.frozen_model_token
                ].append(record.product_id)

                identity_by_token[
                    ingredient.frozen_model_token
                ] = ingredient

                if ingredient.rxcui is not None:
                    product_ids_by_rxcui[
                        ingredient.rxcui
                    ].append(record.product_id)

                    identity_name_by_rxcui[
                        ingredient.rxcui
                    ] = (
                        ingredient.canonical_display_name
                        or ingredient.frozen_model_token
                    )

            elif sidecar_identity is not None:
                product_ids_by_rxcui[
                    sidecar_identity.rxcui
                ].append(record.product_id)

                identity_name_by_rxcui[
                    sidecar_identity.rxcui
                ] = sidecar_identity.canonical_display_name

            product_results.append(
                CartProductResolution(
                    product_id=record.product_id,
                    product_title=record.product_title,
                    product_status=record.product_status,
                    product_requires_rx=record.product_requires_rx,
                    ingredient=ingredient,
                    structural_adaptation_succeeded=structural_succeeded,
                    structural_limitation=structural_limitation,
                )
            )

        pair_results: list[CartPairResult] = []
        artifact_alignment_failure = False
        expected_model_version = self._resolver.artifact.provenance.frozen_model_version
        expected_evidence_source = (
            f"{self._resolver.artifact.provenance.evidence_source_file}@sha256:"
            f"{self._resolver.artifact.provenance.evidence_source_sha256}"
        )
        for token_a, token_b in itertools.combinations(sorted(product_ids_by_token), 2):
            runtime_result = self._runtime.predict(token_a, token_b)
            if (
                runtime_result.model_version != expected_model_version
                or runtime_result.evidence_source_identifier != expected_evidence_source
            ):
                artifact_alignment_failure = True
            identity_a = identity_by_token[token_a]
            identity_b = identity_by_token[token_b]
            assert identity_a.identity_namespace is not None
            assert identity_b.identity_namespace is not None
            assert identity_a.identity_id is not None
            assert identity_b.identity_id is not None
            pair_results.append(
                _pair_result(
                    runtime_result,
                    product_ids_a=product_ids_by_token[token_a],
                    product_ids_b=product_ids_by_token[token_b],
                    ingredient_a=token_a,
                    ingredient_b=token_b,
                    identity_namespace_a=identity_a.identity_namespace.value,
                    identity_namespace_b=identity_b.identity_namespace.value,
                    identity_id_a=identity_a.identity_id,
                    identity_id_b=identity_b.identity_id,
                    rxcui_a=identity_a.rxcui,
                    rxcui_b=identity_b.rxcui,
                )
            )


        if self._rxcui_evidence_index is not None:
            for rxcui_a, rxcui_b in itertools.combinations(
                sorted(product_ids_by_rxcui),
                2,
            ):
                evidence = self._rxcui_evidence_index.lookup(
                    rxcui_a,
                    rxcui_b,
                )

                if evidence is None:
                    continue

                pair_results.append(
                    CartPairResult(
                        product_ids_a=tuple(
                            sorted(product_ids_by_rxcui[rxcui_a])
                        ),
                        product_ids_b=tuple(
                            sorted(product_ids_by_rxcui[rxcui_b])
                        ),
                        ingredient_a=identity_name_by_rxcui[rxcui_a],
                        ingredient_b=identity_name_by_rxcui[rxcui_b],
                        identity_namespace_a="RXNORM",
                        identity_namespace_b="RXNORM",
                        identity_id_a=rxcui_a,
                        identity_id_b=rxcui_b,
                        rxcui_a=rxcui_a,
                        rxcui_b=rxcui_b,
                        severity=_ddinter_severity(evidence.levels),
                        state=RuntimeDDIStatus.INTERACTION_WARNING,
                        model_version=None,
                        model_warning_score=None,
                        selected_threshold=None,
                        model_warning_triggered=None,
                        warning_triggered=True,
                        known_dataset_record_found=True,
                        known_interaction_descriptions=evidence.descriptions,
                        evidence_source_identifier=(
                            evidence.source_identifier
                        ),
                        evidence_record_identifiers=(
                            evidence.record_identifiers
                        ),
                        review_required=True,
                        message=(
                            "Exact DDInter interaction evidence was found "
                            "for this governed RxCUI pair. Model support is "
                            "independent of this exact evidence."
                        ),
                        limitations=CART_LIMITATIONS
                        + (
                            "DDInter evidence is an exact positive record; "
                            "absence of a DDInter row does not establish "
                            "absence of interaction.",
                        ),
                    )
                )

        hard_unresolved = any(
            not item.structural_adaptation_succeeded
            or item.product_status != 1
            or item.ingredient.state
            in {
                IngredientResolutionState.SOURCE_UNAVAILABLE,
                IngredientResolutionState.UNMAPPED,
                IngredientResolutionState.AMBIGUOUS,
                IngredientResolutionState.REVIEW_REQUIRED,
            }
            for item in product_results
        )

        model_unsupported = any(
            item.ingredient.state is IngredientResolutionState.MODEL_UNSUPPORTED
            for item in product_results
        )

        service_unavailable = artifact_alignment_failure or any(
            pair.state is RuntimeDDIStatus.MODEL_UNAVAILABLE for pair in pair_results
        )

        warning = any(
            pair.state is RuntimeDDIStatus.INTERACTION_WARNING
            for pair in pair_results
        )

        if service_unavailable:
            status = CartDDIStatus.SERVICE_UNAVAILABLE
            message = (
                "The DDI runtime could not complete every required pair evaluation with "
                "the exact model and evidence artifacts pinned by the bridge."
            )
        elif hard_unresolved:
            status = CartDDIStatus.UNRESOLVED_REVIEW_REQUIRED
            message = "One or more cart products could not be evaluated with complete governed identity."
        elif warning:
            status = CartDDIStatus.WARNING_REVIEW_REQUIRED
            message = "At least one cart ingredient pair produced a DDI warning or exact evidence match."
        elif model_unsupported:
            status = CartDDIStatus.UNRESOLVED_REVIEW_REQUIRED
            message = "One or more cart products are outside the frozen DDI model vocabulary and require review."
        else:
            status = CartDDIStatus.CLEAR_WITH_LIMITATIONS
            if len(product_ids_by_token) < 2:
                message = (
                    "Fewer than two distinct supported ingredients were present, so no pair was scored. "
                    "This is not a clinical safety guarantee."
                )
            else:
                message = (
                    "No model warning or exact evidence row was found for the evaluated pairs. "
                    "This is not a clinical safety guarantee."
                )

        allowed = status is CartDDIStatus.CLEAR_WITH_LIMITATIONS
        artifact = self._resolver.artifact
        return PartnerCartCheckResponse(
            status=status,
            request_snapshot_sha256=digest,
            request_snapshot_identifier=snapshot_identifier,
            bridge_schema_version=artifact.schema_version,
            bridge_payload_sha256=artifact.payload_sha256,
            products=tuple(product_results),
            pairs=tuple(pair_results),
            review_required=not allowed,
            checkout_allowed=allowed,
            message=message,
            limitations=CART_LIMITATIONS,
        )


def _pair_result(
    result: RuntimeDDIResult,
    *,
    product_ids_a: Iterable[int],
    product_ids_b: Iterable[int],
    ingredient_a: str,
    ingredient_b: str,
    identity_namespace_a: str,
    identity_namespace_b: str,
    identity_id_a: str,
    identity_id_b: str,
    rxcui_a: str | None,
    rxcui_b: str | None,
) -> CartPairResult:
    has_exact_evidence = result.known_dataset_record_found
    if result.model_warning_triggered and not has_exact_evidence:
        message = (
            "Potential interaction model signal triggered; no exact clinical interaction "
            "record or clinical severity was found."
        )
    elif has_exact_evidence:
        message = (
            f"{result.message} No exact clinical severity is available; severity is Unknown."
        )
    else:
        message = result.message
    return CartPairResult(
        product_ids_a=tuple(sorted(product_ids_a)),
        product_ids_b=tuple(sorted(product_ids_b)),
        ingredient_a=ingredient_a,
        ingredient_b=ingredient_b,
        identity_namespace_a=identity_namespace_a,
        identity_namespace_b=identity_namespace_b,
        identity_id_a=identity_id_a,
        identity_id_b=identity_id_b,
        rxcui_a=rxcui_a,
        rxcui_b=rxcui_b,
        severity="Unknown" if has_exact_evidence else None,
        state=result.status,
        model_version=result.model_version,
        model_warning_score=result.model_warning_score,
        selected_threshold=result.selected_threshold,
        model_warning_triggered=result.model_warning_triggered,
        warning_triggered=result.warning_triggered,
        known_dataset_record_found=result.known_dataset_record_found,
        known_interaction_descriptions=result.known_interaction_descriptions,
        evidence_source_identifier=result.evidence_source_identifier,
        evidence_record_identifiers=result.evidence_record_identifiers,
        review_required=result.manual_review_required,
        message=message,
        limitations=result.limitations,
    )


def unavailable_cart_response(
    request: PartnerCartCheckRequest,
    *,
    message: str = "DDI integration artifacts are unavailable; no cart evaluation was attempted.",
) -> PartnerCartCheckResponse:
    digest, snapshot_identifier = request_snapshot(request)
    return PartnerCartCheckResponse(
        status=CartDDIStatus.SERVICE_UNAVAILABLE,
        request_snapshot_sha256=digest,
        request_snapshot_identifier=snapshot_identifier,
        bridge_schema_version=None,
        bridge_payload_sha256=None,
        products=(),
        pairs=(),
        review_required=True,
        checkout_allowed=False,
        message=message,
        limitations=CART_LIMITATIONS,
    )
