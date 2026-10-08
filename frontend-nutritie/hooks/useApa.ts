import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { localDayKey } from '../lib/dateUtils';

const legacyKeyForToday = () => `apa_${localDayKey()}`;
const mlKeyForToday = () => `apa_ml_${localDayKey()}`;
const GLASS_ML = 250;
const MAX_DAILY_ML = 20000;

export function useApa() {
  const [consumedMl, setConsumedMlState] = useState(0);
  const tinta = 8;
  const [loading, setLoading] = useState(true);
  const operationRef = useRef<Promise<number>>(Promise.resolve(0));
  const consumedMlRef = useRef(consumedMl);
  consumedMlRef.current = consumedMl;

  const loadApa = useCallback(async () => {
    setLoading(true);
    try {
      const exactStored = await AsyncStorage.getItem(mlKeyForToday());
      if (exactStored !== null) {
        const parsed = Number.parseInt(exactStored, 10);
        setConsumedMlState(Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, MAX_DAILY_ML) : 0);
        return;
      }

      // Migrare compatibilă cu versiunile care persistau doar numărul de pahare.
      const legacyStored = await AsyncStorage.getItem(legacyKeyForToday());
      const legacyGlasses = Number.parseInt(legacyStored || '0', 10);
      const migratedMl = Number.isFinite(legacyGlasses) && legacyGlasses > 0
        ? Math.min(legacyGlasses * GLASS_ML, MAX_DAILY_ML)
        : 0;
      await AsyncStorage.setItem(mlKeyForToday(), String(migratedMl));
      setConsumedMlState(migratedMl);
    } catch (error) {
      console.error('[Apă] Citirea consumului a eșuat:', error);
      setConsumedMlState(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadApa(); }, [loadApa]);

  const setConsumedMl = useCallback((value: number) => {
    const next = Math.min(MAX_DAILY_ML, Math.max(0, Math.round(Number.isFinite(value) ? value : 0)));
    consumedMlRef.current = next;
    setConsumedMlState(next);
    const operation = operationRef.current.then(async () => {
      await AsyncStorage.setItem(mlKeyForToday(), String(next));
      return next;
    });
    operationRef.current = operation.catch(() => consumedMlRef.current);
    return operation;
  }, []);

  const update = useCallback((deltaMl: number) => {
    return setConsumedMl(consumedMlRef.current + deltaMl);
  }, [setConsumedMl]);

  const adaugaPahar = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      return await update(GLASS_ML);
    } catch (error) {
      console.error('[Apă] Salvarea consumului a eșuat:', error);
      return consumedMl;
    }
  };

  const scadePahar = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      return await update(-GLASS_ML);
    } catch (error) {
      console.error('[Apă] Scăderea consumului a eșuat:', error);
      return consumedMl;
    }
  };

  return {
    consumedMl,
    pahare: consumedMl / GLASS_ML,
    tinta,
    loading,
    adaugaPahar,
    scadePahar,
    setConsumedMl,
    reload: loadApa,
  };
}
