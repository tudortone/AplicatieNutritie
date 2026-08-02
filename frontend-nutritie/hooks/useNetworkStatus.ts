import { useEffect, useState, useRef } from 'react';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { AppState } from 'react-native';

/**
 * Monitorizează starea conectivității.
 * Folosește NetInfo pentru detecție instantă + un health-check periodic
 * către backend ca verificare de layer 7 (detectează captive portals, DNS failure etc.).
 */
export function useNetworkStatus(pollIntervalMs = 45_000) {
  const [isConnected, setIsConnected] = useState(true);
  const [isInternetReachable, setIsInternetReachable] = useState<boolean | null>(true);
  const lastState = useRef<NetInfoState | null>(null);

  useEffect(() => {
    // NetInfo oferă detecție la nivel de interfață (WiFi / Cellular on/off)
    const unsubscribe = NetInfo.addEventListener((state) => {
      lastState.current = state;
      setIsConnected(Boolean(state.isConnected));
      setIsInternetReachable(state.isInternetReachable);
    });

    // Health-check periodic: dacă NetInfo spune că suntem conectați dar API-ul nu răspunde,
    // probabil e un captive portal sau DNS failure. Marcăm ca offline.
    let timer: ReturnType<typeof setInterval> | null = null;
    let mounted = true;

    const runHealthCheck = async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        // Folosim un URL cunoscut care răspunde rapid (fără auth).
        const res = await fetch('https://clients3.google.com/generate_204', {
          method: 'HEAD',
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (mounted) setIsInternetReachable(res.ok);
      } catch {
        if (mounted) setIsInternetReachable(false);
      }
    };

    const startPolling = () => {
      if (timer) clearInterval(timer);
      runHealthCheck();
      timer = setInterval(runHealthCheck, pollIntervalMs);
    };

    const stopPolling = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    // Pornim polling doar când NetInfo raportează conectat.
    // Dacă NetInfo spune offline, oprim polling-ul (baterie).
    if (lastState.current?.isConnected !== false) {
      startPolling();
    }

    const appSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        // La revenirea din background, forțăm o reîmprospătare NetInfo
        NetInfo.fetch().then((s) => {
          lastState.current = s;
          if (mounted) {
            setIsConnected(Boolean(s.isConnected));
            setIsInternetReachable(s.isInternetReachable);
          }
          if (s.isConnected !== false) {
            startPolling();
          } else {
            stopPolling();
          }
        });
      } else {
        stopPolling();
      }
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
