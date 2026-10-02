import type { WorkoutV2MeasurementType } from '../../constants/workout-v2/exercises';

export interface WorkoutV2MeasurementInput {
  reps?: number;
  weightKg?: number;
  durationSeconds?: number;
  distanceKm?: number;
  assistanceWeightKg?: number;
}

export function validateWorkoutV2Measurement(
  type: WorkoutV2MeasurementType,
  value: WorkoutV2MeasurementInput,
): readonly string[] {
  const errors: string[] = [];
  const positive = (number: number | undefined) => Number.isFinite(number) && (number ?? 0) > 0;
  const nonNegative = (number: number | undefined) => number === undefined
    || (Number.isFinite(number) && number >= 0);

  if (type === 'reps_weight' || type === 'bodyweight_reps' || type === 'assisted_bodyweight_reps') {
    if (!positive(value.reps)) errors.push('REPS_REQUIRED');
  }
  if (type === 'reps_weight' || type === 'timed_weight') {
    if (!nonNegative(value.weightKg)) errors.push('INVALID_WEIGHT');
  }
  if (type === 'timed' || type === 'timed_weight') {
    if (!positive(value.durationSeconds)) errors.push('DURATION_REQUIRED');
  }
  if (type === 'distance_time') {
    if (!positive(value.durationSeconds) && !positive(value.distanceKm)) errors.push('CARDIO_RESULT_REQUIRED');
  }
  if (type === 'assisted_bodyweight_reps' && !nonNegative(value.assistanceWeightKg)) {
    errors.push('INVALID_ASSISTANCE');
  }
  return errors;
}
