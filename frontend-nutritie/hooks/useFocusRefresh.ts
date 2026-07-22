import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';

/**
 * Hook generic care apellează `refreshFn` la focus, dar cu throttle
 * — previne bombardarea Supabase la tab-switch rapid sau tap repetat.
 *
 * @param refreshFn  Funcția de refresh (ex: refresh din useMeseAzi)
 * @param minInterval  Milisecunde minime între două refresh-uri (default: 5s)
 * @param deps  Dependency array (trebuie să includă refreshFn)
 */
export function useFocusRefresh(
  refreshFn: () => void | Promise<void>,
  minInterval = 5000,
  deps: React.DependencyList = [],
) {
  const lastRefreshRef = useRef(0);

  const throttledRefresh = useCallback(() => {
    const now = Date.now();
    if (now - lastRefreshRef.current < minInterval) return; // throttle
    lastRefreshRef.current = now;
    refreshFn();
  }, [refreshFn, minInterval]);

  useFocusEffect(
    useCallback(() => {
      throttledRefresh();
    }, [throttledRefresh, ...deps])
  );
}
