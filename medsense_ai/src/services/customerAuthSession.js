export const CUSTOMER_AUTH_KEY = 'medsense_customer_auth';
export const LEGACY_CUSTOMER_SESSION_ID_KEY = 'medsense_session_id';

function decodeJwtPayload(token) {
  const encodedPayload = token.split('.')[1];
  if (!encodedPayload) throw new Error('Malformed JWT');

  const base64 = encodedPayload
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padded = base64.padEnd(
    Math.ceil(base64.length / 4) * 4,
    '='
  );

  return JSON.parse(atob(padded));
}

export function isStoredCustomerJwtInvalid(auth) {
  try {
    if (!auth || typeof auth.token !== 'string') return true;
    const payload = decodeJwtPayload(auth.token);
    return (
      payload?.type !== 'customer' ||
      !Number.isFinite(payload?.exp) ||
      payload.exp * 1000 <= Date.now()
    );
  } catch {
    return true;
  }
}

export function clearCustomerAuth() {
  sessionStorage.removeItem(CUSTOMER_AUTH_KEY);
  localStorage.removeItem(CUSTOMER_AUTH_KEY);
  sessionStorage.removeItem(LEGACY_CUSTOMER_SESSION_ID_KEY);
  localStorage.removeItem(LEGACY_CUSTOMER_SESSION_ID_KEY);
}

export function readCustomerAuth() {
  sessionStorage.removeItem(LEGACY_CUSTOMER_SESSION_ID_KEY);
  localStorage.removeItem(LEGACY_CUSTOMER_SESSION_ID_KEY);

  for (const storage of [sessionStorage, localStorage]) {
    const raw = storage.getItem(CUSTOMER_AUTH_KEY);
    if (!raw) continue;

    try {
      const auth = JSON.parse(raw);
      if (isStoredCustomerJwtInvalid(auth)) {
        storage.removeItem(CUSTOMER_AUTH_KEY);
        continue;
      }
      return auth;
    } catch {
      storage.removeItem(CUSTOMER_AUTH_KEY);
    }
  }

  return null;
}

export function writeCustomerAuth(auth) {
  if (isStoredCustomerJwtInvalid(auth)) {
    clearCustomerAuth();
    return false;
  }

  sessionStorage.removeItem(CUSTOMER_AUTH_KEY);
  sessionStorage.removeItem(LEGACY_CUSTOMER_SESSION_ID_KEY);
  localStorage.removeItem(LEGACY_CUSTOMER_SESSION_ID_KEY);
  const serialized = JSON.stringify(auth);
  if (localStorage.getItem(CUSTOMER_AUTH_KEY) !== serialized) {
    localStorage.setItem(CUSTOMER_AUTH_KEY, serialized);
  }
  return true;
}
