import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import type { ProdusScanat } from '../lib/openfoodfacts';

export interface ProdusCamara {
  id: string;
  user_id: string;
  barcode: string;
  nume: string;
  brand?: string;
  calorii_100g: number;
  proteine_100g: number;
  grasimi_100g: number;
  carbohidrati_100g: number;
  imagine_url?: string;
  created_at: string;
}

const LOCAL_CAMARA_KEY = 'nutriai_camara_local';

export function useCamara() {
  const [produse, setProduse] = useState<ProdusCamara[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProduse = useCallback(async () => {
    setLoading(true);
    try {
      let remoteProduse: ProdusCamara[] = [];
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { data, error } = await supabase
          .from('produse_camara')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) {
          console.warn('Eroare sau tabelă lipsă produse_camara în Supabase. Folosim stocare locală:', error.message);
        } else if (data) {
          remoteProduse = data as ProdusCamara[];
        }
      }

      // Încarcă și produsele salvate local (fallback)
      let localProduse: ProdusCamara[] = [];
      try {
        const localSaved = await AsyncStorage.getItem(LOCAL_CAMARA_KEY);
        if (localSaved) {
          localProduse = JSON.parse(localSaved);
        }
      } catch (e) {
        console.warn('Eroare citire camara local:', e);
      }

      // Combină produsele (fără duplicate de id)
      const combinedMap = new Map<string, ProdusCamara>();
      for (const p of remoteProduse) {
        combinedMap.set(p.id, p);
      }
      for (const p of localProduse) {
        if (!combinedMap.has(p.id)) {
          combinedMap.set(p.id, p);
        }
      }

      const merged = Array.from(combinedMap.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setProduse(merged);
    } catch (e) {
      console.warn('Eroare fetch camara:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProduse();
  }, [fetchProduse]);

  const adaugaProdus = async (item: ProdusScanat): Promise<ProdusCamara> => {
    const { data: { user } } = await supabase.auth.getUser();
    const now = new Date().toISOString();

    const localId = `camara_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nouProdus: ProdusCamara = {
      id: localId,
      user_id: user ? user.id : 'local_user',
      barcode: item.barcode,
      nume: item.nume,
      brand: item.brand || undefined,
      calorii_100g: item.calorii_100g,
      proteine_100g: item.proteine_100g,
      grasimi_100g: item.grasimi_100g,
      carbohidrati_100g: item.carbohidrati_100g,
      imagine_url: item.imagine_url || undefined,
      created_at: now,
    };

    // Încercăm salvare în Supabase
    let savedRemote = false;
    if (user) {
      try {
        const payload = {
          user_id: user.id,
          barcode: item.barcode,
          nume: item.nume,
          brand: item.brand || null,
          calorii_100g: item.calorii_100g,
          proteine_100g: item.proteine_100g,
          grasimi_100g: item.grasimi_100g,
          carbohidrati_100g: item.carbohidrati_100g,
          imagine_url: item.imagine_url || null,
          created_at: now,
        };

        const { data, error } = await supabase
          .from('produse_camara')
          .insert([payload])
          .select()
          .single();

        if (!error && data) {
          savedRemote = true;
          nouProdus.id = data.id;
        }
      } catch (err) {
        console.warn('Supabase save failed, saving to local storage:', err);
      }
    }

    // Dacă salvarea remote nu a reușit (sau nu este logat), salvăm garantat local în AsyncStorage
    if (!savedRemote) {
      try {
        const existingRaw = await AsyncStorage.getItem(LOCAL_CAMARA_KEY);
        const existing: ProdusCamara[] = existingRaw ? JSON.parse(existingRaw) : [];
        const actualizat = [nouProdus, ...existing];
        await AsyncStorage.setItem(LOCAL_CAMARA_KEY, JSON.stringify(actualizat));
      } catch (e) {
        console.error('Eroare salvare locala camara:', e);
      }
    }

    setProduse(prev => [nouProdus, ...prev]);
    return nouProdus;
  };

  const stergeProdus = async (id: string) => {
    try {
      // Încercăm ștergere din Supabase
      try {
        await supabase.from('produse_camara').delete().eq('id', id);
      } catch {}

      // Ștergere din stocarea locală
      const existingRaw = await AsyncStorage.getItem(LOCAL_CAMARA_KEY);
      if (existingRaw) {
        const existing: ProdusCamara[] = JSON.parse(existingRaw);
        const filtrate = existing.filter(p => p.id !== id);
        await AsyncStorage.setItem(LOCAL_CAMARA_KEY, JSON.stringify(filtrate));
      }

      setProduse(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      console.error('Eroare stergere produs camara:', err);
      throw err;
    }
  };

  const cautaLocal = (query: string): ProdusCamara[] => {
    const q = query.trim().toLowerCase();
    if (!q) return produse;
    return produse.filter(p =>
      p.nume.toLowerCase().includes(q) ||
      (p.brand && p.brand.toLowerCase().includes(q)) ||
      p.barcode.includes(q)
    );
  };

  return {
    produse,
    loading,
    adaugaProdus,
    stergeProdus,
    cautaLocal,
    refresh: fetchProduse,
  };
}
