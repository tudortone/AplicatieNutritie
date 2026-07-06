import { useState, useCallback } from 'react';
import { supabase } from '../supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Masa } from '../types';
import type { User } from '@supabase/supabase-js';

export function useMeseAzi() {
  const [mese, setMese] = useState<Masa[]>([]);
  const [totalCalorii, setTotalCalorii] = useState(0);
  const [totalProteine, setTotalProteine] = useState(0);
  const [totalGrasimi, setTotalGrasimi] = useState(0);
  const [totalCarbohidrati, setTotalCarbohidrati] = useState(0);
  const [numarMese, setNumarMese] = useState(0);
  const [user, setUser] = useState<User | null>(null);
  
  const [caloriiTinta, setCaloriiTinta] = useState(2000);
  const [proteineTinta, setProteineTinta] = useState(150);
  const [greutate, setGreutate] = useState(75);

  const [loading, setLoading] = useState(true);

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
      if (!g) {
        const storedG = await AsyncStorage.getItem('greutate');
        g = storedG ? parseInt(storedG) : 75;
      }

      setCaloriiTinta(Number(cTinta));
      setProteineTinta(Number(pTinta));
      setGreutate(Number(g));

      // 2. Încarcă mesele din ziua curentă
      const inceputulZilei = new Date();
      inceputulZilei.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('mese')
        .select('*')
        .eq('user_id', currentUser.id)
        .gte('created_at', inceputulZilei.toISOString())
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
    } catch (e) {
      console.error("Eroare neașteptată în hook-ul useMeseAzi:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    mese,
    totalCalorii,
    totalProteine,
    totalGrasimi,
    totalCarbohidrati,
    numarMese,
    caloriiTinta,
    proteineTinta,
    greutate,
    user,
    loading,
    refresh: fetchData,
  };
}
