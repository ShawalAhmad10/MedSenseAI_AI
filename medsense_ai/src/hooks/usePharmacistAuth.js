// src/hooks/usePharmacistAuth.js
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/authService';
import {
  PHARMACIST_AUTH_KEY,
  clearPharmacistAuth,
  readPharmacistAuth,
  writePharmacistAuth,
} from '../services/pharmacistAuthSession';

export function usePharmacistAuth() {
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const getUser = () => readPharmacistAuth();

  const [user, setUser] = useState(getUser);

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key === PHARMACIST_AUTH_KEY && event.storageArea === localStorage) {
        const currentUser = readPharmacistAuth();
        setUser(currentUser);
        if (!currentUser) {
          navigate('/pharmacist/login', { replace: true });
        }
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [navigate]);

  /**
   * Login with email + password
   * Calls the real backend, stores JWT + user data
   */
  const login = async (email, password, rememberMe = false) => {
    setIsLoading(true);
    try {
      const response = await authService.login(email, password);

      if (!response.success) {
        throw new Error(response.message || 'Login failed');
      }

      const { token, user: userData } = response.data;

      // Store token alongside user data
      const storageData = {
        ...userData,
        token,
        loginAt: new Date().toISOString(),
      };

      writePharmacistAuth(storageData, rememberMe);
      setUser(storageData);
      navigate('/pharmacist/dashboard');
    } catch (err) {
      // Re-throw with backend message if available
      const message =
        err.response?.data?.message || err.message || 'Invalid credentials';
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Google OAuth login
   * Pass the Google ID token from the Google Sign-In SDK
   */
  const googleLogin = async (idToken, rememberMe = false) => {
    setIsLoading(true);
    try {
      const response = await authService.googleLogin(idToken);

      if (!response.success) {
        throw new Error(response.message || 'Google login failed');
      }

      const { token, user: userData } = response.data;

      const storageData = {
        ...userData,
        token,
        loginAt: new Date().toISOString(),
      };

      writePharmacistAuth(storageData, rememberMe);
      setUser(storageData);

      // If pending approval, redirect there
      if (userData.status === 'pending') {
        navigate('/pharmacist/pending-approval');
      } else {
        navigate('/pharmacist/dashboard');
      }
    } catch (err) {
      const message =
        err.response?.data?.message || err.message || 'Google login failed';
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    clearPharmacistAuth();
    setUser(null);
    navigate('/pharmacist/login', { replace: true });
  };

  const isAuthenticated = !!user;

  return {
    login,
    googleLogin,
    logout,
    isLoading,
    user,
    isAuthenticated,
    getUser,
  };
}
