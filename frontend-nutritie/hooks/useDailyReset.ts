import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type DailyQuest = {
  id: string;
  progres: number;
  completat?: boolean;
  [key: string]: unknown;
};

/**
 * Alias păstrat pentru codul din modif-qredd-design care tipiza questurile
 * local prin QuestBase. Contractul public exportat rămâne DailyQuest.
 */
export type QuestBase = DailyQuest;

type Options<TQuest extends DailyQuest> = {
  questuriAzi: TQuest[];
  setQuesturiAzi: React.Dispatch<React.SetStateAction<TQuest[]>>;
  storageKey?: string;
};

const DEFAULT_KEY = 'nutriai:last_reset_date';

export const localDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const nextMidnightDelay = () => {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return Math.max(1000, next.getTime() - now.getTime() + 50);
};

export function useDailyReset<TQuest extends DailyQuest>({
  questuriAzi,
  setQuesturiAzi,
  storageKey = DEFAULT_KEY,
}: Options<TQuest>) {
  const [isResetting, setIsResetting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const resetIfNeeded = useCallback(async () => {
    const today = localDateKey();
    const lastReset = await AsyncStorage.getItem(storageKey);
    if (lastReset === today) return false;

    if (mountedRef.current) setIsResetting(true);
    setQuesturiAzi((current) => current.map((quest) => ({
      ...quest,
      progres: 0,
      // Defect vechi: progresul revenea la 0, dar questul rămânea bifat.
      completat: false,
    })));
    await AsyncStorage.setItem(storageKey, today);
    if (mountedRef.current) setIsResetting(false);
    return true;
  }, [setQuesturiAzi, storageKey]);

  const scheduleMidnightCheck = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        await resetIfNeeded();
      } finally {
        if (mountedRef.current) scheduleMidnightCheck();
      }
    }, nextMidnightDelay());
  }, [resetIfNeeded]);

  useEffect(() => {
    mountedRef.current = true;
    resetIfNeeded().catch((error) => console.warn('[DailyReset] Reset eșuat:', error));
    scheduleMidnightCheck();

    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        resetIfNeeded().catch((error) => console.warn('[DailyReset] Reset la revenire eșuat:', error));
        scheduleMidnightCheck();
      }
    });

    return () => {
      mountedRef.current = false;
      subscription.remove();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resetIfNeeded, scheduleMidnightCheck]);

  return { isResetting, resetIfNeeded, questuriAzi };
}
