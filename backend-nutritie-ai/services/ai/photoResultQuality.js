'use strict';

const LIMITS = Object.freeze({ itemGrams: 2000, mealGrams: 3000, mealKcal: 5000 });

function requiredNumber(value, { min = 0, max = 1000 } = {}) {
  if (typeof value === 'string' && value.trim() === '') throw new Error('PHOTO_RESULT_INVALID');
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error('PHOTO_RESULT_INVALID');
  }
  return parsed;
}

function optionalNumber(value, { min = 0, max = 100 } = {}) {
  if (value === null || value === undefined || value === '') return null;
  return requiredNumber(value, { min, max });
}

function normalizePhotoItems(value) {
  if (!Array.isArray(value) || value.length === 0) throw new Error('PHOTO_RESULT_INVALID');
  return value.map((raw) => {
    if (!raw || typeof raw !== 'object') throw new Error('PHOTO_RESULT_INVALID');
    const name = typeof raw.nume === 'string' ? raw.nume.trim().slice(0, 150) : '';
    if (!name) throw new Error('PHOTO_RESULT_INVALID');
    const item = {
      nume: name,
      estimare_grame: requiredNumber(raw.estimare_grame, { min: 1, max: 5000 }),
      calorii_per_100g: requiredNumber(raw.calorii_per_100g, { max: 1000 }),
      proteine_per_100g: requiredNumber(raw.proteine_per_100g, { max: 100 }),
      grasimi_per_100g: requiredNumber(raw.grasimi_per_100g, { max: 100 }),
      carbohidrati_per_100g: requiredNumber(raw.carbohidrati_per_100g, { max: 100 }),
      fibre_per_100g: optionalNumber(raw.fibre_per_100g),
      incredere: String(raw.incredere || 'mediu').slice(0, 20),
    };
    const nutrientSum = item.proteine_per_100g + item.grasimi_per_100g
      + item.carbohidrati_per_100g + (item.fibre_per_100g || 0);
    if (nutrientSum > 110) throw new Error('PHOTO_RESULT_INVALID');
    return Object.freeze({
      ...item,
      tip_masa_sugerat: typeof raw.tip_masa_sugerat === 'string'
        ? raw.tip_masa_sugerat.slice(0, 40)
        : null,
    });
  });
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function evaluatePhotoQuality(items) {
  const issues = [];
  let grams = 0;
  let kcal = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;
  let fiber = 0;
  let completeFiber = items.length > 0;

  items.forEach((item, itemIndex) => {
    if (item.estimare_grame > LIMITS.itemGrams) {
      issues.push({ code: 'ITEM_QUANTITY_IMPLAUSIBLE', itemIndex });
    }
    const factor = item.estimare_grame / 100;
    grams += item.estimare_grame;
    kcal += item.calorii_per_100g * factor;
    protein += item.proteine_per_100g * factor;
    carbs += item.carbohidrati_per_100g * factor;
    fat += item.grasimi_per_100g * factor;
    if (item.fibre_per_100g === null) completeFiber = false;
    else fiber += item.fibre_per_100g * factor;
  });
  if (grams > LIMITS.mealGrams) issues.push({ code: 'MEAL_QUANTITY_IMPLAUSIBLE' });
  if (kcal > LIMITS.mealKcal) issues.push({ code: 'MEAL_ENERGY_IMPLAUSIBLE' });

  return Object.freeze({
    requiresReview: issues.length > 0,
    issues,
    totals: Object.freeze({
      kcal: round(kcal), protein: round(protein), carbs: round(carbs), fat: round(fat),
      fiber: completeFiber ? round(fiber) : null,
    }),
  });
}

const ALIASES = Object.freeze({
  micdejun: 'mic_dejun', breakfast: 'mic_dejun', fruhstuck: 'mic_dejun', petitdejeuner: 'mic_dejun',
  pranz: 'pranz', lunch: 'pranz', dejeuner: 'pranz', mittagessen: 'pranz',
  cina: 'cina', dinner: 'cina', diner: 'cina', abendessen: 'cina',
  gustare: 'gustare', snack: 'gustare', collation: 'gustare', zwischenmahlzeit: 'gustare',
});

function canonicalMealType(value) {
  if (typeof value !== 'string') return null;
  const key = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z]/g, '');
  return ALIASES[key] || null;
}

function inferMealType(aiSuggestion, submittedContext) {
  return canonicalMealType(aiSuggestion) || canonicalMealType(submittedContext) || 'gustare';
}

module.exports = { normalizePhotoItems, evaluatePhotoQuality, inferMealType, LIMITS };
