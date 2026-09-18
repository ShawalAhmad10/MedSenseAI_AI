import test from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';

import {
  checkCartDDI,
  extractDdiWarnings,
} from '../src/services/storefrontDdiService.js';

test('frontend DDI sends only unique authoritative product IDs', { concurrency: false }, async (t) => {
  const originalPost = axios.post;
  t.after(() => { axios.post = originalPost; });

  let captured = null;

  axios.post = async (url, payload) => {
    captured = { url, payload };

    return {
      data: {
        data: {
          status: 'CLEAR_WITH_LIMITATIONS',
          checkout_allowed: true,
          products: [],
          pairs: [],
        },
      },
    };
  };

  const result = await checkCartDDI([
    { id: 'prod-900012', title: 'FORGED', salt: 'FORGED' },
    { id: 'prod-900012', title: 'DUPLICATE' },
    { id: 'prod-900007' },
  ]);

  assert.equal(captured.url, '/api/orders/ddi-check');
  assert.deepEqual(captured.payload, {
    items: [
      { product_id: 900012 },
      { product_id: 900007 },
    ],
  });

  assert.equal(result.checkout_allowed, true);
});

test('frontend DDI does not call backend when no valid product ID exists', { concurrency: false }, async (t) => {
  const originalPost = axios.post;
  t.after(() => { axios.post = originalPost; });

  let called = false;

  axios.post = async () => {
    called = true;
    return {};
  };

  const result = await checkCartDDI([
    { id: 'bad' },
    { id: null },
    { id: 'prod-0' },
  ]);

  assert.equal(result, null);
  assert.equal(called, false);
});

test('known interaction warning uses factual label and evidence', () => {
  const warnings = extractDdiWarnings({
    checkout_allowed: false,
    products: [],
    pairs: [
      {
        warning_triggered: true,
        review_required: true,
        product_ids_a: [900014],
        product_ids_b: [900009],
        ingredient_a: 'Aminolevulinic acid',
        ingredient_b: 'Digoxin',
        known_interaction_descriptions: ['Known governed interaction evidence'],
      },
    ],
  });

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].label, 'Known interaction detected');
  assert.match(warnings[0].detail, /Known governed interaction evidence/);
});

test('unresolved ingredient produces factual unresolved review item', () => {
  const warnings = extractDdiWarnings({
    checkout_allowed: false,
    pairs: [],
    products: [
      {
        product_id: 900013,
        product_title: 'DEMO Product 13',
        product_status: 1,
        structural_adaptation_succeeded: true,
        ingredient: {
          state: 'MODEL_UNSUPPORTED',
        },
      },
    ],
  });

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].label, 'Ingredient identity unresolved');
  assert.match(warnings[0].detail, /MODEL_UNSUPPORTED/);
});

test('generic governed block never invents clinical severity', () => {
  const warnings = extractDdiWarnings({
    checkout_allowed: false,
    pairs: [],
    products: [],
    message: 'Review required',
  });

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].label, 'Pharmacist review required');

  const serialized = JSON.stringify(warnings);

  assert.doesNotMatch(serialized, /High priority/i);
  assert.doesNotMatch(serialized, /Moderate priority/i);
});

test('service error fallback is represented as unavailable, not clear', () => {
  const warnings = extractDdiWarnings(null, 'Network unavailable');

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].label, 'DDI service unavailable');
});

test('clear governed result produces no warning items', () => {
  const warnings = extractDdiWarnings({
    checkout_allowed: true,
    products: [],
    pairs: [],
  });

  assert.deepEqual(warnings, []);
});