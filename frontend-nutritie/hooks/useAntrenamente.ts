import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { calculeazaCaloriiArse } from '../constants/exercitii';
import type { User } from '@supabase/supabase-js';

export interface SetExercitiu {
  serie: number;
  repetari: number;
  greutate?: number;
}

export interface ExercitiuInAntrenament {
  exercitiuId: string;
  nume: string;
  seturi: SetExercitiu[];
  durataMin?: number;
  kcal: number;
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
  created_at: string;
}

export function useAntrenamente(dataSelectata?: Date) {
  const [antrenamente, setAntrenamente] = useState<Antrenament[]>([]);
  const [totalCaloriiArse, setTotalCaloriiArse] = useState(0);
  const [numarAntrenamente, setNumarAntrenamente] = useState(0);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  const targetDate = dataSelectata || new Date();
  const dateKey = targetDate.toDateString();

  const fetchAntrenamente = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      if (!currentUser) {
        setLoading(false);
        return;
      }
      setUser(currentUser);

      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      const { data, error } = await supabase
        .from('antrenamente')
        .select('*')
        .eq('user_id', currentUser.id)
        .gte('created_at', startOfDay.toISOString())
        .lte('created_at', endOfDay.toISOString())
        .order('created_at', { ascending: false });

      if (error) {
        console.warn(
          'Eroare la citirea antrenamentelor (posibil tabela nu exista inca):',
          error.message
        );
        setAntrenamente([]);
        setTotalCaloriiArse(0);
        setNumarAntrenamente(0);
      } else if (data) {
        setAntrenamente(data as Antrenament[]);
        const total = data.reduce((sum, item) => sum + (item.calorii_arse || 0), 0);
        setTotalCaloriiArse(total);
        setNumarAntrenamente(data.length);
      }
    } catch (e) {
      console.warn('Eroare fetch antrenamente:', e);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey]);

  const fetchIstoric = useCallback(async (zile: number = 30): Promise<Antrenament[]> => {
    try {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      if (!currentUser) return [];

      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - zile);
      pastDate.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('antrenamente')
        .select('*')
        .eq('user_id', currentUser.id)
        .gte('created_at', pastDate.toISOString())
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Eroare fetch istoric antrenamente:', error.message);
        return [];
      }
      return (data || []) as Antrenament[];
    } catch (e) {
      console.warn('Eroare fetchIstoric:', e);
      return [];
    }
  }, []);

  useEffect(() => {
    fetchAntrenamente();
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
      if (!currentUser) throw new Error('Nu ești autentificat.');

      let calorii = payload.calorii_arse || 0;
      if (!calorii && payload.met) {
        let greutateKg = currentUser.user_metadata?.greutate;
        if (!greutateKg) {
          const storedG = await AsyncStorage.getItem('greutate');
          greutateKg = storedG ? parseFloat(storedG) : 75;
        }
        calorii = calculeazaCaloriiArse(payload.met, greutateKg || 75, payload.durata_min);
      }

      const row = {
        user_id: currentUser.id,
        nume: payload.nume.trim(),
        tip: payload.tip,
        durata_min: payload.durata_min,
        calorii_arse: calorii,
        exercitii: payload.exercitii ?? [],
        volum_total: payload.volum_total ?? 0,
        created_at: new Date().toISOString(),
      };

      const { data, error } = await supabase.from('antrenamente').insert([row]).select().single();

      if (error) throw error;
      await fetchAntrenamente();
      return data as Antrenament;
    } catch (error) {
      console.error('Eroare la adaugarea antrenamentului:', error);
      throw error;
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
      const { error } = await supabase.from('antrenamente').delete().eq('id', id);

      if (error) throw error;
      await fetchAntrenamente();
    } catch (error) {
      console.error('Eroare la stergerea antrenamentului:', error);
      throw error;
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
