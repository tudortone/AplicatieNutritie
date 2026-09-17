import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Masa, TipMasa } from '../types';
import { getTipMasaDupaOra, parseAlimente } from '../lib/mealUtils';
import { calculeazaTotaluriZi, totaluriPentruAfisare } from '../lib/nutritionTotals';
import { aboneazaLaModificariMese } from '../lib/freshnessMese';
import { citesteTargeturiPending } from '../lib/sincronizeazaTargeturi';
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
  // P1-03: `mese` este SINGURA stare canonică a zilei. Totalurile nu mai sunt
  // stare separată — se derivă din ea prin autoritatea unică
  // (`lib/nutritionTotals.ts`). Astfel nu mai pot exista două „adevăruri" care
  // să divergă: orice mutație a listei reface automat toate totalurile.
  const [mese, setMese] = useState<Masa[]>([]);
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
      // REV-003: Dacă există un payload pending dedicat acestui utilizator autentificat
      // (salvare offline), acele valori reprezintă intenția cea mai recentă și sunt
      // preferate față de server metadata stale.
      const userMetadata = currentUser.user_metadata || {};
      const pending = currentUser.id ? await citesteTargeturiPending(currentUser.id) : null;
      const pendingTargets = pending?.userId === currentUser.id ? pending.targets : undefined;

      const rezolva = (metadataVal: number | undefined, localVal: number | undefined, fallback: number): number => {
        if (typeof localVal === 'number' && Number.isFinite(localVal)) return localVal;
        if (typeof metadataVal === 'number' && Number.isFinite(metadataVal)) return metadataVal;
        return fallback;
      };

      setCaloriiTinta(rezolva(userMetadata.caloriiTinta, pendingTargets?.caloriiTinta, 2000));
      setProteineTinta(rezolva(userMetadata.proteineTinta, pendingTargets?.proteineTinta, 150));
      setCarbiTinta(rezolva(userMetadata.carbiTinta, pendingTargets?.carbiTinta, 250));
      setGrasimiTinta(rezolva(userMetadata.grasimiTinta, pendingTargets?.grasimiTinta, 70));
      setGreutate(rezolva(userMetadata.greutate, pendingTargets?.greutate, 75));

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

        // Normalizare de formă (compoziție + categorie). Totalurile NU se mai
        // calculează aici: se derivă din `mese` prin autoritatea unică.
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
        });

        setMese(parsedMese);
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

  // P1-04: invalidare DETERMINISTĂ după o salvare verificată. Fără ea, Home se
  // baza pe `useFocusRefresh`, care are throttle de 5s — o salvare din cameră sau
  // din chat urmată de revenirea rapidă pe Home sărea refresh-ul și afișa
  // totaluri vechi. Acum prospețimea nu mai depinde de niciun cronometru.
  //
  // Scopat pe proprietar (P0-02): ignorăm semnalele altui utilizator, ca datele
  // lui A să nu poată împrospăta ecranul lui B.
  useEffect(() => aboneazaLaModificariMese((userIdSemnal) => {
    if (!isMountedRef.current) return;
    if (!user?.id || userIdSemnal !== user.id) return;
    fetchData(true, false);
  }), [fetchData, user?.id]);

  // P1-03: totalurile zilei — derivate, niciodată stare separată. Aceeași funcție
  // canonică alimentează Home, Jurnalul și rezumatul zilei, deci nu pot diverge.
  const totaluriZi = useMemo(
    () => totaluriPentruAfisare(calculeazaTotaluriZi(mese)),
    [mese],
  );
  const numarMese = mese.length;

  const { meseGrupate, categoriiMeseList } = useMemo(() => {
    const grupuri: MeseGrupateMap = {
      mic_dejun: { id: 'mic_dejun', label: 'Mic Dejun', icon: '🍳', mese: [], totalCalorii: 0, totalProteine: 0, totalCarbohidrati: 0, totalGrasimi: 0, totalFibre: 0 },
      pranz: { id: 'pranz', label: 'Prânz', icon: '🍲', mese: [], totalCalorii: 0, totalProteine: 0, totalCarbohidrati: 0, totalGrasimi: 0, totalFibre: 0 },
      gustare: { id: 'gustare', label: 'Gustări', icon: '🍎', mese: [], totalCalorii: 0, totalProteine: 0, totalCarbohidrati: 0, totalGrasimi: 0, totalFibre: 0 },
      cina: { id: 'cina', label: 'Cină', icon: '🥗', mese: [], totalCalorii: 0, totalProteine: 0, totalCarbohidrati: 0, totalGrasimi: 0, totalFibre: 0 },
    };

    mese.forEach(m => {
      const tip: TipMasa = m.tip_masa && grupuri[m.tip_masa] ? m.tip_masa : 'gustare';
      grupuri[tip].mese.push(m);
    });

    // P1-03: totalurile pe categorie folosesc EXACT aceeași autoritate ca totalul
    // zilei și rămân valori BRUTE (nerotunjite).
    //
    // De ce brute: rotunjirea fiecărei categorii și apoi însumarea lor dă un
    // rezultat diferit de rotunjirea sumei (dublă rotunjire — 95.5 în loc de 95.4
    // pe fixtura canonică). Invariantul „suma categoriilor == totalul zilei" poate
    // fi garantat doar pe valori brute; rotunjirea rămâne exclusiv la prezentare.
    (Object.keys(grupuri) as TipMasa[]).forEach((tip) => {
      const cat = grupuri[tip];
      const t = calculeazaTotaluriZi(cat.mese);
      cat.totalCalorii = t.calorii;
      cat.totalProteine = t.proteine;
      cat.totalCarbohidrati = t.carbohidrati;
      cat.totalGrasimi = t.grasimi;
      cat.totalFibre = t.fibre;
    });

    const listaOrd = ['mic_dejun', 'pranz', 'cina', 'gustare'].map(k => grupuri[k as TipMasa]);

    return { meseGrupate: grupuri, categoriiMeseList: listaOrd };
  }, [mese]);

  // P1-03: mutațiile optimiste ating DOAR setul canonic de mese. Totalurile se
  // recalculează din el, deci nu mai există aritmetică pe deltă peste valori deja
  // rotunjite — tiparul care făcea ca „adaugă apoi șterge" să nu readucă totalul
  // inițial și ca ecranele să divergă între ele.
  const optimisticDeleteMeal = useCallback((id: string) => {
    setMese((prev) => (prev.some((m) => m.id === id) ? prev.filter((m) => m.id !== id) : prev));
  }, []);

  // S10 (U-09): adăugare optimistă — reflectă instant o masă tocmai salvată, înainte
  // ca reîmprospătarea server-side să reconcilieze lista. Oglinda lui optimisticDeleteMeal.
  const optimisticAddMeal = useCallback((masa: Masa) => {
    setMese((prev) => {
      // Aceeași masă canonică nu poate contribui de două ori: dacă `refresh()` a
      // adus-o deja de pe server, adăugarea optimistă nu o dublează.
      if (masa?.id && prev.some((m) => m.id === masa.id)) return prev;
      return [masa, ...prev];
    });
  }, []);

  return {
    mese,
    meseGrupate,
    categoriiMeseList,
    // Contractul public rămâne neschimbat pentru consumatori; sursa lor este acum
    // autoritatea unică, nu patru calculatoare separate.
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
    user,
    loading,
    eroareFetch,
    refresh: fetchData,
    optimisticDeleteMeal,
    optimisticAddMeal,
  };
}

