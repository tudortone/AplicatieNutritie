
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { calculeazaCaloriiArse } from '../constants/exercitii';
import { computeWorkoutMetrics } from '../lib/fitnessEngine';
import type { User } from '@supabase/supabase-js';

export type SetType = 'warmup' | 'working' | 'dropset' | 'failure';

export interface SetExercitiu {
  serie: number;
  repetari: number;
  greutate?: number;
  set_type?: SetType;
  rpe?: number; // 1-10
  completed?: boolean;
}

export interface ExercitiuInAntrenament {
  exercitiuId: string;
  nume: string;
  seturi: SetExercitiu[];
  durataMin?: number;
  kcal: number;
  superset_id?: string;
  rest_time_seconds?: number;
}

export interface Antrenament {
  id: string;
  user_id: string;
  nume: string;
  tip: string;
  durata_min: number;
  calorii_arse: number;
  exercitii?: ExercitiuInAntrenament[];
  volum_total?: number;
  muscle_load?: Record<string, number>;
  external_volume_kg?: number;
  equivalent_volume_kg?: number;
  session_score?: number;
  rank_key?: string;
  rank_label?: string;
  created_at: string;
  /** true = randul exista DOAR local si asteapta sincronizare in cloud */
  is_local?: boolean;
}

const LOCAL_WORKOUTS_KEY = 'nutriai_antrenamente_local_v2';
const LOCAL_USER_ID = 'local_user';

/**
 * UUID v4 valid. Coloana antrenamente.id este UUID (gen_random_uuid) in Postgres,
 * deci un id de forma `local_workout_...` era respins cu 22P02 la fiecare insert.
 * Nu folosim crypto.randomUUID pentru ca nu e garantat in Hermes/React Native.
 */
function genUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Randurile scrise inainte de acest fix au id-uri non-UUID si nu pot fi trimise in Postgres. */
function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function toInsertPayload(row: Antrenament, userId: string) {
  return {
    id: row.id,
    user_id: userId,
    nume: row.nume,
    tip: row.tip,
    durata_min: row.durata_min,
    calorii_arse: row.calorii_arse,
    exercitii: row.exercitii,
    volum_total: row.volum_total,
    muscle_load: row.muscle_load,
    external_volume_kg: row.external_volume_kg,
    equivalent_volume_kg: row.equivalent_volume_kg,
    session_score: row.session_score,
    rank_key: row.rank_key,
    rank_label: row.rank_label,
    created_at: row.created_at,
  };
}

export function normalizeAntrenament(row: Antrenament): Antrenament {
  if (row.external_volume_kg !== undefined && row.muscle_load && Object.keys(row.muscle_load).length > 0) {
    return row;
  }
  const computed = computeWorkoutMetrics(row.exercitii || []);
  return {
    ...row,
    muscle_load: row.muscle_load || computed.muscleLoad,
    external_volume_kg: row.external_volume_kg ?? computed.externalVolumeKg,
    equivalent_volume_kg: row.equivalent_volume_kg ?? computed.equivalentVolumeKg,
    session_score: row.session_score ?? computed.sessionScore,
    rank_key: row.rank_key || computed.rank.key,
    rank_label: row.rank_label || computed.rank.label,
    volum_total: row.volum_total ?? computed.externalVolumeKg,
  };
}

