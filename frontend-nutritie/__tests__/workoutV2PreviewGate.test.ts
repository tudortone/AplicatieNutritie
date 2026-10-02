import { readFileSync } from 'fs';
import { resolve } from 'path';

import * as previewGate from '../lib/workout-v2/featureFlag';

describe('Workout V2 preview gate', () => {
  it('is closed in production unless the explicit flag is true', () => {
    expect(previewGate.isWorkoutV2PreviewEnabled(undefined, false)).toBe(false);
    expect(previewGate.isWorkoutV2PreviewEnabled('false', false)).toBe(false);
    expect(previewGate.isWorkoutV2PreviewEnabled('true', false)).toBe(true);
    expect(previewGate.isWorkoutV2PreviewEnabled(undefined, true)).toBe(true);
  });

  it('lets QA deep-link only to an explicitly enabled preview', () => {
    const canAccess = (previewGate as typeof previewGate & {
      canAccessWorkoutV2PreviewWithoutSession?: (
        pathname: string,
        explicitFlag: string | undefined,
        isDevelopment: boolean,
      ) => boolean;
    }).canAccessWorkoutV2PreviewWithoutSession;

    expect(typeof canAccess).toBe('function');
    expect(canAccess?.('/workout-v2-preview', undefined, true)).toBe(true);
    expect(canAccess?.('/workout-v2-preview', 'true', false)).toBe(true);
    expect(canAccess?.('/workout-v2-preview', undefined, false)).toBe(false);
    expect(canAccess?.('/antrenamente', 'true', false)).toBe(false);
  });

  it('registers only a separate preview route', () => {
    const layout = readFileSync(resolve(__dirname, '../app/_layout.tsx'), 'utf8');
    expect(layout).toContain('<Stack.Screen name="workout-v2-preview"');
    const production = readFileSync(resolve(__dirname, '../app/(tabs)/antrenamente.tsx'), 'utf8');
    expect(production).not.toContain('WorkoutV2Experience');
  });
});
