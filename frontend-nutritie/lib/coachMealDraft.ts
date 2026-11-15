import type { TipMasa } from '../types';
import { localDayKey } from './dateUtils';
import { LIMITE_DB_MESE, parseExplicitTipMasa } from './mealUtils';

export interface CoachMealIngredient {
  name: string;
  quantity: string;
  unit: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  fiber: string;
}

export interface CoachMealDraft {
  name: string;
  explanation: string;
  preparation: string;
  imageUrl?: string;
  category: TipMasa | null;
  items: CoachMealIngredient[];
  calories: string;
  date: string;
}

export function parseCoachNumber(value: unknown): number {
  if (value === null || value === undefined) return NaN;
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value !== 'string') return NaN;
  const normalized = value.trim().replace(',', '.');
  if (!normalized) return NaN;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

const numeric = (value: unknown): string => {
  const result = parseCoachNumber(value);
  return Number.isFinite(result) && result >= 0 ? String(result) : '';
};
export const normalizeMealUnit = (unit: unknown): string => {
  const raw = typeof unit === 'string' ? unit.trim().toLowerCase() : '';
  if (!raw || ['g', 'gr', 'gram', 'grams', 'grame', 'ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres', 'mililitru', 'mililitri'].includes(raw)) {
    return 'g';
  }
  return raw;
};
const object = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const nonempty = (...values: unknown[]): string =>
  values.find((value) => typeof value === 'string' && value.trim())?.toString().trim() || '';

export function findNextJsonObjectRange(text: string, fromIndex = 0): { start: number; end: number } | null {
  const start = text.indexOf('{', fromIndex);
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0) return { start, end: i };
    }
  }
  return null;
}

function parseJsonObjects(value: unknown): Record<string, unknown>[] {
  const direct = object(value);
  if (direct) return [direct];
  if (typeof value !== 'string') return [];

  const cleaned = value.replace(/```(?:json|JSON)?/g, '').replace(/```/g, '');
  const results: Record<string, unknown>[] = [];
  let cursor = 0;
  while (cursor < cleaned.length) {
    const range = findNextJsonObjectRange(cleaned, cursor);
    if (!range) break;
    try {
      const parsed = object(JSON.parse(cleaned.slice(range.start, range.end + 1)));
      if (parsed) results.push(parsed);
    } catch {
      // Ignore non-JSON brace blocks inside conversational prose.
    }
    cursor = range.end + 1;
  }
  return results;
}

function makeDraft(raw: unknown, explanation: string, userText: string, preserveOwnCategory = false): CoachMealDraft | null {
  const item = object(raw);
  if (!item || !Array.isArray(item.items) || item.items.length === 0) return null;
  const ingredients = item.items.map((entry): CoachMealIngredient | null => {
    const food = object(entry);
    if (!food) return null;
    const quantity = numeric(food.qty ?? food.grame);
    const calories = numeric(food.kcal ?? food.calorii);
    const protein = numeric(food.protein_g ?? food.proteine);
    const carbs = numeric(food.carbs_g ?? food.carbohidrati);
    const fat = numeric(food.fat_g ?? food.grasimi);
    const fiberRaw = numeric(food.fiber_g ?? food.fibre);
    const hasCoreMacros = quantity !== '' && parseCoachNumber(quantity) > 0
      && calories !== '' && protein !== '' && carbs !== '' && fat !== '';
    return {
      name: nonempty(food.name, food.nume),
      quantity,
      unit: normalizeMealUnit(nonempty(food.unit, food.unitate)),
      calories,
      protein,
      carbs,
      fat,
      fiber: fiberRaw !== '' ? fiberRaw : (hasCoreMacros ? '0' : ''),
    };
  }).filter((value): value is CoachMealIngredient => value !== null);
  if (ingredients.length === 0) return null;
  const category = preserveOwnCategory
    ? (parseExplicitTipMasa(item.meal_type) ?? parseExplicitTipMasa(userText))
    : (parseExplicitTipMasa(userText) ?? parseExplicitTipMasa(item.meal_type));
  const steps = item.preparare ?? item.mod_de_preparare ?? item.steps;
  return {
    name: nonempty(item.name, item.nume, item.title, item.titlu) || ingredients[0].name,
    explanation,
    preparation: Array.isArray(steps) ? steps.filter((s) => typeof s === 'string').join('\n') : nonempty(steps),
    imageUrl: nonempty(item.imageUrl, item.imagine_url, item.photo_url) || undefined,
    category,
    items: ingredients,
    calories: totalFor(ingredients, 'calories'),
    date: '',
  };
}

function totalFor(items: CoachMealIngredient[], key: keyof Pick<CoachMealIngredient, 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber'>): string {
  if (items.some((item) => {
    const val = parseCoachNumber(item[key]);
    return !Number.isFinite(val) || val < 0;
  })) return '';
  const total = items.reduce((sum, item) => sum + parseCoachNumber(item[key]), 0);
  return String(Math.round(total * 10) / 10);
}

export function coachMealTotals(draft: CoachMealDraft) {
  return {
    calories: totalFor(draft.items, 'calories'),
    protein: totalFor(draft.items, 'protein'),
    carbs: totalFor(draft.items, 'carbs'),
    fat: totalFor(draft.items, 'fat'),
    fiber: totalFor(draft.items, 'fiber'),
  };
}

export type CoachMealValidationIssue = 'name' | 'category' | 'date' | 'unit' | 'values' | 'limits' | null;

