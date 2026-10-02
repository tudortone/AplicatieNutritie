/**
 * GetFlow — Nutrient Focus / Health-Aware Journal Calculator
 * Motor matematic sigur pentru agregarea nutrienților, ierarhizarea contributorilor,
 * defalcarea pe mese și tratarea strictă a datelor lipsă (MISSING ≠ ZERO).
 */

import { Masa, AlimentDetaliat } from '../../types';
import {
  NutrientId,
  NutrientAggregatedItem,
  NutrientStatus,
  NUTRIENT_DEFINITIONS,
  FoodContributor,
  MealNutrientTotal,
} from './types';

export function extractFoodNutrientValue(
  aliment: AlimentDetaliat,
  nutrientId: NutrientId
): number | undefined {
  if (!aliment) return undefined;

  switch (nutrientId) {
    case 'calories':
      return Number.isFinite(aliment.calorii) ? aliment.calorii : undefined;

    case 'protein':
      return Number.isFinite(aliment.proteine) ? aliment.proteine : undefined;

    case 'carbs':
      return Number.isFinite(aliment.carbohidrati) ? aliment.carbohidrati : undefined;

    case 'fat':
      return Number.isFinite(aliment.grasimi) ? aliment.grasimi : undefined;

    case 'fiber': {
      if (Number.isFinite(aliment.fibre)) return aliment.fibre;
      if (aliment.micronutrienti && Number.isFinite(aliment.micronutrienti.fibra)) {
        return aliment.micronutrienti.fibra;
      }
      return undefined;
    }

    case 'sugars': {
      if (aliment.micronutrienti && Number.isFinite(aliment.micronutrienti.zaharuri)) {
        return aliment.micronutrienti.zaharuri;
      }
      return undefined;
    }

    case 'added_sugars': {
      const added = (aliment.micronutrienti as any)?.zaharuri_adaugate;
      if (Number.isFinite(added)) return added;
      return undefined;
    }

    case 'saturated_fat': {
      if (aliment.micronutrienti && Number.isFinite(aliment.micronutrienti.grasimi_saturate)) {
        return aliment.micronutrienti.grasimi_saturate;
      }
      return undefined;
    }

    case 'unsaturated_fat': {
      if (
        Number.isFinite(aliment.grasimi) &&
        aliment.micronutrienti &&
        Number.isFinite(aliment.micronutrienti.grasimi_saturate)
      ) {
        const trans = Number.isFinite(aliment.micronutrienti.grasimi_trans)
          ? (aliment.micronutrienti.grasimi_trans as number)
          : 0;
        const diff = aliment.grasimi - (aliment.micronutrienti.grasimi_saturate as number) - trans;
        return Math.max(0, Math.round(diff * 10) / 10);
      }
      return undefined;
    }

    case 'sodium': {
      if (aliment.micronutrienti && Number.isFinite(aliment.micronutrienti.sodiu)) {
        return aliment.micronutrienti.sodiu;
      }
      return undefined;
    }

    case 'cholesterol': {
      if (aliment.micronutrienti && Number.isFinite(aliment.micronutrienti.colesterol)) {
        return aliment.micronutrienti.colesterol;
      }
      return undefined;
    }

    case 'potassium': {
      if (aliment.micronutrienti && Number.isFinite(aliment.micronutrienti.potasiu)) {
        return aliment.micronutrienti.potasiu;
      }
      return undefined;
    }

    default:
      return undefined;
  }
}

export interface FlattenedFoodEntry {
  food: AlimentDetaliat;
  mealType: string;
}

