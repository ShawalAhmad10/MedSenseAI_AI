// src/services/api.js
import axios from 'axios';
import {
  clearPharmacistAuth,
  readPharmacistAuth,
} from './pharmacistAuthSession';

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

// ─── Request Interceptor: attach JWT token ────────────────────────────────────
api.interceptors.request.use(
  (config) => {
    try {
      const userData = readPharmacistAuth();
      if (userData?.token && !config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${userData.token}`;
      }
    } catch {
      // ignore parse errors
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Response Interceptor: handle 401 globally ───────────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const code = error.response?.data?.code;
      // Only auto-logout on expired/invalid token, not on wrong credentials
      if (['TOKEN_EXPIRED', 'INVALID_TOKEN', 'STAFF_ACCOUNT_INVALID'].includes(code)) {
        clearPharmacistAuth();
        window.location.href = '/pharmacist/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
