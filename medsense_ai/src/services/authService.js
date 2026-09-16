// src/services/authService.js
import api from './api';

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

  selectPlan:     (plan, billing, email, pharmacyName) =>
    api.post('/auth/pharmacist/select-plan',    { plan, billing, email, pharmacyName }).then(r => r.data),

  forgotPassword: (email) =>
    api.post('/auth/pharmacist/forgot-password',{ email }).then(r => r.data),

  resetPassword:  (email, otp, newPassword) =>
    api.post('/auth/pharmacist/reset-password', { email, otp, newPassword }).then(r => r.data),

  // Save pharmacy details for Google-registered pharmacists (no password needed)
  updateGooglePharmacistDetails: (data) =>
    api.post('/auth/pharmacist/complete-profile', data).then(r => r.data),

  checkApprovalStatus: (email) =>
    api.get('/auth/pharmacist/status',          { params: { email } }).then(r => r.data),

  googleLogin:    (accessToken) =>
    api.post('/auth/pharmacist/google',         { accessToken }).then(r => r.data),

  getMe:          () =>
    api.get('/auth/pharmacist/me').then(r => r.data),

  logout:         () =>
    api.post('/auth/pharmacist/logout').then(r => r.data),
};
