const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const ddiService = require('../src/services/ddiService');

function contractFields(status) {
  const values = {
    CLEAR_WITH_LIMITATIONS: {
      review_required: false,
      pharmacist_flag_required: false,
      highest_severity: null,
      workflow_action: 'CLEAR',
    },
    WARNING_CHECKOUT_ALLOWED: {
      review_required: false,
      pharmacist_flag_required: true,
      highest_severity: 'Moderate',
      workflow_action: 'FLAG_PHARMACIST',
    },
    WARNING_REVIEW_REQUIRED: {
      review_required: true,
      pharmacist_flag_required: false,
      highest_severity: 'Major',
      workflow_action: 'PHARMACIST_APPROVAL_REQUIRED',
    },
    UNRESOLVED_REVIEW_REQUIRED: {
      review_required: true,
      pharmacist_flag_required: false,
      highest_severity: null,
      workflow_action: 'IDENTITY_REVIEW_REQUIRED',
    },
    SERVICE_UNAVAILABLE: {
      review_required: true,
      pharmacist_flag_required: false,
      highest_severity: null,
      workflow_action: 'SERVICE_UNAVAILABLE',
    },
  };
  return values[status];
}

test('ddiService rejects an empty authoritative product set', async () => {
  await assert.rejects(
    () => ddiService.checkCart([]),
    /requires at least one authoritative product/,
  );
});

test('ddiService accepts a structurally valid clear response', { concurrency: false }, async (t) => {
  const originalPost = axios.post;
  t.after(() => { axios.post = originalPost; });

  axios.post = async (url, body, options) => {
    assert.match(url, /\/api\/v1\/integrations\/amna\/ddi\/cart-check$/);
    assert.equal(options.timeout > 0, true);
    assert.equal(body.products.length, 1);

    return {
      status: 200,
      data: {
        status: 'CLEAR_WITH_LIMITATIONS',
        checkout_allowed: true,
        ...contractFields('CLEAR_WITH_LIMITATIONS'),
        products: [],
        pairs: [],
      },
    };
  };

  const result = await ddiService.checkCart([{ product_id: 900012 }]);

  assert.equal(result.httpStatus, 200);
  assert.equal(result.result.status, 'CLEAR_WITH_LIMITATIONS');
  assert.equal(result.result.checkout_allowed, true);
});

test('ddiService preserves governed service-unavailable response', { concurrency: false }, async (t) => {
  const originalPost = axios.post;
  t.after(() => { axios.post = originalPost; });

  axios.post = async () => ({
    status: 503,
    data: {
      status: 'SERVICE_UNAVAILABLE',
      checkout_allowed: false,
      ...contractFields('SERVICE_UNAVAILABLE'),
      products: [],
      pairs: [],
    },
  });

  const result = await ddiService.checkCart([{ product_id: 900012 }]);

  assert.equal(result.httpStatus, 503);
  assert.equal(result.result.status, 'SERVICE_UNAVAILABLE');
  assert.equal(result.result.checkout_allowed, false);
});

test('ddiService rejects malformed upstream responses', { concurrency: false }, async (t) => {
  const originalPost = axios.post;
  t.after(() => { axios.post = originalPost; });

  axios.post = async () => ({
    status: 200,
    data: {
      status: 'CLEAR_WITH_LIMITATIONS',
      checkout_allowed: true,
    },
  });

  await assert.rejects(
    () => ddiService.checkCart([{ product_id: 900012 }]),
    (error) => error && error.code === 'DDI_INVALID_RESPONSE',
  );
});

test('ddiService propagates network outage instead of inventing clearance', { concurrency: false }, async (t) => {
  const originalPost = axios.post;
  t.after(() => { axios.post = originalPost; });

  axios.post = async () => {
    const error = new Error('connection refused');
    error.code = 'ECONNREFUSED';
    throw error;
  };

  await assert.rejects(
    () => ddiService.checkCart([{ product_id: 900012 }]),
    (error) => error && error.code === 'ECONNREFUSED',
  );
});

