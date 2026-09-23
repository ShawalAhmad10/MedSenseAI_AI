const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildCompletedOrderFlag,
  emitCompletedOrderFlag,
} = require('../src/services/ddiPharmacistFlagService');

function allowedWarning(overrides = {}) {
  return {
    status: 'WARNING_CHECKOUT_ALLOWED',
    pharmacist_flag_required: true,
    highest_severity: 'Moderate',
    workflow_action: 'FLAG_PHARMACIST',
    pairs: [
      {
        ingredient_a: 'Medicine A',
        ingredient_b: 'Medicine B',
        product_ids_a: [1],
        product_ids_b: [2],
        severity: 'Moderate',
        workflow_action: 'FLAG_PHARMACIST',
        evidence_source_identifier: 'ddinter:test',
        known_interaction_descriptions: ['Exact governed evidence'],
      },
    ],
    ...overrides,
  };
}

test('completed allowed-warning order builds one concise pharmacist flag', () => {
  const flag = buildCompletedOrderFlag({
    ddiResult: allowedWarning(),
    orderId: 77,
    orderNumber: 'INV-000077',
    customerName: 'Customer',
  });

  assert.equal(flag.type, 'system');
  assert.match(flag.title, /INV-000077/);
  assert.match(flag.message, /Moderate exact interaction/);
  assert.equal(flag.metadata.affectedPairs.length, 1);
  assert.equal(flag.metadata.affectedPairs[0].severity, 'Moderate');
});

test('pharmacist flag fan-out is invoked exactly once', async () => {
  const calls = [];
  const notify = async (...args) => { calls.push(args); };

  const emitted = await emitCompletedOrderFlag({
    ddiResult: allowedWarning(),
    orderId: 77,
    orderNumber: 'INV-000077',
    customerName: 'Customer',
  }, notify);

  assert.equal(emitted, true);
  assert.equal(calls.length, 1);
});

test('notification failure is not retried by flag service', async () => {
  let attempts = 0;
  const notify = async () => {
    attempts += 1;
    throw new Error('notification database unavailable');
  };

  await assert.rejects(
    () => emitCompletedOrderFlag({
      ddiResult: allowedWarning(),
      orderId: 77,
      orderNumber: 'INV-000077',
      customerName: 'Customer',
    }, notify),
    /notification database unavailable/,
  );
  assert.equal(attempts, 1);
});

test('clear and blocking carts do not emit post-order flags', async () => {
  let attempts = 0;
  const notify = async () => { attempts += 1; };

  for (const ddiResult of [
    {
      status: 'CLEAR_WITH_LIMITATIONS',
      pharmacist_flag_required: false,
      pairs: [],
    },
    {
      status: 'WARNING_REVIEW_REQUIRED',
      pharmacist_flag_required: false,
      pairs: [],
    },
  ]) {
    const emitted = await emitCompletedOrderFlag({
      ddiResult,
      orderId: 1,
      orderNumber: 'INV-000001',
    }, notify);
    assert.equal(emitted, false);
  }

  assert.equal(attempts, 0);
});
