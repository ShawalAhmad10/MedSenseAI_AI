// src/hooks/usePharmacistAuth.js
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/authService';

const AUTH_KEY = 'medsense_auth_user';
const SESSION_ID_KEY = 'medsense_pharmacist_session_id';

export function usePharmacistAuth() {
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  // Read current user from storage with session validation
  const getUser = () => {
    try {
      // Check if current session ID matches stored session ID
      const currentSessionId = sessionStorage.getItem(SESSION_ID_KEY);
      const storedSessionId = localStorage.getItem(SESSION_ID_KEY);
      
      // If session IDs don't match or no session ID exists, clear auth
      if (!currentSessionId || currentSessionId !== storedSessionId) {
        localStorage.removeItem(AUTH_KEY);
        sessionStorage.removeItem(AUTH_KEY);
        localStorage.removeItem(SESSION_ID_KEY);
        sessionStorage.removeItem(SESSION_ID_KEY);
        return null;
      }
      
      const raw = localStorage.getItem(AUTH_KEY) || sessionStorage.getItem(AUTH_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const [user, setUser] = useState(getUser);

  // Generate unique session ID on mount
  useEffect(() => {
    const existingSessionId = sessionStorage.getItem(SESSION_ID_KEY);
    if (!existingSessionId) {
      const newSessionId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
      sessionStorage.setItem(SESSION_ID_KEY, newSessionId);
    }
  }, []);

  // Auto-logout on visibility change (new tab/window opened)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && user) {
        // Check if session ID still matches
        const currentSessionId = sessionStorage.getItem(SESSION_ID_KEY);
        const storedSessionId = localStorage.getItem(SESSION_ID_KEY);
        
        if (!currentSessionId || currentSessionId !== storedSessionId) {
          // Another tab/window has been opened, logout this session
          localStorage.removeItem(AUTH_KEY);
          sessionStorage.removeItem(AUTH_KEY);
          localStorage.removeItem(SESSION_ID_KEY);
          sessionStorage.removeItem(SESSION_ID_KEY);
          setUser(null);
          navigate('/pharmacist/login');
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [user, navigate]);

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

      // Clear both storages first to avoid stale tokens from previous role
      localStorage.removeItem(AUTH_KEY);
      sessionStorage.removeItem(AUTH_KEY);

      const storage = rememberMe ? localStorage : sessionStorage;
      storage.setItem(AUTH_KEY, JSON.stringify(storageData));
      
      // Store current session ID in both storage types
      const currentSessionId = sessionStorage.getItem(SESSION_ID_KEY);
      if (currentSessionId) {
        localStorage.setItem(SESSION_ID_KEY, currentSessionId);
      }
      
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

      // Clear both storages first to avoid stale tokens from previous role
      localStorage.removeItem(AUTH_KEY);
      sessionStorage.removeItem(AUTH_KEY);

      const storage = rememberMe ? localStorage : sessionStorage;
      storage.setItem(AUTH_KEY, JSON.stringify(storageData));
      
      // Store current session ID in both storage types
      const currentSessionId = sessionStorage.getItem(SESSION_ID_KEY);
      if (currentSessionId) {
        localStorage.setItem(SESSION_ID_KEY, currentSessionId);
      }
      
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
    try {
      await authService.logout();
    } catch {
      // Ignore logout API errors — always clear local state
    } finally {
      localStorage.removeItem(AUTH_KEY);
      sessionStorage.removeItem(AUTH_KEY);
      localStorage.removeItem(SESSION_ID_KEY);
      sessionStorage.removeItem(SESSION_ID_KEY);
      setUser(null);
      navigate('/pharmacist/login');
    }
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