export function flattenFoods(mese: Masa[]): FlattenedFoodEntry[] {
  const result: FlattenedFoodEntry[] = [];
  if (!Array.isArray(mese)) return result;

  for (const masa of mese) {
    const tipMasa = masa.tip_masa || 'gustare';
    const alimente = masa.alimente;

    if (Array.isArray(alimente) && alimente.length > 0) {
      for (const al of alimente) {
        result.push({ food: al, mealType: tipMasa });
      }
    } else {
      // Masă fără array de alimente detaliate (înregistrare rapidă sau veche)
      // Macros sunt prezenți la nivel de masă, dar micronutrienții sunt undefined (MISSING, NU 0).
      result.push({
        food: {
          nume: masa.nume || 'Aliment înregistrat',
          calorii: masa.calorii || 0,
          proteine: masa.proteine || 0,
          carbohidrati: masa.carbohidrati || 0,
          grasimi: masa.grasimi || 0,
          fibre: masa.fibre,
        },
        mealType: tipMasa,
      });
    }
  }

  return result;
}

export function calculateNutrientTotals(
  mese: Masa[],
  trackedNutrients: NutrientId[],
  customTargets: Partial<Record<NutrientId, number>> = {}
): NutrientAggregatedItem[] {
  const flattened = flattenFoods(mese);
  const totalFoodsCount = flattened.length;

  return trackedNutrients.map((nutrientId) => {
    const def = NUTRIENT_DEFINITIONS[nutrientId];
    if (!def) {
      throw new Error(`Nutrient necunoscut: ${nutrientId}`);
    }

    let sum = 0;
    let availableCount = 0;

    for (const entry of flattened) {
      const val = extractFoodNutrientValue(entry.food, nutrientId);
      if (val !== undefined && Number.isFinite(val)) {
        sum += val;
        availableCount += 1;
      }
    }

    const missingFoodsCount = totalFoodsCount - availableCount;
    let status: NutrientStatus;
    let total: number | null = null;

    if (totalFoodsCount === 0 || availableCount === 0) {
      status = 'no_data';
      total = null;
    } else if (missingFoodsCount > 0) {
      status = 'incomplete';
      total = def.unit === 'mg' || def.unit === 'kcal' ? Math.round(sum) : Math.round(sum * 10) / 10;
    } else {
      status = 'complete';
      total = def.unit === 'mg' || def.unit === 'kcal' ? Math.round(sum) : Math.round(sum * 10) / 10;
    }

    const hasCustomTarget = customTargets[nutrientId] !== undefined;
    const target = hasCustomTarget ? customTargets[nutrientId] : def.defaultReferenceTarget;

    return {
      nutrientId,
      definition: def,
      total,
      target,
      hasCustomTarget,
      unit: def.unit,
      status,
      totalFoodsCount,
      availableFoodsCount: availableCount,
      missingFoodsCount,
      isLimit: def.isLimit,
    };
  });
}

export function getTopContributors(
  mese: Masa[],
  nutrientId: NutrientId,
  limit: number = 5
): FoodContributor[] {
  const def = NUTRIENT_DEFINITIONS[nutrientId];
  if (!def) return [];

  const flattened = flattenFoods(mese);
  const validItems: Array<{ foodName: string; mealType: string; amount: number }> = [];

  for (const entry of flattened) {
    const val = extractFoodNutrientValue(entry.food, nutrientId);
    if (val !== undefined && Number.isFinite(val) && val > 0) {
      validItems.push({
        foodName: entry.food.nume || 'Aliment',
        mealType: entry.mealType,
        amount: val,
      });
    }
  }

  if (validItems.length === 0) return [];

  // Sortăm descrescător după cantitate
  validItems.sort((a, b) => b.amount - a.amount);

  const totalSum = validItems.reduce((acc, it) => acc + it.amount, 0);
  const sliced = validItems.slice(0, limit);

  return sliced.map((item, index) => {
    const percentage = totalSum > 0 ? Math.round((item.amount / totalSum) * 100) : 0;
    const roundedAmount = def.unit === 'mg' || def.unit === 'kcal'
      ? Math.round(item.amount)
      : Math.round(item.amount * 10) / 10;

    // Clasificare factuală și neutră (fără etichete alarmiste de tipul 'toxic' sau 'rău')
    let classification: 'higher' | 'moderate' | 'lower' = 'lower';
    if (index === 0 || percentage >= 30) {
      classification = 'higher';
    } else if (percentage >= 15) {
      classification = 'moderate';
    }

    return {
      foodName: item.foodName,
      mealType: item.mealType,
      amount: roundedAmount,
      unit: def.unit,
      percentage,
      classification,
    };
  });
}

