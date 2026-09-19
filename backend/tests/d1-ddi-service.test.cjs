const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const ddiService = require('../src/services/ddiService');

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
      products: [],
      pairs: [],
    },
  });

  await assert.rejects(
    () => ddiService.checkCart([{ product_id: 900012 }]),
    (error) => error && error.code === 'DDI_INVALID_RESPONSE',
  );
});
