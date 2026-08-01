
import { useState, useEffect, useCallback, useRef } from 'react';
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
  is_local?: boolean;
}

const LOCAL_WORKOUTS_KEY = 'nutriai_antrenamente_local_v2';

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
  const fetchReqId = useRef(0);

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

  const fetchAntrenamente = useCallback(async () => {
    fetchReqId.current += 1;
    const currentReq = fetchReqId.current;

    setLoading(true);
    try {
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Citim din stocarea locală mai întâi
      const localAll = await getLocalWorkouts();
      if (currentReq !== fetchReqId.current) return;

      const localFiltered = localAll.filter((w) => {
        const d = new Date(w.created_at);
        return d >= startOfDay && d <= endOfDay;
      });

      let cloudData: Antrenament[] = [];
      const sessionData = await supabase.auth.getSession();
      const currentUser = sessionData?.data?.session?.user;

      if (!user && currentUser) setUser(currentUser);
      if (user && !currentUser) setUser(null);

      if (currentUser) {
        const { data, error } = await supabase
          .from('antrenamente')
          .select('*')
          .eq('user_id', currentUser.id)
          .gte('created_at', startOfDay.toISOString())
          .lte('created_at', endOfDay.toISOString())
          .order('created_at', { ascending: false });

        if (!error && data) {
          cloudData = data as Antrenament[];
        }
      }

      if (currentReq !== fetchReqId.current) return;

      // Combinăm cloud și local fără duplicate
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
  }, [dateKey]);

  const fetchIstoric = useCallback(async (zile: number = 30): Promise<Antrenament[]> => {
    try {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - zile);
      pastDate.setHours(0, 0, 0, 0);

      const localAll = await getLocalWorkouts();
      const localFiltered = localAll.filter((w) => new Date(w.created_at) >= pastDate);

      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

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
        // FIX CRITIC: coloana antrenamente.id este UUID (gen_random_uuid). Un id de forma
        // `local_workout_...` era respins de Postgres (22P02 invalid input syntax for type uuid)
        // la FIECARE salvare, iar eroarea era inghitita => antrenamentele nu ajungeau NICIODATA in cloud.
        id: 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        }),
        user_id: currentUser?.id || 'local_user',
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
      };

      // Salvăm obligatoriu în stocarea locală pentru garantarea rezilienței (0 erori)
      const localList = await getLocalWorkouts();
      await saveLocalWorkouts([row, ...localList]);

      // Încercăm sincronizarea în cloud dacă utilizatorul e conectat
      if (currentUser) {
        try {
          const { data, error } = await supabase
            .from('antrenamente')
            .insert([
              {
                id: row.id,
                user_id: currentUser.id,
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
              },
            ])
            .select()
            .single();

          if (error) {
            console.warn('[Antrenamente] Insert Supabase esuat, randul NU e in cloud:', error.message ?? error);
          }
          if (!error && data) {
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
      console.error('Eroare adăugare antrenament (rezolvată prin fallback):', error);
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

      if (user) {
        await supabase.from('antrenamente').delete().eq('id', id).eq('user_id', user.id);
      }
      await fetchAntrenamente();
    } catch (error) {
      console.warn('Eroare ștergere antrenament:', error);
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
