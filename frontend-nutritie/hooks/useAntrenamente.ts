import React, { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { calculeazaCaloriiArse } from '../constants/exercitii';
import { computeWorkoutMetrics } from '../lib/fitnessEngine';
import { localDayKey } from '../lib/dateUtils';
import { useCurrentDayKey } from './useCurrentDayKey';
import { marcheazaAntrenamenteModificate } from '../lib/freshnessMese';
import * as AuthContextModule from '../context/AuthContext';

const useAuthSafe =
  typeof AuthContextModule.useOptionalAuth === 'function'
    ? AuthContextModule.useOptionalAuth
    : AuthContextModule.useAuth;

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

const LOCAL_WORKOUTS_PREFIX = 'nutriai_antrenamente_local_v3_';
const LEGACY_LOCAL_WORKOUTS_KEY = 'nutriai_antrenamente_local_v2';
const LOCAL_USER_ID = 'local_user';
const DAILY_RESET_KEY = 'nutriai_last_workout_reset_date';
const ACTIVE_SESSION_KEYS = [
  'current_workout_session',
  'current_workout_session_meta',
  'nutriai_active_workout_timer',
];

function workoutsStorageKey(userId: string | null): string {
  return userId ? `${LOCAL_WORKOUTS_PREFIX}${userId}` : LEGACY_LOCAL_WORKOUTS_KEY;
}

function genUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
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
  const auth = useAuthSafe();
  const hasAuthProvider = auth !== null;
  const authUser = (auth?.user ?? auth?.session?.user ?? null) as User | null;
  const authUserId = authUser?.id ?? null;
  const currentDayKey = useCurrentDayKey();
  const [antrenamente, setAntrenamente] = useState<Antrenament[]>([]);
  const [totalCaloriiArse, setTotalCaloriiArse] = useState(0);
  const [numarAntrenamente, setNumarAntrenamente] = useState(0);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(authUser);
  const [dayRevision, setDayRevision] = useState(0);
  const fetchReqId = useRef(0);
  const syncing = useRef(false);
  const mountedRef = useRef(true);
  const activeUserIdRef = useRef<string | null>(authUserId);
  const authUserRef = useRef<User | null>(authUser);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    authUserRef.current = authUser;
    activeUserIdRef.current = authUserId;
    setUser((prev) => (prev?.id === authUser?.id ? prev : authUser));
  }, [authUser, authUserId]);

  const targetDate = dataSelectata || new Date();
  const dateKey = `${dataSelectata ? localDayKey(dataSelectata) : currentDayKey}:${dayRevision}`;

  // Verifică sesiunea activă locală fără a depinde de rețea (P0-12).
  // Depinde strict de primitive (hasAuthProvider, authUserId), nu de obiectul `auth`
  // pentru a evita bucle de re-render când un provider/mock întoarce referință nouă.
  const resolveSessionUser = useCallback(async (): Promise<User | null> => {
    if (supabase?.auth && typeof supabase.auth.getSession === 'function') {
      try {
        const sessionResult = await supabase.auth.getSession();
        const sessionUser = (sessionResult?.data?.session?.user ?? null) as User | null;
        if (sessionUser) return sessionUser;
      } catch {
        // Continuă pe fallback-ul controlat
      }
    }
    if (authUserRef.current) return authUserRef.current;
    if (!hasAuthProvider && supabase?.auth && typeof supabase.auth.getUser === 'function') {
      try {
        const { data: authData } = await supabase.auth.getUser();
        return (authData?.user ?? null) as User | null;
      } catch {
        return null;
      }
    }
    return null;
  }, [hasAuthProvider, authUserId]);

  const verifySessionMatches = useCallback(async (expectedUserId: string): Promise<boolean> => {
    if (supabase?.auth && typeof supabase.auth.getSession === 'function') {
      try {
        const sessionResult = await supabase.auth.getSession();
        const liveUserId = sessionResult?.data?.session?.user?.id ?? null;
        if (liveUserId) return liveUserId === expectedUserId;
      } catch {
        return false;
      }
    }
    if (supabase?.auth && typeof supabase.auth.getUser === 'function') {
      try {
        const { data: authData } = await supabase.auth.getUser();
        return authData?.user?.id === expectedUserId;
      } catch {
        return false;
      }
    }
    return authUserId === expectedUserId;
  }, [authUserId]);

  const getLocalWorkouts = useCallback(async (ownerUserId: string | null): Promise<Antrenament[]> => {
    try {
      const key = workoutsStorageKey(ownerUserId);
      const raw = await AsyncStorage.getItem(key);
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      }
      // Migrare sigură (read-only) din cheia legacy v2 DOAR pentru rândurile care aparțin
      // explicit acestui ownerUserId — NICIODATĂ rânduri 'local_user' sau ale altui cont.
      if (ownerUserId) {
        const legacyRaw = await AsyncStorage.getItem(LEGACY_LOCAL_WORKOUTS_KEY);
        const legacyParsed = legacyRaw ? JSON.parse(legacyRaw) : [];
        if (Array.isArray(legacyParsed)) {
          return legacyParsed.filter((w) => w && w.user_id === ownerUserId);
        }
      }
      return [];
    } catch {
      return [];
    }
  }, []);

  const saveLocalWorkouts = useCallback(async (ownerUserId: string | null, list: Antrenament[]) => {
    if (ownerUserId && activeUserIdRef.current && activeUserIdRef.current !== ownerUserId) {
      return;
    }
    // Nu ascundem eroarea: UI-ul nu trebuie să afișeze succes dacă salvarea a eșuat.
    await AsyncStorage.setItem(workoutsStorageKey(ownerUserId), JSON.stringify(list));
  }, []);

  const syncPendingWorkouts = useCallback(async (currentUserId: string) => {
    if (syncing.current) return;
    syncing.current = true;
    try {
      const all = await getLocalWorkouts(currentUserId);
      // P0-12: sincronizăm STRICT rândurile marcate cu user_id === currentUserId (fără 'local_user').
      const pending = all.filter(
        (w) => w.is_local && isUuid(w.id) && w.user_id === currentUserId,
      );
      if (!pending.length) return;
      if (!(await verifySessionMatches(currentUserId))) return;
      const { error } = await supabase
        .from('antrenamente')
        .upsert(pending.map((w) => toInsertPayload(normalizeAntrenament(w), currentUserId)), { onConflict: 'id' });
      if (error) {
        console.warn('[Antrenamente] Resincronizare eșuată:', error.message ?? error);
        return;
      }
      if (!(await verifySessionMatches(currentUserId))) return;
      const ids = new Set(pending.map((w) => w.id));
      await saveLocalWorkouts(
        currentUserId,
        all.map((w) => (ids.has(w.id) ? { ...w, is_local: false, user_id: currentUserId } : w)),
      );
      marcheazaAntrenamenteModificate(currentUserId);
    } finally {
      syncing.current = false;
    }
  }, [getLocalWorkouts, saveLocalWorkouts, verifySessionMatches]);

  const fetchAntrenamente = useCallback(async () => {
    const currentReq = ++fetchReqId.current;
    setLoading(true);
    try {
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);
      const currentUser = await resolveSessionUser();
      const currentUserId = currentUser?.id ?? null;
      if (!mountedRef.current || currentReq !== fetchReqId.current) return;
      activeUserIdRef.current = currentUserId;
      setUser(currentUser);
      if (currentUserId) await syncPendingWorkouts(currentUserId);

      const localAll = await getLocalWorkouts(currentUserId);
      if (!mountedRef.current || currentReq !== fetchReqId.current) return;
      const localFiltered = localAll.filter((w) => {
        if (currentUserId && w.user_id !== currentUserId) return false;
        if (!currentUserId && w.user_id !== LOCAL_USER_ID) return false;
        const time = new Date(w.created_at).getTime();
        return time >= startOfDay.getTime() && time <= endOfDay.getTime();
      });

      let cloudData: Antrenament[] = [];
      if (currentUserId) {
        const { data, error } = await supabase
          .from('antrenamente')
          .select('*')
          .eq('user_id', currentUserId)
          .gte('created_at', startOfDay.toISOString())
          .lte('created_at', endOfDay.toISOString())
          .order('created_at', { ascending: false });
        if (error) console.warn('[Antrenamente] Citire cloud eșuată:', error.message ?? error);
        else cloudData = (data || []) as Antrenament[];
      }
      if (!mountedRef.current || currentReq !== fetchReqId.current) return;

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
      if (mountedRef.current && currentReq === fetchReqId.current) setLoading(false);
    }
  }, [dateKey, getLocalWorkouts, resolveSessionUser, syncPendingWorkouts]);

  const fetchIstoric = useCallback(async (zile = 30): Promise<Antrenament[]> => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - zile);
    pastDate.setHours(0, 0, 0, 0);
    const currentUser = await resolveSessionUser();
    const currentUserId = currentUser?.id ?? null;
    const local = (await getLocalWorkouts(currentUserId)).filter((w) => {
      if (currentUserId && w.user_id !== currentUserId) return false;
      if (!currentUserId && w.user_id !== LOCAL_USER_ID) return false;
      return new Date(w.created_at) >= pastDate;
    });
    let cloud: Antrenament[] = [];
    if (currentUserId) {
      const { data } = await supabase
        .from('antrenamente')
        .select('*')
        .eq('user_id', currentUserId)
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
  }, [getLocalWorkouts, resolveSessionUser]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const resetForCurrentDay = async () => {
      const today = localDayKey();
      const lastReset = await AsyncStorage.getItem(DAILY_RESET_KEY);
      if (cancelled) return;
      if (lastReset !== today) {
        if (typeof AsyncStorage.multiRemove === 'function') {
          await AsyncStorage.multiRemove(ACTIVE_SESSION_KEYS);
        } else if (typeof AsyncStorage.removeItem === 'function') {
          await Promise.all(ACTIVE_SESSION_KEYS.map((k) => AsyncStorage.removeItem(k)));
        }
        if (cancelled) return;
        await AsyncStorage.setItem(DAILY_RESET_KEY, today);
        if (!cancelled) setDayRevision((v) => v + 1);
      }
      if (cancelled) return;
      const nextMidnight = new Date();
      nextMidnight.setHours(24, 0, 1, 0);
      timer = setTimeout(resetForCurrentDay, Math.max(1000, nextMidnight.getTime() - Date.now()));
    };
    resetForCurrentDay().catch((e) => console.warn('Eroare reset zilnic:', e));
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // P0-12: fără subscripție directă supabase.auth.onAuthStateChange — reîncarcă
  // automat când se schimbă authUserId din AuthContext sau ziua curentă.
  useEffect(() => {
    void fetchAntrenamente();
  }, [authUserId, fetchAntrenamente]);

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
      const currentUser = await resolveSessionUser();
      const ownerUserId = currentUser?.id ?? activeUserIdRef.current ?? null;
      let calorii = payload.calorii_arse || 0;
      if (!calorii && payload.met) {
        const stored = await AsyncStorage.getItem('greutate');
        const weight = Number(currentUser?.user_metadata?.greutate || stored || 75);
        calorii = calculeazaCaloriiArse(payload.met, weight, payload.durata_min);
      }
      const computed = computeWorkoutMetrics(payload.exercitii ?? []);
      const row: Antrenament = {
        id: genUuid(),
        user_id: ownerUserId || LOCAL_USER_ID,
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
      await saveLocalWorkouts(ownerUserId, [row, ...(await getLocalWorkouts(ownerUserId))]);
      if (ownerUserId && (await verifySessionMatches(ownerUserId))) {
        const { data, error } = await supabase
          .from('antrenamente')
          .insert([toInsertPayload(row, ownerUserId)])
          .select()
          .single();
        if (!error && data) {
          if (await verifySessionMatches(ownerUserId)) {
            const all = await getLocalWorkouts(ownerUserId);
            await saveLocalWorkouts(
              ownerUserId,
              all.map((w) => (w.id === row.id ? { ...w, is_local: false, user_id: ownerUserId } : w)),
            );
            marcheazaAntrenamenteModificate(ownerUserId);
          }
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
    const currentUser = await resolveSessionUser();
    const ownerUserId = currentUser?.id ?? activeUserIdRef.current ?? null;
    await saveLocalWorkouts(ownerUserId, (await getLocalWorkouts(ownerUserId)).filter((item) => item.id !== id));
    if (ownerUserId && isUuid(id) && (await verifySessionMatches(ownerUserId))) {
      const { error } = await supabase
        .from('antrenamente')
        .delete()
        .eq('id', id)
        .eq('user_id', ownerUserId);
      if (error) throw error;
      marcheazaAntrenamenteModificate(ownerUserId);
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

    const currentUser = await resolveSessionUser();
    const ownerUserId = currentUser?.id ?? activeUserIdRef.current ?? null;
    const localAll = await getLocalWorkouts(ownerUserId);
    const baseWorkout: Antrenament = typeof workoutOrId !== 'string'
      ? workoutOrId
      : antrenamente.find((w) => w.id === targetId) ??
      localAll.find((w) => w.id === targetId) ?? {
        id: targetId,
        user_id: ownerUserId || LOCAL_USER_ID,
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

    if (ownerUserId && isUuid(updatedRow.id) && !effectiveIsLocal && (await verifySessionMatches(ownerUserId))) {
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
        .eq('user_id', ownerUserId);
      if (error) throw error;
      marcheazaAntrenamenteModificate(ownerUserId);
    }

    if (localAll.some((w) => w.id === updatedRow.id)) {
      await saveLocalWorkouts(
        ownerUserId,
        localAll.map((w) => (w.id === updatedRow.id ? { ...updatedRow, is_local: w.is_local } : w)),
      );
    } else if (updatedRow.is_local) {
      await saveLocalWorkouts(ownerUserId, [updatedRow, ...localAll]);
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
