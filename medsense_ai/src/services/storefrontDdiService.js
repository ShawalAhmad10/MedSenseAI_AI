import axios from 'axios';

const DDI_URL = '/api/orders/ddi-check';

function authoritativeProductId(value) {
  const raw = typeof value === 'string'
    ? value.replace(/^prod-/, '')
    : value;

  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
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

export function extractDdiWarnings(result, fallbackMessage = '') {
  const warnings = [];

  for (const pair of result?.pairs || []) {
    const blockingPairReview =
      result?.checkout_allowed === false &&
      pair.review_required === true;

    if (!pair.warning_triggered && !blockingPairReview) {
      continue;
    }

    const evidence =
      Array.isArray(pair.known_interaction_descriptions) &&
      pair.known_interaction_descriptions.length > 0
        ? pair.known_interaction_descriptions.join(' ')
        : pair.message;

    warnings.push({
      id: `pair-${(pair.product_ids_a || []).join('-')}-${(pair.product_ids_b || []).join('-')}`,
      label: pair.warning_triggered ? 'Known interaction detected' : 'Pharmacist review required',
      title: `${pair.ingredient_a} + ${pair.ingredient_b}`,
      detail:
        evidence ||
        'This medicine pair requires pharmacist review before checkout.',
    });
  }

  for (const product of result?.products || []) {
    const ingredientState = product?.ingredient?.state;

    if (
      ingredientState === 'RESOLVED' &&
      product.structural_adaptation_succeeded &&
      product.product_status === 1
    ) {
      continue;
    }

    warnings.push({
      id: `product-${product.product_id}`,
      label: 'Ingredient identity unresolved',
      title: product.product_title || `Product ${product.product_id}`,
      detail:
        ingredientState && ingredientState !== 'RESOLVED'
          ? `Ingredient identity could not be fully resolved (${ingredientState}). Pharmacist review is required.`
          : 'This product could not be fully evaluated by the governed DDI screen.',
    });
  }

  if (
    warnings.length === 0 &&
    result &&
    result.checkout_allowed === false
  ) {
    warnings.push({
      id: 'ddi-review-required',
      label: 'Pharmacist review required',
      title: 'Drug interaction review required',
      detail:
        result.message ||
        'The cart could not be cleared for checkout by the DDI service.',
    });
  }

  if (warnings.length === 0 && fallbackMessage) {
    warnings.push({
      id: 'ddi-service-error',
      label: 'DDI service unavailable',
      title: 'Interaction check unavailable',
      detail: fallbackMessage,
    });
  }

  return warnings;
}
