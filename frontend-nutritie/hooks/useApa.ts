import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { localDayKey } from '../lib/dateUtils';
import { useCurrentDayKey } from './useCurrentDayKey';

const legacyKeyForDay = (dayKey: string) => `apa_${dayKey}`;
const mlKeyForDay = (dayKey: string) => `apa_ml_${dayKey}`;
const GLASS_ML = 250;
const MAX_DAILY_ML = 20000;

export function useApa() {
  const dayKey = useCurrentDayKey();
  const [consumedMl, setConsumedMlState] = useState(0);
  const tinta = 8;
  const [loading, setLoading] = useState(true);
  const operationRef = useRef<Promise<number>>(Promise.resolve(0));
  const consumedMlRef = useRef(0);
  const loadedDayKeyRef = useRef(dayKey);
  const loadSeqRef = useRef(0);

  const loadApa = useCallback(async (targetDay: string = dayKey) => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    try {
      const exactStored = await AsyncStorage.getItem(mlKeyForDay(targetDay));
      if (seq !== loadSeqRef.current) return;
      if (exactStored !== null) {
        const parsed = Number.parseInt(exactStored, 10);
        const safe = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, MAX_DAILY_ML) : 0;
        loadedDayKeyRef.current = targetDay;
        consumedMlRef.current = safe;
        setConsumedMlState(safe);
        return;
      }

      // Migrare compatibilă cu versiunile care persistau doar numărul de pahare.
      const legacyStored = await AsyncStorage.getItem(legacyKeyForDay(targetDay));
      if (seq !== loadSeqRef.current) return;
      const legacyGlasses = Number.parseInt(legacyStored || '0', 10);
      const migratedMl = Number.isFinite(legacyGlasses) && legacyGlasses > 0
        ? Math.min(legacyGlasses * GLASS_ML, MAX_DAILY_ML)
        : 0;
      await AsyncStorage.setItem(mlKeyForDay(targetDay), String(migratedMl));
      if (seq !== loadSeqRef.current) return;
      loadedDayKeyRef.current = targetDay;
      consumedMlRef.current = migratedMl;
      setConsumedMlState(migratedMl);
    } catch (error) {
      if (seq !== loadSeqRef.current) return;
      console.error('[Apă] Citirea consumului a eșuat:', error);
      loadedDayKeyRef.current = targetDay;
      consumedMlRef.current = 0;
      setConsumedMlState(0);
    } finally {
      if (seq === loadSeqRef.current) {
        setLoading(false);
      }
    }
  }, [dayKey]);

  // P0-08: La schimbarea zilei (23:59 -> 00:01), resetăm sincron starea și
  // reîncărcăm cheia zilei noi ca totalul de ieri să nu contamineze ziua de azi.
  useEffect(() => {
    if (loadedDayKeyRef.current !== dayKey) {
      loadedDayKeyRef.current = dayKey;
      consumedMlRef.current = 0;
      setConsumedMlState(0);
    }
    void loadApa(dayKey);
  }, [dayKey, loadApa]);

  const setConsumedMl = useCallback((value: number) => {
    const activeDay = localDayKey();
    loadedDayKeyRef.current = activeDay;
    const next = Math.min(MAX_DAILY_ML, Math.max(0, Math.round(Number.isFinite(value) ? value : 0)));
    consumedMlRef.current = next;
    setConsumedMlState(next);
    const operation = operationRef.current.then(async () => {
      await AsyncStorage.setItem(mlKeyForDay(activeDay), String(next));
      return next;
    });
    operationRef.current = operation.catch(() => consumedMlRef.current);
    return operation;
  }, []);

  const update = useCallback((deltaMl: number) => {
    const activeDay = localDayKey();
    // Dacă ziua s-a schimbat înainte să ruleze efectul de rollover, pornim de la 0.
    const base = loadedDayKeyRef.current === activeDay ? consumedMlRef.current : 0;
    loadedDayKeyRef.current = activeDay;
    return setConsumedMl(base + deltaMl);
  }, [setConsumedMl]);

  const adaugaPahar = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      return await update(GLASS_ML);
    } catch (error) {
      console.error('[Apă] Salvarea consumului a eșuat:', error);
      return consumedMlRef.current;
    }
  };

  const scadePahar = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      return await update(-GLASS_ML);
    } catch (error) {
      console.error('[Apă] Salvarea consumului a eșuat:', error);
      return consumedMlRef.current;
    }
  };

  const pahare = Math.round(consumedMl / GLASS_ML);

  return {
    consumedMl,
    pahare,
    tinta,
    loading,
    adaugaPahar,
    scadePahar,
    setConsumedMl,
    reload: () => loadApa(localDayKey()),
  };
}
