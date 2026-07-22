import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

export function useApa() {
  const getTodayKey = () => `apa_${new Date().toISOString().split('T')[0]}`;
  
  const [pahare, setPahareState] = useState<number>(0);
  const tinta = 8;
  const [loading, setLoading] = useState<boolean>(true);

  const loadApa = useCallback(async () => {
    setLoading(true);
    try {
      const stored = await AsyncStorage.getItem(getTodayKey());
      if (stored) {
        setPahareState(parseInt(stored, 10));
      } else {
        setPahareState(0);
      }
    } catch (e) {
      console.error('Eroare la citirea consumului de apă:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadApa();
  }, [loadApa]);

  const adaugaPahar = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const next = pahare + 1;
      setPahareState(next);
      await AsyncStorage.setItem(getTodayKey(), String(next));
      return next;
    } catch (e) {
      console.error('Eroare la salvarea apei:', e);
      return pahare;
    }
  };

  const scadePahar = async () => {
    try {
      if (pahare <= 0) return 0;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const next = pahare - 1;
      setPahareState(next);
      await AsyncStorage.setItem(getTodayKey(), String(next));
      return next;
    } catch (e) {
      console.error('Eroare la scăderea apei:', e);
      return pahare;
    }
  };

  return {
    pahare,
    tinta,
    loading,
    adaugaPahar,
    scadePahar,
    reload: loadApa,
  };
}
