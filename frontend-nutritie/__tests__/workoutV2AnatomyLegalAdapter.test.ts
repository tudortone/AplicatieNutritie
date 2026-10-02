import { V2_MUSCLE_IDS } from '../constants/workout-v2/muscles';
import {
  ANATOMY_V2_SOURCE_MAPPING,
  ANATOMY_V2_SOURCE_UNSUPPORTED_IDS,
  mappingForSourceSlug,
  resolveSourceAnatomyV2State,
  selectionTargetForSourceSlug,
  sourceGroupForSlug,
  sourceGroupsForCanonicalMuscle,
} from '../components/workout-v2/anatomyV2SourceAdapter';

describe('Workout V2 audited anatomy source adapter', () => {
  it('accounts for every canonical ID without inventing hip-flexor geometry', () => {
    const covered = new Set(
      Object.values(ANATOMY_V2_SOURCE_MAPPING)
        .flatMap((mapping) => Object.values(mapping))
        .flatMap((mapping) => mapping?.canonicalIds ?? []),
    );
    const accountedFor = new Set([...covered, ...ANATOMY_V2_SOURCE_UNSUPPORTED_IDS]);

    expect([...accountedFor].sort()).toEqual([...V2_MUSCLE_IDS].sort());
    expect(covered.has('hip_flexors')).toBe(false);
    expect(ANATOMY_V2_SOURCE_UNSUPPORTED_IDS).toEqual(['hip_flexors']);
  });

  it('uses honest aggregate regions for source subdivisions that do not exist', () => {
    expect(mappingForSourceSlug('chest', 'front')?.canonicalIds).toEqual(['chest', 'upper_chest']);
    expect(mappingForSourceSlug('deltoids', 'front')?.canonicalIds).toEqual(['front_delts', 'side_delts']);
    expect(mappingForSourceSlug('deltoids', 'back')?.canonicalIds).toEqual(['rear_delts', 'side_delts']);
    expect(sourceGroupsForCanonicalMuscle('side_delts', 'front')).toEqual(['deltoids']);
    expect(sourceGroupsForCanonicalMuscle('side_delts', 'back')).toEqual(['deltoids']);
    expect(sourceGroupsForCanonicalMuscle('hip_flexors', 'front')).toEqual([]);
  });

  it('resolves both published fragment slugs and whole-group accessibility slugs', () => {
    expect(sourceGroupForSlug('chest-male-front-1')).toBe('chest');
    expect(sourceGroupForSlug('upper-back')).toBe('upper-back');
    expect(selectionTargetForSourceSlug('chest-male-front-1', 'front')).toBe('chest');
    expect(selectionTargetForSourceSlug('upper-back', 'back')).toBe('lats');
    expect(selectionTargetForSourceSlug('head', 'front')).toBeNull();
  });

  it('preserves role priority and the existing five-level strength contract', () => {
    expect(resolveSourceAnatomyV2State({
      mode: 'exercise',
      primary: ['upper_chest'],
      secondary: ['chest'],
      stabilizers: [],
    }, 'chest', 'front')).toBe('PRIMARY');

    expect(resolveSourceAnatomyV2State({
      mode: 'exercise',
      primary: [],
      secondary: ['side_delts'],
      stabilizers: ['front_delts'],
    }, 'deltoids', 'front')).toBe('SECONDARY');

    expect(resolveSourceAnatomyV2State({
      mode: 'strength',
      scores: { chest: 10, upper_chest: 52 },
    }, 'chest', 'front')).toBe('LEVEL_3');
    expect(resolveSourceAnatomyV2State({
      mode: 'strength',
      scores: { rear_delts: 88 },
    }, 'deltoids', 'back')).toBe('LEVEL_5');
    expect(resolveSourceAnatomyV2State({
      mode: 'strength',
      scores: {},
    }, 'head', 'front')).toBe('NO_DATA');
  });
});
