import { resolveLegacyExerciseId } from '../lib/workout-v2/legacyAdapter';
import { validateWorkoutV2Measurement } from '../lib/workout-v2/measurement';

describe('Workout V2 measurement and legacy boundaries', () => {
  it('validates measurement-specific fields without guessing values', () => {
    expect(validateWorkoutV2Measurement('reps_weight', { reps: 8, weightKg: 40 })).toEqual([]);
    expect(validateWorkoutV2Measurement('distance_time', {})).toContain('CARDIO_RESULT_REQUIRED');
    expect(validateWorkoutV2Measurement('assisted_bodyweight_reps', { reps: 5, assistanceWeightKg: -1 }))
      .toContain('INVALID_ASSISTANCE');
  });

  it('maps only explicit legacy IDs and rejects unknown free text', () => {
    expect(resolveLegacyExerciseId('genuflexiuni')).toEqual({ kind: 'mapped', exerciseId: 'back-squat' });
    expect(resolveLegacyExerciseId('mystery super lift')).toEqual({
      kind: 'unsupported', legacyId: 'mystery super lift',
    });
  });
});
