// src/services/api.js
import axios from 'axios';

const AUTH_KEY = 'medsense_auth_user';

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

// ─── Request Interceptor: attach JWT token ────────────────────────────────────
api.interceptors.request.use(
  (config) => {
    try {
      // sessionStorage takes priority (more recent login)
      const raw = sessionStorage.getItem(AUTH_KEY) || localStorage.getItem(AUTH_KEY);
      if (raw) {
        const userData = JSON.parse(raw);
        if (userData?.token) {
          config.headers.Authorization = `Bearer ${userData.token}`;
        }
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
      if (code === 'TOKEN_EXPIRED' || error.response?.data?.message === 'Invalid token.') {
        localStorage.removeItem(AUTH_KEY);
        sessionStorage.removeItem(AUTH_KEY);
        window.location.href = '/pharmacist/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
