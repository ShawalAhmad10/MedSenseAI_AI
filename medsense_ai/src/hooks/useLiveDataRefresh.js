import { useEffect, useRef } from 'react';
import { startLiveDataRefresh } from '../services/liveDataRefresh';

export function useLiveDataRefresh(refresh, enabled = true) {
  const latest = useRef(refresh);
  latest.current = refresh;
  useEffect(() => {
    if (!enabled) return;
    return startLiveDataRefresh(() => latest.current());
  }, [enabled]);
}
