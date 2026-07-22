import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGamificare } from './useGamificare';

const LAST_OPENED_DATE_KEY = 'nutriai_last_opened_date';
const DAILY_TEMP_KEYS_TO_RESET = [
  'nutriai_temp_calorii_azi',
  'nutriai_apa_azi_ml',
  'nutriai_mese_cache_azi',
];

export interface DailySyncResult {
  isNewDay: boolean;
  previousDate: string | null;
  currentDate: string;
}

/**
 * Hook global useDailySync
 * Rulează la pornirea aplicației și la revenirea din background (când AppState devine 'active').
 * Compară data curentă cu `lastOpenedDate` din AsyncStorage și execută resetările zilnice necesare.
 */
export function useDailySync(onNewDayDetected?: (result: DailySyncResult) => void) {
  const appState = useRef(AppState.currentState);
  const isChecking = useRef(false);
  const { refreshGamificare } = useGamificare();

  const getTodayString = () => new Date().toISOString().split('T')[0];

  const getYesterdayString = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  };

  const checkDailySync = useCallback(async () => {
    if (isChecking.current) return;
    isChecking.current = true;

    try {
      const today = getTodayString();
      const lastOpenedDate = await AsyncStorage.getItem(LAST_OPENED_DATE_KEY);

      if (lastOpenedDate !== today) {
        if (__DEV__) console.log(`[useDailySync] Zi nouă detectată: ${today} (precedentă: ${lastOpenedDate || 'niciuna'})`);

        // 1. Dacă există o dată anterioară, curățăm contoarele locale temporare zilnice
        if (lastOpenedDate) {
          try {
            await AsyncStorage.multiRemove(DAILY_TEMP_KEYS_TO_RESET);
          } catch (e) {
            console.warn('[useDailySync] Eroare la ștergerea cheilor temporare zilnice:', e);
          }
        }

        // 2. Verificăm continuitatea streak-ului local (dacă ultima deschidere e mai veche de ieri)
        if (lastOpenedDate && lastOpenedDate !== getYesterdayString()) {
          if (__DEV__) console.log('[useDailySync] O zi sau mai multe au fost sărite anterior. Verificare sincronizare streak cu serverul...');
        }

        // 3. Actualizăm `lastOpenedDate` la ziua curentă
        await AsyncStorage.setItem(LAST_OPENED_DATE_KEY, today);

        // 4. Reîmprospătăm starea de gamificare / quest-uri / obiective din context
        try {
          await refreshGamificare();
        } catch (e) {
          console.warn('[useDailySync] Eroare la refresh gamificare:', e);
        }

        // 5. Apelăm callback-ul (dacă a fost transmis)
        if (onNewDayDetected) {
          onNewDayDetected({
            isNewDay: true,
            previousDate: lastOpenedDate,
            currentDate: today,
          });
        }
      }
    } catch (error) {
      console.error('[useDailySync] Eroare în timpul verificării zilnice:', error);
    } finally {
      isChecking.current = false;
    }
  }, [onNewDayDetected, refreshGamificare]);

  useEffect(() => {
    // Verificare inițială la montarea root-ului
    checkDailySync();

    // Ascultător pentru tranziția aplicației din background/inactive în active
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        checkDailySync();
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [checkDailySync]);

  return { checkDailySync };
}
