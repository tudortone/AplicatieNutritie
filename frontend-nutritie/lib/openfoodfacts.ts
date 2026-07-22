import { cautaProdusRomanescLocal } from '../constants/produseRomanesti';
import { API_URL } from '../constants/config';
import { supabase } from '../supabase';
import { AminoaciziEsentiali } from '../types';

export interface ProdusScanat {
  barcode: string;
  nume: string;
  brand?: string;
  calorii_100g: number;
  proteine_100g: number;
  grasimi_100g: number;
  carbohidrati_100g: number;
  aminoacizi_100g?: AminoaciziEsentiali;
  imagine_url?: string;
  sursa?: string;
}

/**
 * Caută un produs după codul de bare (1. Bază locală -> 2. Backend cu Cache & AI -> 3. OpenFoodFacts API direct).
 */
export async function getProdusByBarcode(barcode: string): Promise<ProdusScanat | null> {
  const code = barcode.trim();
  if (!code) return null;

  // 1. Verificare bază locală rapidă
  const local = cautaProdusRomanescLocal(code);
  if (local) {
    return { ...local, sursa: 'local' };
  }

  // 2. Interogare backend NutriAI (/api/produs-barcode/:code)
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;

    if (token) {
      const respBackend = await fetch(`${API_URL}/api/produs-barcode/${code}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (respBackend.ok) {
        const payload = await respBackend.json();
        if (payload && payload.produs) {
          const p = payload.produs;
          return {
            barcode: code,
            nume: p.nume || `Produs EAN ${code}`,
            brand: p.brand || '',
            calorii_100g: Math.round(Number(p.calorii || 0)),
            proteine_100g: Math.round(Number(p.proteine || 0)),
            grasimi_100g: Math.round(Number(p.grasimi || 0)),
            carbohidrati_100g: Math.round(Number(p.carbohidrati || 0)),
            sursa: payload.source || 'backend'
          };
        }
      }
    }
  } catch (errBackend) {
    console.warn('Avertisment interogare backend barcode:', errBackend);
  }

  // 3. Fallback direct la OpenFoodFacts API (dacă nu e conectat sau backend-ul nu răspunde)
  try {
    const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json`, {
      headers: {
        'User-Agent': 'NutriAI - React Native App - Contact: tudortone'
      }
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (data.status !== 1 || !data.product) {
      return null;
    }

    const p = data.product;
    const nutriments = p.nutriments || {};

    const calorii = Math.round(Number(nutriments['energy-kcal_100g'] || nutriments['energy-kcal'] || 0));
    const proteine = Math.round(Number(nutriments['proteins_100g'] || nutriments['proteins'] || 0));
    const grasimi = Math.round(Number(nutriments['fat_100g'] || nutriments['fat'] || 0));
    const carbohidrati = Math.round(Number(nutriments['carbohydrates_100g'] || nutriments['carbohydrates'] || 0));

    const numeProdus = p.product_name_ro || p.product_name || `Produs EAN ${code}`;
    const brand = p.brands || p.brand_owner || '';

    return {
      barcode: code,
      nume: numeProdus,
      brand: brand,
      calorii_100g: calorii,
      proteine_100g: proteine,
      grasimi_100g: grasimi,
      carbohidrati_100g: carbohidrati,
      imagine_url: p.image_front_small_url || p.image_url || undefined,
      sursa: 'openfoodfacts'
    };
  } catch (error) {
    console.warn('Eroare fetch OpenFoodFacts direct:', error);
    return null;
  }
}
