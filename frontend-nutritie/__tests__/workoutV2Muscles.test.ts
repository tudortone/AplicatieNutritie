import { readFileSync } from 'fs';
import { resolve } from 'path';

import {
  V2_MUSCLE_IDS,
  V2_MUSCLES,
  v2RegionId,
} from '../constants/workout-v2/muscles';

describe('Workout V2 canonical muscle taxonomy', () => {
  it('defines 19 unique canonical muscles with drawable views', () => {
    expect(V2_MUSCLE_IDS).toHaveLength(19);
    expect(new Set(V2_MUSCLE_IDS).size).toBe(19);
    expect(V2_MUSCLE_IDS).toEqual(expect.arrayContaining([
      'upper_chest',
      'front_delts',
      'side_delts',
      'rear_delts',
      'hip_flexors',
    ]));

    for (const muscleId of V2_MUSCLE_IDS) {
      expect(V2_MUSCLES[muscleId].id).toBe(muscleId);
      expect(V2_MUSCLES[muscleId].views.length).toBeGreaterThan(0);
      expect(V2_MUSCLES[muscleId].nameKey).toBe(`workoutV2.muscles.${muscleId}`);
    }
  });

  it('creates stable view- and side-aware region IDs', () => {
    expect(v2RegionId('chest', 'front', 'left')).toBe('chest:front:left');
    expect(v2RegionId('lower_back', 'back', 'center')).toBe('lower_back:back:center');
  });

  it('renders the approved Anatomy V2 map in BodyMap while rejecting separate geometric files', () => {
    const source = readFileSync(
      resolve(__dirname, '../components/fitness/BodyMap.tsx'),
      'utf8',
    );
    expect(source).toContain('AnatomyV2Map');
    expect(source).toContain("from './anatomyFront'");
    expect(source).toContain("from './anatomyBack'");
    expect(source).not.toContain('anatomyV2Front');
    expect(source).not.toContain('anatomyV2Back');
  });
});
