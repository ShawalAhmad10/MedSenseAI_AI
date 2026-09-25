const {
  createNotificationForAllPharmacists
} = require('../controllers/notificationController');

const FLAG_ACTIONS = new Set([
  'FLAG_INFORMATIONAL',
  'FLAG_PHARMACIST',
  'FLAG_MODEL_SIGNAL'
]);

function compactText(value, maxLength = 500) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength
    ? `${text.slice(0, maxLength - 1)}…`
    : text;
}

function describePair(pair) {
  const ingredients = [
    pair?.ingredient_a,
    pair?.ingredient_b
  ].filter(Boolean).join(' + ') || 'Affected medicine pair';

  const evidence = Array.isArray(pair?.known_interaction_descriptions)
    ? pair.known_interaction_descriptions.filter(Boolean).join(' ')
    : '';

  if (pair?.workflow_action === 'FLAG_MODEL_SIGNAL') {
    return compactText(
      `${ingredients}: AI DDI signal — no governed clinical severity available. ` +
      'Order was accepted; review recommended.'
    );
  }

  const severity = pair?.severity === 'Moderate' ? 'Moderate' : 'Minor';
  const recommendation = severity === 'Moderate'
    ? 'Order was accepted; pharmacist review recommended.'
    : 'Informational review.';

  return compactText(
    `${ingredients}: DDI flag — ${severity} exact interaction. ` +
    `${recommendation}${evidence ? ` Evidence: ${evidence}` : ''}`
  );
}

function buildCompletedOrderFlag({
  ddiResult,
  orderId,
  orderNumber,
  customerName
}) {
  if (
    ddiResult?.status !== 'WARNING_CHECKOUT_ALLOWED' ||
    ddiResult?.pharmacist_flag_required !== true
  ) {
    return null;
  }

  const affectedPairs = (ddiResult.pairs || []).filter(
    (pair) => FLAG_ACTIONS.has(pair?.workflow_action)
  );

  if (affectedPairs.length === 0) {
    return null;
  }

  const pairSummaries = affectedPairs.map(describePair);
  const context = customerName
    ? `Customer: ${compactText(customerName, 120)}. `
    : '';

  return {
    type: 'system',
    title: `DDI flag — ${orderNumber}`,
    message: compactText(
      `${context}${pairSummaries.join(' | ')}`,
      1800
    ),
    metadata: {
      orderId,
      orderNumber,
      customerName: customerName || null,
      ddiStatus: ddiResult.status,
      highestSeverity: ddiResult.highest_severity || null,
      workflowAction: ddiResult.workflow_action,
      affectedPairs: affectedPairs.map((pair) => ({
        ingredientA: pair.ingredient_a || null,
        ingredientB: pair.ingredient_b || null,
        productIdsA: pair.product_ids_a || [],
        productIdsB: pair.product_ids_b || [],
        severity: pair.severity || null,
        workflowAction: pair.workflow_action,
        evidenceSourceIdentifier:
          pair.evidence_source_identifier || null,
        evidenceSummary: Array.isArray(
          pair.known_interaction_descriptions
        )
          ? pair.known_interaction_descriptions.filter(Boolean)
          : []
      }))
    }
  };
}

async function emitCompletedOrderFlag(
  orderContext,
  notify = createNotificationForAllPharmacists
) {
  const flag = buildCompletedOrderFlag(orderContext);

  if (!flag) {
    return false;
  }

  await notify(
    flag.type,
    flag.title,
    flag.message,
    flag.metadata
  );

  return true;
}

module.exports = {
  buildCompletedOrderFlag,
  emitCompletedOrderFlag
};
