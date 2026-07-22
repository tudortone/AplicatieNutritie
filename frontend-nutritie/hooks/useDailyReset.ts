import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type DailyQuest = { id: string; progres: number; [key: string]: unknown };

type Options = {
  questuriAzi: DailyQuest[];
  setQuesturiAzi: React.Dispatch<React.SetStateAction<DailyQuest[]>>;
  storageKey?: string;
};

const DEFAULT_KEY = 'nutriai:last_reset_date';

const localDateKey = (date = new Date()) => {
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

export function useDailyReset({
  questuriAzi,
  setQuesturiAzi,
  storageKey = DEFAULT_KEY,
}: Options) {
  const [isResetting, setIsResetting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetIfNeeded = useCallback(async () => {
    const today = localDateKey();
    const lastReset = await AsyncStorage.getItem(storageKey);
    if (lastReset === today) return false;

    setIsResetting(true);
    setQuesturiAzi((current) =>
      current.map((quest) => ({ ...quest, progres: 0 })),
    );
    await AsyncStorage.setItem(storageKey, today);
    setIsResetting(false);
    return true;
  }, [setQuesturiAzi, storageKey]);

  const scheduleMidnightCheck = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      await resetIfNeeded();
      scheduleMidnightCheck();
    }, nextMidnightDelay());
  }, [resetIfNeeded]);

  useEffect(() => {
    resetIfNeeded();
    scheduleMidnightCheck();

    const onAppStateChange = (state: AppStateStatus) => {
      if (state === 'active') {
        resetIfNeeded();
        scheduleMidnightCheck();
      }
    };

    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => {
      subscription.remove();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resetIfNeeded, scheduleMidnightCheck]);

  return { isResetting, resetIfNeeded, questuriAzi };
}
