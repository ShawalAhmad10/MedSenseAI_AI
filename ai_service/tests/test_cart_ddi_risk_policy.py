"""Deterministic risk-policy tests over governed DDI evidence."""

from medsense_ai.ddi_runtime.contracts import RuntimeDDIStatus
from medsense_ai.integrations.amna_medcopy.cart_ddi import (
    CartDDIStatus,
    CartPairResult,
    DDIWorkflowAction,
    _ddinter_severity,
    _pair_with_policy,
    _select_cart_workflow,
    unavailable_cart_response,
    PartnerCartCheckRequest,
)
from medsense_ai.integrations.amna_medcopy.contracts import PartnerProductRecord
from medsense_ai.integrations.amna_medcopy.ddi_rxcui_sidecar import (
    RxCUIInteractionEvidenceIndex,
)


def pair(*, severity: str | None, exact: bool, model_warning: bool = False):
    return CartPairResult(
        product_ids_a=(1,),
        product_ids_b=(2,),
        ingredient_a="Ingredient A",
        ingredient_b="Ingredient B",
        identity_namespace_a="RXNORM",
        identity_namespace_b="RXNORM",
        identity_id_a="1",
        identity_id_b="2",
        rxcui_a="1",
        rxcui_b="2",
        severity=severity,
        state=RuntimeDDIStatus.INTERACTION_WARNING,
        model_version="test-model" if model_warning else None,
        model_warning_score=0.9 if model_warning else None,
        selected_threshold=0.5 if model_warning else None,
        model_warning_triggered=model_warning if model_warning else None,
        warning_triggered=True,
        known_dataset_record_found=exact,
        known_interaction_descriptions=("Governed evidence",) if exact else (),
        evidence_source_identifier="governed:test" if exact else None,
        evidence_record_identifiers=("record:test",) if exact else (),
        review_required=True,
        message="Test pair",
        limitations=("Test limitation",),
    )


def workflow(*pairs, unresolved=False, service_unavailable=False):
    return _select_cart_workflow(
        [_pair_with_policy(item) for item in pairs],
        unresolved=unresolved,
        service_unavailable=service_unavailable,
    )


def test_clear_cart_allows_checkout_policy():
    assert workflow() == (
        CartDDIStatus.CLEAR_WITH_LIMITATIONS,
        DDIWorkflowAction.CLEAR,
    )


def test_actual_governed_ddinter_severities_drive_exact_pair_policy():
    index = RxCUIInteractionEvidenceIndex.from_artifact()
    governed_cases = (
        ("1000577", "1307404", "Minor", DDIWorkflowAction.FLAG_INFORMATIONAL),
        ("1000112", "139825", "Moderate", DDIWorkflowAction.FLAG_PHARMACIST),
        ("1000112", "2049106", "Major", DDIWorkflowAction.PHARMACIST_APPROVAL_REQUIRED),
        ("10156", "10237", "Unknown", DDIWorkflowAction.PHARMACIST_APPROVAL_REQUIRED),
    )

    for left, right, expected_severity, expected_action in governed_cases:
        evidence = index.lookup(left, right)
        assert evidence is not None
        severity = _ddinter_severity(evidence.levels)
        assert severity == expected_severity
        evaluated = _pair_with_policy(pair(severity=severity, exact=True))
        assert evaluated.interaction_found is True
        assert evaluated.workflow_action is expected_action
        assert evaluated.review_required is (
            expected_action is DDIWorkflowAction.PHARMACIST_APPROVAL_REQUIRED
        )


def test_minor_and_moderate_are_allowed_flagged_warnings():
    for severity, expected_action in (
        ("minor", DDIWorkflowAction.FLAG_INFORMATIONAL),
        ("MODERATE", DDIWorkflowAction.FLAG_PHARMACIST),
    ):
        evaluated = _pair_with_policy(pair(severity=severity, exact=True))
        status, action = _select_cart_workflow(
            [evaluated], unresolved=False, service_unavailable=False
        )
        assert evaluated.severity in {"Minor", "Moderate"}
        assert evaluated.review_required is False
        assert evaluated.pharmacist_flag_required is True
        assert status is CartDDIStatus.WARNING_CHECKOUT_ALLOWED
        assert action is expected_action


def test_major_critical_severe_and_unknown_block_for_approval():
    for severity in ("Major", "critical", "SEVERE", "Unknown", "unrecognized"):
        evaluated = _pair_with_policy(pair(severity=severity, exact=True))
        status, action = _select_cart_workflow(
            [evaluated], unresolved=False, service_unavailable=False
        )
        assert status is CartDDIStatus.WARNING_REVIEW_REQUIRED
        assert action is DDIWorkflowAction.PHARMACIST_APPROVAL_REQUIRED
        assert evaluated.review_required is True
        if severity.casefold() in {"unknown", "unrecognized"}:
            assert "severity is unknown" in evaluated.message


def test_model_only_signal_is_allowed_without_fabricated_severity():
    evaluated = _pair_with_policy(
        pair(severity=None, exact=False, model_warning=True)
    )
    status, action = _select_cart_workflow(
        [evaluated], unresolved=False, service_unavailable=False
    )
    assert status is CartDDIStatus.WARNING_CHECKOUT_ALLOWED
    assert action is DDIWorkflowAction.FLAG_MODEL_SIGNAL
    assert evaluated.severity is None
    assert evaluated.interaction_found is False
    assert evaluated.review_required is False


def test_cart_precedence_major_beats_moderate_and_unresolved_beats_minor():
    moderate = pair(severity="Moderate", exact=True)
    major = pair(severity="Major", exact=True)
    minor = pair(severity="Minor", exact=True)

    assert workflow(moderate, major) == (
        CartDDIStatus.WARNING_REVIEW_REQUIRED,
        DDIWorkflowAction.PHARMACIST_APPROVAL_REQUIRED,
    )
    assert workflow(minor, unresolved=True) == (
        CartDDIStatus.UNRESOLVED_REVIEW_REQUIRED,
        DDIWorkflowAction.IDENTITY_REVIEW_REQUIRED,
    )


def test_service_failure_is_fail_closed():
    request = PartnerCartCheckRequest(
        products=(
            PartnerProductRecord(
                product_id=1,
                product_title="Test",
                product_generic_name="test",
                product_salt="test",
                product_requires_rx=False,
                product_status=1,
            ),
        )
    )
    response = unavailable_cart_response(request)
    assert response.status is CartDDIStatus.SERVICE_UNAVAILABLE
    assert response.checkout_allowed is False
    assert response.review_required is True


def test_reversed_governed_pair_has_identical_policy():
    index = RxCUIInteractionEvidenceIndex.from_artifact()
    forward = index.lookup("1000112", "139825")
    reverse = index.lookup("139825", "1000112")
    assert forward == reverse
    assert forward is not None
    assert workflow(pair(severity=_ddinter_severity(forward.levels), exact=True)) == workflow(
        pair(severity=_ddinter_severity(reverse.levels), exact=True)
    )
