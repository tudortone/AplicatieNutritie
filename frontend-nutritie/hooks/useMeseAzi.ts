import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Masa, TipMasa } from '../types';
import { getTipMasaDupaOra, parseAlimente } from '../lib/mealUtils';
import { calculeazaTotaluriZi, totaluriPentruAfisare } from '../lib/nutritionTotals';
import { aboneazaLaModificariMese } from '../lib/freshnessMese';
import { citesteTargeturiPending } from '../lib/sincronizeazaTargeturi';
import { resolveProfileWeightKg } from '../lib/profileWeight';
import { startOfLocalDayISO, endOfLocalDayISO, localDayKey } from '../lib/dateUtils';
import {
  getCachedJournalDay,
  setCachedJournalDay,
  hasCachedJournalDay,
  clearJournalCache,
  optimisticAddCachedMeal,
  optimisticDeleteCachedMeal,
} from '../lib/journalCache';
import type { User } from '@supabase/supabase-js';

export interface CategorieMasaGrupata {
  id: TipMasa;
  label: string;
  icon: string;
  mese: Masa[];
  totalCalorii: number;
  totalProteine: number;
  totalCarbohidrati: number;
  totalGrasimi: number;
  totalFibre: number;
}

export type MeseGrupateMap = Record<TipMasa, CategorieMasaGrupata>;

/**
 * Normalizes raw meal records from Supabase into canonical Masa format.
 */
function normalizeMese(rawMese: Masa[]): Masa[] {
  rawMese.forEach((m) => {
    let alimenteArr = parseAlimente(m);
    if (!alimenteArr || alimenteArr.length === 0) {
      alimenteArr = [
        {
          id: m.id,
          nume: m.nume || 'Preparat',
          calorii: m.calorii || 0,
          proteine: m.proteine || 0,
          carbohidrati: m.carbohidrati || 0,
          grasimi: m.grasimi || 0,
          fibre: m.fibre || 0,
        },
      ];
    }
    m.alimente = alimenteArr;

    if (!m.tip_masa || !['mic_dejun', 'pranz', 'cina', 'gustare'].includes(m.tip_masa)) {
      const dateToUse = m.created_at ? new Date(m.created_at) : new Date();
      m.tip_masa = getTipMasaDupaOra(dateToUse);
    }
  });
  return rawMese;
}

