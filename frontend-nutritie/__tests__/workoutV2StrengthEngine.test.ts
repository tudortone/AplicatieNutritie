import {
  computeExerciseStrength,
  computeOverallFlowRank,
  computeProgressMomentum,
  computeStrengthMap,
  effectiveLoadForSet,
  estimateE1rm,
  type WorkoutV2Performance,
} from '../lib/workout-v2/strengthEngine';

const NOW = '2026-09-26T12:00:00.000Z';

function performance(
  exerciseId: WorkoutV2Performance['exerciseId'],
  performedAt: string,
  weightKg: number,
  reps = 5,
  overrides: Partial<WorkoutV2Performance> = {},
): WorkoutV2Performance {
  return {
    id: `${exerciseId}-${performedAt}-${weightKg}`,
    sessionId: `${exerciseId}-${performedAt}`,
    exerciseId,
    performedAt,
    reps,
    weightKg,
    setType: 'working',
    ...overrides,
  };
}

describe('Workout V2 demonstrated strength engine', () => {
  it('uses Epley only for valid 1-12 rep performances', () => {
    expect(estimateE1rm(100, 6)).toBeCloseTo(120);
    expect(estimateE1rm(100, 13)).toBeNull();
    expect(estimateE1rm(0, 6)).toBeNull();
  });

  it('normalizes by current bodyweight and the explicit exercise anchor', () => {
    const rows = [performance('barbell-bench-press', '2026-09-20T12:00:00.000Z', 100, 6)];
    expect(computeExerciseStrength('barbell-bench-press', rows, 80, NOW).score).toBe(75);
    expect(computeExerciseStrength('barbell-bench-press', rows, 60, NOW).score).toBe(100);
  });

  it('uses bodyweight factors and assistance without inventing missing bodyweight', () => {
    const pushUp = performance('push-up', '2026-09-20T12:00:00.000Z', 10, 10);
    expect(effectiveLoadForSet('push-up', pushUp, 80)).toBeCloseTo(65.2);
    const assisted = performance('pull-up', '2026-09-20T12:00:00.000Z', 0, 6, { assistanceWeightKg: 20 });
    expect(effectiveLoadForSet('pull-up', assisted, 80)).toBe(60);
    expect(effectiveLoadForSet('pull-up', assisted, undefined)).toBeNull();
  });

  it('excludes stale, warmup, cardio, and non-ranked equipment evidence', () => {
    const stale = performance('back-squat', '2026-06-01T12:00:00.000Z', 180);
    const warmup = performance('back-squat', '2026-09-20T12:00:00.000Z', 200, 5, { setType: 'warmup' });
    expect(computeExerciseStrength('back-squat', [stale, warmup], 80, NOW).status).toBe('NO_CURRENT_EVIDENCE');
    expect(computeExerciseStrength('running', [], 80, NOW).status).toBe('INELIGIBLE');
    expect(computeExerciseStrength('lat-pulldown', [], 80, NOW).status).toBe('INELIGIBLE');
  });

  it('keeps Progress Momentum completely separate from Strength Score', () => {
    const improving = [40, 45, 50, 58, 65, 72].map((weight, index) =>
      performance('barbell-bench-press', `2026-0${4 + index}-01T12:00:00.000Z`, weight),
    );
    const flatStrong = [100, 100, 100, 100, 100, 100].map((weight, index) =>
      performance('barbell-bench-press', `2026-0${4 + index}-02T12:00:00.000Z`, weight),
    );
    const strengthA = computeExerciseStrength('barbell-bench-press', improving, 80, NOW);
    const strengthB = computeExerciseStrength('barbell-bench-press', flatStrong, 80, NOW);
    const progressA = computeProgressMomentum('barbell-bench-press', improving, 80);
    const progressB = computeProgressMomentum('barbell-bench-press', flatStrong, 80);
    expect(strengthB.score).toBeGreaterThan(strengthA.score ?? 0);
    expect(progressA.score).toBeGreaterThan(progressB.score);
  });

  it('limits one-exercise muscle evidence and requires three overall regions', () => {
    const onlyBench = [performance('barbell-bench-press', '2026-09-20T12:00:00.000Z', 160, 1)];
    const map = computeStrengthMap(onlyBench, 80, NOW);
    expect(map.muscles.chest.score).toBeLessThanOrEqual(65);
    expect(map.overall.rank.key).toBe('NO_DATA');
    expect(map.overall.representedRegions).toBeLessThan(3);
    expect(computeOverallFlowRank({ chest: 60, back: 50, legs: 70 }).rank.key).not.toBe('NO_DATA');
  });

  it('recalculates directly from edited or deleted source history', () => {
    const best = performance('barbell-bench-press', '2026-09-20T12:00:00.000Z', 100, 5);
    const older = performance('barbell-bench-press', '2026-09-10T12:00:00.000Z', 70, 5);
    const original = computeExerciseStrength('barbell-bench-press', [older, best], 80, NOW).score ?? 0;
    const edited = computeExerciseStrength('barbell-bench-press', [older, { ...best, weightKg: 60 }], 80, NOW).score ?? 0;
    const deleted = computeExerciseStrength('barbell-bench-press', [older], 80, NOW).score ?? 0;
    expect(edited).toBeLessThan(original);
    expect(deleted).toBeLessThan(original);
  });

  it('excludes cross-account evidence when an owner authority is supplied', () => {
    const own = performance('barbell-bench-press', '2026-09-20T12:00:00.000Z', 50, 5, { ownerId: 'user-a' });
    const foreign = performance('barbell-bench-press', '2026-09-21T12:00:00.000Z', 200, 5, { ownerId: 'user-b' });
    const isolated = computeExerciseStrength('barbell-bench-press', [own, foreign], 80, NOW, 'user-a');
    const ownOnly = computeExerciseStrength('barbell-bench-press', [own], 80, NOW, 'user-a');
    expect(isolated.score).toBe(ownOnly.score);
    expect(isolated.bestPerformanceId).toBe(own.id);
  });
});