export function getMealBreakdown(
  mese: Masa[],
  nutrientId: NutrientId,
  mealLabels: Record<string, string> = {
    mic_dejun: 'Mic Dejun',
    pranz: 'Prânz',
    cina: 'Cină',
    gustare: 'Gustări',
  }
): MealNutrientTotal[] {
  const def = NUTRIENT_DEFINITIONS[nutrientId];
  if (!def) return [];

  const categories = ['mic_dejun', 'pranz', 'cina', 'gustare'];
  const result: MealNutrientTotal[] = [];

  for (const cat of categories) {
    const meseInCat = (mese || []).filter((m) => (m.tip_masa || 'gustare') === cat);
    const flattened = flattenFoods(meseInCat);
    const totalCount = flattened.length;

    if (totalCount === 0) {
      result.push({
        mealType: cat,
        mealLabel: mealLabels[cat] || cat,
        amount: null,
        unit: def.unit,
        hasIncompleteData: false,
        missingFoodsCount: 0,
      });
      continue;
    }

    let sum = 0;
    let availableCount = 0;

    for (const item of flattened) {
      const val = extractFoodNutrientValue(item.food, nutrientId);
      if (val !== undefined && Number.isFinite(val)) {
        sum += val;
        availableCount += 1;
      }
    }

    const missingFoodsCount = totalCount - availableCount;
    const amount = availableCount > 0
      ? def.unit === 'mg' || def.unit === 'kcal' ? Math.round(sum) : Math.round(sum * 10) / 10
      : null;

    result.push({
      mealType: cat,
      mealLabel: mealLabels[cat] || cat,
      amount,
      unit: def.unit,
      hasIncompleteData: missingFoodsCount > 0,
      missingFoodsCount,
    });
  }

  return result;
}

export interface SevenDayTrendResult {
  nutrientId: NutrientId;
  unit: string;
  daysEvaluated: number;
  daysWithData: number;
  averageAmount: number | null;
  daysMeetingTarget: number;
  isLimit: boolean;
  history: Array<{ date: string; amount: number | null; status: NutrientStatus }>;
}

export function calculate7DayTrends(
  historyByDate: Record<string, Masa[]>,
  nutrientId: NutrientId,
  target?: number
): SevenDayTrendResult {
  const def = NUTRIENT_DEFINITIONS[nutrientId];
  const dates = Object.keys(historyByDate).sort(); // YYYY-MM-DD
  const isLimit = def.isLimit;

  let sum = 0;
  let daysWithData = 0;
  let daysMeetingTarget = 0;
  const history: Array<{ date: string; amount: number | null; status: NutrientStatus }> = [];

  for (const date of dates) {
    const mese = historyByDate[date] || [];
    const totals = calculateNutrientTotals(mese, [nutrientId]);
    const item = totals[0];

    if (item && item.total !== null) {
      sum += item.total;
      daysWithData += 1;

      if (target !== undefined && Number.isFinite(target)) {
        if (isLimit ? item.total <= target : item.total >= target) {
          daysMeetingTarget += 1;
        }
      }

      history.push({
        date,
        amount: item.total,
        status: item.status,
      });
    } else {
      history.push({
        date,
        amount: null,
        status: 'no_data',
      });
    }
  }

  const averageAmount = daysWithData > 0
    ? def.unit === 'mg' || def.unit === 'kcal' ? Math.round(sum / daysWithData) : Math.round((sum / daysWithData) * 10) / 10
    : null;

  return {
    nutrientId,
    unit: def.unit,
    daysEvaluated: dates.length,
    daysWithData,
    averageAmount,
    daysMeetingTarget,
    isLimit,
    history,
  };
}
