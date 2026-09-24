// src/routes/ProtectedRoute.jsx
import React, { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { authService } from '../services/authService';
import {
  PHARMACIST_AUTH_KEY,
  clearPharmacistAuth,
  readPharmacistAuthRecord,
  replacePharmacistAuthIdentity,
} from '../services/pharmacistAuthSession';

export default function ProtectedRoute() {
  const [validationAttempt, setValidationAttempt] = useState(0);
  const [sessionState, setSessionState] = useState(() => {
    const record = readPharmacistAuthRecord();
    return record
      ? { status: 'checking', source: record.source }
      : { status: 'unauthenticated', source: null };
  });

  useEffect(() => {
    let cancelled = false;

    async function validateSession() {
      const record = readPharmacistAuthRecord();
      if (!record) {
        if (!cancelled) {
          setSessionState({ status: 'unauthenticated', source: null });
        }
        return;
      }

      setSessionState({ status: 'checking', source: record.source });

      try {
        const response = await authService.getMe();
        if (!cancelled && response?.success) {
          replacePharmacistAuthIdentity(response.data);
          setSessionState({ status: 'authenticated', source: record.source });
        } else if (!cancelled) {
          clearPharmacistAuth();
          setSessionState({ status: 'unauthenticated', source: null });
        }
      } catch (error) {
        if (cancelled) return;

        const status = error.response?.status;
        if (status === 401 || status === 403) {
          clearPharmacistAuth();
          setSessionState({ status: 'unauthenticated', source: null });
          return;
        }

        setSessionState({ status: 'unavailable', source: record.source });
      }
    }

    validateSession();
    return () => { cancelled = true; };
  }, [validationAttempt]);

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key !== PHARMACIST_AUTH_KEY || event.storageArea !== localStorage) {
        return;
      }

      if (event.newValue === null) {
        setSessionState((current) => (
          current.source === 'local'
            ? { status: 'unauthenticated', source: null }
            : current
        ));
        return;
      }

      setValidationAttempt((attempt) => attempt + 1);
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  if (sessionState.status === 'checking') {
    return <div role="status" style={{ padding: '2rem', textAlign: 'center' }}>Checking your session…</div>;
  }

  if (sessionState.status === 'unauthenticated') {
    return <Navigate to="/pharmacist/login" replace />;
  }

  if (sessionState.status === 'unavailable') {
    return (
      <div role="alert" style={{ padding: '2rem', textAlign: 'center' }}>
        <p>We could not verify your session because the service is temporarily unavailable.</p>
        <button type="button" onClick={() => setValidationAttempt((attempt) => attempt + 1)}>
          Retry
        </button>
      </div>
    );
  }

  return <Outlet />;
}
