import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import { EXERCITII_DB as STATIC_EXERCISES } from '../constants/exercitii';
import type { Exercitiu } from '../constants/exercitii';

const CACHE_KEY = 'exercitii_cache';
const LAST_SYNC_KEY = 'exercitii_last_sync';

export function useExercitii() {
  const [exercitii, setExercitii] = useState<Exercitiu[]>(STATIC_EXERCISES); // Fallback inițial la static
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);

  const fetchExercises = useCallback(async (force = false) => {
    try {
      // 1. Încărcăm din cache mai întâi pentru viteză instantanee
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setExercitii(parsed);
          }
        } catch { /* cache corupt, îl ignorăm */ }
        setLoading(false); // UI-ul se poate randa imediat
      }

      // 2. Verificăm când am făcut ultimul sync.
      // Sincronizăm o dată pe zi, sau dacă 'force' este true.
      const lastSync = await AsyncStorage.getItem(LAST_SYNC_KEY);
      const acum = new Date().getTime();
      const oZiInMs = 24 * 60 * 60 * 1000;

      if (!force && lastSync && (acum - parseInt(lastSync)) < oZiInMs && cached) {
        return; // Cache-ul este suficient de proaspăt
      }

      // 3. Descărcăm de pe Supabase în background
      const { data, error } = await supabase.from('exercitii').select('*');

      if (error) {
        // Dacă tabelul nu există încă pe Supabase, folosim silențios datele statice.
        // Nu afișăm eroare deoarece acest lucru este așteptat înainte de a rula migrarea SQL.
        if (error.message?.includes('schema cache') || error.code === 'PGRST204' || error.code === '42P01') {
          // Tabelul nu a fost creat încă — fallback silențios la static
          console.log('[useExercitii] Tabelul Supabase nu există încă, folosesc datele locale.');
        } else {
          console.warn('[useExercitii] Eroare la sync:', error.message);
        }
        setIsOffline(true);
        // Păstrăm datele curente (fie din cache, fie statice) — nu resetăm
        return;
      }

      if (data && data.length > 0) {
        setExercitii(data);
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
        await AsyncStorage.setItem(LAST_SYNC_KEY, acum.toString());
        setIsOffline(false);
      }
      // Dacă tabelul există dar e gol, păstrăm datele statice ca fallback
    } catch (e) {
      // Eroare de rețea sau altă excepție — folosim silențios fallback-ul
      console.log('[useExercitii] Offline sau excepție, folosesc datele locale.');
      setIsOffline(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExercises();
  }, [fetchExercises]);

  const refresh = () => fetchExercises(true);

  return { exercitii, loading, isOffline, refresh };
}
