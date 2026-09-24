import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

const sessionModule = await import('../src/services/pharmacistAuthSession.js');
const {
  PHARMACIST_AUTH_KEY,
  LEGACY_PHARMACIST_SESSION_ID_KEY,
  clearPharmacistAuth,
  isStoredJwtExpiredOrMalformed,
  readPharmacistAuth,
  readPharmacistAuthRecord,
  writePharmacistAuth,
} = sessionModule;

function tokenWithExpiry(exp) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode({ exp })}.signature`;
}

function validAuth(overrides = {}) {
  return {
    id: 'pharmacist-1',
    email: 'pharmacist@example.com',
    role: 'pharmacist',
    token: tokenWithExpiry(Math.floor(Date.now() / 1000) + 600),
    ...overrides,
  };
}

test.beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

test('remembered auth is available when a second tab has empty sessionStorage', () => {
  const auth = validAuth();
  localStorage.setItem(PHARMACIST_AUTH_KEY, JSON.stringify(auth));

  assert.deepEqual(readPharmacistAuth(), auth);
  assert.equal(localStorage.getItem(PHARMACIST_AUTH_KEY) !== null, true);
});

test('non-remembered auth reads from sessionStorage first', () => {
  const auth = validAuth({ id: 'session-user' });
  sessionStorage.setItem(PHARMACIST_AUTH_KEY, JSON.stringify(auth));

  assert.deepEqual(readPharmacistAuthRecord(), {
    auth,
    source: 'session',
  });
});

test('session login writes sessionStorage only and clears stale local auth', () => {
  localStorage.setItem(PHARMACIST_AUTH_KEY, JSON.stringify(validAuth({ id: 'stale' })));
  const auth = validAuth({ id: 'session-user' });

  assert.equal(writePharmacistAuth(auth, false), true);
  assert.equal(localStorage.getItem(PHARMACIST_AUTH_KEY), null);
  assert.deepEqual(JSON.parse(sessionStorage.getItem(PHARMACIST_AUTH_KEY)), auth);
});

test('remembered login writes localStorage only and clears stale session auth', () => {
  sessionStorage.setItem(PHARMACIST_AUTH_KEY, JSON.stringify(validAuth({ id: 'stale' })));
  const auth = validAuth({ id: 'remembered-user' });

  assert.equal(writePharmacistAuth(auth, true), true);
  assert.equal(sessionStorage.getItem(PHARMACIST_AUTH_KEY), null);
  assert.deepEqual(JSON.parse(localStorage.getItem(PHARMACIST_AUTH_KEY)), auth);
});

test('logout clears both auth stores and obsolete session-id keys', () => {
  sessionStorage.setItem(PHARMACIST_AUTH_KEY, 'value');
  localStorage.setItem(PHARMACIST_AUTH_KEY, 'value');
  sessionStorage.setItem(LEGACY_PHARMACIST_SESSION_ID_KEY, 'legacy');
  localStorage.setItem(LEGACY_PHARMACIST_SESSION_ID_KEY, 'legacy');

  clearPharmacistAuth();

  assert.equal(sessionStorage.getItem(PHARMACIST_AUTH_KEY), null);
  assert.equal(localStorage.getItem(PHARMACIST_AUTH_KEY), null);
  assert.equal(sessionStorage.getItem(LEGACY_PHARMACIST_SESSION_ID_KEY), null);
  assert.equal(localStorage.getItem(LEGACY_PHARMACIST_SESSION_ID_KEY), null);
});

test('malformed JWT is invalid and removed from storage', () => {
  const auth = validAuth({ token: 'not-a-jwt' });
  sessionStorage.setItem(PHARMACIST_AUTH_KEY, JSON.stringify(auth));

  assert.equal(isStoredJwtExpiredOrMalformed(auth), true);
  assert.equal(readPharmacistAuth(), null);
  assert.equal(sessionStorage.getItem(PHARMACIST_AUTH_KEY), null);
});

test('expired JWT is invalid and removed from storage', () => {
  const auth = validAuth({
    token: tokenWithExpiry(Math.floor(Date.now() / 1000) - 10),
  });
  localStorage.setItem(PHARMACIST_AUTH_KEY, JSON.stringify(auth));

  assert.equal(isStoredJwtExpiredOrMalformed(auth), true);
  assert.equal(readPharmacistAuth(), null);
  assert.equal(localStorage.getItem(PHARMACIST_AUTH_KEY), null);
});

test('valid non-expired JWT remains stored', () => {
  const auth = validAuth();
  localStorage.setItem(PHARMACIST_AUTH_KEY, JSON.stringify(auth));

  assert.equal(isStoredJwtExpiredOrMalformed(auth), false);
  assert.deepEqual(readPharmacistAuth(), auth);
  assert.notEqual(localStorage.getItem(PHARMACIST_AUTH_KEY), null);
});

test('ProtectedRoute validates with pharmacist me and has no session-id authority', () => {
  const source = fs.readFileSync(
    path.join(ROOT, 'src', 'routes', 'ProtectedRoute.jsx'),
    'utf8'
  );

  assert.doesNotMatch(source, /medsense_pharmacist_session_id/);
  assert.match(source, /authService\.getMe\(\)/);
  assert.match(source, /status === 401 \|\| status === 403/);
  assert.match(source, /clearPharmacistAuth\(\)/);
  assert.match(source, /status: 'unavailable'/);
  assert.match(source, /temporarily unavailable/);
});

test('remembered logout synchronization listens for localStorage removal', () => {
  const source = fs.readFileSync(
    path.join(ROOT, 'src', 'routes', 'ProtectedRoute.jsx'),
    'utf8'
  );

  assert.match(source, /addEventListener\('storage'/);
  assert.match(source, /event\.storageArea !== localStorage/);
  assert.match(source, /event\.newValue === null/);
  assert.match(source, /current\.source === 'local'/);
});
