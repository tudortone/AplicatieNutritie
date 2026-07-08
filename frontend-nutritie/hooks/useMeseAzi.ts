import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Masa } from '../types';
import type { User } from '@supabase/supabase-js';

export function useMeseAzi(dataSelectata?: Date) {
  const [mese, setMese] = useState<Masa[]>([]);
  const [zileCuMese, setZileCuMese] = useState<string[]>([]);
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

  const dateKey = dataSelectata?.toDateString() ?? '';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Apel unic la getUser() pentru securitate și evitarea cererilor rețea duble (B6)
      const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser();
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
      const targetDate = dataSelectata || new Date();
      const inceputulZilei = new Date(targetDate);
      inceputulZilei.setHours(0, 0, 0, 0);
      const sfarsitulZilei = new Date(targetDate);
      sfarsitulZilei.setHours(23, 59, 59, 999);

      const { data, error } = await supabase
        .from('mese')
        .select('*')
        .eq('user_id', currentUser.id)
        .gte('created_at', inceputulZilei.toISOString())
        .lte('created_at', sfarsitulZilei.toISOString())
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Eroare fetch mese Supabase:", error.message);
      } else if (data) {
        const parsedMese = data as Masa[];
        setMese(parsedMese);
        
        let totalC = 0, totalP = 0, totalG = 0, totalCarbs = 0;
        parsedMese.forEach(m => {
          totalC += m.calorii || 0;
          totalP += m.proteine || 0;
          totalG += m.grasimi || 0;
          totalCarbs += m.carbohidrati || 0;
        });
        setTotalCalorii(totalC);
        setTotalProteine(totalP);
        setTotalGrasimi(totalG);
        setTotalCarbohidrati(totalCarbs);
        setNumarMese(parsedMese.length);
      }

      // 3. Fetch data pentru zile marcate (ultimele 90 de zile + viitor)
      const startDeVerificat = new Date();
      startDeVerificat.setDate(startDeVerificat.getDate() - 90);
      const { data: toateMesele } = await supabase
        .from('mese')
        .select('created_at')
        .eq('user_id', currentUser.id)
        .gte('created_at', startDeVerificat.toISOString());
        
      if (toateMesele) {
        const setZile = new Set<string>();
        toateMesele.forEach(m => {
          if (m.created_at) {
            setZile.add(m.created_at.split('T')[0]);
          }
        });
        setZileCuMese(Array.from(setZile));
      }
    } catch (e) {
      console.error("Eroare neașteptată în hook-ul useMeseAzi:", e);
    } finally {
      setLoading(false);
    }
  }, [dateKey]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    mese,
    zileCuMese,
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
