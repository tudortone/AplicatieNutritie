import { cautaProdusRomanescLocal } from '../constants/produseRomanesti';
import { API_URL } from '../constants/config';
import { supabase } from '../supabase';
import { AminoaciziEsentiali, Micronutrienti } from '../types';

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
}

/** Extrage aminoacizii din răspunsul OpenFoodFacts (mg per 100g) */
function extractAminoacizi(nutriments: any): AminoaciziEsentiali | undefined {
  const map: Record<string, keyof AminoaciziEsentiali> = {
    'leucine_100g': 'leucina',
    'isoleucine_100g': 'izoleucina',
    'valine_100g': 'valina',
    'lysine_100g': 'lizina',
    'methionine_100g': 'metionina',
    'phenylalanine_100g': 'fenilalanina',
    'threonine_100g': 'treonina',
    'tryptophan_100g': 'triptofan',
    'histidine_100g': 'istidina',
  };
  const result: AminoaciziEsentiali = {};
  let hasAny = false;
  for (const [apiKey, localKey] of Object.entries(map)) {
    const val = Number(nutriments[apiKey]);
    if (val > 0) {
      result[localKey] = Math.round(val * 1000); // g → mg
      hasAny = true;
    }
  }
  return hasAny ? result : undefined;
}

/** Extrage micronutrienții din răspunsul OpenFoodFacts (per 100g) */
function extractMicronutrienti(nutriments: any): Micronutrienti | undefined {
  const mapping: Array<{ apiKey: string; localKey: keyof Micronutrienti; unit: 'mg' | 'ug' | 'g' }> = [
    // Vitamine
    { apiKey: 'vitamin-a_100g', localKey: 'vitamina_a', unit: 'ug' },
    { apiKey: 'vitamin-c_100g', localKey: 'vitamina_c', unit: 'mg' },
    { apiKey: 'vitamin-d_100g', localKey: 'vitamina_d', unit: 'ug' },
    { apiKey: 'vitamin-e_100g', localKey: 'vitamina_e', unit: 'mg' },
    { apiKey: 'vitamin-k_100g', localKey: 'vitamina_k', unit: 'ug' },
    { apiKey: 'vitamin-b1_100g', localKey: 'vitamina_b1', unit: 'mg' },
    { apiKey: 'vitamin-b2_100g', localKey: 'vitamina_b2', unit: 'mg' },
    { apiKey: 'vitamin-pp_100g', localKey: 'vitamina_b3', unit: 'mg' },
    { apiKey: 'vitamin-b6_100g', localKey: 'vitamina_b6', unit: 'mg' },
    { apiKey: 'vitamin-b9_100g', localKey: 'vitamina_b9', unit: 'ug' },
    { apiKey: 'vitamin-b12_100g', localKey: 'vitamina_b12', unit: 'ug' },
    // Minerale
    { apiKey: 'calcium_100g', localKey: 'calciu', unit: 'mg' },
    { apiKey: 'iron_100g', localKey: 'fier', unit: 'mg' },
    { apiKey: 'magnesium_100g', localKey: 'magneziu', unit: 'mg' },
    { apiKey: 'phosphorus_100g', localKey: 'fosfor', unit: 'mg' },
    { apiKey: 'potassium_100g', localKey: 'potasiu', unit: 'mg' },
    { apiKey: 'sodium_100g', localKey: 'sodiu', unit: 'mg' },
    { apiKey: 'zinc_100g', localKey: 'zinc', unit: 'mg' },
    { apiKey: 'copper_100g', localKey: 'cupru', unit: 'mg' },
    { apiKey: 'manganese_100g', localKey: 'mangan', unit: 'mg' },
    { apiKey: 'selenium_100g', localKey: 'seleniu', unit: 'ug' },
    { apiKey: 'iodine_100g', localKey: 'iod', unit: 'ug' },
    // Altele
    { apiKey: 'sugars_100g', localKey: 'zaharuri', unit: 'g' },
    { apiKey: 'saturated-fat_100g', localKey: 'grasimi_saturate', unit: 'g' },
    { apiKey: 'trans-fat_100g', localKey: 'grasimi_trans', unit: 'g' },
    { apiKey: 'cholesterol_100g', localKey: 'colesterol', unit: 'mg' },
    { apiKey: 'fiber_100g', localKey: 'fibra', unit: 'g' },
  ];

  const result: Micronutrienti = {};
  let hasAny = false;

  for (const { apiKey, localKey, unit } of mapping) {
    const val = Number(nutriments[apiKey]);
    if (val > 0) {
      if (unit === 'mg') {
        result[localKey] = Math.round(val * 1000);
      } else if (unit === 'ug') {
        result[localKey] = Math.round(val * 1000000);
      } else {
        result[localKey] = Math.round(val * 100) / 100;
      }
      hasAny = true;
    }
  }

  return hasAny ? result : undefined;
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
            aminoacizi_100g: p.aminoacizi_100g,
            micronutrienti_100g: p.micronutrienti_100g,
            imagine_url: p.imagine_url,
            sursa: payload.source || 'backend'
          };
        }
      }
    }
  } catch (errBackend) {
    console.warn('Avertisment interogare backend barcode:', errBackend);
  }

  // 3. Fallback direct la OpenFoodFacts API
  try {
    const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json`, {
      headers: {
        'User-Agent': 'NutriAI - React Native App - Contact: tudortone'
      }
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data.status !== 1 || !data.product) return null;

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
      aminoacizi_100g: extractAminoacizi(nutriments),
      micronutrienti_100g: extractMicronutrienti(nutriments),
      imagine_url: p.image_front_small_url || p.image_url || undefined,
      sursa: 'openfoodfacts'
    };
  } catch (error) {
    console.warn('Eroare fetch OpenFoodFacts direct:', error);
    return null;
  }
}
