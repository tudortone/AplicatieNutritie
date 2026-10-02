import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { activeSessionKey } from '../../lib/workout-v2/storageKeys';
import type { ActiveWorkoutSession } from '../../lib/workout-v2/sessionModel';

export function useActiveWorkout(ownerId: string | null) {
  const [session, setSessionState] = useState<ActiveWorkoutSession | null>(null);
  const [loading, setLoading] = useState(Boolean(ownerId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!ownerId) {
        if (active) { setSessionState(null); setLoading(false); }
        return;
      }
      setLoading(true);
      try {
        const raw = await AsyncStorage.getItem(activeSessionKey(ownerId));
        if (active) setSessionState(raw ? JSON.parse(raw) as ActiveWorkoutSession : null);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'ACTIVE_SESSION_LOAD_FAILED');
      } finally {
        if (active) setLoading(false);
      }
    };
    load().catch(() => undefined);
    return () => { active = false; };
  }, [ownerId]);

  const setSession = useCallback(async (next: ActiveWorkoutSession) => {
    if (!ownerId || next.ownerId !== ownerId) throw new Error('OWNER_MISMATCH');
    await AsyncStorage.setItem(activeSessionKey(ownerId), JSON.stringify(next));
    setSessionState(next);
  }, [ownerId]);

  const clearSession = useCallback(async () => {
    if (!ownerId) throw new Error('OWNER_ID_REQUIRED');
    await AsyncStorage.removeItem(activeSessionKey(ownerId));
    setSessionState(null);
  }, [ownerId]);

  return { session, loading, error, setSession, clearSession };
}
