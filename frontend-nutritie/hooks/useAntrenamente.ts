import React, { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { calculeazaCaloriiArse } from '../constants/exercitii';
import { computeWorkoutMetrics } from '../lib/fitnessEngine';

export type SetType = 'warmup' | 'working' | 'dropset' | 'failure';
export interface SetExercitiu {
  serie: number;
  repetari: number;
  greutate?: number;
  set_type?: SetType;
  rpe?: number;
  completed?: boolean;
  assistance_weight_kg?: number;
  time_seconds?: number;
  distance_km?: number;
}
export interface ExercitiuInAntrenament {
  schemaVersion?: number;
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
const LOCAL_USER_ID = 'local_user';
const DAILY_RESET_KEY = 'nutriai_last_workout_reset_date';
const ACTIVE_SESSION_KEYS = [
  'current_workout_session',
  'current_workout_session_meta',
  'nutriai_active_workout_timer',
];

function genUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
function localDayKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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

export function replaceSetInWorkout(
  workout: Antrenament,
  exIndex: number,
  setIndex: number,
  updatedSet: SetExercitiu,
): ExercitiuInAntrenament[] {
  return (workout.exercitii ?? []).map((ex, i) => {
    if (i !== exIndex) return ex;
    const nextSets = (ex.seturi ?? []).map((s, j) =>
      j === setIndex ? { ...updatedSet, serie: j + 1 } : { ...s, serie: j + 1 },
    );
    return { ...ex, seturi: nextSets };
  });
}

export function removeSetFromWorkout(
  workout: Antrenament,
  exIndex: number,
  setIndex: number,
): ExercitiuInAntrenament[] {
  return (workout.exercitii ?? [])
    .map((ex, i) => {
      if (i !== exIndex) return ex;
      const nextSets = (ex.seturi ?? [])
        .filter((_, j) => j !== setIndex)
        .map((s, j) => ({ ...s, serie: j + 1 }));
      return { ...ex, seturi: nextSets };
    })
    .filter((ex) => ex.seturi.length > 0);
}

export function removeExerciseFromWorkout(
  workout: Antrenament,
  exIndex: number,
): ExercitiuInAntrenament[] {
  return (workout.exercitii ?? []).filter((_, i) => i !== exIndex);
}

export function recalculateEditedWorkout(
  workout: Antrenament,
  updatedExercitii: ExercitiuInAntrenament[],
): Antrenament {
  const origList = workout.exercitii ?? [];
  const cleanedExercitii: ExercitiuInAntrenament[] = updatedExercitii
    .map((ex, idx) => {
      const cleanedSets = (ex.seturi ?? []).map((s, sIdx) => ({ ...s, serie: sIdx + 1 }));
      if (cleanedSets.length === 0) return null;
      const origEx = origList[idx]?.exercitiuId === ex.exercitiuId
        ? origList[idx]
        : origList.find((o) => o.exercitiuId === ex.exercitiuId);
      const oldSets = origEx?.seturi ?? [];
      const oldSec = oldSets.reduce((acc, s) => acc + Math.max(0, Number(s.time_seconds) || 0), 0);
      const newSec = cleanedSets.reduce((acc, s) => acc + Math.max(0, Number(s.time_seconds) || 0), 0);

      let durataMin = ex.durataMin;
      let kcal = ex.kcal;
      if (oldSec > 0 || newSec > 0) {
        if (oldSec !== newSec) {
          durataMin = Math.max(1, Math.round(newSec / 60));
          if (origEx) {
            kcal = oldSec > 0 && origEx.kcal > 0
              ? Math.max(1, Math.round(origEx.kcal * (newSec / oldSec)))
              : Math.max(1, durataMin * 5);
          }
        }
      } else if (origEx && oldSets.length > 0 && cleanedSets.length !== oldSets.length) {
        const ratio = cleanedSets.length / oldSets.length;
        durataMin = Math.max(1, Math.round((origEx.durataMin || 1) * ratio));
        kcal = origEx.kcal > 0 ? Math.max(1, Math.round(origEx.kcal * ratio)) : 0;
      }

      return { ...ex, seturi: cleanedSets, durataMin, kcal };
    })
    .filter((ex): ex is NonNullable<typeof ex> => ex !== null);

  const oldSumDur = origList.reduce((acc, e) => acc + Math.max(0, Number(e.durataMin) || 0), 0);
  const newSumDur = cleanedExercitii.reduce((acc, e) => acc + Math.max(0, Number(e.durataMin) || 0), 0);
  const oldSumKcal = origList.reduce((acc, e) => acc + Math.max(0, Number(e.kcal) || 0), 0);
  const newSumKcal = cleanedExercitii.reduce((acc, e) => acc + Math.max(0, Number(e.kcal) || 0), 0);

  let nextDurataMin = workout.durata_min;
  if (oldSumDur > 0 && newSumDur !== oldSumDur) {
    nextDurataMin = Math.max(1, Math.round((workout.durata_min || oldSumDur) * (newSumDur / oldSumDur)));
  } else if (oldSumDur === 0 && origList.length > 0 && cleanedExercitii.length !== origList.length && cleanedExercitii.length > 0) {
    nextDurataMin = Math.max(1, Math.round((workout.durata_min || 1) * (cleanedExercitii.length / origList.length)));
  }

  let nextCalorii = workout.calorii_arse;
  if (oldSumKcal > 0 && newSumKcal !== oldSumKcal) {
    nextCalorii = Math.max(0, Math.round((workout.calorii_arse || oldSumKcal) * (newSumKcal / oldSumKcal)));
  } else if (oldSumKcal === 0 && origList.length > 0 && cleanedExercitii.length !== origList.length && cleanedExercitii.length > 0) {
    nextCalorii = Math.max(0, Math.round((workout.calorii_arse || 0) * (cleanedExercitii.length / origList.length)));
  }

  const computed = computeWorkoutMetrics(cleanedExercitii);
  return {
    ...workout,
    durata_min: nextDurataMin,
    calorii_arse: nextCalorii,
    exercitii: cleanedExercitii,
    volum_total: computed.externalVolumeKg,
    muscle_load: computed.muscleLoad,
    external_volume_kg: computed.externalVolumeKg,
    equivalent_volume_kg: computed.equivalentVolumeKg,
    session_score: computed.sessionScore,
    rank_key: computed.rank.key,
    rank_label: computed.rank.label,
  };
}

export function normalizeAntrenament(row: Antrenament): Antrenament {
  const computed = computeWorkoutMetrics(row.exercitii || []);
  const hasStoredLoad = Boolean(row.muscle_load && Object.keys(row.muscle_load).length > 0);
  return {
    ...row,
    // IMPORTANT: {} nu este o hartă validă. Recalculăm din exercițiile salvate.
    muscle_load: hasStoredLoad ? row.muscle_load : computed.muscleLoad,
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
  const [dayRevision, setDayRevision] = useState(0);
  const fetchReqId = useRef(0);
  const syncing = useRef(false);

  const targetDate = dataSelectata || new Date();
  const dateKey = `${localDayKey(targetDate)}:${dayRevision}`;

  const getLocalWorkouts = useCallback(async (): Promise<Antrenament[]> => {
    try {
      const raw = await AsyncStorage.getItem(LOCAL_WORKOUTS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, []);

  const saveLocalWorkouts = useCallback(async (list: Antrenament[]) => {
    // Nu ascundem eroarea: UI-ul nu trebuie să afișeze succes dacă salvarea a eșuat.
    await AsyncStorage.setItem(LOCAL_WORKOUTS_KEY, JSON.stringify(list));
  }, []);

  const syncPendingWorkouts = useCallback(async (currentUserId: string) => {
    if (syncing.current) return;
    syncing.current = true;
    try {
      const all = await getLocalWorkouts();
      const pending = all.filter(
        (w) => w.is_local && isUuid(w.id) && (w.user_id === currentUserId || w.user_id === LOCAL_USER_ID),
      );
      if (!pending.length) return;
      const { error } = await supabase
        .from('antrenamente')
        .upsert(pending.map((w) => toInsertPayload(normalizeAntrenament(w), currentUserId)), { onConflict: 'id' });
      if (error) {
        console.warn('[Antrenamente] Resincronizare eșuată:', error.message ?? error);
        return;
      }
      const ids = new Set(pending.map((w) => w.id));
      await saveLocalWorkouts(
        all.map((w) => (ids.has(w.id) ? { ...w, is_local: false, user_id: currentUserId } : w)),
      );
    } finally {
      syncing.current = false;
    }
  }, [getLocalWorkouts, saveLocalWorkouts]);

  const fetchAntrenamente = useCallback(async () => {
    const currentReq = ++fetchReqId.current;
    setLoading(true);
    try {
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);
      let currentUser: User | null = null;
      if (supabase?.auth && typeof supabase.auth.getSession === 'function') {
        const sessionResult = await supabase.auth.getSession();
        currentUser = sessionResult?.data?.session?.user ?? null;
      }
      setUser(currentUser);
      if (currentUser) await syncPendingWorkouts(currentUser.id);

      const localAll = await getLocalWorkouts();
      if (currentReq !== fetchReqId.current) return;
      const localFiltered = localAll.filter((w) => {
        if (currentUser && w.user_id !== currentUser.id && w.user_id !== LOCAL_USER_ID) return false;
        const time = new Date(w.created_at).getTime();
        return time >= startOfDay.getTime() && time <= endOfDay.getTime();
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
        if (error) console.warn('[Antrenamente] Citire cloud eșuată:', error.message ?? error);
        else cloudData = (data || []) as Antrenament[];
      }
      if (currentReq !== fetchReqId.current) return;

      const map = new Map<string, Antrenament>();
      cloudData.forEach((item) => map.set(item.id, item));
      localFiltered.forEach((item) => { if (!map.has(item.id)) map.set(item.id, item); });
      const merged = [...map.values()]
        .map(normalizeAntrenament)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setAntrenamente(merged);
      setTotalCaloriiArse(merged.reduce((sum, item) => sum + (item.calorii_arse || 0), 0));
      setNumarAntrenamente(merged.length);
    } catch (error) {
      console.warn('Eroare fetch antrenamente:', error);
    } finally {
      if (currentReq === fetchReqId.current) setLoading(false);
    }
  }, [dateKey, getLocalWorkouts, syncPendingWorkouts]);

  const fetchIstoric = useCallback(async (zile = 30): Promise<Antrenament[]> => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - zile);
    pastDate.setHours(0, 0, 0, 0);
    let currentUser: User | null = null;
    if (supabase?.auth && typeof supabase.auth.getUser === 'function') {
      const { data: authData } = await supabase.auth.getUser();
      currentUser = authData?.user ?? null;
    }
    const local = (await getLocalWorkouts()).filter((w) => {
      if (currentUser && w.user_id !== currentUser.id && w.user_id !== LOCAL_USER_ID) return false;
      return new Date(w.created_at) >= pastDate;
    });
    let cloud: Antrenament[] = [];
    if (currentUser) {
      const { data } = await supabase
        .from('antrenamente')
        .select('*')
        .eq('user_id', currentUser.id)
        .gte('created_at', pastDate.toISOString())
        .order('created_at', { ascending: false });
      cloud = (data || []) as Antrenament[];
    }
    const map = new Map<string, Antrenament>();
    cloud.forEach((x) => map.set(x.id, x));
    local.forEach((x) => { if (!map.has(x.id)) map.set(x.id, x); });
    return [...map.values()]
      .map(normalizeAntrenament)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [getLocalWorkouts]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const resetForCurrentDay = async () => {
      const today = localDayKey();
      const lastReset = await AsyncStorage.getItem(DAILY_RESET_KEY);
      if (lastReset !== today) {
        if (typeof AsyncStorage.multiRemove === 'function') {
          await AsyncStorage.multiRemove(ACTIVE_SESSION_KEYS);
        } else if (typeof AsyncStorage.removeItem === 'function') {
          await Promise.all(ACTIVE_SESSION_KEYS.map((k) => AsyncStorage.removeItem(k)));
        }
        await AsyncStorage.setItem(DAILY_RESET_KEY, today);
        setDayRevision((v) => v + 1);
      }
      const nextMidnight = new Date();
      nextMidnight.setHours(24, 0, 1, 0);
      timer = setTimeout(resetForCurrentDay, Math.max(1000, nextMidnight.getTime() - Date.now()));
    };
    resetForCurrentDay().catch((e) => console.warn('Eroare reset zilnic:', e));
    return () => { if (timer) clearTimeout(timer); };
  }, []);

  useEffect(() => {
    void fetchAntrenamente();
    const authSub =
      typeof supabase?.auth?.onAuthStateChange === 'function'
        ? supabase.auth.onAuthStateChange((_event, session) => {
            const nextUser = session?.user ?? null;
            setUser(nextUser);
            void fetchAntrenamente();
          })
        : null;
    const subscription = authSub?.data?.subscription;
    return () => {
      subscription?.unsubscribe?.();
    };
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
      let currentUser: User | null = null;
      if (supabase?.auth && typeof supabase.auth.getUser === 'function') {
        const { data: authData } = await supabase.auth.getUser();
        currentUser = authData?.user ?? null;
      }
      let calorii = payload.calorii_arse || 0;
      if (!calorii && payload.met) {
        const stored = await AsyncStorage.getItem('greutate');
        const weight = Number(currentUser?.user_metadata?.greutate || stored || 75);
        calorii = calculeazaCaloriiArse(payload.met, weight, payload.durata_min);
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
      await saveLocalWorkouts([row, ...(await getLocalWorkouts())]);
      if (currentUser) {
        const { data, error } = await supabase
          .from('antrenamente')
          .insert([toInsertPayload(row, currentUser.id)])
          .select()
          .single();
        if (!error && data) {
          const all = await getLocalWorkouts();
          await saveLocalWorkouts(all.map((w) => w.id === row.id ? { ...w, is_local: false } : w));
          await fetchAntrenamente();
          return normalizeAntrenament(data as Antrenament);
        }
        if (error) console.warn('[Antrenamente] Salvat local, sync cloud amânat:', error.message ?? error);
      }
      await fetchAntrenamente();
      return row;
    } catch (error) {
      console.error('Eroare adăugare antrenament:', error);
      return null;
    }
  };

  const adaugaExercitiu = async (payload: {
    exercitiuId?: string; nume: string; calorii: number; durataMin: number;
    seturi?: SetExercitiu[] | number; repetari?: number; greutateKg?: number;
    icon?: string; tip?: string; volum?: number;
  }): Promise<Antrenament | null> => {
    const seturi = Array.isArray(payload.seturi)
      ? payload.seturi
      : Array.from({ length: typeof payload.seturi === 'number' ? payload.seturi : 0 }, (_, i) => ({
          serie: i + 1, repetari: payload.repetari || 10, greutate: payload.greutateKg || 0,
        }));
    const volum = payload.volum ?? seturi.reduce((s, x) => s + x.repetari * (x.greutate || 0), 0);
    return adaugaAntrenament({
      nume: payload.nume,
      tip: payload.tip || 'forta',
      durata_min: payload.durataMin || 15,
      calorii_arse: payload.calorii || 80,
      exercitii: [{
        exercitiuId: payload.exercitiuId || 'custom', nume: payload.nume,
        seturi, durataMin: payload.durataMin, kcal: payload.calorii,
      }],
      volum_total: volum,
    });
  };

  const stergeAntrenament = async (id: string): Promise<void> => {
    await saveLocalWorkouts((await getLocalWorkouts()).filter((item) => item.id !== id));
    let currentUser: User | null = null;
    if (supabase?.auth && typeof supabase.auth.getUser === 'function') {
      const { data: authData } = await supabase.auth.getUser();
      currentUser = authData?.user ?? null;
    }
    if (currentUser && isUuid(id)) {
      const { error } = await supabase
        .from('antrenamente')
        .delete()
        .eq('id', id)
        .eq('user_id', currentUser.id);
      if (error) throw error;
    }
    await fetchAntrenamente();
  };

  const actualizeazaAntrenament = async (
    workoutOrId: Antrenament | string,
    exercitiiActualizate: ExercitiuInAntrenament[],
  ): Promise<Antrenament | null> => {
    const targetId = typeof workoutOrId === 'string' ? workoutOrId : workoutOrId.id;
    const validExercitii = (exercitiiActualizate ?? []).filter(
      (ex) => Array.isArray(ex.seturi) && ex.seturi.length > 0,
    );
    if (validExercitii.length === 0) {
      await stergeAntrenament(targetId);
      return null;
    }

    const localAll = await getLocalWorkouts();
    const baseWorkout: Antrenament = typeof workoutOrId !== 'string'
      ? workoutOrId
      : antrenamente.find((w) => w.id === targetId) ??
        localAll.find((w) => w.id === targetId) ?? {
          id: targetId,
          user_id: LOCAL_USER_ID,
          nume: '',
          tip: 'forta',
          durata_min: 15,
          calorii_arse: 0,
          exercitii: validExercitii,
          created_at: new Date().toISOString(),
        };

    const updatedRow = recalculateEditedWorkout(baseWorkout, validExercitii);
    const storedMatch = localAll.find((w) => w.id === updatedRow.id);
    const effectiveIsLocal = storedMatch ? Boolean(storedMatch.is_local) : Boolean(updatedRow.is_local);
    let currentUser: User | null = null;
    if (supabase?.auth && typeof supabase.auth.getUser === 'function') {
      const { data: authData } = await supabase.auth.getUser();
      currentUser = authData?.user ?? null;
    }

    if (currentUser && isUuid(updatedRow.id) && !effectiveIsLocal) {
      const { error } = await supabase
        .from('antrenamente')
        .update({
          durata_min: updatedRow.durata_min,
          calorii_arse: updatedRow.calorii_arse,
          exercitii: updatedRow.exercitii,
          volum_total: updatedRow.volum_total,
          muscle_load: updatedRow.muscle_load,
          external_volume_kg: updatedRow.external_volume_kg,
          equivalent_volume_kg: updatedRow.equivalent_volume_kg,
          session_score: updatedRow.session_score,
          rank_key: updatedRow.rank_key,
          rank_label: updatedRow.rank_label,
        })
        .eq('id', updatedRow.id)
        .eq('user_id', currentUser.id);
      if (error) throw error;
    }

    if (localAll.some((w) => w.id === updatedRow.id)) {
      await saveLocalWorkouts(
        localAll.map((w) => (w.id === updatedRow.id ? { ...updatedRow, is_local: w.is_local } : w)),
      );
    } else if (updatedRow.is_local) {
      await saveLocalWorkouts([updatedRow, ...localAll]);
    }

    await fetchAntrenamente();
    return updatedRow;
  };

  return {
    user, antrenamente, totalCaloriiArse, numarAntrenamente,
    adaugaAntrenament, adaugaExercitiu, actualizeazaAntrenament, stergeAntrenament,
    fetchIstoric, loading, refresh: fetchAntrenamente,
  };
}
