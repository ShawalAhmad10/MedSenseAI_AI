// src/services/authService.js
import api from './api';

export const PHARMACIST_GOOGLE_ONBOARDING_KEY =
  'medsense_pharmacist_google_onboarding';

function decodeJwtPayload(token) {
  const encodedPayload = token.split('.')[1];
  const base64 = encodedPayload
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padded = base64.padEnd(
    Math.ceil(base64.length / 4) * 4,
    '='
  );

  return JSON.parse(atob(padded));
}

function isUsablePharmacistOnboarding(context) {
  const payload = decodeJwtPayload(context?.onboardingToken ?? '');

  return Boolean(
    context?.email &&
    context?.id &&
    payload?.type === 'pharmacist_onboarding' &&
    payload?.id === context.id &&
    payload?.email === context.email &&
    Number.isFinite(payload?.exp) &&
    payload.exp * 1000 > Date.now()
  );
}

export function clearPharmacistGoogleOnboarding() {
  sessionStorage.removeItem(PHARMACIST_GOOGLE_ONBOARDING_KEY);
}

export function savePharmacistGoogleOnboarding(data) {
  const context = {
    onboardingToken: data?.onboardingToken,
    email: data?.email,
    fullName: data?.fullName ?? '',
    id: data?.id,
  };

  try {
    if (!isUsablePharmacistOnboarding(context)) {
      clearPharmacistGoogleOnboarding();
      return false;
    }
  } catch {
    clearPharmacistGoogleOnboarding();
    return false;
  }

  sessionStorage.setItem(
    PHARMACIST_GOOGLE_ONBOARDING_KEY,
    JSON.stringify(context)
  );
  return true;
}

export function getPharmacistGoogleOnboarding() {
  try {
    const raw = sessionStorage.getItem(
      PHARMACIST_GOOGLE_ONBOARDING_KEY
    );
    if (!raw) return null;

    const context = JSON.parse(raw);
    if (!isUsablePharmacistOnboarding(context)) {
      clearPharmacistGoogleOnboarding();
      return null;
    }

    return context;
  } catch {
    clearPharmacistGoogleOnboarding();
    return null;
  }
}

/**
 * Auth Service
 * Pharmacist → /api/auth/pharmacist/...
 */
export const authService = {

  // ── Pharmacist Auth ────────────────────────────────────────────────────────

  login:          (email, password) =>
    api.post('/auth/pharmacist/login',          { email, password }).then(r => r.data),

  register:       (data) =>
    api.post('/auth/pharmacist/register',       data).then(r => r.data),

  resendOtp:      (email) =>
    api.post('/auth/pharmacist/resend-otp',     { email }).then(r => r.data),

  verifyOtp:      (email, otp) =>
    api.post('/auth/pharmacist/verify-otp',     { email, otp }).then(r => r.data),

  selectPlan:     (plan, billing, registrationToken) =>
    api.post(
      '/auth/pharmacist/select-plan',
      { plan, billing },
      {
        headers: {
          Authorization:
            'Bearer ' + registrationToken,
        },
      }
    ).then(r => r.data),

  forgotPassword: (email) =>
    api.post('/auth/pharmacist/forgot-password',{ email }).then(r => r.data),

  resetPassword:  (email, otp, newPassword) =>
    api.post('/auth/pharmacist/reset-password', { email, otp, newPassword }).then(r => r.data),

  // Save pharmacy details for Google-registered pharmacists (no password needed)
  updateGooglePharmacistDetails: (data, onboardingToken) =>
    api.post(
      '/auth/pharmacist/complete-profile',
      data,
      {
        headers: {
          Authorization: `Bearer ${onboardingToken}`,
        },
      }
    ).then(r => r.data),

  checkApprovalStatus: (token) =>
    api.get(
      '/auth/pharmacist/status',
      {
        headers: {
          Authorization:
            'Bearer ' + token,
        },
      }
    ).then(r => r.data),

  googleLogin:    (accessToken) =>
    api.post('/auth/pharmacist/google',         { accessToken }).then(r => r.data),

  getMe:          () =>
    api.get('/auth/pharmacist/me').then(r => r.data),

  logout:         () =>
    api.post('/auth/pharmacist/logout').then(r => r.data),
};
