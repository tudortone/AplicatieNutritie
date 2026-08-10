import { useEffect, useRef, useCallback } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGamificareActions } from '../context/GamificareContext';
import { localDayKey } from '../lib/dateUtils';

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
 * Sincronizează resetările zilnice la pornire și la revenirea din background.
 * Toate cheile de zi sunt calculate în fusul local, nu în UTC.
 */
export function useDailySync(onNewDayDetected?: (result: DailySyncResult) => void) {
  const appState = useRef(AppState.currentState);
  const isChecking = useRef(false);
  const { refreshGamificare } = useGamificareActions();

  const checkDailySync = useCallback(async () => {
    if (isChecking.current) return;
    isChecking.current = true;

    try {
      const now = new Date();
      const today = localDayKey(now);
      const yesterdayDate = new Date(now);
      // setDate păstrează ziua calendaristică locală și funcționează corect la DST.
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const yesterday = localDayKey(yesterdayDate);
      const lastOpenedDate = await AsyncStorage.getItem(LAST_OPENED_DATE_KEY);

      if (lastOpenedDate !== today) {
        if (__DEV__) {
          console.log(`[useDailySync] Zi nouă locală: ${today} (precedentă: ${lastOpenedDate || 'niciuna'})`);
        }

        if (lastOpenedDate) {
          try {
            await AsyncStorage.multiRemove(DAILY_TEMP_KEYS_TO_RESET);
          } catch (error) {
            console.warn('[useDailySync] Curățarea contoarelor zilnice a eșuat:', error);
          }
        }

        if (lastOpenedDate && lastOpenedDate !== yesterday && __DEV__) {
          console.log('[useDailySync] A fost sărită cel puțin o zi; gamificarea va fi resincronizată.');
        }

        // Salvăm data numai după curățarea reușită a stării temporare.
        await AsyncStorage.setItem(LAST_OPENED_DATE_KEY, today);

        try {
          await refreshGamificare();
        } catch (error) {
          console.warn('[useDailySync] Refresh-ul gamificării a eșuat:', error);
        }

        onNewDayDetected?.({
          isNewDay: true,
          previousDate: lastOpenedDate,
          currentDate: today,
        });
      }
    } catch (error) {
      console.error('[useDailySync] Verificarea zilnică a eșuat:', error);
    } finally {
      isChecking.current = false;
    }
  }, [onNewDayDetected, refreshGamificare]);

  useEffect(() => {
    checkDailySync();

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        checkDailySync();
      }
      appState.current = nextAppState;
    });

    return () => subscription.remove();
  }, [checkDailySync]);

  return { checkDailySync };
}
