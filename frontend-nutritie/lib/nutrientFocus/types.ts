/**
 * GetFlow — Nutrient Focus / Health-Aware Journal Types
 * Sursa unică de adevăr pentru selecția și agregarea nutrienților în jurnal.
 *
 * NOTĂ DE SIGURANȚĂ:
 * GetFlow nu este un dispozitiv medical și nu pune diagnostice clinice.
 * Tipurile de mai jos gestionează exclusiv preferințe nutriționale,
 * agregări matematice și ținte informative stabilite voluntar de utilizator.
 */

export type NutrientId =
  | 'calories'
  | 'protein'
  | 'carbs'
  | 'fat'
  | 'fiber'
  | 'sugars'
  | 'added_sugars'
  | 'saturated_fat'
  | 'unsaturated_fat'
  | 'sodium'
  | 'cholesterol'
  | 'potassium';

export type NutrientUnit = 'kcal' | 'g' | 'mg';

export type NutrientStatus = 'complete' | 'incomplete' | 'no_data';

export type PresetId =
  | 'general'
  | 'carb_awareness'
  | 'heart_health'
  | 'low_sodium'
  | 'high_fiber'
  | 'high_protein'
  | 'custom';

export interface NutrientDefinition {
  id: NutrientId;
  nameKey: string;
  shortKey: string;
  unit: NutrientUnit;
  isLimit: boolean; // true = plafon maxim recomandat (ex: sodiu), false = obiectiv minim (ex: fibre, proteine)
  defaultReferenceTarget?: number;
  generalReferenceKey?: string;
  descriptionKey: string;
}

export const NUTRIENT_DEFINITIONS: Record<NutrientId, NutrientDefinition> = {
  calories: {
    id: 'calories',
    nameKey: 'nutrientFocus.nutrients.calories',
    shortKey: 'nutrientFocus.nutrients.short.calories',
    unit: 'kcal',
    isLimit: true,
    defaultReferenceTarget: 2000,
    generalReferenceKey: 'nutrientFocus.ref.calories',
    descriptionKey: 'nutrientFocus.desc.calories',
  },
  protein: {
    id: 'protein',
    nameKey: 'nutrientFocus.nutrients.protein',
    shortKey: 'nutrientFocus.nutrients.short.protein',
    unit: 'g',
    isLimit: false,
    defaultReferenceTarget: 80,
    generalReferenceKey: 'nutrientFocus.ref.protein',
    descriptionKey: 'nutrientFocus.desc.protein',
  },
  carbs: {
    id: 'carbs',
    nameKey: 'nutrientFocus.nutrients.carbs',
    shortKey: 'nutrientFocus.nutrients.short.carbs',
    unit: 'g',
    isLimit: true,
    defaultReferenceTarget: 200,
    generalReferenceKey: 'nutrientFocus.ref.carbs',
    descriptionKey: 'nutrientFocus.desc.carbs',
  },
  fat: {
    id: 'fat',
    nameKey: 'nutrientFocus.nutrients.fat',
    shortKey: 'nutrientFocus.nutrients.short.fat',
    unit: 'g',
    isLimit: true,
    defaultReferenceTarget: 65,
    generalReferenceKey: 'nutrientFocus.ref.fat',
    descriptionKey: 'nutrientFocus.desc.fat',
  },
  fiber: {
    id: 'fiber',
    nameKey: 'nutrientFocus.nutrients.fiber',
    shortKey: 'nutrientFocus.nutrients.short.fiber',
    unit: 'g',
    isLimit: false,
    defaultReferenceTarget: 28,
    generalReferenceKey: 'nutrientFocus.ref.fiber',
    descriptionKey: 'nutrientFocus.desc.fiber',
  },
  sugars: {
    id: 'sugars',
    nameKey: 'nutrientFocus.nutrients.sugars',
    shortKey: 'nutrientFocus.nutrients.short.sugars',
    unit: 'g',
    isLimit: true,
    defaultReferenceTarget: 50,
    generalReferenceKey: 'nutrientFocus.ref.sugars',
    descriptionKey: 'nutrientFocus.desc.sugars',
  },
  added_sugars: {
    id: 'added_sugars',
    nameKey: 'nutrientFocus.nutrients.addedSugars',
    shortKey: 'nutrientFocus.nutrients.short.addedSugars',
    unit: 'g',
    isLimit: true,
    defaultReferenceTarget: 25,
    generalReferenceKey: 'nutrientFocus.ref.addedSugars',
    descriptionKey: 'nutrientFocus.desc.addedSugars',
  },
  saturated_fat: {
    id: 'saturated_fat',
    nameKey: 'nutrientFocus.nutrients.saturatedFat',
    shortKey: 'nutrientFocus.nutrients.short.saturatedFat',
    unit: 'g',
    isLimit: true,
    defaultReferenceTarget: 20,
    generalReferenceKey: 'nutrientFocus.ref.saturatedFat',
    descriptionKey: 'nutrientFocus.desc.saturatedFat',
  },
  unsaturated_fat: {
    id: 'unsaturated_fat',
    nameKey: 'nutrientFocus.nutrients.unsaturatedFat',
    shortKey: 'nutrientFocus.nutrients.short.unsaturatedFat',
    unit: 'g',
    isLimit: false,
    defaultReferenceTarget: 40,
    generalReferenceKey: 'nutrientFocus.ref.unsaturatedFat',
    descriptionKey: 'nutrientFocus.desc.unsaturatedFat',
  },
  sodium: {
    id: 'sodium',
    nameKey: 'nutrientFocus.nutrients.sodium',
    shortKey: 'nutrientFocus.nutrients.short.sodium',
    unit: 'mg',
    isLimit: true,
    defaultReferenceTarget: 2300,
    generalReferenceKey: 'nutrientFocus.ref.sodium',
    descriptionKey: 'nutrientFocus.desc.sodium',
  },
  cholesterol: {
    id: 'cholesterol',
    nameKey: 'nutrientFocus.nutrients.cholesterol',
    shortKey: 'nutrientFocus.nutrients.short.cholesterol',
    unit: 'mg',
    isLimit: true,
    defaultReferenceTarget: 300,
    generalReferenceKey: 'nutrientFocus.ref.cholesterol',
    descriptionKey: 'nutrientFocus.desc.cholesterol',
  },
  potassium: {
    id: 'potassium',
    nameKey: 'nutrientFocus.nutrients.potassium',
    shortKey: 'nutrientFocus.nutrients.short.potassium',
    unit: 'mg',
    isLimit: false,
    defaultReferenceTarget: 3400,
    generalReferenceKey: 'nutrientFocus.ref.potassium',
    descriptionKey: 'nutrientFocus.desc.potassium',
  },
};

