import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  getCurrentCustomerProfile,
  loginCustomer,
  registerCustomer,
} from '../services/customerService';
import {
  CUSTOMER_AUTH_KEY,
  clearCustomerAuth,
  readCustomerAuth,
  writeCustomerAuth,
} from '../services/customerAuthSession';
import { updateMyCustomerProfile } from '../services/storefrontAccountService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authStatus, setAuthStatus] = useState(() => (
    readCustomerAuth() ? 'checking' : 'anonymous'
  ));
  const [authModalState, setAuthModalState] = useState({ open: false, intent: 'checkout' });
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const validateStoredCustomer = useCallback(async () => {
    const stored = readCustomerAuth();
    if (!stored) {
      setUser(null);
      setAuthStatus('anonymous');
      return;
    }

    setAuthStatus('checking');
    try {
      const response = await getCurrentCustomerProfile(stored.token);
      if (!response?.success || !response.data) {
        clearCustomerAuth();
        setUser(null);
        setAuthStatus('anonymous');
        return;
      }

      const authoritativeUser = {
        ...response.data,
        token: stored.token,
      };
      writeCustomerAuth(authoritativeUser);
      setUser(authoritativeUser);
      setAuthStatus('authenticated');
    } catch (error) {
      const status = error.response?.status;
      if (status === 401 || status === 403) {
        clearCustomerAuth();
        setUser(null);
        setAuthStatus('anonymous');
        return;
      }

      setUser(null);
      setAuthStatus('unavailable');
    }
  }, []);

  useEffect(() => {
    validateStoredCustomer();
  }, [validateStoredCustomer]);

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key !== CUSTOMER_AUTH_KEY || event.storageArea !== localStorage) return;
      if (event.newValue === null) {
        setUser(null);
        setAuthStatus('anonymous');
        return;
      }
      validateStoredCustomer();
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [validateStoredCustomer]);

  const register = async (payload) => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const response = await registerCustomer(payload);
      const authenticatedUser = {
        id: response.data.customer.id,
        name: response.data.customer.name,
        email: response.data.customer.email,
        phone: response.data.customer.phone,
        city: response.data.customer.city,
        address: response.data.customer.address,
        token: response.data.token,
      };
      if (!writeCustomerAuth(authenticatedUser)) {
        throw new Error('Invalid customer authentication response');
      }
      setUser(authenticatedUser);
      setAuthStatus('authenticated');
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
      const authenticatedUser = {
        id: response.data.customer.id,
        name: response.data.customer.name,
        email: response.data.customer.email,
        phone: response.data.customer.phone,
        city: response.data.customer.city,
        address: response.data.customer.address,
        token: response.data.token,
      };
      if (!writeCustomerAuth(authenticatedUser)) {
        throw new Error('Invalid customer authentication response');
      }
      setUser(authenticatedUser);
      setAuthStatus('authenticated');
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
    clearCustomerAuth();
    setUser(null);
    setAuthStatus('anonymous');
    setAuthError('');
  };

  const updateProfile = useCallback(async (profile) => {
    const stored = readCustomerAuth();
    if (!stored) throw new Error('Your session has expired. Please sign in again.');
    const updated = await updateMyCustomerProfile(profile);
    const current = readCustomerAuth();
    if (!current || current.token !== stored.token) throw new Error('Your session changed. Please sign in again.');
    const refreshed = { ...current, ...updated, token: current.token };
    if (!writeCustomerAuth(refreshed)) throw new Error('Your session has expired. Please sign in again.');
    setUser(refreshed);
    return updated;
  }, []);

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
      updateProfile,
      isAuthenticated: authStatus === 'authenticated' && Boolean(user),
      authStatus,
      retryAuthValidation: validateStoredCustomer,
      authModalState,
      openAuthModal,
      closeAuthModal,
      authError,
      authLoading,
    }),
    [authModalState, user, authError, authLoading, authStatus, validateStoredCustomer, updateProfile],
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
