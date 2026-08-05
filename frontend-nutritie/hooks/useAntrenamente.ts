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

export function normalizeAntrenament(row: Antrenament): Antrenament {
  const hasStoredLoad = Boolean(row.muscle_load && Object.keys(row.muscle_load).length > 0);
  // computeWorkoutMetrics e costisitor (parcurge seturi × exerciții). Îl rulăm
  // DOAR când lipsește cel puțin un câmp derivat; în cazul comun (antrenament
  // salvat complet), reutilizăm valorile stocate. normalizeAntrenament rulează pe
  // fiecare fetch, deci fără asta am recalcula întregul istoric la fiecare refresh.
  const needsCompute =
    !hasStoredLoad ||
    row.external_volume_kg == null ||
    row.equivalent_volume_kg == null ||
    row.session_score == null ||
    row.volum_total == null ||
    !row.rank_key ||
    !row.rank_label;
  const computed = needsCompute ? computeWorkoutMetrics(row.exercitii || []) : null;
  return {
    ...row,
    // IMPORTANT: {} nu este o hartă validă. Recalculăm din exercițiile salvate.
    muscle_load: hasStoredLoad ? row.muscle_load : (computed?.muscleLoad ?? row.muscle_load),
    external_volume_kg: row.external_volume_kg ?? computed?.externalVolumeKg ?? 0,
    equivalent_volume_kg: row.equivalent_volume_kg ?? computed?.equivalentVolumeKg ?? 0,
    session_score: row.session_score ?? computed?.sessionScore ?? 0,
    rank_key: row.rank_key || computed?.rank.key || '',
    rank_label: row.rank_label || computed?.rank.label || '',
    volum_total: row.volum_total ?? computed?.externalVolumeKg ?? 0,
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
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUser = sessionData.session?.user ?? null;
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
    const { data: authData } = await supabase.auth.getUser();
    const currentUser = authData.user;
    const local = (await getLocalWorkouts()).filter((w) => {
      if (currentUser && w.user_id !== currentUser.id && w.user_id !== LOCAL_USER_ID) return false;
      return new Date(w.created_at) >= pastDate;
    });
    let cloud: Antrenament[] = [];
    if (currentUser) {
      // Proiectie explicita: normalizarea reutilizeaza valorile stocate (fast
      // path), iar `exercitii` e necesar atat pentru lista expandata din jurnal,
      // cat si pentru recomputare. Fara select('*') nu mai aducem coloane pe care
      // ecranul nu le foloseste.
      const { data } = await supabase
        .from('antrenamente')
        .select(
          'id, user_id, nume, tip, durata_min, calorii_arse, exercitii, volum_total, muscle_load, external_volume_kg, equivalent_volume_kg, session_score, rank_key, rank_label, created_at',
        )
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
        await AsyncStorage.multiRemove(ACTIVE_SESSION_KEYS);
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

  useEffect(() => { fetchAntrenamente(); }, [fetchAntrenamente]);

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
      const { data: authData } = await supabase.auth.getUser();
      const currentUser = authData.user;
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
    const { data: authData } = await supabase.auth.getUser();
    if (authData.user && isUuid(id)) {
      const { error } = await supabase
        .from('antrenamente')
        .delete()
        .eq('id', id)
        .eq('user_id', authData.user.id);
      if (error) throw error;
    }
    await fetchAntrenamente();
  };

  return {
    user, antrenamente, totalCaloriiArse, numarAntrenamente,
    adaugaAntrenament, adaugaExercitiu, stergeAntrenament,
    fetchIstoric, loading, refresh: fetchAntrenamente,
  };
}
