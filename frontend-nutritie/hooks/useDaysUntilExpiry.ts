/**
 * useDaysUntilExpiry.ts — Hook pentru calculul timpului rămas până la expirare.
 * Conform specificației NutriAI v7 & STEP 2.1.
 * Oferă progres 0..1, ore și zile, calcul absolut cu Date.now() și compatibilitate retroactivă.
 */

import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

export interface ExpiryInfo {
  days: number;
  hours: number;
  msLeft: number;
  progress: number;   // 1 = proaspăt, 0 = expirat (pentru bara vizuală)
  expired: boolean;
  urgent: boolean;    // < 24h rămase
  daysLeft: number | null; // compatibilitate
  refresh: () => void;
}

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export function calculateDaysUntilExpiry(expirationISO?: string | number | Date | null): number | null {
  if (!expirationISO) return null;
  try {
    const expTime = new Date(expirationISO).getTime();
    if (isNaN(expTime)) return null;
    const diffMs = expTime - Date.now();
    return Math.ceil(diffMs / DAY_MS);
  } catch {
    return null;
  }
}

export function useDaysUntilExpiry(
  expiryDate?: string | number | Date | null,
  addedDate?: string | number | Date | null,
): ExpiryInfo {
  const compute = useCallback((): Omit<ExpiryInfo, 'refresh'> => {
    if (!expiryDate) {
      return {
        days: 0,
        hours: 0,
        msLeft: 0,
        progress: 0,
        expired: true,
        urgent: false,
        daysLeft: null,
      };
    }
    const now = Date.now();
    const end = new Date(expiryDate).getTime();
    const start = addedDate ? new Date(addedDate).getTime() : now - DAY_MS * 7; // default 7 zile window dacă nu e dat

    const msLeft = end - now;
    const window = Math.max(end - start, 1);
    const clamped = Math.max(msLeft, 0);
    const days = Math.floor(clamped / DAY_MS);

    return {
      days,
      hours: Math.floor((clamped % DAY_MS) / HOUR_MS),
      msLeft,
      progress: Math.min(Math.max(clamped / window, 0), 1),
      expired: msLeft <= 0,
      urgent: msLeft > 0 && clamped < DAY_MS,
      daysLeft: calculateDaysUntilExpiry(expiryDate),
    };
  }, [expiryDate, addedDate]);

  const [info, setInfo] = useState<Omit<ExpiryInfo, 'refresh'>>(compute);

  const refresh = useCallback(() => {
    setInfo(compute());
  }, [compute]);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refresh();
      }
    });
    return () => sub.remove();
  }, [refresh]);

  return { ...info, refresh };
}

// Interpolare verde -> galben -> roșu în funcție de fracțiunea rămasă
export function expiryColor(progress: number): string {
  const p = Math.min(Math.max(progress, 0), 1);
  const hue = Math.round(p * 120); // 0 = roșu, 120 = verde
  return `hsl(${hue}, 85%, 45%)`;
}
