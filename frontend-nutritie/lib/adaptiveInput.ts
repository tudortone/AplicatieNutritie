/**
 * adaptiveInput.ts — Tipuri, validare strictă și indexare rapidă pentru catalogul de exerciții offline.
 * Conform specificației NutriAI v7 (Secțiunea 1.2, 1.3 & 3.E).
 */

import EXERCISES_RAW from '../constants/exercises.json';
import { sportI18n as i18n } from './sportI18n';
import {
  getLocalizedExerciseName,
  getLocalizedMuscleLabel,
  normalizeSearchText,
} from './sportI18n';

export type InputType = 'hold' | 'bodyweight_reps' | 'weighted_reps';

export interface SetInput {
  reps?: number;
  weight_kg?: number;
  time_seconds?: number;
}

export interface ExerciseCatalogItem {
  id: string;
  name: string;
  name_ro?: string;
  categorie?: string;
  equipment: 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'kettlebell' | 'band' | string;
  target_muscles: string[];
  input_type: InputType;
  bw_load_ratio?: number;
  activation?: Record<string, number>;
}

export const FIELDS_BY_TYPE: Record<InputType, (keyof SetInput)[]> = {
  hold: ['time_seconds'],
  bodyweight_reps: ['reps'],
  weighted_reps: ['weight_kg', 'reps'],
};

export function getFieldsForType(t: InputType): (keyof SetInput)[] {
  return FIELDS_BY_TYPE[t] || FIELDS_BY_TYPE.weighted_reps;
}

export function validateSet(t: InputType, input: SetInput): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const fields = getFieldsForType(t);

  for (const field of fields) {
    const fieldKey =
      field === 'time_seconds'
        ? 'duration'
        : field === 'weight_kg'
          ? 'weight'
          : field;
    const fieldLabel = i18n.t(`sport.measurement.fields.${fieldKey}`, {
      defaultValue: field,
    });
    const v = input[field];
    if (v === undefined || v === null || Number.isNaN(v)) {
      errors.push(i18n.t('sport.measurement.errors.fieldRequired', { field: fieldLabel }));
    } else if (typeof v !== 'number' || v <= 0) {
      errors.push(i18n.t('sport.measurement.errors.fieldPositive', { field: fieldLabel }));
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * 3.E JSON parsing / 1000+ exerciții fără jank:
 * Parsează și creează un index minuscul în memorie la boot [{id, name, nameLower, equipment, input_type}]
 */
export interface ExerciseIndexItem {
  id: string;
  name: string;
  nameLower: string;
  equipment: string;
  input_type: InputType;
}

export const EXERCISE_CATALOG_LIST: ExerciseCatalogItem[] = EXERCISES_RAW as unknown as ExerciseCatalogItem[];

export const EXERCISE_INDEX: ExerciseIndexItem[] = EXERCISE_CATALOG_LIST.map((item) => ({
  id: item.id,
  name: item.name_ro || item.name,
  nameLower: `${item.name?.toLowerCase() || ''} ${item.name_ro?.toLowerCase() || ''} ${(item.target_muscles || []).join(' ')}`.trim(),
  equipment: item.equipment,
  input_type: item.input_type,
}));

/**
 * Căutare ultra-rapidă cu index minuscul
 */
export function searchExercisesIndex(query: string, equipmentFilter?: string): ExerciseCatalogItem[] {
  const q = normalizeSearchText(query);

  return EXERCISE_CATALOG_LIST.filter((ex) => {
    if (equipmentFilter && equipmentFilter !== 'all' && ex.equipment !== equipmentFilter) {
      return false;
    }
    if (!q) return true;

    const localized = normalizeSearchText(
      getLocalizedExerciseName({ id: ex.id, nume: ex.name_ro || ex.name }),
    );
    const lowerName = normalizeSearchText(ex.name);
    const lowerRo = normalizeSearchText(ex.name_ro || '');
    const lowerMuscles = normalizeSearchText(
      ex.target_muscles.map((m) => `${m} ${getLocalizedMuscleLabel(m)}`).join(' '),
    );

    return localized.includes(q) || lowerName.includes(q) || lowerRo.includes(q) || lowerMuscles.includes(q);
  });
}
