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

const numeric = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '';
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? String(result) : '';
};
const object = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const nonempty = (...values: unknown[]): string =>
  values.find((value) => typeof value === 'string' && value.trim())?.toString().trim() || '';

function parseJson(value: unknown): Record<string, unknown> | null {
  const direct = object(value);
  if (direct) return direct;
  if (typeof value !== 'string') return null;
  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return object(JSON.parse(value.slice(start, end + 1))); } catch { return null; }
}

function makeDraft(raw: unknown, explanation: string, userText: string): CoachMealDraft | null {
  const item = object(raw);
  if (!item || !Array.isArray(item.items) || item.items.length === 0) return null;
  const ingredients = item.items.map((entry): CoachMealIngredient | null => {
    const food = object(entry);
    if (!food) return null;
    return {
      name: nonempty(food.name, food.nume),
      quantity: numeric(food.qty ?? food.grame),
      unit: nonempty(food.unit, food.unitate) || 'g',
      calories: numeric(food.kcal ?? food.calorii),
      protein: numeric(food.protein_g ?? food.proteine),
      carbs: numeric(food.carbs_g ?? food.carbohidrati),
      fat: numeric(food.fat_g ?? food.grasimi),
      fiber: numeric(food.fiber_g ?? food.fibre),
    };
  }).filter((value): value is CoachMealIngredient => value !== null);
  if (ingredients.length === 0) return null;
  // Explicit category from user wording > explicit category from model
  const category = parseExplicitTipMasa(userText) ?? parseExplicitTipMasa(item.meal_type);
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
  if (items.some((item) => item[key] === '' || !Number.isFinite(Number(item[key])))) return '';
  return String(items.reduce((sum, item) => sum + Number(item[key]), 0));
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

export function validateCoachMealDraft(draft: CoachMealDraft): boolean {
  if (!draft.name.trim() || !draft.category || !/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) return false;
  const day = new Date(`${draft.date}T12:00:00`);
  if (Number.isNaN(day.getTime()) || localDayKey(day) !== draft.date) return false;
  if (draft.date > localDayKey(new Date())) return false;
  if (draft.items.length === 0) return false;
  for (const item of draft.items) {
    if (!item.name.trim() || item.unit.trim().toLowerCase() !== 'g' || item.quantity === '' || Number(item.quantity) <= 0 || Number(item.quantity) > LIMITE_DB_MESE.gramaj) return false;
    for (const key of ['calories', 'protein', 'carbs', 'fat', 'fiber'] as const) {
      if (item[key] === '' || !Number.isFinite(Number(item[key])) || Number(item[key]) < 0) return false;
    }
  }
  const totals = coachMealTotals(draft);
  return totals.calories !== '' && Number(totals.calories) <= LIMITE_DB_MESE.calorii
    && Number(totals.protein) <= LIMITE_DB_MESE.proteine
    && Number(totals.carbs) <= LIMITE_DB_MESE.carbohidrati
    && Number(totals.fat) <= LIMITE_DB_MESE.grasimi
    && Number(totals.fiber) <= LIMITE_DB_MESE.fibre;
}

export function extractCoachMealDrafts(response: unknown, prompt: string): CoachMealDraft[] {
  const wrapper = object(response);
  const raw = parseJson(wrapper?.raspuns ?? response) || wrapper;
  const explanation = typeof wrapper?.raspuns === 'string' && !parseJson(wrapper.raspuns)
    ? wrapper.raspuns.trim().slice(0, 500) : '';
  const candidates = Array.isArray(raw?.suggestions) ? raw.suggestions
    : Array.isArray(raw?.meals) ? raw.meals
      : Array.isArray(raw?.meal_suggestions) ? raw.meal_suggestions
        : raw ? [raw] : [];
  const structured = candidates.map((candidate) => makeDraft(candidate, explanation, prompt)).filter((draft): draft is CoachMealDraft => !!draft);
  if (structured.length > 0) return structured;

  // Free-form output is never assigned nutrition. Only an explicit food/recipe
  // request with a recognizable meal heading receives an editable blank draft.
  if (!/(?:recipe|meal idea|meal plan|suggest.*(?:meal|food)|rețet|retet|mas[ăa]|mâncare|repas|recette|rezept|mahlzeit)/iu.test(prompt)) return [];
  const text = typeof wrapper?.raspuns === 'string' ? wrapper.raspuns : typeof response === 'string' ? response : '';
  const headings = text.split(/\r?\n/).map((line) => line.trim())
    .filter((line) => /^(?:#{1,3}\s+[^\n]{3,80}|[-*]\s*(?:Breakfast|Lunch|Dinner|Snack|Mic dejun|Prânz|Cină|Gustare|Petit-déjeuner|Déjeuner|Dîner|Collation|Frühstück|Mittagessen|Abendessen)\s*:\s*[^\n]{3,80})$/iu.test(line))
    .map((line) => line.replace(/^#{1,3}\s+/, '').replace(/^[-*]\s*/, '').replace(/^(?:Breakfast|Lunch|Dinner|Snack|Mic dejun|Prânz|Cină|Gustare|Petit-déjeuner|Déjeuner|Dîner|Collation|Frühstück|Mittagessen|Abendessen)\s*:\s*/iu, '').trim())
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
