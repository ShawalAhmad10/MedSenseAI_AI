import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Protected route for storefront pages that require authentication
 * Redirects to home page with auth modal if user is not logged in
 */
export default function ProtectedStorefrontRoute() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    // Redirect to home page - auth modal will be handled by the page itself
    return <Navigate to="/" state={{ from: location, requiresAuth: true }} replace />;
  }

  return <Outlet />;
}
