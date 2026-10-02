import { isV2MuscleId, type V2MuscleId } from './muscles';

export type WorkoutV2Movement =
  | 'horizontal_push' | 'vertical_push' | 'horizontal_pull' | 'vertical_pull'
  | 'squat' | 'hinge' | 'lunge' | 'carry' | 'arms' | 'core' | 'cardio';
export type WorkoutV2ExerciseKind = 'strength' | 'bodyweight' | 'isometric' | 'cardio';
export type WorkoutV2Equipment =
  | 'barbell' | 'dumbbell' | 'bodyweight' | 'pullup_bar' | 'parallel_bars'
  | 'machine' | 'cable' | 'treadmill' | 'bike' | 'none';
export type WorkoutV2MeasurementType =
  | 'reps_weight' | 'bodyweight_reps' | 'assisted_bodyweight_reps'
  | 'timed' | 'timed_weight' | 'distance_time';

export interface ExerciseMuscleRoles {
  primary: readonly V2MuscleId[];
  secondary: readonly V2MuscleId[];
  stabilizers: readonly V2MuscleId[];
}

export interface WorkoutV2Exercise {
  id: string;
  nameKey: `workoutV2.exercises.${string}`;
  movement: WorkoutV2Movement;
  kind: WorkoutV2ExerciseKind;
  equipment: WorkoutV2Equipment;
  measurement: WorkoutV2MeasurementType;
  muscles: ExerciseMuscleRoles;
  defaults: { sets: number; reps?: number; durationSeconds?: number; restSeconds: number; weightKg?: number };
  strengthEligible: boolean;
  bodyweightFactor?: number;
  strengthNormalizationAnchor?: number;
  loadInterpretation?: 'total_external' | 'combined_dumbbells' | 'bodyweight_plus_external_minus_assistance';
}

const roles = (
  primary: readonly V2MuscleId[],
  secondary: readonly V2MuscleId[] = [],
  stabilizers: readonly V2MuscleId[] = [],
): ExerciseMuscleRoles => ({ primary, secondary, stabilizers });

