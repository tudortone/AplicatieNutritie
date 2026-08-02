import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { localDayKey } from '../lib/dateUtils';

const keyForToday = () => `apa_${localDayKey()}`;

export function useApa() {
  const [pahare, setPahareState] = useState(0);
  const tinta = 8;
  const [loading, setLoading] = useState(true);
  const operationRef = useRef<Promise<number>>(Promise.resolve(0));
  // Ref pentru valoarea curenta (evita closure invechit)
  // in .catch(() => pahare) din lantul de operatii.
  const pahareRef = useRef(pahare);
  pahareRef.current = pahare;

  const loadApa = useCallback(async () => {
    setLoading(true);
    try {
      const stored = await AsyncStorage.getItem(keyForToday());
      const parsed = Number.parseInt(stored || '0', 10);
      setPahareState(Number.isFinite(parsed) && parsed > 0 ? parsed : 0);
    } catch (error) {
      console.error('[Apă] Citirea consumului a eșuat:', error);
      setPahareState(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadApa(); }, [loadApa]);

  const update = useCallback((delta: number) => {
    const operation = operationRef.current.then(async () => {
      const key = keyForToday();
      const stored = await AsyncStorage.getItem(key);
      const current = Math.max(0, Number.parseInt(stored || '0', 10) || 0);
      const next = Math.max(0, current + delta);
      await AsyncStorage.setItem(key, String(next));
      setPahareState(next);
      return next;
    });
    operationRef.current = operation.catch(() => pahareRef.current);
    return operation;
  }, []);

  const adaugaPahar = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      return await update(1);
    } catch (error) {
      console.error('[Apă] Salvarea consumului a eșuat:', error);
      return pahare;
    }
  };

  const scadePahar = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      return await update(-1);
    } catch (error) {
      console.error('[Apă] Scăderea consumului a eșuat:', error);
      return pahare;
    }
  };

  return { pahare, tinta, loading, adaugaPahar, scadePahar, reload: loadApa };
}
