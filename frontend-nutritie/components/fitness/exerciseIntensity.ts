import type { MuscleId } from './heatColor';

export type ExerciseActivation = Partial<Record<MuscleId, number>>;

export interface ExerciseForHeatmap {
  target_muscles?: string[];
  activation?: ExerciseActivation;
}

const MUSCLE_ALIASES: Record<string, MuscleId> = {
  chest: 'pectorali',
  piept: 'pectorali',
  pectoralis: 'pectorali',
  pectoralis_major: 'pectorali',
  back: 'dorsali',
  spate: 'dorsali',
  lats: 'dorsali',
  shoulders: 'deltoid_anterior',
  umeri: 'deltoid_anterior',
  delts: 'deltoid_anterior',
  front_delts: 'deltoid_anterior',
  side_delts: 'deltoid_lateral',
  delts_side: 'deltoid_lateral',
  umeri_laterali: 'deltoid_lateral',
  rear_delts: 'deltoid_posterior',
  delts_rear: 'deltoid_posterior',
  umeri_posteriori: 'deltoid_posterior',
  biceps: 'biceps',
  triceps: 'triceps',
  forearms: 'antebrate',
  antebrate: 'antebrate',
  core: 'abdomen',
  abs: 'abdomen',
  obliques: 'oblici',
  oblici: 'oblici',
  glutes: 'fesieri',
  fesieri: 'fesieri',
  quads: 'cvadriceps',
  quadriceps: 'cvadriceps',
  cvadriceps: 'cvadriceps',
  hamstrings: 'ischiogambieri',
  ischiogambieri: 'ischiogambieri',
  calves: 'gambe',
  gambe: 'gambe',
  trapezius: 'trapez',
  trapez: 'trapez',
  lower_back: 'lombari',
  lombari: 'lombari',
  rhomboids: 'romboizi',
  romboizi: 'romboizi',
  adductors: 'adductori',
  adductori: 'adductori',
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
