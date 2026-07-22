import { AlimentAI, AminoaciziEsentiali } from '../../types';

export type FoodSource =
  | 'preset'
  | 'user_saved'
  | 'barcode_cache'
  | 'openfoodfacts'
  | 'manual';

export interface FoodProduct {
  id: string;
  source: FoodSource;
  name: string;
  brand?: string;
  barcode?: string;
  servingLabel?: string;
  servingGrams?: number;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g?: number;
  sugarPer100g?: number;
  saltPer100g?: number;
  aminoacizi?: AminoaciziEsentiali;
  verified?: boolean;
}

export interface FoodQuantity {
  grams: number;
  units?: number;
  unitLabel?: string;
}

export function foodProductToAlimentAI(prod: FoodProduct, grameSelectate: number = 100): AlimentAI {
  return {
    nume: prod.brand ? `${prod.name} (${prod.brand})` : prod.name,
    estimare_grame: grameSelectate,
    calorii_per_100g: prod.kcalPer100g,
    proteine_per_100g: prod.proteinPer100g,
    grasimi_per_100g: prod.fatPer100g,
    carbohidrati_per_100g: prod.carbsPer100g,
  };
}

export function normalizeFoodNumber(str: string): number {
  if (!str) return 0;
  const clean = str.replace(/,/g, '.').trim();
  const n = parseFloat(clean);
  if (isNaN(n) || !isFinite(n) || n < 0) return 0;
  return n;
}