export function useAntrenamente(dataSelectata?: Date) {
  const [antrenamente, setAntrenamente] = useState<Antrenament[]>([]);
  const [totalCaloriiArse, setTotalCaloriiArse] = useState(0);
  const [numarAntrenamente, setNumarAntrenamente] = useState(0);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  const targetDate = dataSelectata || new Date();
  const dateKey = targetDate.toDateString();
  const fetchReqId = React.useRef(0);
  const syncing = useRef(false);

  const getLocalWorkouts = async (): Promise<Antrenament[]> => {
    try {
      const raw = await AsyncStorage.getItem(LOCAL_WORKOUTS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };

  const saveLocalWorkouts = async (list: Antrenament[]) => {
    try {
      await AsyncStorage.setItem(LOCAL_WORKOUTS_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn('Eroare salvare antrenamente local:', e);
    }
  };

  /**
   * Fix audit: antrenamentele salvate offline sau inainte de login ramaneau pe veci
   * doar in AsyncStorage (pierdere totala la reinstalare). Le retrimitem in cloud
   * la prima incarcare cu utilizator conectat.
   */
  const syncPendingWorkouts = useCallback(async (currentUserId: string) => {
    if (syncing.current) return;
    syncing.current = true;
    try {
      const all = await getLocalWorkouts();
      const pending = all.filter(
        (w) => w.is_local && isUuid(w.id) && (w.user_id === currentUserId || w.user_id === LOCAL_USER_ID)
      );
      if (pending.length === 0) return;

      const { error } = await supabase
        .from('antrenamente')
        .upsert(
          pending.map((w) => toInsertPayload(w, currentUserId)),
          { onConflict: 'id' }
        );

      if (error) {
        console.warn('[Antrenamente] Resincronizare esuata, se reincearca mai tarziu:', error.message ?? error);
        return;
      }

      const syncedIds = new Set(pending.map((w) => w.id));
      await saveLocalWorkouts(
        all.map((w) => (syncedIds.has(w.id) ? { ...w, is_local: false, user_id: currentUserId } : w))
      );
    } catch (e) {
      console.warn('[Antrenamente] Resincronizare esuata (exceptie):', e);
    } finally {
      syncing.current = false;
    }
  }, []);

  const fetchAntrenamente = useCallback(async () => {
    fetchReqId.current += 1;
    const currentReq = fetchReqId.current;

    setLoading(true);
    try {
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      const sessionData = await supabase.auth.getSession();
      const currentUser = sessionData?.data?.session?.user;

      setUser((prev) => {
        if (prev?.id === currentUser?.id) return prev;
        return currentUser ?? null;
      });

      if (currentUser) {
        await syncPendingWorkouts(currentUser.id);
      }

      // Citim din stocarea locala
      const localAll = await getLocalWorkouts();
      if (currentReq !== fetchReqId.current) return;

      const localFiltered = localAll.filter((w) => {
        // Izolare pe utilizator: randurile altui cont nu apar in lista curenta.
        if (currentUser && w.user_id !== currentUser.id && w.user_id !== LOCAL_USER_ID) return false;
        const d = new Date(w.created_at);
        return d >= startOfDay && d <= endOfDay;
      });

      let cloudData: Antrenament[] = [];

      if (currentUser) {
        const { data, error } = await supabase
          .from('antrenamente')
          .select('*')
          .eq('user_id', currentUser.id)
          .gte('created_at', startOfDay.toISOString())
          .lte('created_at', endOfDay.toISOString())
          .order('created_at', { ascending: false });

        if (error) {
          console.warn('[Antrenamente] Citire cloud esuata:', error.message ?? error);
        }
        if (!error && data) {
          cloudData = data as Antrenament[];
        }
      }

      if (currentReq !== fetchReqId.current) return;

      // Combinam cloud si local fara duplicate
      const combinedMap = new Map<string, Antrenament>();
      cloudData.forEach((item) => combinedMap.set(item.id, item));
      localFiltered.forEach((item) => {
        if (!combinedMap.has(item.id)) {
          combinedMap.set(item.id, item);
        }
      });

      const merged = Array.from(combinedMap.values())
        .map(normalizeAntrenament)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setAntrenamente(merged);
      const total = merged.reduce((sum, item) => sum + (item.calorii_arse || 0), 0);
      setTotalCaloriiArse(total);
      setNumarAntrenamente(merged.length);
    } catch (e) {
      console.warn('Eroare fetch antrenamente:', e);
    } finally {
      setLoading(false);
    }
  }, [dateKey, syncPendingWorkouts]);

  const fetchIstoric = useCallback(async (zile: number = 30): Promise<Antrenament[]> => {
    try {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - zile);
      pastDate.setHours(0, 0, 0, 0);

      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      const localAll = await getLocalWorkouts();
      const localFiltered = localAll.filter((w) => {
        if (currentUser && w.user_id !== currentUser.id && w.user_id !== LOCAL_USER_ID) return false;
        return new Date(w.created_at) >= pastDate;
      });

      let cloudData: Antrenament[] = [];
      if (currentUser) {
        const { data } = await supabase
          .from('antrenamente')
          .select('*')
          .eq('user_id', currentUser.id)
          .gte('created_at', pastDate.toISOString())
          .order('created_at', { ascending: false });

        if (data) cloudData = data as Antrenament[];
      }

      const map = new Map<string, Antrenament>();
      cloudData.forEach((x) => map.set(x.id, x));
      localFiltered.forEach((x) => {
        if (!map.has(x.id)) map.set(x.id, x);
      });

      return Array.from(map.values())
        .map(normalizeAntrenament)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } catch (e) {
      console.warn('Eroare fetchIstoric:', e);
      return [];
    }
  }, []);

  useEffect(() => {
    fetchAntrenamente();

    const checkDailyReset = async () => {
      try {
        const todayStr = new Date().toDateString();
        const lastReset = await AsyncStorage.getItem('nutriai_last_workout_reset_date');
        if (lastReset && lastReset !== todayStr) {
          await AsyncStorage.removeItem('nutriai_active_workout_timer');
          await AsyncStorage.setItem('nutriai_last_workout_reset_date', todayStr);
          fetchAntrenamente();
        } else if (!lastReset) {
          await AsyncStorage.setItem('nutriai_last_workout_reset_date', todayStr);
        }
      } catch (e) {
        console.warn('Eroare verificare reset zilnic:', e);
      }
    };
    checkDailyReset();
  }, [fetchAntrenamente]);

  const adaugaAntrenament = async (payload: {
    nume: string;
    tip: string;
    durata_min: number;
    calorii_arse?: number;
    met?: number;
    exercitii?: ExercitiuInAntrenament[];
    volum_total?: number;
  }): Promise<Antrenament | null> => {
    try {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      let calorii = payload.calorii_arse || 0;
      if (!calorii && payload.met) {
        let greutateKg = currentUser?.user_metadata?.greutate;
        if (!greutateKg) {
          const storedG = await AsyncStorage.getItem('greutate');
          greutateKg = storedG ? parseFloat(storedG) : 75;
        }
        calorii = calculeazaCaloriiArse(payload.met, greutateKg || 75, payload.durata_min);
      }

      const computed = computeWorkoutMetrics(payload.exercitii ?? []);

      const row: Antrenament = {
        id: genUuid(),
        user_id: currentUser?.id || LOCAL_USER_ID,
        nume: payload.nume.trim(),
        tip: payload.tip,
        durata_min: payload.durata_min,
        calorii_arse: calorii,
        exercitii: payload.exercitii ?? [],
        volum_total: payload.volum_total ?? computed.externalVolumeKg,
        muscle_load: computed.muscleLoad,
        external_volume_kg: computed.externalVolumeKg,
        equivalent_volume_kg: computed.equivalentVolumeKg,
        session_score: computed.sessionScore,
        rank_key: computed.rank.key,
        rank_label: computed.rank.label,
        created_at: new Date().toISOString(),
        is_local: true,
      };

      // Salvam obligatoriu local, pentru rezilienta (0 pierderi daca reteaua cade)
      const localList = await getLocalWorkouts();
      await saveLocalWorkouts([row, ...localList]);

      // Incercam sincronizarea in cloud daca utilizatorul e conectat
      if (currentUser) {
        try {
          const { data, error } = await supabase
            .from('antrenamente')
            .insert([toInsertPayload(row, currentUser.id)])
            .select()
            .single();

          if (error) {
            console.warn('[Antrenamente] Insert Supabase esuat, randul ramane local:', error.message ?? error);
          }

          if (!error && data) {
            // Marcam randul ca sincronizat, ca sa nu fie retrimis la urmatorul fetch
            const listNow = await getLocalWorkouts();
            await saveLocalWorkouts(
              listNow.map((w) => (w.id === row.id ? { ...w, is_local: false } : w))
            );
            await fetchAntrenamente();
            return data as Antrenament;
          }
        } catch (e) {
          console.warn('[Antrenamente] Sincronizare cloud esuata, se pastreaza doar local:', e);
        }
      }

      await fetchAntrenamente();
      return row;
    } catch (error) {
      console.error('Eroare adaugare antrenament (rezolvata prin fallback):', error);
      return null;
    }
  };

  const adaugaExercitiu = async (payload: {
    exercitiuId?: string;
    nume: string;
    calorii: number;
    durataMin: number;
    seturi?: SetExercitiu[] | number;
    repetari?: number;
    greutateKg?: number;
    icon?: string;
    tip?: string;
    volum?: number;
  }): Promise<Antrenament | null> => {
    let seturiArray: SetExercitiu[] = [];
    if (Array.isArray(payload.seturi)) {
      seturiArray = payload.seturi;
    } else if (typeof payload.seturi === 'number') {
      const nr = payload.seturi || 1;
      seturiArray = Array.from({ length: nr }, (_, i) => ({
        serie: i + 1,
        repetari: payload.repetari || 10,
        greutate: payload.greutateKg || 0,
      }));
    }

    const volumCalc =
      payload.volum ?? seturiArray.reduce((s, x) => s + x.repetari * (x.greutate || 0), 0);

    return adaugaAntrenament({
      nume: payload.nume,
      tip: payload.tip || 'forta',
      durata_min: payload.durataMin || 15,
      calorii_arse: payload.calorii || 80,
      exercitii: [
        {
          exercitiuId: payload.exercitiuId || 'custom',
          nume: payload.nume,
          seturi: seturiArray,
          durataMin: payload.durataMin,
          kcal: payload.calorii,
        },
      ],
      volum_total: volumCalc,
    });
  };

  const stergeAntrenament = async (id: string): Promise<void> => {
    try {
      const localList = await getLocalWorkouts();
      await saveLocalWorkouts(localList.filter((item) => item.id !== id));

      // Randurile vechi (id non-UUID) nu au ajuns niciodata in Postgres.
      if (user && isUuid(id)) {
        const { error } = await supabase
          .from('antrenamente')
          .delete()
          .eq('id', id)
          .eq('user_id', user.id);
        if (error) {
          console.warn('[Antrenamente] Stergere din cloud esuata:', error.message ?? error);
        }
      }
      await fetchAntrenamente();
    } catch (error) {
      console.warn('Eroare stergere antrenament:', error);
    }
  };

  return {
    user,
    antrenamente,
    totalCaloriiArse,
    numarAntrenamente,
    adaugaAntrenament,
    adaugaExercitiu,
    stergeAntrenament,
    fetchIstoric,
    loading,
    refresh: fetchAntrenamente,
  };
}
