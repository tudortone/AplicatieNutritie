import { useState, useEffect, useCallback } from 'react';
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

export function useCamara() {
  const [produse, setProduse] = useState<ProdusCamara[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProduse = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setProduse([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('produse_camara')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Eroare la citirea produselor din camara (posibil tabela lipseste):', error.message);
        setProduse([]);
      } else if (data) {
        setProduse(data as ProdusCamara[]);
      }
    } catch (e) {
      console.warn('Eroare fetch camara:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProduse();
  }, [fetchProduse]);

  const adaugaProdus = async (item: ProdusScanat) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Utilizator neautentificat');

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
        created_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('produse_camara')
        .insert([payload])
        .select()
        .single();

      if (error) throw error;
      await fetchProduse();
      return data as ProdusCamara;
    } catch (err) {
      console.error('Eroare la salvare produs camara:', err);
      throw err;
    }
  };

  const stergeProdus = async (id: string) => {
    try {
      const { error } = await supabase
        .from('produse_camara')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await fetchProduse();
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
