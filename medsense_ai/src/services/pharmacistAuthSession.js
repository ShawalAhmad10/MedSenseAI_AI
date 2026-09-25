export const PHARMACIST_AUTH_KEY = 'medsense_auth_user';
export const LEGACY_PHARMACIST_SESSION_ID_KEY =
  'medsense_pharmacist_session_id';

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

export function isStoredJwtExpiredOrMalformed(auth) {
  try {
    if (!auth || typeof auth.token !== 'string') return true;
    const payload = decodeJwtPayload(auth.token);
    return !Number.isFinite(payload?.exp) || payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

function removeLegacySessionIds() {
  sessionStorage.removeItem(LEGACY_PHARMACIST_SESSION_ID_KEY);
  localStorage.removeItem(LEGACY_PHARMACIST_SESSION_ID_KEY);
}

export function readPharmacistAuthRecord() {
  removeLegacySessionIds();

  for (const [storage, source] of [
    [sessionStorage, 'session'],
    [localStorage, 'local'],
  ]) {
    const raw = storage.getItem(PHARMACIST_AUTH_KEY);
    if (!raw) continue;

    try {
      const auth = JSON.parse(raw);
      if (isStoredJwtExpiredOrMalformed(auth)) {
        storage.removeItem(PHARMACIST_AUTH_KEY);
        continue;
      }
      return { auth, source };
    } catch {
      storage.removeItem(PHARMACIST_AUTH_KEY);
    }
  }

  return null;
}

export function readPharmacistAuth() {
  return readPharmacistAuthRecord()?.auth ?? null;
}

export function replacePharmacistAuthIdentity(authoritativeUser) {
  const record = readPharmacistAuthRecord();
  if (!record || !authoritativeUser || typeof authoritativeUser !== 'object') {
    return null;
  }

  const auth = {
    ...authoritativeUser,
    token: record.auth.token,
    ...(record.auth.loginAt ? { loginAt: record.auth.loginAt } : {}),
  };
  const serialized = JSON.stringify(auth);
  const storage = record.source === 'session' ? sessionStorage : localStorage;

  if (storage.getItem(PHARMACIST_AUTH_KEY) !== serialized) {
    storage.setItem(PHARMACIST_AUTH_KEY, serialized);
  }

  return auth;
}

export function writePharmacistAuth(auth, rememberMe = false) {
  if (isStoredJwtExpiredOrMalformed(auth)) {
    clearPharmacistAuth();
    return false;
  }

  removeLegacySessionIds();
  const serialized = JSON.stringify(auth);

  if (rememberMe) {
    sessionStorage.removeItem(PHARMACIST_AUTH_KEY);
    localStorage.setItem(PHARMACIST_AUTH_KEY, serialized);
  } else {
    localStorage.removeItem(PHARMACIST_AUTH_KEY);
    sessionStorage.setItem(PHARMACIST_AUTH_KEY, serialized);
  }

  return true;
}

export function clearPharmacistAuth() {
  sessionStorage.removeItem(PHARMACIST_AUTH_KEY);
  localStorage.removeItem(PHARMACIST_AUTH_KEY);
  removeLegacySessionIds();
}