export const WORKOUT_V2_EXERCISES = [
  { id: 'barbell-bench-press', nameKey: 'workoutV2.exercises.barbellBenchPress', movement: 'horizontal_push', kind: 'strength', equipment: 'barbell', measurement: 'reps_weight', muscles: roles(['chest'], ['upper_chest', 'triceps', 'front_delts'], ['abs']), defaults: { sets: 4, reps: 8, restSeconds: 120, weightKg: 20 }, strengthEligible: true, strengthNormalizationAnchor: 1, loadInterpretation: 'total_external' },
  { id: 'incline-dumbbell-press', nameKey: 'workoutV2.exercises.inclineDumbbellPress', movement: 'horizontal_push', kind: 'strength', equipment: 'dumbbell', measurement: 'reps_weight', muscles: roles(['upper_chest'], ['chest', 'triceps', 'front_delts']), defaults: { sets: 3, reps: 10, restSeconds: 90, weightKg: 10 }, strengthEligible: true, strengthNormalizationAnchor: 0.75, loadInterpretation: 'combined_dumbbells' },
  { id: 'push-up', nameKey: 'workoutV2.exercises.pushUp', movement: 'horizontal_push', kind: 'bodyweight', equipment: 'bodyweight', measurement: 'bodyweight_reps', muscles: roles(['chest'], ['triceps', 'front_delts'], ['abs']), defaults: { sets: 3, reps: 10, restSeconds: 60 }, strengthEligible: true, bodyweightFactor: 0.69, strengthNormalizationAnchor: 0.6, loadInterpretation: 'bodyweight_plus_external_minus_assistance' },
  { id: 'parallel-bar-dip', nameKey: 'workoutV2.exercises.parallelBarDip', movement: 'vertical_push', kind: 'bodyweight', equipment: 'parallel_bars', measurement: 'assisted_bodyweight_reps', muscles: roles(['triceps', 'chest'], ['front_delts'], ['abs']), defaults: { sets: 3, reps: 8, restSeconds: 90 }, strengthEligible: true, bodyweightFactor: 0.9, strengthNormalizationAnchor: 0.95, loadInterpretation: 'bodyweight_plus_external_minus_assistance' },
  { id: 'standing-overhead-press', nameKey: 'workoutV2.exercises.standingOverheadPress', movement: 'vertical_push', kind: 'strength', equipment: 'barbell', measurement: 'reps_weight', muscles: roles(['front_delts', 'side_delts'], ['triceps', 'upper_chest'], ['abs', 'lower_back']), defaults: { sets: 4, reps: 6, restSeconds: 120, weightKg: 15 }, strengthEligible: true, strengthNormalizationAnchor: 0.65, loadInterpretation: 'total_external' },
  { id: 'dumbbell-lateral-raise', nameKey: 'workoutV2.exercises.dumbbellLateralRaise', movement: 'vertical_push', kind: 'strength', equipment: 'dumbbell', measurement: 'reps_weight', muscles: roles(['side_delts'], ['traps']), defaults: { sets: 3, reps: 12, restSeconds: 60, weightKg: 4 }, strengthEligible: true, strengthNormalizationAnchor: 0.2, loadInterpretation: 'combined_dumbbells' },
  { id: 'barbell-row', nameKey: 'workoutV2.exercises.barbellRow', movement: 'horizontal_pull', kind: 'strength', equipment: 'barbell', measurement: 'reps_weight', muscles: roles(['lats'], ['traps', 'biceps', 'rear_delts'], ['lower_back', 'abs']), defaults: { sets: 4, reps: 8, restSeconds: 120, weightKg: 20 }, strengthEligible: true, strengthNormalizationAnchor: 0.9, loadInterpretation: 'total_external' },
  { id: 'one-arm-dumbbell-row', nameKey: 'workoutV2.exercises.oneArmDumbbellRow', movement: 'horizontal_pull', kind: 'strength', equipment: 'dumbbell', measurement: 'reps_weight', muscles: roles(['lats'], ['biceps', 'rear_delts'], ['lower_back']), defaults: { sets: 3, reps: 10, restSeconds: 75, weightKg: 10 }, strengthEligible: false },
  { id: 'pull-up', nameKey: 'workoutV2.exercises.pullUp', movement: 'vertical_pull', kind: 'bodyweight', equipment: 'pullup_bar', measurement: 'assisted_bodyweight_reps', muscles: roles(['lats'], ['biceps', 'forearms', 'rear_delts'], ['abs']), defaults: { sets: 4, reps: 6, restSeconds: 120 }, strengthEligible: true, bodyweightFactor: 1, strengthNormalizationAnchor: 1.1, loadInterpretation: 'bodyweight_plus_external_minus_assistance' },
  { id: 'chin-up', nameKey: 'workoutV2.exercises.chinUp', movement: 'vertical_pull', kind: 'bodyweight', equipment: 'pullup_bar', measurement: 'assisted_bodyweight_reps', muscles: roles(['lats', 'biceps'], ['forearms'], ['abs']), defaults: { sets: 3, reps: 6, restSeconds: 120 }, strengthEligible: true, bodyweightFactor: 1, strengthNormalizationAnchor: 1.1, loadInterpretation: 'bodyweight_plus_external_minus_assistance' },
  { id: 'lat-pulldown', nameKey: 'workoutV2.exercises.latPulldown', movement: 'vertical_pull', kind: 'strength', equipment: 'machine', measurement: 'reps_weight', muscles: roles(['lats'], ['biceps', 'rear_delts']), defaults: { sets: 3, reps: 10, restSeconds: 75, weightKg: 20 }, strengthEligible: false },
  { id: 'back-squat', nameKey: 'workoutV2.exercises.backSquat', movement: 'squat', kind: 'strength', equipment: 'barbell', measurement: 'reps_weight', muscles: roles(['quads', 'glutes'], ['adductors', 'hamstrings'], ['abs', 'lower_back']), defaults: { sets: 4, reps: 6, restSeconds: 150, weightKg: 20 }, strengthEligible: true, strengthNormalizationAnchor: 1.25, loadInterpretation: 'total_external' },
  { id: 'front-squat', nameKey: 'workoutV2.exercises.frontSquat', movement: 'squat', kind: 'strength', equipment: 'barbell', measurement: 'reps_weight', muscles: roles(['quads'], ['glutes', 'adductors'], ['abs', 'lower_back']), defaults: { sets: 3, reps: 6, restSeconds: 150, weightKg: 20 }, strengthEligible: true, strengthNormalizationAnchor: 1.05, loadInterpretation: 'total_external' },
  { id: 'goblet-squat', nameKey: 'workoutV2.exercises.gobletSquat', movement: 'squat', kind: 'strength', equipment: 'dumbbell', measurement: 'reps_weight', muscles: roles(['quads', 'glutes'], ['adductors'], ['abs']), defaults: { sets: 3, reps: 10, restSeconds: 75, weightKg: 10 }, strengthEligible: false },
  { id: 'conventional-deadlift', nameKey: 'workoutV2.exercises.conventionalDeadlift', movement: 'hinge', kind: 'strength', equipment: 'barbell', measurement: 'reps_weight', muscles: roles(['glutes', 'hamstrings', 'lower_back'], ['traps', 'quads'], ['forearms', 'abs']), defaults: { sets: 3, reps: 5, restSeconds: 180, weightKg: 30 }, strengthEligible: true, strengthNormalizationAnchor: 1.5, loadInterpretation: 'total_external' },
  { id: 'romanian-deadlift', nameKey: 'workoutV2.exercises.romanianDeadlift', movement: 'hinge', kind: 'strength', equipment: 'barbell', measurement: 'reps_weight', muscles: roles(['hamstrings', 'glutes'], ['lower_back'], ['forearms', 'abs']), defaults: { sets: 3, reps: 8, restSeconds: 120, weightKg: 20 }, strengthEligible: true, strengthNormalizationAnchor: 1.2, loadInterpretation: 'total_external' },
  { id: 'hip-thrust', nameKey: 'workoutV2.exercises.hipThrust', movement: 'hinge', kind: 'strength', equipment: 'barbell', measurement: 'reps_weight', muscles: roles(['glutes'], ['hamstrings'], ['abs']), defaults: { sets: 3, reps: 10, restSeconds: 90, weightKg: 20 }, strengthEligible: false },
  { id: 'weighted-lunge', nameKey: 'workoutV2.exercises.weightedLunge', movement: 'lunge', kind: 'strength', equipment: 'dumbbell', measurement: 'reps_weight', muscles: roles(['quads', 'glutes'], ['hamstrings', 'adductors'], ['calves', 'abs']), defaults: { sets: 3, reps: 10, restSeconds: 75, weightKg: 10 }, strengthEligible: true, strengthNormalizationAnchor: 0.6, loadInterpretation: 'combined_dumbbells' },
  { id: 'farmer-carry', nameKey: 'workoutV2.exercises.farmerCarry', movement: 'carry', kind: 'strength', equipment: 'dumbbell', measurement: 'timed_weight', muscles: roles(['forearms', 'traps'], ['side_delts'], ['abs', 'lower_back', 'glutes']), defaults: { sets: 3, durationSeconds: 40, restSeconds: 75, weightKg: 10 }, strengthEligible: false },
  { id: 'dumbbell-curl', nameKey: 'workoutV2.exercises.dumbbellCurl', movement: 'arms', kind: 'strength', equipment: 'dumbbell', measurement: 'reps_weight', muscles: roles(['biceps'], ['forearms']), defaults: { sets: 3, reps: 10, restSeconds: 60, weightKg: 6 }, strengthEligible: true, strengthNormalizationAnchor: 0.35, loadInterpretation: 'combined_dumbbells' },
  { id: 'overhead-triceps-extension', nameKey: 'workoutV2.exercises.overheadTricepsExtension', movement: 'arms', kind: 'strength', equipment: 'dumbbell', measurement: 'reps_weight', muscles: roles(['triceps'], ['front_delts']), defaults: { sets: 3, reps: 10, restSeconds: 60, weightKg: 8 }, strengthEligible: false },
  { id: 'plank', nameKey: 'workoutV2.exercises.plank', movement: 'core', kind: 'isometric', equipment: 'bodyweight', measurement: 'timed', muscles: roles(['abs'], ['obliques'], ['glutes', 'front_delts']), defaults: { sets: 3, durationSeconds: 30, restSeconds: 45 }, strengthEligible: false },
  { id: 'pallof-press', nameKey: 'workoutV2.exercises.pallofPress', movement: 'core', kind: 'strength', equipment: 'cable', measurement: 'reps_weight', muscles: roles(['obliques', 'abs'], [], ['glutes']), defaults: { sets: 3, reps: 10, restSeconds: 45, weightKg: 5 }, strengthEligible: false },
  { id: 'running', nameKey: 'workoutV2.exercises.running', movement: 'cardio', kind: 'cardio', equipment: 'treadmill', measurement: 'distance_time', muscles: roles([], [], []), defaults: { sets: 1, durationSeconds: 1200, restSeconds: 0 }, strengthEligible: false },
  { id: 'cycling', nameKey: 'workoutV2.exercises.cycling', movement: 'cardio', kind: 'cardio', equipment: 'bike', measurement: 'distance_time', muscles: roles([], [], []), defaults: { sets: 1, durationSeconds: 1200, restSeconds: 0 }, strengthEligible: false },
] as const satisfies readonly WorkoutV2Exercise[];

