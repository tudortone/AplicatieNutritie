import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Masa, TipMasa, AlimentDetaliat } from '../types';
import { getTipMasaDupaOra } from '../lib/mealUtils';
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
        return;
      }
      setUser(currentUser);

      // 1. Încarcă profile targets din user_metadata
      const userMetadata = currentUser.user_metadata || {};
      
      let cTinta = userMetadata.caloriiTinta;
      let pTinta = userMetadata.proteineTinta;
      let cbTinta = userMetadata.carbiTinta;
      let grTinta = userMetadata.grasimiTinta;
      let g = userMetadata.greutate;

      // Fallback la AsyncStorage
      if (!cTinta) {
        const storedC = await AsyncStorage.getItem('caloriiTinta');
        cTinta = storedC ? parseInt(storedC) : 2000;
      }
      if (!pTinta) {
        const storedP = await AsyncStorage.getItem('proteineTinta');
        pTinta = storedP ? parseInt(storedP) : 150;
      }
      if (!cbTinta) {
        const storedCb = await AsyncStorage.getItem('carbiTinta');
        cbTinta = storedCb ? parseInt(storedCb) : 250;
      }
      if (!grTinta) {
        const storedGr = await AsyncStorage.getItem('grasimiTinta');
        grTinta = storedGr ? parseInt(storedGr) : 70;
      }
      if (!g) {
        const storedG = await AsyncStorage.getItem('greutate');
        g = storedG ? parseInt(storedG) : 75;
      }

      setCaloriiTinta(Number(cTinta));
      setProteineTinta(Number(pTinta));
      setCarbiTinta(Number(cbTinta));
      setGrasimiTinta(Number(grTinta));
      setGreutate(Number(g));

      // 2. Încarcă mesele din ziua selectată sau curentă
      let startOfDay: Date;
      let endOfDay: Date;
      if (dataSelectata) {
        startOfDay = new Date(dataSelectata);
        startOfDay.setHours(0, 0, 0, 0);
        endOfDay = new Date(dataSelectata);
        endOfDay.setHours(23, 59, 59, 999);
      } else {
        startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);
      }

      const { data: meseData, error: meseError } = await supabase
        .from('mese')
        .select('*')
        .eq('user_id', currentUser.id)
        .gte('created_at', startOfDay.toISOString())
        .lte('created_at', endOfDay.toISOString())
        .order('created_at', { ascending: false });

      if (isStale()) return; // ❗ guard anti-race: nu suprascrie stare cu rezultat învechit

      if (meseError) {
        console.error("Eroare fetch mese Supabase:", meseError.message);
      } else if (meseData) {
        const parsedMese = meseData as Masa[];
        
        let totalC = 0, totalP = 0, totalG = 0, totalCarbs = 0;
        parsedMese.forEach(m => {
          let alimenteArr: AlimentDetaliat[] = [];
          if (Array.isArray(m.alimente)) {
            alimenteArr = m.alimente;
          } else if (typeof m.alimente === 'string') {
            try {
              const parsed = JSON.parse(m.alimente);
              if (Array.isArray(parsed)) alimenteArr = parsed;
            } catch {}
          }
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

        setMese(parsedMese);
        setTotalCalorii(totalC);
        setTotalProteine(totalP);
        setTotalGrasimi(totalG);
        setTotalCarbohidrati(totalCarbs);
        setNumarMese(parsedMese.length);
      }
    } catch (e) {
      console.error("Eroare neașteptată în hook-ul useMeseAzi:", e);
    } finally {
      // Marcăm ca încărcat doar dacă suntem încă montați și nu am fost invalidați
      if (!isStale()) {
        hasLoadedDateRef.current = dateKey;
        setLoading(false);
      }
    }
  }, [dateKey, dataSelectata]);

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
    refresh: fetchData,
  };
}
