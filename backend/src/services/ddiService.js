const axios = require('axios');

const AI_SERVICE_URL = (process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000')
  .replace(/\/+$/, '');

const CART_DDI_URL =
  `${AI_SERVICE_URL}/api/v1/integrations/amna/ddi/cart-check`;

const DDI_TIMEOUT_MS = Number(process.env.DDI_TIMEOUT_MS || 15000);
const DDI_STATUS_CHECKOUT_CONTRACT = Object.freeze({
  CLEAR_WITH_LIMITATIONS: true,
  WARNING_CHECKOUT_ALLOWED: true,
  WARNING_REVIEW_REQUIRED: false,
  UNRESOLVED_REVIEW_REQUIRED: false,
  SERVICE_UNAVAILABLE: false
});

const DDI_STATUS_REVIEW_CONTRACT = Object.freeze({
  CLEAR_WITH_LIMITATIONS: false,
  WARNING_CHECKOUT_ALLOWED: false,
  WARNING_REVIEW_REQUIRED: true,
  UNRESOLVED_REVIEW_REQUIRED: true,
  SERVICE_UNAVAILABLE: true
});

const DDI_WORKFLOW_ACTIONS = new Set([
  'CLEAR',
  'FLAG_INFORMATIONAL',
  'FLAG_PHARMACIST',
  'FLAG_MODEL_SIGNAL',
  'PHARMACIST_APPROVAL_REQUIRED',
  'IDENTITY_REVIEW_REQUIRED',
  'SERVICE_UNAVAILABLE'
]);

const DDI_SEVERITIES = new Set([
  'Minor',
  'Moderate',
  'Unknown',
  'Major',
  'Severe',
  'Critical'
]);

const DDI_STATUS_ACTION_CONTRACT = Object.freeze({
  CLEAR_WITH_LIMITATIONS: new Set(['CLEAR']),
  WARNING_CHECKOUT_ALLOWED: new Set([
    'FLAG_INFORMATIONAL',
    'FLAG_PHARMACIST',
    'FLAG_MODEL_SIGNAL'
  ]),
  WARNING_REVIEW_REQUIRED: new Set([
    'PHARMACIST_APPROVAL_REQUIRED'
  ]),
  UNRESOLVED_REVIEW_REQUIRED: new Set([
    'IDENTITY_REVIEW_REQUIRED'
  ]),
  SERVICE_UNAVAILABLE: new Set(['SERVICE_UNAVAILABLE'])
});

async function checkCart(products) {
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error('DDI check requires at least one authoritative product');
  }

  const response = await axios.post(
    CART_DDI_URL,
    { products },
    {
      timeout: DDI_TIMEOUT_MS,
      validateStatus: () => true
    }
  );

  const result = response.data;

  if (
    !result ||
    typeof result.status !== 'string' ||
    typeof result.checkout_allowed !== 'boolean' ||
    typeof result.review_required !== 'boolean' ||
    typeof result.pharmacist_flag_required !== 'boolean' ||
    !DDI_WORKFLOW_ACTIONS.has(result.workflow_action) ||
    !(
      result.highest_severity === null ||
      DDI_SEVERITIES.has(result.highest_severity)
    ) ||
    !Array.isArray(result.products) ||
    !Array.isArray(result.pairs)
  ) {
    const error = new Error('Invalid response received from DDI service');
    error.code = 'DDI_INVALID_RESPONSE';
    error.upstreamStatus = response.status;
    throw error;
  }

  const expectedCheckoutAllowed =
    DDI_STATUS_CHECKOUT_CONTRACT[result.status];
  const expectedReviewRequired =
    DDI_STATUS_REVIEW_CONTRACT[result.status];
  const expectedFlagRequired =
    result.status === 'WARNING_CHECKOUT_ALLOWED';
  const expectedActions =
    DDI_STATUS_ACTION_CONTRACT[result.status];
  const pairsAreValid = result.pairs.every((pair) => (
    pair &&
    typeof pair.interaction_found === 'boolean' &&
    (pair.severity === null || DDI_SEVERITIES.has(pair.severity)) &&
    DDI_WORKFLOW_ACTIONS.has(pair.workflow_action) &&
    typeof pair.review_required === 'boolean' &&
    typeof pair.pharmacist_flag_required === 'boolean' &&
    (
      pair.model_warning_triggered === null ||
      typeof pair.model_warning_triggered === 'boolean'
    ) &&
    typeof pair.warning_triggered === 'boolean' &&
    typeof pair.known_dataset_record_found === 'boolean' &&
    Array.isArray(pair.known_interaction_descriptions) &&
    Array.isArray(pair.evidence_record_identifiers) &&
    (
      pair.evidence_source_identifier === null ||
      typeof pair.evidence_source_identifier === 'string'
    )
  ));

  if (
    typeof expectedCheckoutAllowed !== 'boolean' ||
    !expectedActions?.has(result.workflow_action) ||
    result.checkout_allowed !== expectedCheckoutAllowed ||
    result.review_required !== expectedReviewRequired ||
    result.pharmacist_flag_required !== expectedFlagRequired ||
    !pairsAreValid
  ) {
    const error = new Error(
      'Inconsistent response received from DDI service'
    );
    error.code = 'DDI_INVALID_RESPONSE';
    error.upstreamStatus = response.status;
    throw error;
  }

  return {
    httpStatus: response.status,
    result
  };
}

module.exports = {
  checkCart,
  AI_SERVICE_URL,
  CART_DDI_URL
};