// ddiService hardening status/clearance consistency
test('ddiService preserves valid blocked governed statuses', { concurrency: false }, async (t) => {
  const originalPost = axios.post;
  t.after(() => { axios.post = originalPost; });

  for (const [status, httpStatus] of [
    ['WARNING_REVIEW_REQUIRED', 200],
    ['UNRESOLVED_REVIEW_REQUIRED', 200],
    ['SERVICE_UNAVAILABLE', 503],
  ]) {
    axios.post = async () => ({
      status: httpStatus,
      data: {
        status,
        checkout_allowed: false,
        ...contractFields(status),
        products: [],
        pairs: [],
      },
    });

    const result =
      await ddiService.checkCart([{ product_id: 900012 }]);

    assert.equal(result.result.status, status);
    assert.equal(result.result.checkout_allowed, false);
  }
});

test('ddiService rejects review statuses that incorrectly allow checkout', { concurrency: false }, async (t) => {
  const originalPost = axios.post;
  t.after(() => { axios.post = originalPost; });

  for (const status of [
    'WARNING_REVIEW_REQUIRED',
    'UNRESOLVED_REVIEW_REQUIRED',
    'SERVICE_UNAVAILABLE',
  ]) {
    axios.post = async () => ({
      status: status === 'SERVICE_UNAVAILABLE' ? 503 : 200,
      data: {
        status,
        ...contractFields(status),
        checkout_allowed: true,
        products: [],
        pairs: [],
      },
    });

    await assert.rejects(
      () => ddiService.checkCart([{ product_id: 900012 }]),
      (error) => error && error.code === 'DDI_INVALID_RESPONSE',
    );
  }
});

test('ddiService rejects CLEAR status that does not grant checkout', { concurrency: false }, async (t) => {
  const originalPost = axios.post;
  t.after(() => { axios.post = originalPost; });

  axios.post = async () => ({
    status: 200,
    data: {
      status: 'CLEAR_WITH_LIMITATIONS',
      ...contractFields('CLEAR_WITH_LIMITATIONS'),
      checkout_allowed: false,
      products: [],
      pairs: [],
    },
  });

  await assert.rejects(
    () => ddiService.checkCart([{ product_id: 900012 }]),
    (error) => error && error.code === 'DDI_INVALID_RESPONSE',
  );
});

test('ddiService rejects unknown governed status instead of trusting its boolean', { concurrency: false }, async (t) => {
  const originalPost = axios.post;
  t.after(() => { axios.post = originalPost; });

  axios.post = async () => ({
    status: 200,
    data: {
      status: 'UNKNOWN_CLEAR_STATE',
      checkout_allowed: true,
      review_required: false,
      pharmacist_flag_required: false,
      highest_severity: null,
      workflow_action: 'CLEAR',
      products: [],
      pairs: [],
    },
  });

  await assert.rejects(
    () => ddiService.checkCart([{ product_id: 900012 }]),
    (error) => error && error.code === 'DDI_INVALID_RESPONSE',
  );
});

test('ddiService accepts WARNING_CHECKOUT_ALLOWED only with checkout enabled', { concurrency: false }, async (t) => {
  const originalPost = axios.post;
  t.after(() => { axios.post = originalPost; });

  axios.post = async () => ({
    status: 200,
    data: {
      status: 'WARNING_CHECKOUT_ALLOWED',
      checkout_allowed: true,
      ...contractFields('WARNING_CHECKOUT_ALLOWED'),
      products: [],
      pairs: [],
    },
  });

  const result = await ddiService.checkCart([{ product_id: 900012 }]);
  assert.equal(result.result.checkout_allowed, true);
  assert.equal(result.result.pharmacist_flag_required, true);

  axios.post = async () => ({
    status: 200,
    data: {
      status: 'WARNING_CHECKOUT_ALLOWED',
      checkout_allowed: false,
      ...contractFields('WARNING_CHECKOUT_ALLOWED'),
      products: [],
      pairs: [],
    },
  });

  await assert.rejects(
    () => ddiService.checkCart([{ product_id: 900012 }]),
    (error) => error && error.code === 'DDI_INVALID_RESPONSE',
  );
});

test('ddiService rejects allowed warnings missing deterministic pair fields', { concurrency: false }, async (t) => {
  const originalPost = axios.post;
  t.after(() => { axios.post = originalPost; });

  axios.post = async () => ({
    status: 200,
    data: {
      status: 'WARNING_CHECKOUT_ALLOWED',
      checkout_allowed: true,
      ...contractFields('WARNING_CHECKOUT_ALLOWED'),
      products: [],
      pairs: [{ warning_triggered: true }],
    },
  });

  await assert.rejects(
    () => ddiService.checkCart([{ product_id: 900012 }]),
    (error) => error && error.code === 'DDI_INVALID_RESPONSE',
  );
});
