/**
 * GetFlow — Nutrient Focus Preferences Storage
 * Gestionează salvarea și încărcarea preferințelor utilizatorului în AsyncStorage.
 *
 * RESPECTARE CONFIDENȚIALITATE:
 * Nu se stochează diagnostice sau stări clinice. Se stochează strict ID-uri de
 * nutrienți monitorizați, valori numerice pentru ținte și preferințe alimentare.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  NutrientId,
  PresetId,
  NutrientFocusPreferences,
  DEFAULT_NUTRIENT_FOCUS_PREFERENCES,
  FOCUS_PRESETS,
} from './types';

const STORAGE_KEY = '@getflow_nutrient_focus_prefs_v1';

export async function getNutrientFocusPreferences(): Promise<NutrientFocusPreferences> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_NUTRIENT_FOCUS_PREFERENCES };

    const parsed = JSON.parse(raw);
    return {
      activePreset: parsed.activePreset || 'general',
      trackedNutrients: Array.isArray(parsed.trackedNutrients) && parsed.trackedNutrients.length > 0
        ? parsed.trackedNutrients
        : [...DEFAULT_NUTRIENT_FOCUS_PREFERENCES.trackedNutrients],
      nutrientOrder: Array.isArray(parsed.nutrientOrder) && parsed.nutrientOrder.length > 0
        ? parsed.nutrientOrder
        : [...DEFAULT_NUTRIENT_FOCUS_PREFERENCES.nutrientOrder],
      customTargets: typeof parsed.customTargets === 'object' && parsed.customTargets !== null
        ? parsed.customTargets
        : {},
      foodPreferences: Array.isArray(parsed.foodPreferences) ? parsed.foodPreferences : [],
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch (error) {
    console.warn('[NutrientFocusStorage] Eroare citire preferinte:', error);
    return { ...DEFAULT_NUTRIENT_FOCUS_PREFERENCES };
  }
}

export async function saveNutrientFocusPreferences(
  prefs: Partial<NutrientFocusPreferences>
): Promise<NutrientFocusPreferences> {
  try {
    const current = await getNutrientFocusPreferences();
    const updated: NutrientFocusPreferences = {
      ...current,
      ...prefs,
      updatedAt: new Date().toISOString(),
    };

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (error) {
    console.warn('[NutrientFocusStorage] Eroare salvare preferinte:', error);
    return { ...DEFAULT_NUTRIENT_FOCUS_PREFERENCES, ...prefs, updatedAt: new Date().toISOString() };
  }
}

export async function selectFocusPreset(presetId: PresetId): Promise<NutrientFocusPreferences> {
  const preset = FOCUS_PRESETS[presetId];
  if (!preset) {
    throw new Error(`Preset necunoscut: ${presetId}`);
  }

  const current = await getNutrientFocusPreferences();

  if (presetId === 'custom') {
    return saveNutrientFocusPreferences({
      activePreset: 'custom',
    });
  }

  return saveNutrientFocusPreferences({
    activePreset: presetId,
    trackedNutrients: [...preset.nutrients],
    nutrientOrder: [...preset.nutrients],
  });
}

export async function toggleTrackedNutrient(
  nutrientId: NutrientId,
  enable?: boolean
): Promise<NutrientFocusPreferences> {
  const current = await getNutrientFocusPreferences();
  const currentlyTracked = new Set(current.trackedNutrients);

  const shouldEnable = enable !== undefined ? enable : !currentlyTracked.has(nutrientId);

  let newTracked: NutrientId[];
  let newOrder: NutrientId[];

  if (shouldEnable) {
    currentlyTracked.add(nutrientId);
    newTracked = Array.from(currentlyTracked);
    newOrder = current.nutrientOrder.includes(nutrientId)
      ? current.nutrientOrder
      : [...current.nutrientOrder, nutrientId];
  } else {
    // Păstrăm cel puțin 1 nutrient activ
    if (currentlyTracked.size <= 1) {
      return current;
    }
    currentlyTracked.delete(nutrientId);
    newTracked = Array.from(currentlyTracked);
    newOrder = current.nutrientOrder.filter((id) => id !== nutrientId);
  }

  return saveNutrientFocusPreferences({
    activePreset: 'custom',
    trackedNutrients: newTracked,
    nutrientOrder: newOrder,
  });
}

export async function setNutrientOrder(order: NutrientId[]): Promise<NutrientFocusPreferences> {
  return saveNutrientFocusPreferences({
    activePreset: 'custom',
    nutrientOrder: order,
  });
}

export async function setCustomNutrientTarget(
  nutrientId: NutrientId,
  targetValue: number | null
): Promise<NutrientFocusPreferences> {
  const current = await getNutrientFocusPreferences();
  const targets = { ...current.customTargets };

  if (targetValue === null || targetValue <= 0 || !Number.isFinite(targetValue)) {
    delete targets[nutrientId];
  } else {
    targets[nutrientId] = Math.round(targetValue);
  }

  return saveNutrientFocusPreferences({
    customTargets: targets,
  });
}

export async function setFoodPreferences(preferences: string[]): Promise<NutrientFocusPreferences> {
  return saveNutrientFocusPreferences({
    foodPreferences: preferences,
  });
}

export async function resetNutrientFocusToDefaults(): Promise<NutrientFocusPreferences> {
  await AsyncStorage.removeItem(STORAGE_KEY);
  return { ...DEFAULT_NUTRIENT_FOCUS_PREFERENCES };
}
