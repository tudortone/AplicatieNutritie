import type { TipMasa } from '../types';
import { getTipMasaDupaOra } from './mealUtils';

export interface PhotoResultItem {
  nume: string;
  estimare_grame: number;
  calorii_per_100g: number;
  proteine_per_100g: number;
  grasimi_per_100g: number;
  carbohidrati_per_100g: number;
  fibre_per_100g: number | null;
  incredere?: string;
}

export type PhotoQualityIssueCode =
  | 'ITEM_NAME_MISSING'
  | 'ITEM_VALUE_INVALID'
  | 'ITEM_QUANTITY_IMPLAUSIBLE'
  | 'ITEM_NUTRIENTS_IMPLAUSIBLE'
  | 'MEAL_QUANTITY_IMPLAUSIBLE'
  | 'MEAL_ENERGY_IMPLAUSIBLE';

export interface PhotoQualityIssue {
  code: PhotoQualityIssueCode;
  itemIndex?: number;
  field?: keyof PhotoResultItem;
}

export interface PhotoNutritionTotals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
}

export interface PhotoQualityResult {
  requiresReview: boolean;
  issues: PhotoQualityIssue[];
  totals: PhotoNutritionTotals;
}

// These are deliberately conservative single-meal review thresholds, not DB
// storage limits. Crossing one never rewrites nutrition; it only prevents an
// implausible estimate from being persisted without user correction.
export const PHOTO_REVIEW_LIMITS = Object.freeze({
  itemGrams: 2000,
  mealGrams: 3000,
  mealKcal: 5000,
  nutrientPer100g: 100,
  kcalPer100g: 1000,
});

function finiteNumber(value: unknown): number {
  if (typeof value === 'string' && value.trim() === '') return Number.NaN;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function optionalFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function normalizePhotoResultItems(value: unknown): PhotoResultItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    return {
      nume: typeof item.nume === 'string' ? item.nume.trim() : '',
      estimare_grame: finiteNumber(item.estimare_grame),
      calorii_per_100g: finiteNumber(item.calorii_per_100g),
      proteine_per_100g: finiteNumber(item.proteine_per_100g),
      grasimi_per_100g: finiteNumber(item.grasimi_per_100g),
      carbohidrati_per_100g: finiteNumber(item.carbohidrati_per_100g),
      fibre_per_100g: optionalFiniteNumber(item.fibre_per_100g),
      ...(typeof item.incredere === 'string' ? { incredere: item.incredere.trim() } : {}),
    };
  });
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

export function evaluatePhotoMealQuality(items: readonly PhotoResultItem[]): PhotoQualityResult {
  const issues: PhotoQualityIssue[] = [];
  let grams = 0;
  let kcal = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;
  let fiber = 0;
  let hasFiberForEveryItem = items.length > 0;

  items.forEach((item, itemIndex) => {
    if (!item.nume.trim()) issues.push({ code: 'ITEM_NAME_MISSING', itemIndex, field: 'nume' });

    const requiredFields: Array<keyof Pick<PhotoResultItem,
      'estimare_grame' | 'calorii_per_100g' | 'proteine_per_100g' |
      'grasimi_per_100g' | 'carbohidrati_per_100g'>> = [
      'estimare_grame', 'calorii_per_100g', 'proteine_per_100g',
      'grasimi_per_100g', 'carbohidrati_per_100g',
    ];
    for (const field of requiredFields) {
      const number = item[field];
      if (!Number.isFinite(number) || number < 0) {
        issues.push({ code: 'ITEM_VALUE_INVALID', itemIndex, field });
      }
    }
    if (item.estimare_grame <= 0) {
      issues.push({ code: 'ITEM_VALUE_INVALID', itemIndex, field: 'estimare_grame' });
    }
    if (item.estimare_grame > PHOTO_REVIEW_LIMITS.itemGrams) {
      issues.push({ code: 'ITEM_QUANTITY_IMPLAUSIBLE', itemIndex, field: 'estimare_grame' });
    }

    const nutrientValues = [
      item.proteine_per_100g,
      item.grasimi_per_100g,
      item.carbohidrati_per_100g,
      item.fibre_per_100g,
    ].filter((number): number is number => number !== null);
    if (
      item.calorii_per_100g > PHOTO_REVIEW_LIMITS.kcalPer100g
      || nutrientValues.some((number) => number > PHOTO_REVIEW_LIMITS.nutrientPer100g)
      || nutrientValues.reduce((sum, number) => sum + number, 0) > 110
    ) {
      issues.push({ code: 'ITEM_NUTRIENTS_IMPLAUSIBLE', itemIndex });
    }

    if (item.fibre_per_100g === null) hasFiberForEveryItem = false;
    else if (!Number.isFinite(item.fibre_per_100g) || item.fibre_per_100g < 0) {
      issues.push({ code: 'ITEM_VALUE_INVALID', itemIndex, field: 'fibre_per_100g' });
      hasFiberForEveryItem = false;
    }

    if (
      Number.isFinite(item.estimare_grame)
      && item.estimare_grame > 0
      && requiredFields.slice(1).every((field) => Number.isFinite(item[field]))
    ) {
      const factor = item.estimare_grame / 100;
      grams += item.estimare_grame;
      kcal += item.calorii_per_100g * factor;
      protein += item.proteine_per_100g * factor;
      carbs += item.carbohidrati_per_100g * factor;
      fat += item.grasimi_per_100g * factor;
      if (item.fibre_per_100g !== null && Number.isFinite(item.fibre_per_100g)) {
        fiber += item.fibre_per_100g * factor;
      }
    }
  });

  if (grams > PHOTO_REVIEW_LIMITS.mealGrams) issues.push({ code: 'MEAL_QUANTITY_IMPLAUSIBLE' });
  if (kcal > PHOTO_REVIEW_LIMITS.mealKcal) issues.push({ code: 'MEAL_ENERGY_IMPLAUSIBLE' });

  return {
    requiresReview: items.length === 0 || issues.length > 0,
    issues,
    totals: {
      kcal: rounded(kcal),
      protein: rounded(protein),
      carbs: rounded(carbs),
      fat: rounded(fat),
      fiber: hasFiberForEveryItem ? rounded(fiber) : null,
    },
  };
}

const MEAL_TYPE_ALIASES: Readonly<Record<string, TipMasa>> = Object.freeze({
  micdejun: 'mic_dejun', breakfast: 'mic_dejun', fruhstuck: 'mic_dejun', petitdejeuner: 'mic_dejun',
  pranz: 'pranz', lunch: 'pranz', dejeuner: 'pranz', mittagessen: 'pranz',
  cina: 'cina', dinner: 'cina', diner: 'cina', abendessen: 'cina',
  gustare: 'gustare', snack: 'gustare', collation: 'gustare', zwischenmahlzeit: 'gustare',
});

function mealAlias(value: unknown): TipMasa | null {
  if (typeof value !== 'string') return null;
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  return MEAL_TYPE_ALIASES[normalized] || null;
}

export function inferCanonicalMealType({
  aiMealType,
  capturedAt = new Date(),
}: {
  aiMealType?: unknown;
  capturedAt?: Date;
}): TipMasa {
  return mealAlias(aiMealType) || getTipMasaDupaOra(capturedAt);
}
