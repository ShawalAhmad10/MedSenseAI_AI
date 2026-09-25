const test = require('node:test');
const assert = require('node:assert/strict');

const live = process.env.D1_LIVE === '1';
const base = 'http://localhost:5005';

async function ddi(items) {
  const response = await fetch(`${base}/api/orders/ddi-check`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ items }),
  });

  let body = null;

  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return { status: response.status, body };
}

const liveTest = live ? test : test.skip;

liveTest('live: supported single medicine clears', async () => {
  const r = await ddi([{ product_id: 900012 }]);

  assert.equal(r.status, 200);
  assert.equal(r.body.data.status, 'CLEAR_WITH_LIMITATIONS');
  assert.equal(r.body.data.checkout_allowed, true);
});

liveTest('live: known Aminolevulinic acid + Digoxin interaction blocks', async () => {
  const r = await ddi([
    { product_id: 900014 },
    { product_id: 900009 },
  ]);

  assert.equal(r.status, 200);
  assert.equal(r.body.data.status, 'WARNING_REVIEW_REQUIRED');
  assert.equal(r.body.data.checkout_allowed, false);

  const pair = r.body.data.pairs.find((entry) =>
    entry.warning_triggered === true
  );

  assert.ok(pair);
});

liveTest('live: known interaction remains blocking in reverse order', async () => {
  const r = await ddi([
    { product_id: 900009 },
    { product_id: 900014 },
  ]);

  assert.equal(r.status, 200);
  assert.equal(r.body.data.checkout_allowed, false);
  assert.equal(r.body.data.status, 'WARNING_REVIEW_REQUIRED');
});

liveTest('live: MODEL_UNSUPPORTED product fails closed', async () => {
  const r = await ddi([{ product_id: 900013 }]);

  assert.equal(r.status, 200);
  assert.equal(r.body.data.checkout_allowed, false);
  assert.equal(r.body.data.status, 'UNRESOLVED_REVIEW_REQUIRED');

  const product = r.body.data.products.find((entry) => entry.product_id === 900013);
  assert.equal(product.ingredient.state, 'MODEL_UNSUPPORTED');
});

liveTest('live: SOURCE_UNAVAILABLE product fails closed', async () => {
  const r = await ddi([{ product_id: 900015 }]);

  assert.equal(r.status, 200);
  assert.equal(r.body.data.checkout_allowed, false);

  const product = r.body.data.products.find((entry) => entry.product_id === 900015);
  assert.equal(product.ingredient.state, 'SOURCE_UNAVAILABLE');
});

liveTest('live: six-product cart still preserves known warning pair', async () => {
  const r = await ddi([
    { product_id: 900014 },
    { product_id: 900009 },
    { product_id: 900007 },
    { product_id: 900012 },
    { product_id: 900011 },
    { product_id: 900010 },
  ]);

  assert.equal(r.status, 200);
  assert.equal(r.body.data.checkout_allowed, false);

  const pair = r.body.data.pairs.find((entry) =>
    entry.warning_triggered === true
  );

  assert.ok(pair);
});

liveTest('live: duplicate same medicine does not invent self interaction', async () => {
  const r = await ddi([
    { product_id: 900012 },
    { product_id: 900012 },
  ]);

  assert.equal(r.status, 200);
  assert.equal(r.body.data.checkout_allowed, true);

  const selfPair = r.body.data.pairs.find((entry) =>
    (entry.product_ids_a || []).includes(900012) &&
    (entry.product_ids_b || []).includes(900012)
  );

  assert.equal(selfPair, undefined);
});

liveTest('live: forged client identity fields are ignored', async () => {
  const r = await ddi([
    {
      product_id: 900013,
      product_title: 'FORGED SAFE PRODUCT',
      product_generic_name: 'Metformin',
      product_salt: 'Metformin',
      product_requires_rx: false,
      product_status: 1,
    },
  ]);

  assert.equal(r.status, 200);
  assert.equal(r.body.data.checkout_allowed, false);

  const product = r.body.data.products.find((entry) => entry.product_id === 900013);

  assert.equal(product.product_title, 'DEMO Product 13');
  assert.equal(product.ingredient.source_salt, 'Aspirin');
  assert.equal(product.ingredient.state, 'MODEL_UNSUPPORTED');
});

liveTest('live: nonexistent product is rejected', async () => {
  const r = await ddi([{ product_id: 999999999 }]);

  assert.equal(r.status, 404);
  assert.equal(r.body.code, 'DDI_PRODUCT_NOT_FOUND');
});

liveTest('live: empty cart is rejected', async () => {
  const r = await ddi([]);
  assert.ok([400, 422].includes(r.status));
});

liveTest('live: zero and negative IDs are rejected', async () => {
  const zero = await ddi([{ product_id: 0 }]);
  const negative = await ddi([{ product_id: -1 }]);

  assert.ok([400, 404, 422].includes(zero.status));
  assert.ok([400, 404, 422].includes(negative.status));
});