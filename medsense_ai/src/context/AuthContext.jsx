import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { loginCustomer, registerCustomer } from '../services/customerService';

const AuthContext = createContext(null);

const AUTH_KEY = 'medsense_customer_auth';
const SESSION_ID_KEY = 'medsense_session_id';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      // Check if current session ID matches stored session ID
      const currentSessionId = sessionStorage.getItem(SESSION_ID_KEY);
      const storedSessionId = localStorage.getItem(SESSION_ID_KEY);
      
      // If session IDs don't match or no session ID exists, clear auth
      if (!currentSessionId || currentSessionId !== storedSessionId) {
        localStorage.removeItem(AUTH_KEY);
        localStorage.removeItem(SESSION_ID_KEY);
        return null;
      }
      
      const raw = localStorage.getItem(AUTH_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [authModalState, setAuthModalState] = useState({ open: false, intent: 'checkout' });
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Generate unique session ID on mount
  useEffect(() => {
    const existingSessionId = sessionStorage.getItem(SESSION_ID_KEY);
    if (!existingSessionId) {
      const newSessionId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
      sessionStorage.setItem(SESSION_ID_KEY, newSessionId);
    }
  }, []);

  useEffect(() => {
    if (user) {
      localStorage.setItem(AUTH_KEY, JSON.stringify(user));
      // Store current session ID in both storage types
      const currentSessionId = sessionStorage.getItem(SESSION_ID_KEY);
      if (currentSessionId) {
        localStorage.setItem(SESSION_ID_KEY, currentSessionId);
      }
      return;
    }
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(SESSION_ID_KEY);
  }, [user]);

  // Auto-logout on visibility change (new tab/window opened)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && user) {
        // Check if session ID still matches
        const currentSessionId = sessionStorage.getItem(SESSION_ID_KEY);
        const storedSessionId = localStorage.getItem(SESSION_ID_KEY);
        
        if (!currentSessionId || currentSessionId !== storedSessionId) {
          // Another tab/window has been opened, logout this session
          setUser(null);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [user]);

  const register = async (payload) => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const response = await registerCustomer(payload);
      setUser({
        id: response.data.customer.id,
        name: response.data.customer.name,
        email: response.data.customer.email,
        phone: response.data.customer.phone,
        city: response.data.customer.city,
        address: response.data.customer.address,
        token: response.data.token,
      });
      setAuthModalState((current) => ({ ...current, open: false }));
      return response;
    } catch (error) {
      setAuthError(error.message);
      throw error;
    } finally {
      setAuthLoading(false);
    }
  };

  const login = async (payload) => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const response = await loginCustomer(payload);
      setUser({
        id: response.data.customer.id,
        name: response.data.customer.name,
        email: response.data.customer.email,
        phone: response.data.customer.phone,
        city: response.data.customer.city,
        address: response.data.customer.address,
        token: response.data.token,
      });
      setAuthModalState((current) => ({ ...current, open: false }));
      return response;
    } catch (error) {
      setAuthError(error.message);
      throw error;
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    setAuthError('');
  };

  const openAuthModal = React.useCallback((intent = 'checkout') => {
    setAuthModalState({ open: true, intent });
    setAuthError('');
  }, []);

  const closeAuthModal = React.useCallback(() => {
    setAuthModalState((current) => ({ ...current, open: false }));
    setAuthError('');
  }, []);

  const value = useMemo(
    () => ({
      user,
      login,
      register,
      logout,
      isAuthenticated: Boolean(user),
      authModalState,
      openAuthModal,
      closeAuthModal,
      authError,
      authLoading,
    }),
    [authModalState, user, authError, authLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
