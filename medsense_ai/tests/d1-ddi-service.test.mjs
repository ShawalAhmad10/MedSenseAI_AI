import test from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';

import {
  checkCartDDI,
  extractDdiWarnings,
  getDdiPresentation,
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
        interaction_found: true,
        known_dataset_record_found: true,
        severity: 'Major',
        workflow_action: 'PHARMACIST_APPROVAL_REQUIRED',
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
  assert.equal(warnings[0].label, 'Major exact interaction');
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
  assert.equal(warnings[0].label, 'Submitted for pharmacist verification');
  assert.match(warnings[0].detail, /MODEL_UNSUPPORTED/);
  assert.match(warnings[0].detail, /not a confirmed interaction/);
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

test('non-blocking Moderate warning preserves normal checkout presentation', () => {
  const presentation = getDdiPresentation({
    status: 'WARNING_CHECKOUT_ALLOWED',
    checkout_allowed: true,
    highest_severity: 'Moderate',
    workflow_action: 'FLAG_PHARMACIST',
  });

  assert.equal(presentation.allowedWarning, true);
  assert.equal(presentation.blocking, false);
  assert.match(presentation.text, /Moderate exact interaction/);
  assert.match(presentation.text, /checkout available/);
});

test('Major and Unknown exact warnings present as blocking approval', () => {
  for (const severity of ['Major', 'Unknown']) {
    const presentation = getDdiPresentation({
      status: 'WARNING_REVIEW_REQUIRED',
      checkout_allowed: false,
      highest_severity: severity,
      workflow_action: 'PHARMACIST_APPROVAL_REQUIRED',
    });

    assert.equal(presentation.blocking, true);
    assert.match(presentation.detail, /pharmacist approval/i);
    if (severity === 'Unknown') {
      assert.match(
        `${presentation.text} ${presentation.detail}`,
        /severity not available/i,
      );
    } else {
      assert.match(
        `${presentation.text} ${presentation.detail}`,
        new RegExp(severity, 'i'),
      );
    }
  }
});

test('unsupported cart says verification rather than confirmed interaction', () => {
  const presentation = getDdiPresentation({
    status: 'UNRESOLVED_REVIEW_REQUIRED',
    checkout_allowed: false,
    workflow_action: 'IDENTITY_REVIEW_REQUIRED',
  });

  assert.equal(presentation.text, 'Submitted for pharmacist verification');
  assert.match(presentation.detail, /identities could not be fully evaluated/);
  assert.doesNotMatch(presentation.detail, /confirmed.*interaction/i);
});

test('model-only signal never displays a fabricated clinical severity', () => {
  const warnings = extractDdiWarnings({
    status: 'WARNING_CHECKOUT_ALLOWED',
    checkout_allowed: true,
    products: [],
    pairs: [{
      warning_triggered: true,
      interaction_found: false,
      known_dataset_record_found: false,
      severity: null,
      workflow_action: 'FLAG_MODEL_SIGNAL',
      product_ids_a: [1],
      product_ids_b: [2],
      ingredient_a: 'Medicine A',
      ingredient_b: 'Medicine B',
    }],
  });

  assert.equal(warnings[0].label, 'Potential AI interaction signal');
  assert.equal(warnings[0].severity, null);
  assert.doesNotMatch(JSON.stringify(warnings), /Major|Moderate|Minor/);
});

test('missing or unknown workflow result never presents as clear', () => {
  for (const result of [null, { status: 'UNKNOWN_STATUS' }]) {
    const presentation = getDdiPresentation(result);
    assert.equal(presentation.level, 'review');
    assert.equal(presentation.blocking, true);
    assert.doesNotMatch(presentation.text, /cleared/i);
  }
});
