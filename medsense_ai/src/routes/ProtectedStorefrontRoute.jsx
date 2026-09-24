import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Protected route for storefront pages that require authentication
 * Redirects to home page with auth modal if user is not logged in
 */
export default function ProtectedStorefrontRoute() {
  const { authStatus, isAuthenticated, retryAuthValidation } = useAuth();
  const location = useLocation();

  if (authStatus === 'checking') {
    return <div role="status" style={{ padding: '2rem', textAlign: 'center' }}>Checking your session…</div>;
  }

  if (authStatus === 'unavailable') {
    return (
      <div role="alert" style={{ padding: '2rem', textAlign: 'center' }}>
        <p>We could not verify your customer session because the service is temporarily unavailable.</p>
        <button type="button" onClick={retryAuthValidation}>Retry</button>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Redirect to home page - auth modal will be handled by the page itself
    return <Navigate to="/" state={{ from: location, requiresAuth: true }} replace />;
  }

  return <Outlet />;
}
