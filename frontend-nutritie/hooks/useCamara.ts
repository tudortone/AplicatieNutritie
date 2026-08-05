
import React, { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import type { ProdusScanat } from '../lib/openfoodfacts';
import { calculateDaysUntilExpiry } from './useDaysUntilExpiry';
import { checkAndSchedulePantryExpiryNotification } from '../lib/pantryNotifications';

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
  zile_valabilitate?: number; // zile rămase până la expirare (dinamic)
  is_congelat?: boolean; // opțiunea de congelator (carne, fructe congelate)
}

const LOCAL_CAMARA_KEY = 'nutriai_camara_local_v3';

export function useCamara() {
  const [produse, setProduse] = useState<ProdusCamara[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // refs for cleanup and avoid race-conditions
  const isMounted = React.useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const fetchProduse = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let remoteProduse: ProdusCamara[] = [];
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // Proiectie explicita + plafon: evita select('*') (aduce coloane
        // nefolosite) si un payload nelimitat. Capul de 200 acopera o camera
        // reala cu multa marja; produsele locale se combina oricum dupa.
        const { data, error } = await supabase
          .from('produse_camara')
          .select('id, user_id, barcode, nume, brand, calorii_100g, proteine_100g, grasimi_100g, carbohidrati_100g, imagine_url, created_at, cantitate, cantitate_g, data_expirare, zile_valabilitate, is_congelat')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(200);

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
        let dataExp = p.data_expirare;
        if (!dataExp) {
          const zile = typeof p.zile_valabilitate === 'number' ? p.zile_valabilitate : (p.is_congelat ? 90 : 14);
          dataExp = new Date(new Date(p.created_at || Date.now()).getTime() + zile * 86_400_000).toISOString().split('T')[0];
        }
        const dLeft = calculateDaysUntilExpiry(dataExp);
        combinedMap.set(p.id, {
          ...p,
          cantitate: p.cantitate || 1,
          data_expirare: dataExp,
          zile_valabilitate: dLeft !== null ? dLeft : (p.is_congelat ? 90 : (p.zile_valabilitate || 14)),
        });
      }
      for (const p of localProduse) {
        if (!combinedMap.has(p.id)) {
          let dataExp = p.data_expirare;
          if (!dataExp) {
            const zile = typeof p.zile_valabilitate === 'number' ? p.zile_valabilitate : (p.is_congelat ? 90 : 14);
            dataExp = new Date(new Date(p.created_at || Date.now()).getTime() + zile * 86_400_000).toISOString().split('T')[0];
          }
          const dLeft = calculateDaysUntilExpiry(dataExp);
          combinedMap.set(p.id, {
            ...p,
            cantitate: p.cantitate || 1,
            data_expirare: dataExp,
            zile_valabilitate: dLeft !== null ? dLeft : (p.is_congelat ? 90 : (p.zile_valabilitate || 14)),
          });
        }
      }

      const merged = Array.from(combinedMap.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      if (isMounted.current) {
        setProduse(merged);
        checkAndSchedulePantryExpiryNotification(merged).catch(() => {});
      }
    } catch (e) {
      console.warn('Eroare fetch camara:', e);
      if (isMounted.current) setError('Eroare la încărcarea produselor din cămară.');
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProduse();
  }, [fetchProduse]);

  const salveazaLocalList = async (list: ProdusCamara[]) => {
    try {
      await AsyncStorage.setItem(LOCAL_CAMARA_KEY, JSON.stringify(list));
      checkAndSchedulePantryExpiryNotification(list).catch(() => {});
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

    const existentIndex = produse.findIndex(
      (p) =>
        (item.barcode && item.barcode !== 'MANUAL' && p.barcode === item.barcode) ||
        p.nume.trim().toLowerCase() === item.nume.trim().toLowerCase()
    );

    if (existentIndex >= 0) {
      const produsExistent = produse[existentIndex];
      const nouaCantitate = (produsExistent.cantitate || 1) + (options?.cantitate || 1);
      let dataExp = options?.dataExpirare ?? produsExistent.data_expirare;
      if (!dataExp) {
        const zile = options?.zileValabilitate ?? produsExistent.zile_valabilitate ?? (options?.isCongelat ? 90 : 14);
        dataExp = new Date(Date.now() + zile * 86_400_000).toISOString().split('T')[0];
      }
      const dLeft = calculateDaysUntilExpiry(dataExp);
      const actualizat: ProdusCamara = {
        ...produsExistent,
        cantitate: nouaCantitate,
        is_congelat: options?.isCongelat ?? produsExistent.is_congelat,
        data_expirare: dataExp,
        zile_valabilitate: dLeft !== null ? dLeft : (options?.zileValabilitate || (options?.isCongelat ? 90 : produsExistent.zile_valabilitate)),
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
    const zileVal = options?.zileValabilitate || (options?.isCongelat ? 90 : 14);
    const dataExp = options?.dataExpirare || new Date(Date.now() + zileVal * 86_400_000).toISOString().split('T')[0];
    const dLeft = calculateDaysUntilExpiry(dataExp);
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
      data_expirare: dataExp,
      zile_valabilitate: dLeft !== null ? dLeft : zileVal,
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
          // FIX: aceste coloane exista in schema dar nu erau trimise => se pierdeau la reinstalare.
          cantitate: nouProdus.cantitate ?? 1,
          data_expirare: nouProdus.data_expirare || null,
          zile_valabilitate: nouProdus.zile_valabilitate ?? null,
          is_congelat: nouProdus.is_congelat ?? false,
          updated_at: now,
        };

        const { data, error } = await supabase
          .from('produse_camara')
          .insert([payload])
          .select()
          .single();

        if (error) {
          console.warn('[Camara] Insert produs in Supabase esuat:', error.message ?? error);
        }
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

  const toggleCongelator = async (id: string) => {
    const nouaLista = produse.map((p) => {
      if (p.id !== id) return p;
      const willFreeze = !p.is_congelat;

      // Calculează data de expirare păstrând timpul deja scurs de la adăugare
      let dataExp: string;
      const now = Date.now();

      // Folosește created_at (timestamp ISO) pentru a calcula cât timp a trecut
      const addedTime = p.created_at ? new Date(p.created_at).getTime() : now;
      const elapsedDays = Math.max(0, (now - addedTime) / 86_400_000);

      if (willFreeze) {
        // Înghețare: shelf life-ul rămas se extinde (aprox 6x)
        const freshShelfDays = 14; // perioada default la adăugare
        const remainingDays = Math.max(1, freshShelfDays - elapsedDays);
        const frozenDays = Math.max(90, Math.ceil(remainingDays * 6));
        dataExp = new Date(now + frozenDays * 86_400_000).toISOString().split('T')[0];
      } else {
        // Dezghețare: shelf life scurt (7 zile de acum)
        dataExp = new Date(now + 7 * 86_400_000).toISOString().split('T')[0];
      }

      const dLeft = calculateDaysUntilExpiry(dataExp);
      return {
        ...p,
        is_congelat: willFreeze,
        data_expirare: dataExp,
        zile_valabilitate: dLeft !== null ? dLeft : (willFreeze ? 90 : 7),
      };
    });
    setProduse(nouaLista);
    await salveazaLocalList(nouaLista);
  };

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
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from('produse_camara').delete().eq('id', id).eq('user_id', user?.id);
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

  /**
   * Modul 4.B Selecție ingrediente & link către RecipeBuilder (useInRecipe)
   */
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(produse.map((p) => p.id)));
  }, [produse]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const useInRecipe = useCallback((): ProdusCamara[] => {
    if (selectedIds.size === 0) return produse;
    return produse.filter((p) => selectedIds.has(p.id));
  }, [produse, selectedIds]);

  return {
    produse,
    loading,
    error,
    selectedIds,
    toggleSelect,
    selectAll,
    clearSelection,
    useInRecipe,
    adaugaProdus,
    modificaCantitate,
    toggleCongelator,
    stergeProdus,
    cautaLocal,
    refresh: fetchProduse,
  };
}
