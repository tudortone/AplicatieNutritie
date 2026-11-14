
import React, { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import type { ProdusScanat } from '../lib/openfoodfacts';
import { calculateDaysUntilExpiry } from './useDaysUntilExpiry';
import { checkAndSchedulePantryExpiryNotification } from '../lib/pantryNotifications';
import { normalizePantryText } from '../components/camara/pantryUtils';

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
  cantitate_g?: number; // grame totale rămase (când e urmărit la gram)
  data_expirare?: string; // data de expirare YYYY-MM-DD
  zile_valabilitate?: number; // zile rămase până la expirare (dinamic)
  is_congelat?: boolean; // opțiunea de congelator (carne, fructe congelate)
}

export type ProdusCamaraUpdate = Partial<
  Pick<ProdusCamara, 'cantitate' | 'cantitate_g' | 'data_expirare' | 'zile_valabilitate' | 'is_congelat' | 'nume' | 'brand'>
>;

export type ConsumePantryResult =
  | { status: 'not_found' }
  | { status: 'consumed'; item: ProdusCamara }
  | { status: 'updated_grams'; item: ProdusCamara; remainingGrams: number }
  | { status: 'updated_count'; item: ProdusCamara; remainingCount: number };

const LOCAL_CAMARA_KEY = 'nutriai_camara_local_v3';

const normalizeFetchedProdus = (p: ProdusCamara & { kcal_100g?: number | null }): ProdusCamara => {
  let dataExp = p.data_expirare;
  if (!dataExp) {
    const zile = typeof p.zile_valabilitate === 'number' ? p.zile_valabilitate : (p.is_congelat ? 90 : 14);
    dataExp = new Date(new Date(p.created_at || Date.now()).getTime() + zile * 86_400_000).toISOString().split('T')[0];
  }
  const dLeft = calculateDaysUntilExpiry(dataExp);
  const rawKcal = p.calorii_100g ?? p.kcal_100g;
  const safeKcal = typeof rawKcal === 'number' && Number.isFinite(rawKcal) ? rawKcal : 0;
  return {
    ...p,
    calorii_100g: safeKcal,
    cantitate: p.cantitate || 1,
    cantitate_g: typeof p.cantitate_g === 'number' && p.cantitate_g > 0 ? p.cantitate_g : undefined,
    data_expirare: dataExp,
    zile_valabilitate: dLeft !== null ? dLeft : (p.is_congelat ? 90 : (p.zile_valabilitate || 14)),
  };
};

