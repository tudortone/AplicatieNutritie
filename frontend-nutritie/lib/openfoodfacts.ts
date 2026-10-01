import { cautaProdusRomanescLocal } from '../constants/produseRomanesti';
import { API_URL } from '../constants/config';
import { API_PREFIX } from './api';
import { supabase } from '../supabase';
import type { AminoaciziEsentiali, Micronutrienti } from '../../backend-nutritie-ai/contracts/nutritie/types';

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
      // CAM-008: timeout și pentru backend — un endpoint mort nu blochează scanner-ul.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(`${API_URL}${API_PREFIX}/produs-barcode/${encodeURIComponent(code)}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          signal: controller.signal,
        });
        if (response.ok) {
          const payload = await response.json();
          if (payload?.produs) return normalizeProduct(code, payload.produs, payload.source || 'backend');
        }
      } finally {
        clearTimeout(timeoutId);
      }
    }
  } catch (error) {
    console.warn('[Barcode] Eroare la interogarea backend-ului pentru codul de bare:', error);
  }

  // Fallback direct către OpenFoodFacts API v3 dacă backend-ul nu a răspuns
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(code)}.json`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'NutriFlow-App/1.0 (Android; https://nutriai.ro; contact@nutriai.ro)',
        },
        signal: controller.signal,
      });
      if (response.ok) {
        const data = await response.json();
        if (data?.product) {
          return normalizeProduct(code, data.product, 'openfoodfacts');
        }
      }
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err) {
    console.warn('[Barcode] Eroare directă OpenFoodFacts:', err);
  }

  return null;
}

const OFF_SEARCH_URL = 'https://search.openfoodfacts.org/search';
const OFF_USER_AGENT = 'NutriFlow-App/1.0 (Android; https://nutriai.ro; contact@nutriai.ro)';

/**
 * Caută produse în catalogul mondial OpenFoodFacts (Search-a-licious).
 * Preia toate informațiile nutriționale: poze, Nutri-Score, NOVA, ingrediente, alergeni, macro și micro.
 */
export async function cautaProduseOpenFoodFacts(
  termen: string,
  signal?: AbortSignal,
): Promise<import('../components/food/types').FoodProduct[]> {
  const q = (termen || '').trim();
  if (q.length < 2) return [];

  try {
    const res = await fetch(OFF_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': OFF_USER_AGENT,
      },
      body: JSON.stringify({
        q,
        page: 1,
        page_size: 24,
        fields: [
          'code',
          'product_name',
          'product_name_ro',
          'product_name_en',
          'brands',
          'image_url',
          'image_front_url',
          'image_front_small_url',
          'nutriscore_grade',
          'nutriscore_score',
          'nova_group',
          'ecoscore_grade',
          'ingredients_text',
          'ingredients_text_ro',
          'allergens',
          'allergens_tags',
          'traces',
          'serving_size',
          'serving_quantity',
          'nutriments',
        ],
        langs: ['ro', 'en', 'fr', 'de'],
      }),
      signal,
    });

    if (!res.ok) return [];

    const data = await res.json();
    const hits: any[] = Array.isArray(data.hits)
      ? data.hits
      : Array.isArray(data.hits?.hits)
        ? data.hits.hits.map((h: any) => h._source || h)
        : [];

    return hits
      .filter((hit) => Boolean(hit && (hit.product_name || hit.product_name_ro || hit.product_name_en)))
      .map((hit, idx) => {
        const nutriments = (hit.nutriments || {}) as Record<string, unknown>;
        const rawBrand = Array.isArray(hit.brands) ? hit.brands.join(', ') : hit.brands || '';
        const allergensList = hit.allergens || (Array.isArray(hit.allergens_tags) ? hit.allergens_tags.map((a: string) => a.replace(/^[a-z]+:/, '')).join(', ') : undefined);
        const imageUrl = hit.image_front_url || hit.image_url || hit.image_front_small_url || undefined;
        const imageSmallUrl = hit.image_front_small_url || hit.image_url || undefined;

        const kcal = Math.round(finitePositive(nutriments['energy-kcal_100g'] ?? nutriments['energy-kcal']));
        const prot = Math.round(finitePositive(nutriments.proteins_100g ?? nutriments.proteins) * 10) / 10;
        const carbs = Math.round(finitePositive(nutriments.carbohydrates_100g ?? nutriments.carbohydrates) * 10) / 10;
        const fat = Math.round(finitePositive(nutriments.fat_100g ?? nutriments.fat) * 10) / 10;
        const sugars = Math.round(finitePositive(nutriments.sugars_100g ?? nutriments.sugars) * 10) / 10;
        const satFat = Math.round(finitePositive(nutriments['saturated-fat_100g'] ?? nutriments['saturated-fat']) * 10) / 10;
        const fiber = Math.round(finitePositive(nutriments.fiber_100g ?? nutriments.fiber) * 10) / 10;
        const salt = Math.round(finitePositive(nutriments.salt_100g ?? nutriments.salt) * 100) / 100;
        const sodium = Math.round(finitePositive(nutriments.sodium_100g ?? nutriments.sodium) * 1000);

        return {
          id: `off_${hit.code || idx}_${Date.now()}`,
          source: 'openfoodfacts' as const,
          name: hit.product_name_ro || hit.product_name || hit.product_name_en || 'Aliment',
          brand: rawBrand ? rawBrand.slice(0, 80) : undefined,
          barcode: hit.code ? String(hit.code) : undefined,
          imageUrl,
          imageSmallUrl,
          nutriscoreGrade: hit.nutriscore_grade ? String(hit.nutriscore_grade).toLowerCase() : undefined,
          nutriscoreScore: typeof hit.nutriscore_score === 'number' ? hit.nutriscore_score : undefined,
          novaGroup: typeof hit.nova_group === 'number' ? hit.nova_group : undefined,
          ecoscoreGrade: hit.ecoscore_grade ? String(hit.ecoscore_grade).toLowerCase() : undefined,
          ingredientsText: hit.ingredients_text_ro || hit.ingredients_text || hit.ingredients_text_en || undefined,
          allergens: allergensList || undefined,
          servingLabel: hit.serving_size ? String(hit.serving_size) : undefined,
          servingGrams: hit.serving_quantity ? Number(hit.serving_quantity) : undefined,
          kcalPer100g: kcal,
          proteinPer100g: prot,
          carbsPer100g: carbs,
          fatPer100g: fat,
          sugarPer100g: sugars || undefined,
          saturatedFatPer100g: satFat || undefined,
          fiberPer100g: fiber || undefined,
          saltPer100g: salt || undefined,
          sodiumPer100g: sodium || undefined,
          aminoacizi: extractAminoacizi(nutriments),
          micronutrienti: extractMicronutrienti(nutriments),
          verified: true,
        };
      });
  } catch (err: any) {
    if (err?.name !== 'AbortError') {
      console.warn('[OpenFoodFacts] Eroare căutare produse:', err);
    }
    return [];
  }
}

/**
 * Preia toate detaliile complete ale unui produs după codul de bare direct de pe OpenFoodFacts v3 API.
 */
export async function getDetaliiCompleteProdus(
  barcode: string,
): Promise<Partial<import('../components/food/types').FoodProduct> | null> {
  const code = (barcode || '').trim();
  if (!code) return null;

  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(code)}.json`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': OFF_USER_AGENT,
      },
    });
    if (!res.ok) return null;

    const data = await res.json();
    const p = data?.product;
    if (!p) return null;

    const nutriments = (p.nutriments || {}) as Record<string, unknown>;
    const rawBrand = Array.isArray(p.brands) ? p.brands.join(', ') : p.brands || '';
    const allergensList = p.allergens || (Array.isArray(p.allergens_tags) ? p.allergens_tags.map((a: string) => a.replace(/^[a-z]+:/, '')).join(', ') : undefined);

    return {
      name: p.product_name_ro || p.product_name || p.product_name_en,
      brand: rawBrand ? rawBrand.slice(0, 80) : undefined,
      barcode: code,
      imageUrl: p.image_front_url || p.image_url || p.image_front_small_url,
      nutriscoreGrade: p.nutriscore_grade ? String(p.nutriscore_grade).toLowerCase() : undefined,
      nutriscoreScore: typeof p.nutriscore_score === 'number' ? p.nutriscore_score : undefined,
      novaGroup: typeof p.nova_group === 'number' ? p.nova_group : undefined,
      ecoscoreGrade: p.ecoscore_grade ? String(p.ecoscore_grade).toLowerCase() : undefined,
      ingredientsText: p.ingredients_text_ro || p.ingredients_text || p.ingredients_text_en,
      allergens: allergensList,
      servingLabel: p.serving_size ? String(p.serving_size) : undefined,
      servingGrams: p.serving_quantity ? Number(p.serving_quantity) : undefined,
      kcalPer100g: Math.round(finitePositive(nutriments['energy-kcal_100g'] ?? nutriments['energy-kcal'])),
      proteinPer100g: Math.round(finitePositive(nutriments.proteins_100g ?? nutriments.proteins) * 10) / 10,
      carbsPer100g: Math.round(finitePositive(nutriments.carbohydrates_100g ?? nutriments.carbohydrates) * 10) / 10,
      fatPer100g: Math.round(finitePositive(nutriments.fat_100g ?? nutriments.fat) * 10) / 10,
      sugarPer100g: Math.round(finitePositive(nutriments.sugars_100g ?? nutriments.sugars) * 10) / 10,
      saturatedFatPer100g: Math.round(finitePositive(nutriments['saturated-fat_100g'] ?? nutriments['saturated-fat']) * 10) / 10,
      fiberPer100g: Math.round(finitePositive(nutriments.fiber_100g ?? nutriments.fiber) * 10) / 10,
      saltPer100g: Math.round(finitePositive(nutriments.salt_100g ?? nutriments.salt) * 100) / 100,
      sodiumPer100g: Math.round(finitePositive(nutriments.sodium_100g ?? nutriments.sodium) * 1000),
      aminoacizi: extractAminoacizi(nutriments),
      micronutrienti: extractMicronutrienti(nutriments),
    };
  } catch (err) {
    console.warn('[OpenFoodFacts] getDetaliiCompleteProdus error:', err);
    return null;
  }
}