export function useMeseAzi(dataSelectata?: Date) {
  // Canonical date key in local timezone (YYYY-MM-DD)
  const canonicalDate = useMemo(() => dataSelectata ?? new Date(), [dataSelectata]);
  const dateKey = useMemo(() => localDayKey(canonicalDate), [canonicalDate]);

  // P1-03: `mese` este SINGURA stare canonică a zilei. Totalurile se derivă din ea.
  // PERF: Initialized synchronously from in-memory cache if available (< 1ms).
  const [mese, setMese] = useState<Masa[]>(() => getCachedJournalDay(dateKey) || []);
  const [user, setUser] = useState<User | null>(null);

  const [caloriiTinta, setCaloriiTinta] = useState(2000);
  const [proteineTinta, setProteineTinta] = useState(150);
  const [carbiTinta, setCarbiTinta] = useState(250);
  const [grasimiTinta, setGrasimiTinta] = useState(70);
  const [greutate, setGreutate] = useState(75);
  const [greutateIntrodusaKg, setGreutateIntrodusaKg] = useState<number | null>(null);

  // If already in cache, loading begins as false!
  const [loading, setLoading] = useState<boolean>(() => !hasCachedJournalDay(dateKey));
  const [eroareFetch, setEroareFetch] = useState<string | null>(null);

  const userRef = useRef<User | null>(null);
  const targetsLoadedRef = useRef(false);
  const activeDateKeyRef = useRef(dateKey);
  const reqIdRef = useRef(0);
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const hasLoadedDateRef = useRef<string | null>(null);

  // Synchronize state immediately upon date change
  const prevDateKeyRef = useRef(dateKey);
  useEffect(() => {
    if (prevDateKeyRef.current !== dateKey) {
      prevDateKeyRef.current = dateKey;
      activeDateKeyRef.current = dateKey;

      const cached = getCachedJournalDay(dateKey);
      if (cached) {
        setMese(cached);
        setLoading(false);
        setEroareFetch(null);
        hasLoadedDateRef.current = dateKey;
      } else {
        // Never show incorrect previous-day data as if it belongs to the new date
        setMese([]);
        setLoading(true);
        setEroareFetch(null);
      }
    }
  }, [dateKey]);

  const fetchData = useCallback(
    async (isSilent = false, forceLoading = false) => {
      if (typeof isSilent !== 'boolean') isSilent = false;
      if (typeof forceLoading !== 'boolean') forceLoading = false;

      // Abort previous in-flight request to eliminate race conditions and request storms
      if (abortControllerRef.current) {
        try {
          abortControllerRef.current.abort();
        } catch {}
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const myReqId = ++reqIdRef.current;
      const targetDateKey = dateKey;
      const isStale = () =>
        !isMountedRef.current ||
        reqIdRef.current !== myReqId ||
        activeDateKeyRef.current !== targetDateKey ||
        controller.signal.aborted;

      const isCached = hasCachedJournalDay(targetDateKey);

      if (forceLoading || (!isSilent && !isCached && hasLoadedDateRef.current !== targetDateKey)) {
        setLoading(true);
      }

      try {
        const {
          data: { user: fetchedUser },
          error: userError,
        } = await supabase.auth.getUser();

        if (isStale()) return;
        if (userError || !fetchedUser) {
          setGreutateIntrodusaKg(null);
          setLoading(false);
          setEroareFetch(userError ? userError.message : null);
          return;
        }

        if ((userRef.current && userRef.current.id !== fetchedUser.id) || forceLoading) {
          clearJournalCache();
          targetsLoadedRef.current = false;
        }
        userRef.current = fetchedUser;
        const currentUser = fetchedUser;
        setUser(fetchedUser);

        // 2. Load profile targets only once (or on force reload), skipping redundant AsyncStorage reads on date switches
        if (!targetsLoadedRef.current || forceLoading) {
          const userMetadata = currentUser.user_metadata || {};
          const pending = currentUser.id ? await citesteTargeturiPending(currentUser.id) : null;
          const pendingTargets = pending?.userId === currentUser.id ? pending.targets : undefined;
          let greutateLocala: string | null = null;
          try {
            greutateLocala = await AsyncStorage.getItem('greutate');
          } catch (error) {
            console.warn('[Profil] Citirea greutății locale restaurate a eșuat:', error);
          }

          if (isStale()) return;

          const rezolva = (
            metadataVal: number | undefined,
            localVal: number | undefined,
            fallback: number
          ): number => {
            if (typeof localVal === 'number' && Number.isFinite(localVal)) return localVal;
            if (typeof metadataVal === 'number' && Number.isFinite(metadataVal)) return metadataVal;
            return fallback;
          };

          setCaloriiTinta(rezolva(userMetadata.caloriiTinta, pendingTargets?.caloriiTinta, 2000));
          setProteineTinta(rezolva(userMetadata.proteineTinta, pendingTargets?.proteineTinta, 150));
          setCarbiTinta(rezolva(userMetadata.carbiTinta, pendingTargets?.carbiTinta, 250));
          setGrasimiTinta(rezolva(userMetadata.grasimiTinta, pendingTargets?.grasimiTinta, 70));
          setGreutate(rezolva(userMetadata.greutate, pendingTargets?.greutate, 75));
          setGreutateIntrodusaKg(
            resolveProfileWeightKg({
              pendingKg: pendingTargets?.greutate,
              metadataKg: userMetadata.greutate,
              storedKg: greutateLocala,
            })
          );
          targetsLoadedRef.current = true;
        }

        if (!forceLoading && !isSilent && hasCachedJournalDay(targetDateKey)) {
          setLoading(false);
          hasLoadedDateRef.current = targetDateKey;
          return;
        }


        const startIso = startOfLocalDayISO(canonicalDate);
        const endIso = endOfLocalDayISO(canonicalDate);

        let query = supabase
          .from('mese')
          .select('*')
          .eq('user_id', currentUser.id)
          .gte('created_at', startIso)
          .lte('created_at', endIso)
          .order('created_at', { ascending: false });

        if (typeof (query as any).abortSignal === 'function' && controller.signal) {
          query = (query as any).abortSignal(controller.signal);
        }

        const { data: rawData, error: meseError } = await query;

        if (isStale()) return;

        if (meseError) {
          console.error('Eroare fetch mese Supabase:', meseError.message);
          setEroareFetch(meseError.message);
        } else if (rawData) {
          setEroareFetch(null);
          const allMese = normalizeMese(rawData as Masa[]);
          setCachedJournalDay(targetDateKey, allMese);
          setMese(allMese);
        }
      } catch (e: any) {
        if (controller.signal.aborted) {
          // Expected cancellation on rapid date switching
          return;
        }
        console.error('Eroare neașteptată în hook-ul useMeseAzi:', e);
        setEroareFetch(e instanceof Error ? e.message : String(e));
      } finally {
        if (!isStale()) {
          hasLoadedDateRef.current = targetDateKey;
          setLoading(false);
        }
      }
    },
    [canonicalDate, dateKey]
  );

  useEffect(() => {
    isMountedRef.current = true;
    fetchData(false, false);
    return () => {
      isMountedRef.current = false;
      reqIdRef.current++;
      abortControllerRef.current?.abort();
    };
  }, [fetchData]);

  // Deterministic invalidation signal on verified mutations (AddMealBottomSheet, Photo AI, Coach, deletion, quantity)
  useEffect(
    () =>
      aboneazaLaModificariMese((userIdSemnal) => {
        if (!isMountedRef.current) return;
        if (!user?.id || userIdSemnal !== user.id) return;
        targetsLoadedRef.current = false;
        fetchData(true, false);
      }),
    [fetchData, user?.id]
  );

  // Totalurile zilei — derivate din lista canonică
  const totaluriZi = useMemo(
    () => totaluriPentruAfisare(calculeazaTotaluriZi(mese)),
    [mese]
  );
  const numarMese = mese.length;

  const { meseGrupate, categoriiMeseList } = useMemo(() => {
    const grupuri: MeseGrupateMap = {
      mic_dejun: { id: 'mic_dejun', label: 'Mic Dejun', icon: '🍳', mese: [], totalCalorii: 0, totalProteine: 0, totalCarbohidrati: 0, totalGrasimi: 0, totalFibre: 0 },
      pranz: { id: 'pranz', label: 'Prânz', icon: '🍲', mese: [], totalCalorii: 0, totalProteine: 0, totalCarbohidrati: 0, totalGrasimi: 0, totalFibre: 0 },
      gustare: { id: 'gustare', label: 'Gustări', icon: '🍎', mese: [], totalCalorii: 0, totalProteine: 0, totalCarbohidrati: 0, totalGrasimi: 0, totalFibre: 0 },
      cina: { id: 'cina', label: 'Cină', icon: '🥗', mese: [], totalCalorii: 0, totalProteine: 0, totalCarbohidrati: 0, totalGrasimi: 0, totalFibre: 0 },
    };

    mese.forEach((m) => {
      const tip: TipMasa = m.tip_masa && grupuri[m.tip_masa] ? m.tip_masa : 'gustare';
      grupuri[tip].mese.push(m);
    });

    (Object.keys(grupuri) as TipMasa[]).forEach((tip) => {
      const cat = grupuri[tip];
      const t = calculeazaTotaluriZi(cat.mese);
      cat.totalCalorii = t.calorii;
      cat.totalProteine = t.proteine;
      cat.totalCarbohidrati = t.carbohidrati;
      cat.totalGrasimi = t.grasimi;
      cat.totalFibre = t.fibre;
    });

    const listaOrd = ['mic_dejun', 'pranz', 'cina', 'gustare'].map((k) => grupuri[k as TipMasa]);

    return { meseGrupate: grupuri, categoriiMeseList: listaOrd };
  }, [mese]);

  // Optimistic mutations: touched in state AND cached day
  const optimisticDeleteMeal = useCallback(
    (id: string) => {
      setMese((prev) => {
        const next = prev.some((m) => m.id === id) ? prev.filter((m) => m.id !== id) : prev;
        optimisticDeleteCachedMeal(dateKey, id);
        return next;
      });
    },
    [dateKey]
  );

  const optimisticAddMeal = useCallback(
    (masa: Masa) => {
      setMese((prev) => {
        if (masa?.id && prev.some((m) => m.id === masa.id)) return prev;
        const next = [masa, ...prev];
        optimisticAddCachedMeal(dateKey, masa);
        return next;
      });
    },
    [dateKey]
  );

  return {
    mese,
    meseGrupate,
    categoriiMeseList,
    totalCalorii: totaluriZi.calorii,
    totalProteine: totaluriZi.proteine,
    totalGrasimi: totaluriZi.grasimi,
    totalCarbohidrati: totaluriZi.carbohidrati,
    totalFibre: totaluriZi.fibre,
    numarMese,
    caloriiTinta,
    proteineTinta,
    carbiTinta,
    grasimiTinta,
    greutate,
    greutateIntrodusaKg,
    user,
    loading,
    eroareFetch,
    refresh: fetchData,
    optimisticDeleteMeal,
    optimisticAddMeal,
  };
}
