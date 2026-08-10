import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { localDayKey } from '../lib/dateUtils';

/**
 * Sursa unica a „zilei curente locale" pentru ecranele care afiseaza un jurnal
 * pe zi (BUG-001). Se actualizeaza la: mount, revenirea din background si
 * trecerea miezului noptii cu aplicatia deschisa (timer rearmat pentru
 * urmatoarea miez). Fiecare consumator primeste aceeasi valoare determinista
 * (`localDayKey(now)`), deci nu exista doua sisteme concurente de „zi".
 */
export function useCurrentDayKey(): string {
  const [dayKey, setDayKey] = useState<string>(() => localDayKey());
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const update = useCallback(() => {
    setDayKey(localDayKey());
    if (timerRef.current) clearTimeout(timerRef.current);
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);
    timerRef.current = setTimeout(
      update,
      Math.max(1000, nextMidnight.getTime() - now.getTime() + 1000),
    );
  }, []);

  useEffect(() => {
    update();

    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && next === 'active') {
        update();
      }
      appStateRef.current = next;
    });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      subscription.remove();
    };
  }, [update]);

  return dayKey;
}
