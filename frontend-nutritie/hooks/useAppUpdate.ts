import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';
import { checkForAppUpdate, openAppStore, type VersionCheckResult } from '../lib/versionCheck';

const RESUME_INTERVAL_MS = 60000;

function isForcedPolicy(result: VersionCheckResult | null | undefined): boolean {
  return Boolean(result?.needsForceUpdate || result?.requiresUpdate);
}

export function useUpdatePolicy(enabled: boolean) {
  const [result, setResult] = useState<VersionCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const dismissed = useRef<number | null>(null);
  const pending = useRef(false);
  const lastCheck = useRef<number | null>(null);
  const active = useRef(true);
  const blocked = useRef(false);

  const runCheck = useCallback(async (forceImmediate: boolean, showSpinner: boolean) => {
    if (!enabled || pending.current) return;
    if (
      !forceImmediate
      && !blocked.current
      && lastCheck.current !== null
      && Date.now() - lastCheck.current < RESUME_INTERVAL_MS
    ) {
      return;
    }
    pending.current = true;
    lastCheck.current = Date.now();
    if (showSpinner && active.current) setChecking(true);
    try {
      const next = await checkForAppUpdate();
      if (!active.current) return;
      const forced = isForcedPolicy(next);
      blocked.current = forced;
      const shouldShow =
        forced || (next.needsOptionalUpdate && next.updateInfo?.latestVersionCode !== dismissed.current);
      setResult(shouldShow ? next : null);
    } catch {
      if (active.current && !blocked.current) setResult(null);
    } finally {
      pending.current = false;
      if (showSpinner && active.current) setChecking(false);
    }
  }, [enabled]);

  useEffect(() => {
    active.current = true;
    if (!enabled) {
      blocked.current = false;
      setResult(null);
      return () => {
        active.current = false;
      };
    }
    lastCheck.current = null;
    void runCheck(true, false);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void runCheck(false, false);
    });
    return () => {
      active.current = false;
      subscription.remove();
    };
  }, [enabled, runCheck]);

  const dismiss = useCallback(() => {
    if (blocked.current || isForcedPolicy(result)) return;
    dismissed.current = result?.updateInfo?.latestVersionCode ?? null;
    setResult(null);
  }, [result]);

  const recheck = useCallback(() => {
    void runCheck(true, true);
  }, [runCheck]);

  return { result, checking, recheck, dismiss };
}

export function useOtaUpdate(enabled: boolean) {
  const [otaUpdating, setOtaUpdating] = useState(false);
  const otaPending = useRef(false);
  const lastCheck = useRef<number | null>(null);

  useEffect(() => {
    const isDevBuild = typeof __DEV__ !== 'undefined' && __DEV__;
    const canCheckOta =
      enabled
      && Boolean(Updates?.isEnabled)
      && !isDevBuild
      && process.env.EXPO_PUBLIC_APP_ENV !== 'qa';
    if (!canCheckOta) return;

    let active = true;
    const checkAndApplyOta = async (force: boolean) => {
      if (otaPending.current) return;
      if (!force && lastCheck.current !== null && Date.now() - lastCheck.current < RESUME_INTERVAL_MS) {
        return;
      }
      otaPending.current = true;
      lastCheck.current = Date.now();
      try {
        const update = await Updates.checkForUpdateAsync();
        if (!active || !update?.isAvailable) return;
        setOtaUpdating(true);
        await Updates.fetchUpdateAsync();
        if (!active) return;
        await Updates.reloadAsync();
      } catch {
        if (active) setOtaUpdating(false);
      } finally {
        otaPending.current = false;
      }
    };

    void checkAndApplyOta(true);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkAndApplyOta(false);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [enabled]);

  return { otaUpdating };
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
