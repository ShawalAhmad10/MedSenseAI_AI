import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const cartContext = read('src/context/CartContext.jsx');
const checkout = read('src/pages/storefront/CheckoutPage.jsx');
const productPage = read('src/pages/storefront/ProductPage.jsx');
const cartPage = read('src/pages/storefront/CartPage.jsx');
const cartDrawer = read('src/components/storefront/CartDrawer.jsx');
const badge = read('src/components/storefront/InteractionBadge.jsx');
const ddiService = read('src/services/storefrontDdiService.js');
const orderService = read('src/services/storefrontOrderService.js');
const customerService = read('src/services/customerService.js');
const customerAuthSession = read('src/services/customerAuthSession.js');
const productService = read('src/services/storefrontProductService.js');
const main = read('src/main.jsx');

test('cart DDI identity includes account ownership and current item set', () => {
  assert.match(cartContext, /function buildCartIdentity\(items, userId\)/);
  assert.match(cartContext, /owner:\s*userId \? String\(userId\) : 'guest'/);
  assert.match(cartContext, /buildCartIdentity\(items, userId\)/);
  assert.match(cartContext, /\[items, userId\]/);
});

test('cart clearance is bound to current identity', () => {
  assert.match(cartContext, /ddiIdentity === cartIdentity/);
  assert.match(cartContext, /setDdiIdentity\(null\)/);
  assert.match(cartContext, /const requestIdentity = cartIdentity/);
  assert.match(cartContext, /setDdiIdentity\(requestIdentity\)/);
});

test('BUY_NOW and CART use explicit isolated item sets', () => {
  assert.match(checkout, /checkoutMode === 'BUY_NOW' \? buyNowItems : cartItems/);
  assert.match(checkout, /checkoutMode === 'BUY_NOW'/);
  assert.match(checkout, /getBuyNowCheckoutSession\(/);
});

test('BUY_NOW DDI clearance is account-scoped', () => {
  assert.match(checkout, /buyNowDdiOwnerScope === buyNowOwnerScope/);
  assert.match(checkout, /\[checkoutMode, buyNowItems, buyNowOwnerScope\]/);
  assert.match(checkout, /const requestOwnerScope = buyNowOwnerScope/);
});

test('successful checkout cleanup differs by explicit mode', () => {
  assert.match(checkout, /if \(checkoutMode === 'CART'\)/);
  assert.match(checkout, /clearCart\(\)/);
  assert.match(checkout, /if \(checkoutMode === 'BUY_NOW'\)/);
  assert.match(checkout, /clearBuyNowCheckout\(\)/);
});

test('ProductPage Buy Now explicitly starts isolated session', () => {
  const start = productPage.indexOf('startBuyNowCheckout(');
  const navigate = productPage.indexOf("navigate('/checkout?mode=buy-now'");

  assert.ok(start >= 0);
  assert.ok(navigate >= 0);
  assert.ok(start < navigate);
});

test('review-required DDI routes to pharmacist workflow while active checking stays disabled', () => {
  assert.match(cartPage, /Escalate to Pharmacist/);
  assert.match(cartPage, /Continue to Pharmacist Review/);
  assert.match(cartDrawer, /Continue to Pharmacist Review/);

  assert.match(cartPage, /Checking DDI\.\.\./);
  assert.match(cartDrawer, /Checking DDI\.\.\./);

  assert.match(
    cartPage,
    /disabled/
  );

  assert.match(
    cartDrawer,
    /disabled/
  );

  assert.doesNotMatch(
    `${cartPage}\n${cartDrawer}`,
    /Checkout blocked - review required/
  );
});

test('DDI callers use centralized risk-based workflow presentation', () => {
  const semanticExpression =
    "level={ddiLoading ? 'checking' : ddiPresentation.level}";

  assert.ok(cartPage.includes(semanticExpression));
  assert.ok(cartDrawer.includes(semanticExpression));
  assert.ok(!cartPage.includes(
    "level={ddiLoading ? 'moderate' : ddiCheckoutAllowed ? 'low' : 'moderate'}"
  ));
  assert.ok(!cartDrawer.includes(
    "level={ddiLoading ? 'moderate' : ddiCheckoutAllowed ? 'low' : 'moderate'}"
  ));

  assert.match(badge, /level === 'checking' \|\| level === 'review'/);
});

test('storefront browser APIs use same-origin /api paths', () => {
  assert.match(ddiService, /const DDI_URL = '\/api\/orders\/ddi-check'/);
  assert.match(orderService, /const API_URL = '\/api\/orders'/);
  assert.match(productService, /const API_URL = '\/api\/products'/);
  assert.match(customerService, /VITE_API_URL \|\| '\/api'/);
});

test('customer auth storage key is aligned', () => {
  assert.match(customerAuthSession, /medsense_customer_auth/);
  assert.match(orderService, /medsense_customer_auth/);
});

test('127 development host canonicalizes to localhost', () => {
  assert.match(main, /window\.location\.hostname === '127\.0\.0\.1'/);
  assert.match(main, /canonicalUrl\.hostname = 'localhost'/);
  assert.match(main, /window\.location\.replace\(canonicalUrl\.toString\(\)\)/);
});

test('forbidden storefront DDI claims remain absent', () => {
  const combined = [
    cartPage,
    cartDrawer,
    checkout,
    ddiService,
  ].join('\n');

  assert.doesNotMatch(combined, /High priority/i);
  assert.doesNotMatch(combined, /Moderate priority/i);
  assert.doesNotMatch(combined, /Checked - no interactions found/i);
});

test('Checkout submit delegates review authorization to authoritative backend workflow', () => {
  assert.match(
    checkout,
    /disabled=\{isSubmitting \|\| ddiLoading\}/,
  );

  assert.match(
    checkout,
    /if \(ddiLoading\)/,
  );

  assert.match(
    checkout,
    /DDI_REVIEW_PENDING/
  );

  assert.match(
    checkout,
    /ddi_consultation_id/
  );

  assert.match(
    checkout,
    /createOrder\(orderData\)/
  );

  assert.doesNotMatch(
    checkout,
    /if \(ddiLoading \|\| !ddiCheckoutAllowed\)/
  );

  assert.doesNotMatch(
    checkout,
    /checkout_allowed\s*=\s*true/
  );
});

test('allowed warning status keeps checkout and uses non-blocking presentation', () => {
  assert.match(ddiService, /WARNING_CHECKOUT_ALLOWED/);
  assert.match(ddiService, /Potential AI interaction signal/);
  assert.match(checkout, /View non-blocking DDI warning/);
  assert.match(checkout, /ddiCheckoutAllowed\s*\?\s*'Place Order'/);
});

test('unresolved presentation uses medicine identity verification language', () => {
  assert.match(ddiService, /Submitted for pharmacist verification/);
  assert.match(ddiService, /medicine identities could not be fully evaluated/i);
  assert.doesNotMatch(ddiService, /unsupported.*confirmed.*interaction/i);
});
