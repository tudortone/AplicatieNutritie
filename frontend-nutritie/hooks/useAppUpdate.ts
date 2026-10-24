import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { checkForAppUpdate, openAppStore, type VersionCheckResult } from '../lib/versionCheck';

const RESUME_INTERVAL_MS = 60000;

export function useUpdatePolicy(enabled: boolean) {
  const [result, setResult] = useState<VersionCheckResult | null>(null);
  const dismissed = useRef<number | null>(null);
  useEffect(() => {
    if (!enabled) { setResult(null); return; }
    let active = true;
    let pending = false;
    let lastCheck: number | null = null;
    const check = async () => {
      if (pending || (lastCheck !== null && Date.now() - lastCheck < RESUME_INTERVAL_MS)) return;
      pending = true; lastCheck = Date.now();
      try {
        const next = await checkForAppUpdate();
        if (active) setResult(next.needsOptionalUpdate && next.updateInfo?.latestVersionCode !== dismissed.current ? next : null);
      } catch { if (active) setResult(null); }
      finally { pending = false; }
    };
    void check();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void check(); });
    return () => { active = false; subscription.remove(); };
  }, [enabled]);
  return { result, dismiss: () => { dismissed.current = result?.updateInfo?.latestVersionCode ?? null; setResult(null); } };
}

export function usePlayDestination() {
  const lock = useRef(false);
  const live = useRef(true);
  const [opening, setOpening] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const open = async () => {
    if (lock.current) return;
    lock.current = true; setOpening(true); setFailed(false);
    try { const opened = await openAppStore(); if (live.current) setFailed(!opened); }
    catch { if (live.current) setFailed(true); }
    finally { lock.current = false; if (live.current) setOpening(false); }
  };
  return { opening, failed, open };
}
