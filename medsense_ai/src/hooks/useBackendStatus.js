// src/hooks/useBackendStatus.js
import { useState, useEffect } from 'react';

/**
 * Checks if the backend server is reachable.
 * Shows a warning banner when backend is offline.
 */
export function useBackendStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch('/health', {
          method: 'GET',
          signal: AbortSignal.timeout(4000),
        });
        if (!cancelled) setIsOnline(res.ok);
      } catch {
        if (!cancelled) setIsOnline(false);
      } finally {
        if (!cancelled) setIsChecking(false);
      }
    }

    check();
    // Re-check every 30 seconds
    const interval = setInterval(check, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return { isOnline, isChecking };
}
