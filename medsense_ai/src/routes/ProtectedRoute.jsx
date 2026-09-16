// src/routes/ProtectedRoute.jsx
import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';

const AUTH_KEY = 'medsense_auth_user';
const SESSION_ID_KEY = 'medsense_pharmacist_session_id';

/**
 * ProtectedRoute — requires pharmacist authentication to access dashboard.
 * Validates session ID to ensure single active session.
 */
export default function ProtectedRoute() {
  // Check if current session ID matches stored session ID
  const currentSessionId = sessionStorage.getItem(SESSION_ID_KEY);
  const storedSessionId = localStorage.getItem(SESSION_ID_KEY);
  
  // If session IDs don't match, clear auth and redirect
  if (!currentSessionId || currentSessionId !== storedSessionId) {
    localStorage.removeItem(AUTH_KEY);
    sessionStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(SESSION_ID_KEY);
    sessionStorage.removeItem(SESSION_ID_KEY);
    return <Navigate to="/pharmacist/login" replace />;
  }
  
  // Check if user exists in storage
  const userRaw = localStorage.getItem(AUTH_KEY) || sessionStorage.getItem(AUTH_KEY);
  const isAuthenticated = !!userRaw;

  if (!isAuthenticated) {
    return <Navigate to="/pharmacist/login" replace />;
  }

  return <Outlet />;
}
