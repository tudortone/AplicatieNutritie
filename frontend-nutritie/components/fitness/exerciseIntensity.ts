import type { MuscleId } from './heatColor';

export type ExerciseActivation = Partial<Record<MuscleId, number>>;

export interface ExerciseForHeatmap {
  target_muscles?: string[];
  activation?: ExerciseActivation;
}

const MUSCLE_ALIASES: Record<string, MuscleId> = {
  chest: 'pectorali',
  pectoralis: 'pectorali',
  pectoralis_major: 'pectorali',
  back: 'dorsali',
  lats: 'dorsali',
  shoulders: 'deltoid_anterior',
  front_delts: 'deltoid_anterior',
  rear_delts: 'deltoid_posterior',
  biceps: 'biceps',
  triceps: 'triceps',
  forearms: 'antebrate',
  core: 'abdomen',
  abs: 'abdomen',
  glutes: 'fesieri',
  quads: 'cvadriceps',
  quadriceps: 'cvadriceps',
  hamstrings: 'ischiogambieri',
  calves: 'gambe',
  trapezius: 'trapez',
  lower_back: 'lombari',
};

export function toCanonicalMuscle(value: string): MuscleId | null {
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return MUSCLE_ALIASES[key] ?? null;
}

export function intensityForExercise(
  exercise: ExerciseForHeatmap,
): ExerciseActivation {
  if (exercise.activation) {
    return Object.fromEntries(
      Object.entries(exercise.activation).map(([muscle, value]) => [
        muscle,
        Math.min(Math.max(Number(value), 0), 1),
      ]),
    ) as ExerciseActivation;
  }

  const muscles = exercise.target_muscles ?? [];
  const result: ExerciseActivation = {};

  muscles.forEach((muscle, index) => {
    const canonical = toCanonicalMuscle(muscle);
    if (!canonical) return;

    result[canonical] = index === 0 ? 1 : index === 1 ? 0.65 : 0.35;
  });

  return result;
}