export interface FocusPreset {
  id: PresetId;
  nameKey: string;
  descriptionKey: string;
  iconName: string;
  nutrients: NutrientId[];
}

export const FOCUS_PRESETS: Record<PresetId, FocusPreset> = {
  general: {
    id: 'general',
    nameKey: 'nutrientFocus.presets.general.name',
    descriptionKey: 'nutrientFocus.presets.general.desc',
    iconName: 'utensils',
    nutrients: ['calories', 'protein', 'carbs', 'fat', 'fiber'],
  },
  carb_awareness: {
    id: 'carb_awareness',
    nameKey: 'nutrientFocus.presets.carbAwareness.name',
    descriptionKey: 'nutrientFocus.presets.carbAwareness.desc',
    iconName: 'wheat',
    nutrients: ['carbs', 'fiber', 'sugars'],
  },
  heart_health: {
    id: 'heart_health',
    nameKey: 'nutrientFocus.presets.heartHealth.name',
    descriptionKey: 'nutrientFocus.presets.heartHealth.desc',
    iconName: 'heart',
    nutrients: ['saturated_fat', 'fiber', 'sodium', 'sugars'],
  },
  low_sodium: {
    id: 'low_sodium',
    nameKey: 'nutrientFocus.presets.lowSodium.name',
    descriptionKey: 'nutrientFocus.presets.lowSodium.desc',
    iconName: 'droplet',
    nutrients: ['sodium'],
  },
  high_fiber: {
    id: 'high_fiber',
    nameKey: 'nutrientFocus.presets.highFiber.name',
    descriptionKey: 'nutrientFocus.presets.highFiber.desc',
    iconName: 'leaf',
    nutrients: ['fiber'],
  },
  high_protein: {
    id: 'high_protein',
    nameKey: 'nutrientFocus.presets.highProtein.name',
    descriptionKey: 'nutrientFocus.presets.highProtein.desc',
    iconName: 'dumbbell',
    nutrients: ['protein'],
  },
  custom: {
    id: 'custom',
    nameKey: 'nutrientFocus.presets.custom.name',
    descriptionKey: 'nutrientFocus.presets.custom.desc',
    iconName: 'sliders',
    nutrients: ['calories', 'protein', 'carbs', 'fat', 'fiber'],
  },
};

export interface NutrientFocusPreferences {
  activePreset: PresetId;
  trackedNutrients: NutrientId[];
  nutrientOrder: NutrientId[];
  customTargets: Partial<Record<NutrientId, number>>;
  foodPreferences: string[];
  updatedAt: string;
}

export const DEFAULT_NUTRIENT_FOCUS_PREFERENCES: NutrientFocusPreferences = {
  activePreset: 'general',
  trackedNutrients: ['calories', 'protein', 'carbs', 'fat', 'fiber'],
  nutrientOrder: ['calories', 'protein', 'carbs', 'fat', 'fiber'],
  customTargets: {},
  foodPreferences: [],
  updatedAt: new Date().toISOString(),
};

export interface NutrientAggregatedItem {
  nutrientId: NutrientId;
  definition: NutrientDefinition;
  total: number | null; // null când 0 alimente au această informație
  target?: number;
  hasCustomTarget: boolean;
  unit: NutrientUnit;
  status: NutrientStatus;
  totalFoodsCount: number;
  availableFoodsCount: number;
  missingFoodsCount: number;
  isLimit: boolean;
}

export interface FoodContributor {
  foodName: string;
  mealType: string;
  amount: number;
  unit: NutrientUnit;
  percentage: number;
  classification: 'higher' | 'moderate' | 'lower'; // Termeni neutri, factuali
}

export interface MealNutrientTotal {
  mealType: string;
  mealLabel: string;
  amount: number | null;
  unit: NutrientUnit;
  hasIncompleteData: boolean;
  missingFoodsCount: number;
}
