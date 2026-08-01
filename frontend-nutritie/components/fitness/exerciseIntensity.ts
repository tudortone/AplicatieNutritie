/**
 * exerciseIntensity.ts — intensitatea per muschi pentru un exercitiu.
 *
 * FIX: dictionarul local de alias-uri a fost mutat in `lib/muscleMapping.ts`
 * (sursa unica de adevar). Aici doar re-exportam, ca sa nu existe doua liste
 * care se pot desincroniza (ex: "abductori" lipsea din varianta veche).
 */

import type { MuscleId } from './heatColor';
import {
  MUSCLE_ALIASES,
  mapToCanonicalMuscleIds,
  normalizeMuscleKey,
  toCanonicalMuscle,
} from '@/lib/muscleMapping';

export { MUSCLE_ALIASES, mapToCanonicalMuscleIds, normalizeMuscleKey, toCanonicalMuscle };

export type ExerciseActivation = Partial<Record<MuscleId, number>>;

export interface ExerciseForHeatmap {
  target_muscles?: string[];
  activation?: ExerciseActivation;
}

const clamp01 = (value: unknown): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(n, 0), 1);
};

export function intensityForExercise(
  exercise: ExerciseForHeatmap,
): ExerciseActivation {
  const result: ExerciseActivation = {};

  // Varianta 1: activare explicita din catalog.
  if (exercise.activation && Object.keys(exercise.activation).length > 0) {
    for (const [muscle, value] of Object.entries(exercise.activation)) {
      // FIX: si cheile din `activation` trec prin normalizare, nu doar target_muscles.
      const canonical = toCanonicalMuscle(muscle);
      if (!canonical) continue;
      const v = clamp01(value);
      result[canonical] = Math.max(result[canonical] ?? 0, v);
    }
    return result;
  }

  // Varianta 2: derivare din lista de muschi tinta (primul = principal).
  const muscles = exercise.target_muscles ?? [];
  muscles.forEach((muscle, index) => {
    const base = index === 0 ? 1 : index === 1 ? 0.65 : 0.35;
    // Grupele generice ("picioare", "spate") se distribuie pe mai multi muschi.
    for (const { id, weight } of mapToCanonicalMuscleIds(muscle)) {
      const value = clamp01(base * weight);
      result[id] = Math.max(result[id] ?? 0, value);
    }
  });

  return result;
}
