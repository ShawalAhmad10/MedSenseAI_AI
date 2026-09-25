import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }
  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }
  setItem(key, value) {
    this.values.set(key, String(value));
  }
  removeItem(key) {
    this.values.delete(key);
  }
  clear() {
    this.values.clear();
  }
}

globalThis.sessionStorage = new MemoryStorage();
globalThis.localStorage = new MemoryStorage();

const pharmacistSession = await import('../src/services/pharmacistAuthSession.js');
const customerSession = await import('../src/services/customerAuthSession.js');

function token(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256' })}.${encode(payload)}.unverified-test-signature`;
}

const futureExp = () => Math.floor(Date.now() / 1000) + 600;

test.beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

test('authoritative pharmacist me identity replaces edited stored role id and email', () => {
  const stored = {
    id: 'edited-id',
    email: 'edited@example.com',
    role: 'superadmin',
    token: token({ id: 'real-id', role: 'pharmacist', exp: futureExp() }),
    arbitraryAdminFlag: true,
  };
  localStorage.setItem(
    pharmacistSession.PHARMACIST_AUTH_KEY,
    JSON.stringify(stored)
  );

  const replaced = pharmacistSession.replacePharmacistAuthIdentity({
    id: 'real-id',
    email: 'real@example.com',
    role: 'pharmacist',
    fullName: 'Real Pharmacist',
  });

  assert.equal(replaced.id, 'real-id');
  assert.equal(replaced.email, 'real@example.com');
  assert.equal(replaced.role, 'pharmacist');
  assert.equal('arbitraryAdminFlag' in replaced, false);
  assert.equal(replaced.token, stored.token);
});

test('fake customer object without token is rejected and removed', () => {
  localStorage.setItem(
    customerSession.CUSTOMER_AUTH_KEY,
    JSON.stringify({ id: 99, email: 'fake@example.com' })
  );

  assert.equal(customerSession.readCustomerAuth(), null);
  assert.equal(localStorage.getItem(customerSession.CUSTOMER_AUTH_KEY), null);
});

test('malformed and expired customer JWTs are rejected', () => {
  assert.equal(
    customerSession.isStoredCustomerJwtInvalid({ token: 'malformed' }),
    true
  );
  assert.equal(
    customerSession.isStoredCustomerJwtInvalid({
      token: token({ type: 'customer', exp: futureExp() - 1200 }),
    }),
    true
  );
});

test('pharmacist and onboarding JWT payloads are rejected from customer storage', () => {
  assert.equal(
    customerSession.isStoredCustomerJwtInvalid({
      token: token({ type: 'pharmacist', exp: futureExp() }),
    }),
    true
  );
  assert.equal(
    customerSession.isStoredCustomerJwtInvalid({
      token: token({ type: 'pharmacist_onboarding', exp: futureExp() }),
    }),
    true
  );
});

test('customer context does not authenticate stored identity before profile validation', () => {
  const source = read('src', 'context', 'AuthContext.jsx');

  assert.match(source, /const \[user, setUser\] = useState\(null\)/);
  assert.match(source, /getCurrentCustomerProfile\(stored\.token\)/);
  assert.match(source, /\.\.\.response\.data,[\s\S]{0,80}token: stored\.token/);
  assert.match(source, /status === 401 \|\| status === 403/);
  assert.match(source, /clearCustomerAuth\(\)/);
  assert.match(source, /authStatus === 'authenticated' && Boolean\(user\)/);
});

test('customer protected route waits for authoritative validation', () => {
  const source = read('src', 'routes', 'ProtectedStorefrontRoute.jsx');

  assert.match(source, /authStatus === 'checking'/);
  assert.match(source, /authStatus === 'unavailable'/);
  assert.match(source, /if \(!isAuthenticated\)/);
});

test('pharmacist route treats browser JWT decoding as advisory and calls me', () => {
  const routeSource = read('src', 'routes', 'ProtectedRoute.jsx');
  const sessionSource = read('src', 'services', 'pharmacistAuthSession.js');

  assert.match(routeSource, /authService\.getMe\(\)/);
  assert.match(routeSource, /replacePharmacistAuthIdentity\(response\.data\)/);
  assert.match(routeSource, /status === 401 \|\| status === 403/);
  assert.doesNotMatch(sessionSource, /payload\?\.(?:role|id|email)/);
});

test('malformed remembered replacement triggers validation rather than access', () => {
  const source = read('src', 'routes', 'ProtectedRoute.jsx');

  assert.match(source, /event\.newValue === null/);
  assert.match(source, /setValidationAttempt\(\(attempt\) => attempt \+ 1\)/);
  assert.match(source, /status: 'checking'/);
});

test('pharmacist and customer API token domains are selected separately', () => {
  const apiSource = read('src', 'services', 'api.js');
  const customerServiceSource = read('src', 'services', 'customerService.js');
  const customerOrderSource = read('src', 'services', 'storefrontOrderService.js');

  assert.match(apiSource, /readPharmacistAuth\(\)/);
  assert.match(customerServiceSource, /getPharmacistToken/);
  assert.match(customerServiceSource, /readPharmacistAuth\(\)\?\.token/);
  assert.match(customerServiceSource, /getCurrentCustomerProfile\(token\)/);
  assert.match(customerOrderSource, /medsense_customer_auth/);
  assert.doesNotMatch(customerOrderSource, /medsense_auth_user/);
});

test('pharmacist and customer logout helpers clear only their own domains', () => {
  const pharmacistAuth = {
    token: token({ role: 'pharmacist', exp: futureExp() }),
  };
  const customerAuth = {
    token: token({ type: 'customer', exp: futureExp() }),
  };
  localStorage.setItem(
    pharmacistSession.PHARMACIST_AUTH_KEY,
    JSON.stringify(pharmacistAuth)
  );
  localStorage.setItem(
    customerSession.CUSTOMER_AUTH_KEY,
    JSON.stringify(customerAuth)
  );

  pharmacistSession.clearPharmacistAuth();
  assert.equal(localStorage.getItem(pharmacistSession.PHARMACIST_AUTH_KEY), null);
  assert.notEqual(localStorage.getItem(customerSession.CUSTOMER_AUTH_KEY), null);

  customerSession.clearCustomerAuth();
  assert.equal(localStorage.getItem(customerSession.CUSTOMER_AUTH_KEY), null);
});