export type WorkoutV2ExerciseId = typeof WORKOUT_V2_EXERCISES[number]['id'];

const EXERCISE_INDEX = new Map<string, WorkoutV2Exercise>(
  WORKOUT_V2_EXERCISES.map((exercise) => [exercise.id, exercise]),
);

export function getWorkoutV2Exercise(id: string): WorkoutV2Exercise | undefined {
  return EXERCISE_INDEX.get(id);
}

export function validateWorkoutV2Catalog(catalog: readonly WorkoutV2Exercise[]): void {
  const ids = new Set<string>();
  for (const exercise of catalog) {
    if (!exercise.id || ids.has(exercise.id)) throw new Error(`DUPLICATE_EXERCISE_ID:${exercise.id}`);
    ids.add(exercise.id);
    const muscleIds = [
      ...exercise.muscles.primary,
      ...exercise.muscles.secondary,
      ...exercise.muscles.stabilizers,
    ];
    if (exercise.kind !== 'cardio' && exercise.muscles.primary.length === 0) {
      throw new Error(`MISSING_PRIMARY_MUSCLE:${exercise.id}`);
    }
    for (const muscleId of muscleIds) {
      if (!isV2MuscleId(muscleId)) throw new Error(`UNKNOWN_MUSCLE:${exercise.id}:${muscleId}`);
    }
    if (new Set(muscleIds).size !== muscleIds.length) throw new Error(`DUPLICATE_MUSCLE_ROLE:${exercise.id}`);
    if (exercise.strengthEligible && (!exercise.strengthNormalizationAnchor || !exercise.loadInterpretation)) {
      throw new Error(`MISSING_STRENGTH_NORMALIZATION:${exercise.id}`);
    }
    if (!exercise.strengthEligible && exercise.strengthNormalizationAnchor !== undefined) {
      throw new Error(`UNRANKED_EXERCISE_HAS_ANCHOR:${exercise.id}`);
    }
  }
}
