const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(
    path.join(root, rel),
    'utf8'
  );
}

test('pharmacist decision route is additive', () => {
  const routes = read(
    'src/routes/consultationRoutes.js'
  );

  assert.match(
    routes,
    /\/:consultationId\/decision/
  );

  assert.match(
    routes,
    /decideConsultation/
  );
});

test('consultation approval is explicit and one-time', () => {
  const service = read(
    'src/services/pharmacistConsultationService.js'
  );

  assert.match(
    service,
    /decision IN \('approved', 'rejected'\)/
  );

  assert.match(
    service,
    /checkout_consumed_at/
  );

  assert.match(
    service,
    /consumeApprovedCheckout/
  );

  assert.match(
    service,
    /CONSULT_APPROVAL_STALE/
  );

  assert.match(
    service,
    /FOR UPDATE/
  );
});

test('cart lifecycle binds rejection and approval to cart instance', () => {
  const service = read(
    'src/services/pharmacistConsultationService.js'
  );

  const order = read(
    'src/controllers/orderController.js'
  );

  const controller = read(
    'src/controllers/consultationController.js'
  );

  assert.match(
    service,
    /cart_instance_id/
  );

  assert.match(
    service,
    /CONSULT_CART_REJECTED/
  );

  assert.match(
    service,
    /cartInstanceIdValue/
  );

  assert.match(
    order,
    /cartInstanceIdValue:\s*req\.body\?\.funnel_cart_id/
  );

  assert.match(
    order,
    /cart_instance_id:\s*req\.body\?\.funnel_cart_id/
  );

  assert.match(
    controller,
    /CONSULT_CART_REJECTED/
  );
});


test('checkout only bypasses review with consumed exact approval', () => {
  const order = read(
    'src/controllers/orderController.js'
  );

  assert.match(
    order,
    /ddi_consultation_id/
  );

  assert.match(
    order,
    /consumeApprovedCheckout/
  );

  assert.match(
    order,
    /DDI_REVIEW_PENDING/
  );

  assert.match(
    order,
    /createConsultation/
  );

  assert.doesNotMatch(
    order,
    /checkout_allowed\s*=\s*true/
  );
});
