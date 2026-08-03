import { cautaProdusRomanescLocal } from '../constants/produseRomanesti';
import { API_URL } from '../constants/config';
import { supabase } from '../supabase';
import type { AminoaciziEsentiali, Micronutrienti } from '../types';

export interface ProdusScanat {
  barcode: string;
  nume: string;
  brand?: string;
  calorii_100g: number;
  proteine_100g: number;
  grasimi_100g: number;
  carbohidrati_100g: number;
  aminoacizi_100g?: AminoaciziEsentiali;
  micronutrienti_100g?: Micronutrienti;
  imagine_url?: string;
  sursa?: string;
  estimat?: boolean;
}

const finitePositive = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

function extractAminoacizi(nutriments: Record<string, unknown>): AminoaciziEsentiali | undefined {
  const map: Record<string, keyof AminoaciziEsentiali> = {
    leucine_100g: 'leucina', isoleucine_100g: 'izoleucina', valine_100g: 'valina',
    lysine_100g: 'lizina', methionine_100g: 'metionina', phenylalanine_100g: 'fenilalanina',
    threonine_100g: 'treonina', tryptophan_100g: 'triptofan', histidine_100g: 'istidina',
  };
  const result: AminoaciziEsentiali = {};
  let found = false;
  for (const [apiKey, localKey] of Object.entries(map)) {
    const value = finitePositive(nutriments[apiKey]);
    if (value) {
      result[localKey] = Math.round(value * 1000);
      found = true;
    }
  }
  return found ? result : undefined;
}

function extractMicronutrienti(nutriments: Record<string, unknown>): Micronutrienti | undefined {
  const map: Array<[string, keyof Micronutrienti, 'mg' | 'ug' | 'g']> = [
    ['vitamin-a_100g', 'vitamina_a', 'ug'], ['vitamin-c_100g', 'vitamina_c', 'mg'],
    ['vitamin-d_100g', 'vitamina_d', 'ug'], ['vitamin-e_100g', 'vitamina_e', 'mg'],
    ['vitamin-k_100g', 'vitamina_k', 'ug'], ['vitamin-b1_100g', 'vitamina_b1', 'mg'],
    ['vitamin-b2_100g', 'vitamina_b2', 'mg'], ['vitamin-pp_100g', 'vitamina_b3', 'mg'],
    ['vitamin-b6_100g', 'vitamina_b6', 'mg'], ['vitamin-b9_100g', 'vitamina_b9', 'ug'],
    ['vitamin-b12_100g', 'vitamina_b12', 'ug'], ['calcium_100g', 'calciu', 'mg'],
    ['iron_100g', 'fier', 'mg'], ['magnesium_100g', 'magneziu', 'mg'],
    ['phosphorus_100g', 'fosfor', 'mg'], ['potassium_100g', 'potasiu', 'mg'],
    ['sodium_100g', 'sodiu', 'mg'], ['zinc_100g', 'zinc', 'mg'],
    ['copper_100g', 'cupru', 'mg'], ['manganese_100g', 'mangan', 'mg'],
    ['selenium_100g', 'seleniu', 'ug'], ['iodine_100g', 'iod', 'ug'],
    ['sugars_100g', 'zaharuri', 'g'], ['saturated-fat_100g', 'grasimi_saturate', 'g'],
    ['trans-fat_100g', 'grasimi_trans', 'g'], ['cholesterol_100g', 'colesterol', 'mg'],
    ['fiber_100g', 'fibra', 'g'],
  ];
  const result: Micronutrienti = {};
  let found = false;
  for (const [apiKey, localKey, unit] of map) {
    const value = finitePositive(nutriments[apiKey]);
    if (!value) continue;
    result[localKey] = unit === 'ug'
      ? Math.round(value * 1_000_000)
      : unit === 'mg'
        ? Math.round(value * 1000)
        : Math.round(value * 100) / 100;
    found = true;
  }
  return found ? result : undefined;
}

function normalizeProduct(code: string, product: Record<string, any>, source: string): ProdusScanat {
  const nutriments = (product.nutriments || product) as Record<string, unknown>;
  return {
    barcode: code,
    nume: product.nume || product.product_name_ro || product.product_name || `Produs EAN ${code}`,
    brand: product.brand || product.brands || product.brand_owner || '',
    calorii_100g: Math.round(finitePositive(product.calorii ?? nutriments['energy-kcal_100g'] ?? nutriments['energy-kcal'])),
    proteine_100g: Math.round(finitePositive(product.proteine ?? nutriments.proteins_100g ?? nutriments.proteins)),
    grasimi_100g: Math.round(finitePositive(product.grasimi ?? nutriments.fat_100g ?? nutriments.fat)),
    carbohidrati_100g: Math.round(finitePositive(product.carbohidrati ?? nutriments.carbohydrates_100g ?? nutriments.carbohydrates)),
    aminoacizi_100g: product.aminoacizi_100g || extractAminoacizi(nutriments),
    micronutrienti_100g: product.micronutrienti_100g || extractMicronutrienti(nutriments),
    imagine_url: product.imagine_url || product.image_front_small_url || product.image_url || undefined,
    sursa: source,
  };
}

/** Bază locală → backend autentificat → OpenFoodFacts public. */
export async function getProdusByBarcode(barcode: string): Promise<ProdusScanat | null> {
  const code = barcode.trim();
  if (!code) return null;

  const local = cautaProdusRomanescLocal(code);
  if (local) return { ...local, sursa: 'local' };

  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token && API_URL) {
      const response = await fetch(`${API_URL}/api/produs-barcode/${encodeURIComponent(code)}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      if (response.ok) {
        const payload = await response.json();
        if (payload?.produs) return normalizeProduct(code, payload.produs, payload.source || 'backend');
      }
    }
  } catch (error) {
    console.warn('[Barcode] Backend indisponibil, folosim OpenFoodFacts:', error);
  }

  try {
    // URL direct catre OpenFoodFacts
    //
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'NutriAI/1.0 (contact: tudortone)',
      },
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (data?.status !== 1 || !data.product) return null;
    return normalizeProduct(code, data.product, 'openfoodfacts');
  } catch (error) {
    console.warn('[Barcode] OpenFoodFacts indisponibil:', error);
    return null;
  }
}
