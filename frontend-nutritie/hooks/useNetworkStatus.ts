import { useEffect, useRef, useState } from 'react';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { API_URL } from '../constants/config';

/** Monitorizează interfața de rețea și disponibilitatea reală a backendului. */
export function useNetworkStatus(pollIntervalMs = 45_000) {
  const [isConnected, setIsConnected] = useState(true);
  const [isInternetReachable, setIsInternetReachable] = useState<boolean | null>(true);
  const lastState = useRef<NetInfoState | null>(null);

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    let healthController: AbortController | null = null;
    const interval = Math.max(10_000, pollIntervalMs);

    const stopPolling = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      healthController?.abort();
      healthController = null;
    };

    const runHealthCheck = async () => {
      healthController?.abort();
      const controller = new AbortController();
      healthController = controller;
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(`${API_URL}/health`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        if (mounted && healthController === controller) setIsInternetReachable(res.ok);
      } catch {
        if (mounted && healthController === controller) setIsInternetReachable(false);
      } finally {
        clearTimeout(timeout);
        if (healthController === controller) healthController = null;
      }
    };

    const startPolling = () => {
      if (!mounted) return;
      if (timer) clearInterval(timer);
      void runHealthCheck();
      timer = setInterval(() => void runHealthCheck(), interval);
    };

    const aplicaStare = (state: NetInfoState) => {
      if (!mounted) return;
      lastState.current = state;
      setIsConnected(Boolean(state.isConnected));
      setIsInternetReachable(state.isInternetReachable);
      if (state.isConnected === false) stopPolling();
      else startPolling();
    };

    const unsubscribe = NetInfo.addEventListener(aplicaStare);
    if (lastState.current?.isConnected !== false) startPolling();

    const appSubscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        stopPolling();
        return;
      }
      NetInfo.fetch()
        .then((networkState) => {
          if (mounted) aplicaStare(networkState);
        })
        .catch(() => {
          if (mounted) {
            setIsConnected(false);
            setIsInternetReachable(false);
            stopPolling();
          }
        });
    });

    return () => {
      mounted = false;
      unsubscribe();
      stopPolling();
      appSubscription.remove();
    };
  }, [pollIntervalMs]);

  return {
    isConnected,
    isInternetReachable: isInternetReachable !== false,
    isOffline: !isConnected || isInternetReachable === false,
  };
}
