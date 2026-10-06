import axios from 'axios';

const DDI_URL = '/api/orders/ddi-check';

function authoritativeProductId(value) {
  const raw = typeof value === 'string'
    ? value.replace(/^prod-/, '')
    : value;

  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function formatIngredientName(value = '') {
  const text = String(value || '').trim();

  if (!text) {
    return '';
  }

  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatEvidenceForDisplay(value = '') {
  return String(value || '')
    .replace(/\s+\?\s+/g, ' \u2194 ')
    .replace(
      /;\s*severity=Unknown\.?/gi,
      '. Severity: Not available in source.',
    )
    .replace(
      /\bseverity=Unknown\.?/gi,
      'Severity: Not available in source.',
    );
}

export async function checkCartDDI(items) {
  const ids = [
    ...new Set(
      (items || [])
        .map((item) => authoritativeProductId(item.id))
        .filter(Boolean),
    ),
  ];

  if (ids.length === 0) {
    return null;
  }

  const response = await axios.post(DDI_URL, {
    items: ids.map((productId) => ({
      product_id: productId,
    })),
  });

  return response.data?.data ?? null;
}

export function getDdiPresentation(result, fallbackMessage = '') {
  const status = result?.status;

  if (status === 'WARNING_CHECKOUT_ALLOWED') {
    const severity = ['Minor', 'Moderate'].includes(result.highest_severity)
      ? result.highest_severity
      : null;

    return {
      level: 'moderate',
      allowedWarning: true,
      blocking: false,
      text: severity
        ? `${severity} exact interaction — checkout available`
        : 'Potential AI interaction signal — checkout available',
      detail: severity
        ? `${severity} exact interaction warning. Your order can proceed and will be flagged for pharmacist review.`
        : 'Potential AI interaction signal. No governed clinical severity is available; checkout remains available and the order will be flagged.',
    };
  }

  if (status === 'WARNING_REVIEW_REQUIRED') {
    const severity = result.highest_severity;

    return {
      level: 'review',
      allowedWarning: false,
      blocking: true,
      text: severity === 'Unknown'
        ? 'Interaction found - severity not available'
        : `${severity || 'Exact'} interaction — pharmacist approval required`,
      detail: severity === 'Unknown'
        ? 'Exact source-backed interaction evidence was found. Clinical severity is not available in the governed source; pharmacist approval is required before checkout.'
        : `${severity || 'This'} exact interaction requires pharmacist approval before checkout.`,
    };
  }

  if (status === 'UNRESOLVED_REVIEW_REQUIRED') {
    return {
      level: 'review',
      allowedWarning: false,
      blocking: true,
      text: 'Submitted for pharmacist verification',
      detail: 'Pharmacist verification required because one or more medicine identities could not be fully evaluated.',
    };
  }

  if (status === 'CLEAR_WITH_LIMITATIONS') {
    return {
      level: 'clear',
      allowedWarning: false,
      blocking: false,
      text: 'Governed DDI check completed; checkout cleared for the current cart',
      detail: result.message || 'No blocking DDI workflow action was found for this medicine set.',
    };
  }

  if (status === 'SERVICE_UNAVAILABLE' || fallbackMessage || !status) {
    return {
      level: 'review',
      allowedWarning: false,
      blocking: true,
      text: 'DDI service unavailable',
      detail: fallbackMessage || result?.message || 'The interaction check could not be completed.',
    };
  }

  return {
    level: 'review',
    allowedWarning: false,
    blocking: true,
    text: 'DDI review required',
    detail: result?.message || 'The DDI service returned an unsupported workflow status.',
  };
}

export function extractDdiWarnings(result, fallbackMessage = '') {
  const warnings = [];

  for (const pair of result?.pairs || []) {
    const blockingPairReview =
      result?.checkout_allowed === false &&
      pair.review_required === true;

    if (!pair.warning_triggered && !blockingPairReview) {
      continue;
    }

    const rawEvidence =
      Array.isArray(pair.known_interaction_descriptions) &&
      pair.known_interaction_descriptions.length > 0
        ? pair.known_interaction_descriptions.join(' ')
        : pair.message;

    const evidence = formatEvidenceForDisplay(rawEvidence);

    const exactInteraction =
      pair.interaction_found === true ||
      pair.known_dataset_record_found === true;

    const modelSignal =
      pair.workflow_action === 'FLAG_MODEL_SIGNAL';

    const severity =
      exactInteraction
        ? pair.severity
        : null;

    const ingredientA =
      formatIngredientName(pair.ingredient_a);

    const ingredientB =
      formatIngredientName(pair.ingredient_b);

    warnings.push({
      id: `pair-${(pair.product_ids_a || []).join('-')}-${(pair.product_ids_b || []).join('-')}`,

      label: modelSignal
        ? 'Potential AI interaction signal'
        : exactInteraction
          ? severity === 'Unknown'
            ? 'Interaction found - severity not available'
            : `${severity || 'Exact'} exact interaction`
          : 'Pharmacist review required',

      title: `${ingredientA} \u2194 ${ingredientB}`,

      detail: modelSignal
        ? 'Potential model signal only; no governed clinical severity is available.'
        : evidence ||
          (
            exactInteraction && severity === 'Unknown'
              ? 'Exact source-backed interaction evidence was found. Severity: Not available in source.'
              : 'This medicine pair requires pharmacist review before checkout.'
          ),

      severity,

      workflowAction:
        pair.workflow_action || null,
    });
  }

  for (const product of result?.products || []) {
    const ingredientState =
      product?.ingredient?.state;

    if (
      ingredientState === 'RESOLVED' &&
      product.structural_adaptation_succeeded &&
      product.product_status === 1
    ) {
      continue;
    }

    warnings.push({
      id: `product-${product.product_id}`,

      label:
        'Submitted for pharmacist verification',

      title:
        product.product_title ||
        `Product ${product.product_id}`,

      detail:
        ingredientState &&
        ingredientState !== 'RESOLVED'
          ? `Medicine identity or evidence could not be fully evaluated (${ingredientState}). This is a medicine identity or model coverage limitation, not a confirmed interaction.`
          : 'Medicine identity or evidence could not be fully evaluated. This is a medicine identity or model coverage limitation, not a confirmed interaction.',
    });
  }

  if (
    warnings.length === 0 &&
    result &&
    result.checkout_allowed === false
  ) {
    warnings.push({
      id: 'ddi-review-required',

      label:
        result.status === 'UNRESOLVED_REVIEW_REQUIRED'
          ? 'Submitted for pharmacist verification'
          : 'Pharmacist review required',

      title:
        result.status === 'UNRESOLVED_REVIEW_REQUIRED'
          ? 'Medicine identity verification required'
          : 'Drug interaction review required',

      detail:
        result.message ||
        'The cart could not be cleared for checkout by the DDI service.',
    });
  }

  if (
    warnings.length === 0 &&
    fallbackMessage
  ) {
    warnings.push({
      id: 'ddi-service-error',
      label: 'DDI service unavailable',
      title: 'Interaction check unavailable',
      detail: fallbackMessage,
    });
  }

  return warnings;
}