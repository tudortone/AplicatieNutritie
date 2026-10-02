import React from 'react';
import { render } from '@testing-library/react-native';

import { StrengthSummary } from '../components/workout-v2/StrengthSummary';
import {
  WORKOUT_V2_COMPARISON_FIXTURES,
  getWorkoutV2PreviewProfile,
} from '../lib/workout-v2/previewFixtures';
import { computeExerciseStrength, computeStrengthMap, effectiveLoadForSet } from '../lib/workout-v2/strengthEngine';

jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ colors: {
    accent: '#ccff00', accentTertiary: '#00f0ff', textPrimary: '#fff', textSecondary: '#999',
    surfaceBg: '#181d22', border: '#333',
  } }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const NOW = '2026-09-26T12:00:00.000Z';

describe('Workout V2 deterministic strength preview', () => {
  it('proves high demonstrated strength outranks high recent improvement', () => {
    const improving = getWorkoutV2PreviewProfile('improving');
    const strong = getWorkoutV2PreviewProfile('strong-flat');
    const improvingMap = computeStrengthMap(improving.performances, improving.bodyweightKg, NOW);
    const strongMap = computeStrengthMap(strong.performances, strong.bodyweightKg, NOW);
    expect(strongMap.overall.score ?? 0).toBeGreaterThan(improvingMap.overall.score ?? 0);
    expect(improvingMap.momentum['barbell-bench-press']?.score ?? 0)
      .toBeGreaterThan(strongMap.momentum['barbell-bench-press']?.score ?? 0);
  });

  it('covers lift, bodyweight, assistance, and missing-bodyweight comparisons', () => {
    const fixtures = WORKOUT_V2_COMPARISON_FIXTURES;
    const low = computeExerciseStrength('barbell-bench-press', [fixtures.sameBodyweightLowerLift], 80, NOW);
    const high = computeExerciseStrength('barbell-bench-press', [fixtures.sameBodyweightHigherLift], 80, NOW);
    expect(high.score ?? 0).toBeGreaterThan(low.score ?? 0);
    expect(computeExerciseStrength('barbell-bench-press', [fixtures.sameBodyweightHigherLift], 60, NOW).score ?? 0)
      .toBeGreaterThan(computeExerciseStrength('barbell-bench-press', [fixtures.sameBodyweightHigherLift], 100, NOW).score ?? 0);
    expect(effectiveLoadForSet('push-up', fixtures.bodyweightExercise, 80)).toBeCloseTo(65.2);
    expect(effectiveLoadForSet('pull-up', fixtures.assistedBodyweight, 80)).toBe(60);
    expect(computeExerciseStrength('pull-up', [fixtures.assistedBodyweight], undefined, NOW).status)
      .toBe('BODYWEIGHT_REQUIRED');
  });

  it('renders Strength and Momentum as separate user-visible concepts', async () => {
    const profile = getWorkoutV2PreviewProfile('strong-improving');
    const view = await render(<StrengthSummary result={computeStrengthMap(profile.performances, 80, NOW)} />);
    expect(view.getByText('workoutV2.strength.currentStrength')).toBeTruthy();
    expect(view.getByText('workoutV2.strength.momentum')).toBeTruthy();
    const rendered = JSON.stringify(view.toJSON()).toLocaleLowerCase('en-US');
    expect(rendered).not.toContain('percentile');
    expect(rendered).not.toContain('hypertrophy');
    expect(rendered).not.toContain('medical');
  });
});