export function useCamara() {
  const [produse, setProduse] = useState<ProdusCamara[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Ref sincron pentru lista curentă (evită closure stale la tap-uri rapide +/-)
  const produseRef = useRef<ProdusCamara[]>([]);
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const commitProduse = useCallback((nextList: ProdusCamara[]) => {
    produseRef.current = nextList;
    if (isMounted.current) {
      setProduse(nextList);
    }
  }, []);

  const fetchProduse = useCallback(async () => {
    setLoading(true);
    setError(null);
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
        combinedMap.set(p.id, normalizeFetchedProdus(p));
      }
      for (const p of localProduse) {
        if (!combinedMap.has(p.id)) {
          combinedMap.set(p.id, normalizeFetchedProdus(p));
        }
      }

      const merged = Array.from(combinedMap.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      commitProduse(merged);
      if (isMounted.current) {
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
    item: ProdusScanat & { cantitate_g?: number },
    options?: {
      zileValabilitate?: number;
      dataExpirare?: string;
      isCongelat?: boolean;
      cantitate?: number;
      cantitate_g?: number;
    }
  ): Promise<ProdusCamara> => {
    const { data: { user } } = await supabase.auth.getUser();
    const now = new Date().toISOString();
    const current = produseRef.current;

    const existentIndex = current.findIndex(
      (p) =>
        (item.barcode && item.barcode !== 'MANUAL' && p.barcode === item.barcode) ||
        normalizePantryText(p.nume) === normalizePantryText(item.nume)
    );

    if (existentIndex >= 0) {
      const produsExistent = current[existentIndex];
      const nouaCantitate = (produsExistent.cantitate || 1) + (options?.cantitate || 1);
      const addedGrams = options?.cantitate_g ?? item.cantitate_g;
      const nouaCantitateG =
        typeof addedGrams === 'number' && addedGrams > 0
          ? Math.round((produsExistent.cantitate_g || 0) + addedGrams)
          : produsExistent.cantitate_g;
      let dataExp = options?.dataExpirare ?? produsExistent.data_expirare;
      if (!dataExp) {
        const zile = options?.zileValabilitate ?? produsExistent.zile_valabilitate ?? (options?.isCongelat ? 90 : 14);
        dataExp = new Date(Date.now() + zile * 86_400_000).toISOString().split('T')[0];
      }
      const dLeft = calculateDaysUntilExpiry(dataExp);
      const nextZile = dLeft !== null ? dLeft : (options?.zileValabilitate || (options?.isCongelat ? 90 : produsExistent.zile_valabilitate));
      const actualizat: ProdusCamara = {
        ...produsExistent,
        cantitate: nouaCantitate,
        cantitate_g: nouaCantitateG,
        is_congelat: options?.isCongelat ?? produsExistent.is_congelat,
        data_expirare: dataExp,
        zile_valabilitate: nextZile,
      };

      const nouaLista = produseRef.current.map((p) => (p.id === produsExistent.id ? actualizat : p));
      commitProduse(nouaLista);
      await salveazaLocalList(nouaLista);

      if (user && !produsExistent.id.startsWith('camara_')) {
        try {
          await supabase
            .from('produse_camara')
            .update({
              cantitate: nouaCantitate,
              cantitate_g: nouaCantitateG ?? null,
              data_expirare: dataExp ?? null,
              zile_valabilitate: nextZile ?? null,
              is_congelat: actualizat.is_congelat ?? false,
              updated_at: now,
            })
            .eq('id', produsExistent.id)
            .eq('user_id', user.id);
        } catch {}
      }
      return actualizat;
    }

    const localId = `camara_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const zileVal = options?.zileValabilitate || (options?.isCongelat ? 90 : 14);
    const dataExp = options?.dataExpirare || new Date(Date.now() + zileVal * 86_400_000).toISOString().split('T')[0];
    const dLeft = calculateDaysUntilExpiry(dataExp);
    const rawGrams = options?.cantitate_g ?? item.cantitate_g;
    const initialGrams = typeof rawGrams === 'number' && rawGrams > 0 ? Math.round(rawGrams) : undefined;
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
      cantitate_g: initialGrams,
      data_expirare: dataExp,
      zile_valabilitate: dLeft !== null ? dLeft : zileVal,
      is_congelat: options?.isCongelat || false,
    };

    if (user) {
      try {
        const payload = {
          user_id: user.id,
          barcode: nouProdus.barcode,
          nume: nouProdus.nume,
          brand: nouProdus.brand || null,
          calorii_100g: nouProdus.calorii_100g,
          kcal_100g: nouProdus.calorii_100g,
          proteine_100g: nouProdus.proteine_100g,
          grasimi_100g: nouProdus.grasimi_100g,
          carbohidrati_100g: nouProdus.carbohidrati_100g,
          imagine_url: nouProdus.imagine_url || null,
          created_at: now,
          // FIX: aceste coloane exista in schema dar nu erau trimise => se pierdeau la reinstalare.
          cantitate: nouProdus.cantitate ?? 1,
          cantitate_g: nouProdus.cantitate_g ?? null,
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
          nouProdus.id = data.id;
        }
      } catch {}
    }

    const nouaLista = [nouProdus, ...produseRef.current];
    commitProduse(nouaLista);
    await salveazaLocalList(nouaLista);
    return nouProdus;
  };

  const toggleCongelator = async (id: string) => {
    const nouaLista = produseRef.current.map((p) => {
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
    commitProduse(nouaLista);
    await salveazaLocalList(nouaLista);

    const { data: { user } } = await supabase.auth.getUser();
    if (user && !id.startsWith('camara_')) {
      const actualizat = nouaLista.find((p) => p.id === id);
      if (actualizat) {
        try {
          await supabase
            .from('produse_camara')
            .update({
              is_congelat: actualizat.is_congelat,
              data_expirare: actualizat.data_expirare,
              zile_valabilitate: actualizat.zile_valabilitate,
              updated_at: new Date().toISOString(),
            })
            .eq('id', id)
            .eq('user_id', user.id);
        } catch {}
      }
    }
  };

  const stergeProdus = async (id: string) => {
    try {
      const nouaLista = produseRef.current.filter((p) => p.id !== id);
      commitProduse(nouaLista);
      await salveazaLocalList(nouaLista);

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.id && !id.startsWith('camara_')) {
          await supabase.from('produse_camara').delete().eq('id', id).eq('user_id', user.id);
        }
      } catch {}
    } catch (err) {
      console.error('Eroare stergere produs camara:', err);
    }
  };

  const modificaCantitate = async (id: string, delta: number) => {
    const existent = produseRef.current.find((p) => p.id === id);
    if (!existent) return;
    const nouaCantitate = (existent.cantitate || 1) + delta;
    if (nouaCantitate <= 0) {
      await stergeProdus(id);
      return;
    }
    const nouaLista = produseRef.current.map((p) => (p.id === id ? { ...p, cantitate: nouaCantitate } : p));
    commitProduse(nouaLista);
    await salveazaLocalList(nouaLista);

    const { data: { user } } = await supabase.auth.getUser();
    if (user && !id.startsWith('camara_')) {
      try {
        await supabase
          .from('produse_camara')
          .update({ cantitate: nouaCantitate, updated_at: new Date().toISOString() })
          .eq('id', id)
          .eq('user_id', user.id);
      } catch {}
    }
  };

  const actualizeazaProdus = async (
    id: string,
    updates: ProdusCamaraUpdate
  ): Promise<ProdusCamara | null> => {
    const existent = produseRef.current.find((p) => p.id === id);
    if (!existent) return null;

    const nextExp = updates.data_expirare !== undefined ? updates.data_expirare : existent.data_expirare;
    let nextZile = updates.zile_valabilitate !== undefined ? updates.zile_valabilitate : existent.zile_valabilitate;
    if (updates.data_expirare !== undefined && updates.zile_valabilitate === undefined) {
      const computed = calculateDaysUntilExpiry(updates.data_expirare);
      if (computed !== null) nextZile = computed;
    }

    const nextCantitate =
      updates.cantitate !== undefined ? Math.max(1, Math.round(updates.cantitate)) : existent.cantitate ?? 1;
    const nextCantitateG =
      updates.cantitate_g !== undefined
        ? updates.cantitate_g > 0
          ? Math.round(updates.cantitate_g)
          : undefined
        : existent.cantitate_g;

    const actualizat: ProdusCamara = {
      ...existent,
      ...updates,
      cantitate: nextCantitate,
      cantitate_g: nextCantitateG,
      data_expirare: nextExp,
      zile_valabilitate: nextZile,
    };

    const nouaLista = produseRef.current.map((p) => (p.id === id ? actualizat : p));
    commitProduse(nouaLista);
    await salveazaLocalList(nouaLista);

    const { data: { user } } = await supabase.auth.getUser();
    if (user && !id.startsWith('camara_')) {
      try {
        await supabase
          .from('produse_camara')
          .update({
            nume: actualizat.nume,
            brand: actualizat.brand ?? null,
            cantitate: actualizat.cantitate ?? 1,
            cantitate_g: actualizat.cantitate_g ?? null,
            data_expirare: actualizat.data_expirare ?? null,
            zile_valabilitate: actualizat.zile_valabilitate ?? null,
            is_congelat: actualizat.is_congelat ?? false,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .eq('user_id', user.id);
      } catch {}
    }

    return actualizat;
  };

  const consumaDinCamara = async ({
    id,
    name,
    usedGrams,
  }: {
    id?: string;
    name?: string;
    usedGrams?: number;
  }): Promise<ConsumePantryResult> => {
    const current = produseRef.current;
    const target =
      (id ? current.find((p) => p.id === id) : undefined) ??
      (name
        ? current.find((p) => normalizePantryText(p.nume) === normalizePantryText(name))
        : undefined);

    if (!target) return { status: 'not_found' };

    if (
      typeof target.cantitate_g === 'number' &&
      target.cantitate_g > 0 &&
      typeof usedGrams === 'number' &&
      usedGrams > 0
    ) {
      const remainingGrams = Math.round(target.cantitate_g - usedGrams);
      if (remainingGrams > 0) {
        const updated = await actualizeazaProdus(target.id, { cantitate_g: remainingGrams });
        return {
          status: 'updated_grams',
          item: updated ?? { ...target, cantitate_g: remainingGrams },
          remainingGrams,
        };
      }
      if ((target.cantitate || 1) > 1) {
        const remainingCount = (target.cantitate || 1) - 1;
        const updated = await actualizeazaProdus(target.id, {
          cantitate: remainingCount,
          cantitate_g: 0,
        });
        return {
          status: 'updated_count',
          item: updated ?? { ...target, cantitate: remainingCount, cantitate_g: undefined },
          remainingCount,
        };
      }
      await stergeProdus(target.id);
      return { status: 'consumed', item: target };
    }

    if ((target.cantitate || 1) > 1) {
      const remainingCount = (target.cantitate || 1) - 1;
      await modificaCantitate(target.id, -1);
      return {
        status: 'updated_count',
        item: { ...target, cantitate: remainingCount },
        remainingCount,
      };
    }

    await stergeProdus(target.id);
    return { status: 'consumed', item: target };
  };

  const cautaLocal = (query: string): ProdusCamara[] => {
    const q = normalizePantryText(query);
    const current = produseRef.current;
    if (!q) return current;
    return current.filter(
      (p) =>
        normalizePantryText(p.nume).includes(q) ||
        (p.brand && normalizePantryText(p.brand).includes(q)) ||
        (p.barcode && p.barcode.toLowerCase().includes(q))
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
    setSelectedIds(new Set(produseRef.current.map((p) => p.id)));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const useInRecipe = useCallback((): ProdusCamara[] => {
    const current = produseRef.current;
    if (selectedIds.size === 0) return current;
    return current.filter((p) => selectedIds.has(p.id));
  }, [selectedIds]);

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
    actualizeazaProdus,
    consumaDinCamara,
    toggleCongelator,
    stergeProdus,
    cautaLocal,
    refresh: fetchProduse,
  };
}
