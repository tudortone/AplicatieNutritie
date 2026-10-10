import {
  calculateConservativeWeightProjection,
  latestMeasuredWeightKg,
  normalizeWeightHistory,
} from '../lib/weightProjection';

describe('measured weight projection', () => {
  it('does not invent a measurement when history is empty or malformed', () => {
    expect(normalizeWeightHistory(null, '2026-10-09')).toEqual([]);
    expect(latestMeasuredWeightKg([])).toBeNull();
  });

  it('keeps only valid, non-future measurements and does not mutate source data', () => {
    const history = [
      { data: '2026-10-08', greutate: 72.4 },
      { data: '2026-10-10', greutate: 70 },
      { data: '2026-10-07', greutate: Number.POSITIVE_INFINITY },
      { data: 'invalid', greutate: 69 },
    ];
    const normalized = normalizeWeightHistory(history, '2026-10-09');
    expect(normalized).toEqual([{ date: '2026-10-08', weightKg: 72.4 }]);
    expect(latestMeasuredWeightKg(normalized)).toBe(72.4);
    expect(history[0]).toEqual({ data: '2026-10-08', greutate: 72.4 });
  });

  it('requires three actual measurements spanning at least two weeks', () => {
    expect(calculateConservativeWeightProjection({
      history: [
        { date: '2026-10-07', weightKg: 75 },
        { date: '2026-10-09', weightKg: 74.9 },
      ],
      targetWeightKg: 70,
      asOfDate: '2026-10-09',
    })).toEqual({ status: 'unavailable', reason: 'insufficient_measurements' });
  });

  it('does not forecast from a flat or away-from-goal measured trend', () => {
    const flat = [
      { date: '2026-09-20', weightKg: 75 },
      { date: '2026-10-01', weightKg: 75 },
      { date: '2026-10-08', weightKg: 75 },
    ];
    expect(calculateConservativeWeightProjection({ history: flat, targetWeightKg: 70, asOfDate: '2026-10-09' }))
      .toEqual({ status: 'unavailable', reason: 'no_progress_toward_goal' });
    expect(calculateConservativeWeightProjection({
      history: [
        { date: '2026-09-20', weightKg: 74 },
        { date: '2026-10-01', weightKg: 74.5 },
        { date: '2026-10-08', weightKg: 75 },
      ], targetWeightKg: 70, asOfDate: '2026-10-09',
    })).toEqual({ status: 'unavailable', reason: 'no_progress_toward_goal' });
  });

  it('projects from actual weight trend, caps the rate, and does not drift without new measurements', () => {
    const history = [
      { date: '2026-09-20', weightKg: 76 },
      { date: '2026-10-01', weightKg: 75.6 },
      { date: '2026-10-08', weightKg: 75.2 },
    ];
    const first = calculateConservativeWeightProjection({ history, targetWeightKg: 70, asOfDate: '2026-10-09' });
    const later = calculateConservativeWeightProjection({ history, targetWeightKg: 70, asOfDate: '2026-11-09' });
    expect(first.status).toBe('estimated');
    expect(later).toEqual(first);
    if (first.status !== 'estimated') throw new Error('Expected a projection');
    expect(first.weeklyChangeKg).toBeLessThanOrEqual(0.38);
    expect(first.weeklyChangeKg).toBeGreaterThan(0);
    expect(first.targetDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns unavailable for invalid target/date/numbers and never returns NaN or infinity', () => {
    const result = calculateConservativeWeightProjection({
      history: [
        { date: '2026-09-20', weightKg: 76 },
        { date: '2026-10-01', weightKg: 75.6 },
        { date: '2026-10-08', weightKg: 75.2 },
      ], targetWeightKg: Number.NaN, asOfDate: '2026-10-09',
    });
    expect(result).toEqual({ status: 'unavailable', reason: 'invalid_inputs' });
  });
});
