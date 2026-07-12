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
  cantitate?: number; // număr de bucăți / stack
  cantitate_g?: number; // grame per bucată
  data_expirare?: string; // data de expirare YYYY-MM-DD
  zile_valabilitate?: number; // zile rămase până la expirare
  is_congelat?: boolean; // opțiunea de congelator (carne, fructe congelate)
}

const LOCAL_CAMARA_KEY = 'nutriai_camara_local_v3';

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

        if (!error && data) {
          remoteProduse = data as ProdusCamara[];
        }
      }

      let localProduse: ProdusCamara[] = [];
      try {
        const localSaved = await AsyncStorage.getItem(LOCAL_CAMARA_KEY);
        if (localSaved) {
          localProduse = JSON.parse(localSaved);
        }
      } catch (e) {
        console.warn('Eroare citire camara local:', e);
      }

      const combinedMap = new Map<string, ProdusCamara>();
      for (const p of remoteProduse) {
        combinedMap.set(p.id, {
          ...p,
          cantitate: p.cantitate || 1,
        });
      }
      for (const p of localProduse) {
        if (!combinedMap.has(p.id)) {
          combinedMap.set(p.id, {
            ...p,
            cantitate: p.cantitate || 1,
          });
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

  const salveazaLocalList = async (list: ProdusCamara[]) => {
    try {
      await AsyncStorage.setItem(LOCAL_CAMARA_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn('Eroare salvare locala camara:', e);
    }
  };

  /**
   * Adaugă produs sau STACHEAZĂ (crește cantitatea) dacă produsul există deja în Cămară
   */
  const adaugaProdus = async (
    item: ProdusScanat,
    options?: {
      zileValabilitate?: number;
      dataExpirare?: string;
      isCongelat?: boolean;
      cantitate?: number;
    }
  ): Promise<ProdusCamara> => {
    const { data: { user } } = await supabase.auth.getUser();
    const now = new Date().toISOString();

    // Verificăm dacă produsul există deja în Cămară (după barcode sau nume identic) pentru STACARE
    const existentIndex = produse.findIndex(
      (p) =>
        (item.barcode && item.barcode !== 'MANUAL' && p.barcode === item.barcode) ||
        p.nume.trim().toLowerCase() === item.nume.trim().toLowerCase()
    );

    if (existentIndex >= 0) {
      // Stacăm: creștem cantitatea
      const produsExistent = produse[existentIndex];
      const nouaCantitate = (produsExistent.cantitate || 1) + (options?.cantitate || 1);
      const actualizat: ProdusCamara = {
        ...produsExistent,
        cantitate: nouaCantitate,
        is_congelat: options?.isCongelat ?? produsExistent.is_congelat,
        data_expirare: options?.dataExpirare ?? produsExistent.data_expirare,
      };

      const nouaLista = produse.map((p, i) => (i === existentIndex ? actualizat : p));
      setProduse(nouaLista);
      await salveazaLocalList(nouaLista);

      if (user && !produsExistent.id.startsWith('camara_')) {
        try {
          await supabase
            .from('produse_camara')
            .update({ cantitate: nouaCantitate })
            .eq('id', produsExistent.id);
        } catch {}
      }
      return actualizat;
    }

    const localId = `camara_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nouProdus: ProdusCamara = {
      id: localId,
      user_id: user ? user.id : 'local_user',
      barcode: item.barcode || 'MANUAL',
      nume: item.nume,
      brand: item.brand || undefined,
      calorii_100g: item.calorii_100g || 0,
      proteine_100g: item.proteine_100g || 0,
      grasimi_100g: item.grasimi_100g || 0,
      carbohidrati_100g: item.carbohidrati_100g || 0,
      imagine_url: item.imagine_url || undefined,
      created_at: now,
      cantitate: options?.cantitate || 1,
      data_expirare: options?.dataExpirare,
      zile_valabilitate: options?.zileValabilitate || (options?.isCongelat ? 90 : 14),
      is_congelat: options?.isCongelat || false,
    };

    let savedRemote = false;
    if (user) {
      try {
        const payload = {
          user_id: user.id,
          barcode: nouProdus.barcode,
          nume: nouProdus.nume,
          brand: nouProdus.brand || null,
          calorii_100g: nouProdus.calorii_100g,
          proteine_100g: nouProdus.proteine_100g,
          grasimi_100g: nouProdus.grasimi_100g,
          carbohidrati_100g: nouProdus.carbohidrati_100g,
          imagine_url: nouProdus.imagine_url || null,
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
      } catch {}
    }

    const nouaLista = [nouProdus, ...produse];
    setProduse(nouaLista);
    await salveazaLocalList(nouaLista);
    return nouProdus;
  };

  /**
   * Comută starea de CONGELATOR ❄️ (extinde valabilitatea pentru carne/alimente)
   */
  const toggleCongelator = async (id: string) => {
    const nouaLista = produse.map((p) => {
      if (p.id !== id) return p;
      const willFreeze = !p.is_congelat;
      return {
        ...p,
        is_congelat: willFreeze,
        zile_valabilitate: willFreeze ? 90 : 7,
      };
    });
    setProduse(nouaLista);
    await salveazaLocalList(nouaLista);
  };

  /**
   * Scade cantitatea unui produs din Cămară (sau îl șterge când ajunge la 0)
   */
  const modificaCantitate = async (id: string, delta: number) => {
    const existent = produse.find((p) => p.id === id);
    if (!existent) return;
    const nouaCantitate = (existent.cantitate || 1) + delta;
    if (nouaCantitate <= 0) {
      await stergeProdus(id);
      return;
    }
    const nouaLista = produse.map((p) => (p.id === id ? { ...p, cantitate: nouaCantitate } : p));
    setProduse(nouaLista);
    await salveazaLocalList(nouaLista);
  };

  const stergeProdus = async (id: string) => {
    try {
      try {
        await supabase.from('produse_camara').delete().eq('id', id);
      } catch {}

      const nouaLista = produse.filter((p) => p.id !== id);
      setProduse(nouaLista);
      await salveazaLocalList(nouaLista);
    } catch (err) {
      console.error('Eroare stergere produs camara:', err);
    }
  };

  const cautaLocal = (query: string): ProdusCamara[] => {
    const q = query.trim().toLowerCase();
    if (!q) return produse;
    return produse.filter(
      (p) =>
        p.nume.toLowerCase().includes(q) ||
        (p.brand && p.brand.toLowerCase().includes(q)) ||
        p.barcode.includes(q)
    );
  };

  return {
    produse,
    loading,
    adaugaProdus,
    modificaCantitate,
    toggleCongelator,
    stergeProdus,
    cautaLocal,
    refresh: fetchProduse,
  };
}
