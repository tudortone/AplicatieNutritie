import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Masa, TipMasa } from '../types';
import { getTipMasaDupaOra, parseAlimente } from '../lib/mealUtils';
import { TARGETURI_PENDING_KEY } from '../lib/sincronizeazaTargeturi';
import { startOfLocalDayISO, endOfLocalDayISO } from '../lib/dateUtils';
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

export function useMeseAzi(dataSelectata?: Date) {
  const [mese, setMese] = useState<Masa[]>([]);
  const [totalCalorii, setTotalCalorii] = useState(0);
  const [totalProteine, setTotalProteine] = useState(0);
  const [totalGrasimi, setTotalGrasimi] = useState(0);
  const [totalCarbohidrati, setTotalCarbohidrati] = useState(0);
  const [numarMese, setNumarMese] = useState(0);
  const [user, setUser] = useState<User | null>(null);
  
  const [caloriiTinta, setCaloriiTinta] = useState(2000);
  const [proteineTinta, setProteineTinta] = useState(150);
  const [carbiTinta, setCarbiTinta] = useState(250);
  const [grasimiTinta, setGrasimiTinta] = useState(70);
  const [greutate, setGreutate] = useState(75);

  const [loading, setLoading] = useState(true);
  // BUG-062: eroare la fetch (mesaj sau null). Fara aceasta, un esec de retea
  // ar afisa jurnalul gol ca si cum utilizatorul n-ar avea mese — esec silentios.
  const [eroareFetch, setEroareFetch] = useState<string | null>(null);
  const hasLoadedDateRef = useRef<string | null>(null);
  // Guard anti-race: fiecare apel fetchData primește un id; la final, dacă id-ul
  // curent a fost invalidat (alt fetchData l-a înlocuit), ignorăm setState-urile
  // ca să nu suprascriem date fresh cu date stale (ex: focus + refresh manual).
  const reqIdRef = useRef(0);
  const isMountedRef = useRef(true);

  const dateKey = dataSelectata?.toDateString() ?? '';

  const fetchData = useCallback(async (isSilent = false, forceLoading = false) => {
    if (typeof isSilent !== 'boolean') isSilent = false;
    if (typeof forceLoading !== 'boolean') forceLoading = false;

    const myReqId = ++reqIdRef.current;
    const isStale = () => !isMountedRef.current || reqIdRef.current !== myReqId;

    if (forceLoading || (!isSilent && hasLoadedDateRef.current !== dateKey)) {
      setLoading(true);
    }
    try {
      // Apel unic la getUser() pentru securitate și evitarea cererilor rețea duble (B6)
      const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser();
      if (isStale()) return; // cerere invalidată (alt fetchData a preluat sau unmount)
      if (userError || !currentUser) {
        setLoading(false);
        setEroareFetch(userError ? userError.message : null);
        return;
      }
      setUser(currentUser);

      // 1. Încarcă profile targets. Sursa principala: user_metadata (server).
      // Excepție BUG-035: dacă există targeturi locale NESINCRONIZATE (salvare
      // offline), acele valori reprezintă intenția cea mai recentă a utilizatorului
      // și nu trebuie suprascrise de metadata stale de pe server.
      const userMetadata = currentUser.user_metadata || {};

      const [storedC, storedP, storedCb, storedGr, storedG, pendingTargeturi] = await Promise.all([
        AsyncStorage.getItem('caloriiTinta'),
        AsyncStorage.getItem('proteineTinta'),
        AsyncStorage.getItem('carbiTinta'),
        AsyncStorage.getItem('grasimiTinta'),
        AsyncStorage.getItem('greutate'),
        AsyncStorage.getItem(TARGETURI_PENDING_KEY),
      ]);
      const preferLocal = pendingTargeturi === '1';
      const rezolva = (metadataVal: number | undefined, localStr: string | null, fallback: number): number => {
        let localVal: number | undefined;
        if (localStr) {
          const v = parseInt(localStr, 10);
          if (Number.isFinite(v)) localVal = v;
        }
        if (preferLocal && localVal !== undefined) return localVal;
        const meta = typeof metadataVal === 'number' && Number.isFinite(metadataVal) ? metadataVal : undefined;
        return meta ?? localVal ?? fallback;
      };

      setCaloriiTinta(rezolva(userMetadata.caloriiTinta, storedC, 2000));
      setProteineTinta(rezolva(userMetadata.proteineTinta, storedP, 150));
      setCarbiTinta(rezolva(userMetadata.carbiTinta, storedCb, 250));
      setGrasimiTinta(rezolva(userMetadata.grasimiTinta, storedGr, 70));
      setGreutate(rezolva(userMetadata.greutate, storedG, 75));

      // 2. Încarcă mesele din ziua selectată sau curentă.
      // Granița de zi e calculată în timezone-ul local (setHours), NU UTC — altfel
      // mesele de seară/DST sar ziua. Helper-ele din dateUtils sunt sursa unică (BUG-031).
      const startDayIso = startOfLocalDayISO(dataSelectata ?? new Date());
      const endDayIso = endOfLocalDayISO(dataSelectata ?? new Date());

      const { data: meseData, error: meseError } = await supabase
        .from('mese')
        .select('*')
        .eq('user_id', currentUser.id)
        .gte('created_at', startDayIso)
        .lte('created_at', endDayIso)
        .order('created_at', { ascending: false });

      if (isStale()) return; // ❗ guard anti-race: nu suprascrie stare cu rezultat învechit

      if (meseError) {
        console.error("Eroare fetch mese Supabase:", meseError.message);
        // BUG-062: expunem eroarea — consumatorii afiseaza banner + retry in loc
        // sa trateze lista goala ca adevar (jurnalul "disparut").
        setEroareFetch(meseError.message);
      } else if (meseData) {
        setEroareFetch(null);
        const parsedMese = meseData as Masa[];
        
        let totalC = 0, totalP = 0, totalG = 0, totalCarbs = 0;
        parsedMese.forEach(m => {
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
                fibre: m.fibre || 0
              }
            ];
          }
          m.alimente = alimenteArr;

          if (!m.tip_masa || !['mic_dejun', 'pranz', 'cina', 'gustare'].includes(m.tip_masa)) {
            const dateToUse = m.created_at ? new Date(m.created_at) : new Date();
            m.tip_masa = getTipMasaDupaOra(dateToUse);
          }

          totalC += m.calorii || 0;
          totalP += m.proteine || 0;
          totalG += m.grasimi || 0;
          totalCarbs += m.carbohidrati || 0;
        });

        const safeTotalC = Math.min(100000, Math.max(0, Math.round(totalC)));
        const safeTotalP = Math.min(5000, Math.max(0, Math.round(totalP * 10) / 10));
        const safeTotalG = Math.min(5000, Math.max(0, Math.round(totalG * 10) / 10));
        const safeTotalCarbs = Math.min(5000, Math.max(0, Math.round(totalCarbs * 10) / 10));

        setMese(parsedMese);
        setTotalCalorii(safeTotalC);
        setTotalProteine(safeTotalP);
        setTotalGrasimi(safeTotalG);
        setTotalCarbohidrati(safeTotalCarbs);
        setNumarMese(parsedMese.length);
      }
    } catch (e) {
      console.error("Eroare neașteptată în hook-ul useMeseAzi:", e);
      setEroareFetch(e instanceof Error ? e.message : String(e));
    } finally {
      // Marcăm ca încărcat doar dacă suntem încă montați și nu am fost invalidați
      if (!isStale()) {
        hasLoadedDateRef.current = dateKey;
        setLoading(false);
      }
    }
  // dateKey (string) in loc de dataSelectata (Date) — identitate stabila — are identitate nouă la fiecare render dacă
  // părintele pasează `new Date()` inline, provocând loop infinit de re-fetch.
  // dateKey (string derivat din dataSelectata) acoperă deja semantica de dată și e stabil.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey]);

  useEffect(() => {
    isMountedRef.current = true;
    fetchData(false, false);
    return () => {
      // La unmount: invalidăm cererile zburătoare și evităm setState după unmount
      isMountedRef.current = false;
      reqIdRef.current++;
    };
  }, [fetchData]);

  const { meseGrupate, categoriiMeseList } = useMemo(() => {
    const grupuri: MeseGrupateMap = {
      mic_dejun: { id: 'mic_dejun', label: 'Mic Dejun', icon: '🍳', mese: [], totalCalorii: 0, totalProteine: 0, totalCarbohidrati: 0, totalGrasimi: 0, totalFibre: 0 },
      pranz: { id: 'pranz', label: 'Prânz', icon: '🍲', mese: [], totalCalorii: 0, totalProteine: 0, totalCarbohidrati: 0, totalGrasimi: 0, totalFibre: 0 },
      gustare: { id: 'gustare', label: 'Gustări', icon: '🍎', mese: [], totalCalorii: 0, totalProteine: 0, totalCarbohidrati: 0, totalGrasimi: 0, totalFibre: 0 },
      cina: { id: 'cina', label: 'Cină', icon: '🥗', mese: [], totalCalorii: 0, totalProteine: 0, totalCarbohidrati: 0, totalGrasimi: 0, totalFibre: 0 },
    };

    mese.forEach(m => {
      const tip: TipMasa = m.tip_masa && grupuri[m.tip_masa] ? m.tip_masa : 'gustare';
      const cat = grupuri[tip];
      cat.mese.push(m);
      cat.totalCalorii += m.calorii || 0;
      cat.totalProteine += m.proteine || 0;
      cat.totalCarbohidrati += m.carbohidrati || 0;
      cat.totalGrasimi += m.grasimi || 0;
      cat.totalFibre += m.fibre || 0;
    });

    const listaOrd = ['mic_dejun', 'pranz', 'cina', 'gustare'].map(k => grupuri[k as TipMasa]);

    return { meseGrupate: grupuri, categoriiMeseList: listaOrd };
  }, [mese]);

  const optimisticDeleteMeal = useCallback((id: string) => {
    setMese((prev) => {
      const deSters = prev.find((m) => m.id === id);
      if (!deSters) return prev;
      setTotalCalorii((c) => Math.max(0, c - (deSters.calorii || 0)));
      setTotalProteine((p) => Math.max(0, p - (deSters.proteine || 0)));
      setTotalGrasimi((g) => Math.max(0, g - (deSters.grasimi || 0)));
      setTotalCarbohidrati((cb) => Math.max(0, cb - (deSters.carbohidrati || 0)));
      setNumarMese((n) => Math.max(0, n - 1));
      return prev.filter((m) => m.id !== id);
    });
  }, []);

  // S10 (U-09): adăugare optimistă — reflectă instant o masă tocmai salvată, înainte
  // ca reîmprospătarea server-side să reconcilieze lista. Oglinda lui optimisticDeleteMeal.
  // Plafoanele totalurilor → aceleași ca în fetchData (safeTotalC/P/G/Carbi).
  const optimisticAddMeal = useCallback((masa: Masa) => {
    setMese((prev) => [masa, ...prev]);
    setTotalCalorii((c) => Math.min(100000, Math.max(0, c + (masa.calorii || 0))));
    setTotalProteine((p) => Math.min(5000, Math.max(0, p + (masa.proteine || 0))));
    setTotalGrasimi((g) => Math.min(5000, Math.max(0, g + (masa.grasimi || 0))));
    setTotalCarbohidrati((cb) => Math.min(5000, Math.max(0, cb + (masa.carbohidrati || 0))));
    setNumarMese((n) => (n ?? 0) + 1);
  }, []);

  return {
    mese,
    meseGrupate,
    categoriiMeseList,
    totalCalorii,
    totalProteine,
    totalGrasimi,
    totalCarbohidrati,
    numarMese,
    caloriiTinta,
    proteineTinta,
    carbiTinta,
    grasimiTinta,
    greutate,
    user,
    loading,
    eroareFetch,
    refresh: fetchData,
    optimisticDeleteMeal,
    optimisticAddMeal,
  };
}

