import {
  WORKOUT_V2_EXERCISES,
  getWorkoutV2Exercise,
  validateWorkoutV2Catalog,
} from '../constants/workout-v2/exercises';
import { WORKOUT_V2_PRESETS } from '../constants/workout-v2/presets';
import {
  addTemplateExercise,
  duplicateTemplateBlock,
  instantiatePreset,
  moveTemplateBlock,
  removeTemplateBlock,
  renameTemplate,
} from '../lib/workout-v2/templateModel';

describe('Workout V2 catalog', () => {
  it('has unique canonical IDs and valid muscle mappings', () => {
    expect(() => validateWorkoutV2Catalog(WORKOUT_V2_EXERCISES)).not.toThrow();
    expect(new Set(WORKOUT_V2_EXERCISES.map((item) => item.id)).size).toBe(WORKOUT_V2_EXERCISES.length);
    expect(getWorkoutV2Exercise('barbell-bench-press')?.muscles.primary).toContain('chest');
    expect(getWorkoutV2Exercise('running')?.strengthEligible).toBe(false);
    expect(getWorkoutV2Exercise('lat-pulldown')?.strengthNormalizationAnchor).toBeUndefined();
  });

  it('covers the required movement families', () => {
    const families = new Set(WORKOUT_V2_EXERCISES.map((item) => item.movement));
    for (const family of ['horizontal_push', 'vertical_push', 'horizontal_pull', 'vertical_pull', 'squat', 'hinge', 'lunge', 'carry', 'core', 'cardio']) {
      expect(families.has(family as never)).toBe(true);
    }
  });
});

describe('Workout V2 presets and template mutations', () => {
  it('provides the eight approved presets', () => {
    expect(WORKOUT_V2_PRESETS.map((item) => item.id)).toEqual([
      'push', 'pull', 'legs', 'upper', 'lower', 'full-body', 'beginner', 'home-dumbbells',
    ]);
  });

  it('creates an editable copy without mutating the preset', () => {
    const preset = WORKOUT_V2_PRESETS[0];
    const draft = instantiatePreset(preset, 'user-a', 'template-1', '2026-09-26T10:00:00.000Z');
    const renamed = renameTemplate(draft, 'Push A', '2026-09-26T10:01:00.000Z');
    const withExercise = addTemplateExercise(renamed, 'dumbbell-curl', 'block-extra', '2026-09-26T10:02:00.000Z');
    const duplicated = duplicateTemplateBlock(withExercise, 'block-extra', 'block-copy', '2026-09-26T10:03:00.000Z');
    const moved = moveTemplateBlock(duplicated, duplicated.blocks.length - 1, 0, '2026-09-26T10:04:00.000Z');
    const removed = removeTemplateBlock(moved, 'block-copy', '2026-09-26T10:05:00.000Z');

    expect(preset.nameKey).toBe('workoutV2.presets.push');
    expect(renamed.name).toBe('Push A');
    expect(duplicated.blocks).toHaveLength(withExercise.blocks.length + 1);
    expect(moved.blocks[0].id).toBe('block-copy');
    expect(removed.blocks.some((block) => block.id === 'block-copy')).toBe(false);
  });
});
