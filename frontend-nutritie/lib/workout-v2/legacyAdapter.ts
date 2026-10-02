import { getWorkoutV2Exercise, type WorkoutV2ExerciseId } from '../../constants/workout-v2/exercises';

const LEGACY_EXERCISE_IDS: Readonly<Record<string, WorkoutV2ExerciseId>> = Object.freeze({
  bench_press: 'barbell-bench-press',
  impins_culcat: 'barbell-bench-press',
  genuflexiuni: 'back-squat',
  deadlift: 'conventional-deadlift',
  indreptari: 'conventional-deadlift',
  pull_up: 'pull-up',
  tractiuni: 'pull-up',
  alergare: 'running',
  bicicleta: 'cycling',
});

export type LegacyExerciseResolution =
  | { kind: 'mapped'; exerciseId: WorkoutV2ExerciseId }
  | { kind: 'unsupported'; legacyId: string };

export function resolveLegacyExerciseId(legacyId: string): LegacyExerciseResolution {
  if (getWorkoutV2Exercise(legacyId)) {
    return { kind: 'mapped', exerciseId: legacyId as WorkoutV2ExerciseId };
  }
  const mapped = LEGACY_EXERCISE_IDS[legacyId.trim().toLocaleLowerCase('ro-RO')];
  return mapped
    ? { kind: 'mapped', exerciseId: mapped }
    : { kind: 'unsupported', legacyId };
}
