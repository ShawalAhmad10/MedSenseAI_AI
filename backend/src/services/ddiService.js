const axios = require('axios');

const AI_SERVICE_URL = (process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000')
  .replace(/\/+$/, '');

const CART_DDI_URL =
  `${AI_SERVICE_URL}/api/v1/integrations/amna/ddi/cart-check`;

const DDI_TIMEOUT_MS = Number(process.env.DDI_TIMEOUT_MS || 15000);
const DDI_STATUS_CHECKOUT_CONTRACT = Object.freeze({
  CLEAR_WITH_LIMITATIONS: true,
  WARNING_REVIEW_REQUIRED: false,
  UNRESOLVED_REVIEW_REQUIRED: false,
  SERVICE_UNAVAILABLE: false
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

  if (
    typeof expectedCheckoutAllowed !== 'boolean' ||
    result.checkout_allowed !== expectedCheckoutAllowed
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