export function getCoachMealValidationIssue(draft: CoachMealDraft): CoachMealValidationIssue {
  if (!draft.name.trim()) return 'name';
  if (!draft.category) return 'category';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) return 'date';
  const day = new Date(`${draft.date}T12:00:00`);
  if (Number.isNaN(day.getTime()) || localDayKey(day) !== draft.date || draft.date > localDayKey(new Date())) return 'date';
  if (draft.items.length === 0) return 'values';
  for (const item of draft.items) {
    if (!item.name.trim()) return 'values';
    if (normalizeMealUnit(item.unit) !== 'g' && item.unit.trim().toLowerCase() !== 'g') return 'unit';
    const qty = parseCoachNumber(item.quantity);
    if (!Number.isFinite(qty) || qty <= 0) return 'values';
    if (qty > LIMITE_DB_MESE.gramaj) return 'limits';
    for (const key of ['calories', 'protein', 'carbs', 'fat', 'fiber'] as const) {
      const val = parseCoachNumber(item[key]);
      if (!Number.isFinite(val) || val < 0) return 'values';
    }
  }
  const totals = coachMealTotals(draft);
  if (totals.calories === '') return 'values';
  if (parseCoachNumber(totals.calories) > LIMITE_DB_MESE.calorii
    || parseCoachNumber(totals.protein) > LIMITE_DB_MESE.proteine
    || parseCoachNumber(totals.carbs) > LIMITE_DB_MESE.carbohidrati
    || parseCoachNumber(totals.fat) > LIMITE_DB_MESE.grasimi
    || parseCoachNumber(totals.fiber) > LIMITE_DB_MESE.fibre) {
    return 'limits';
  }
  return null;
}

export function validateCoachMealDraft(draft: CoachMealDraft): boolean {
  return getCoachMealValidationIssue(draft) === null;
}

export function extractCoachMealDrafts(response: unknown, prompt: string): CoachMealDraft[] {
  const wrapper = object(response);
  const parsedBlocks = parseJsonObjects(wrapper?.raspuns ?? response);
  if (parsedBlocks.length === 0 && wrapper) parsedBlocks.push(wrapper);

  const explanation = typeof wrapper?.raspuns === 'string' && parseJsonObjects(wrapper.raspuns).length === 0
    ? wrapper.raspuns.trim().slice(0, 500)
    : '';

  const candidateGroups = parsedBlocks.flatMap((block) => {
    if (Array.isArray(block.suggestions)) return block.suggestions;
    if (Array.isArray(block.meals)) return block.meals;
    if (Array.isArray(block.meal_suggestions)) return block.meal_suggestions;
    return [block];
  });
  const isMultiMeal = candidateGroups.length > 1;
  const structured = candidateGroups
    .map((candidate) => makeDraft(candidate, explanation, prompt, isMultiMeal))
    .filter((draft): draft is CoachMealDraft => !!draft);
  if (structured.length > 0) return structured;

  // Free-form output is never assigned nutrition. Only an explicit food/recipe
  // request with a recognizable meal heading receives an editable blank draft.
  if (!/(?:recipe|meal idea|meal plan|suggest.*(?:meal|food)|rețet|retet|mas[ăa]|mese|mâncare|repas|recette|rezept|mahlzeit)/iu.test(prompt)) return [];
  const text = typeof wrapper?.raspuns === 'string' ? wrapper.raspuns : typeof response === 'string' ? response : '';
  const headings = text.split(/\r?\n/).map((line) => line.trim())
    .filter((line) => /^(?:#{1,3}\s+[^\n]{3,80}|(?:\*\*|[-*]\s*)?(?:Breakfast|Lunch|Dinner|Snack|Meal\s*\d+|Option\s*\d+|Mic dejun|Prânz|Cină|Gustare|Mas[ăa]\s*\d+|Varianta\s*\d+|Petit-déjeuner|Déjeuner|Dîner|Collation|Repas\s*\d+|Frühstück|Mittagessen|Abendessen|Mahlzeit\s*\d+)\s*:?\**\s*[^\n]{3,80})$/iu.test(line))
    .map((line) => line
      .replace(/^#{1,3}\s+/, '')
      .replace(/^[-*]\s*/, '')
      .replace(/\*\*/g, '')
      .replace(/^(?:Breakfast|Lunch|Dinner|Snack|Meal\s*\d+|Option\s*\d+|Mic dejun|Prânz|Cină|Gustare|Mas[ăa]\s*\d+|Varianta\s*\d+|Petit-déjeuner|Déjeuner|Dîner|Collation|Repas\s*\d+|Frühstück|Mittagessen|Abendessen|Mahlzeit\s*\d+)\s*:\s*/iu, '')
      .trim())
    .filter((line) => line.length >= 3 && line.length <= 80);
  if (headings.length === 0) return [];
  const explicitCategory = parseExplicitTipMasa(prompt);
  return headings.slice(0, 6).map((name) => ({
    name, explanation: '', preparation: '', category: explicitCategory,
    items: [{ name, quantity: '', unit: 'g', calories: '', protein: '', carbs: '', fat: '', fiber: '' }],
    calories: '', date: '',
  }));
}

export function isBareJournalCommand(text: string): boolean {
  return /^(?:adaug[aă](?: (?:aceast[aă] mas[aă]|masa asta|asta))? [iî]n jurnal|salveaz[aă] masa(?: asta)?|add (?:this meal|it) to (?:my )?(?:food )?diary|add to (?:my )?journal|ajoute(?:r)? ce repas au journal|ajouter au journal|f[uü]ge diese mahlzeit zum tagebuch hinzu|zum tagebuch hinzuf[uü]gen)[.!?\s]*$/iu.test(text.trim());
}
