import { WORKOUT_V2_PRESETS } from '../constants/workout-v2/presets';
import { completeSet, startWorkoutFromTemplate } from '../lib/workout-v2/sessionModel';
import { instantiatePreset } from '../lib/workout-v2/templateModel';
import { fromWorkoutHistoryRow, toWorkoutHistoryPayload } from '../lib/workout-v2/historyAdapter';

it('creates a versioned history payload only from a complete session', () => {
  const template = instantiatePreset(WORKOUT_V2_PRESETS[6], 'user-a', 'template-a', '2026-09-26T10:00:00Z');
  let session = startWorkoutFromTemplate(template, 'session-a', '2026-09-26T10:01:00Z');
  for (const block of session.blocks) {
    if (block.kind !== 'strength') continue;
    for (const set of block.sets) session = completeSet(session, block.id, set.id, { reps: set.plannedReps, weightKg: set.plannedWeightKg });
  }
  const payload = toWorkoutHistoryPayload(session, '2026-09-26T10:31:00Z');
  expect(payload.tip).toBe('forta_v2');
  expect(payload.exercitii[0].schemaVersion).toBe(2);
  expect(payload.exercitii[0].exercitiuId).toBe('goblet-squat');
});

it('keeps legacy rows readable without pretending they are V2', () => {
  expect(fromWorkoutHistoryRow({ id: 'legacy', exercitii: [{ exercitiuId: 'flotari' }] }).kind).toBe('legacy');
  expect(fromWorkoutHistoryRow({ id: 'v2', exercitii: [{ schemaVersion: 2, exercitiuId: 'push-up' }] }).kind).toBe('v2');
});
