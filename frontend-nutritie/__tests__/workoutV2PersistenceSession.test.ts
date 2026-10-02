import { WORKOUT_V2_PRESETS } from '../constants/workout-v2/presets';
import { activeSessionKey, templateCacheKey } from '../lib/workout-v2/storageKeys';
import {
  createMemoryTemplateRepository,
} from '../lib/workout-v2/templateRepository';
import {
  addActualSet,
  completeSet,
  startWorkoutFromTemplate,
  validateSessionForFinish,
} from '../lib/workout-v2/sessionModel';
import { instantiatePreset, renameTemplate } from '../lib/workout-v2/templateModel';

const now = '2026-09-26T12:00:00.000Z';

describe('Workout V2 template persistence', () => {
  it('isolates templates by owner and rejects owner spoofing', async () => {
    const repo = createMemoryTemplateRepository();
    const template = instantiatePreset(WORKOUT_V2_PRESETS[0], 'user-a', 'template-a', now);
    await repo.create('user-a', template);
    await expect(repo.list('user-a')).resolves.toHaveLength(1);
    await expect(repo.list('user-b')).resolves.toEqual([]);
    await expect(repo.create('user-b', template)).rejects.toThrow('OWNER_MISMATCH');
    expect(templateCacheKey('user-a')).not.toBe(templateCacheKey('user-b'));
  });

  it('supports update, duplicate and delete truthfully', async () => {
    const repo = createMemoryTemplateRepository();
    const template = instantiatePreset(WORKOUT_V2_PRESETS[1], 'user-a', 'template-a', now);
    await repo.create('user-a', template);
    await repo.update('user-a', renameTemplate(template, 'Pull A', now));
    const duplicate = await repo.duplicate('user-a', 'template-a', 'template-b', 'Pull B', now);
    expect(duplicate.id).toBe('template-b');
    await repo.remove('user-a', 'template-a');
    await expect(repo.remove('user-a', 'missing')).rejects.toThrow('TEMPLATE_NOT_FOUND');
  });
});

describe('Workout V2 active-session separation', () => {
  it('copies a template and remains independent from later edits', () => {
    const template = instantiatePreset(WORKOUT_V2_PRESETS[2], 'user-a', 'template-a', now);
    const active = startWorkoutFromTemplate(template, 'session-a', now);
    const renamed = renameTemplate(template, 'Legs changed', now);
    expect(active.name).not.toBe(renamed.name);
    expect(activeSessionKey('user-a')).not.toBe(activeSessionKey('user-b'));
  });

  it('records and completes actual sets without mutating planned values', () => {
    const template = instantiatePreset(WORKOUT_V2_PRESETS[0], 'user-a', 'template-a', now);
    const active = startWorkoutFromTemplate(template, 'session-a', now);
    const strengthBlock = active.blocks.find((block) => block.kind === 'strength');
    expect(strengthBlock?.kind).toBe('strength');
    if (!strengthBlock || strengthBlock.kind !== 'strength') throw new Error('missing strength block');
    const withSet = addActualSet(active, strengthBlock.id, 'set-extra');
    const completed = completeSet(withSet, strengthBlock.id, strengthBlock.sets[0].id, { reps: 8, weightKg: 40 });
    const completedBlock = completed.blocks.find((block) => block.id === strengthBlock.id);
    expect(completedBlock?.kind === 'strength' && completedBlock.sets[0].completed).toBe(true);
    expect(completedBlock?.kind === 'strength' && completedBlock.sets[0].plannedReps).toBe(strengthBlock.sets[0].plannedReps);
    expect(validateSessionForFinish(completed).length).toBeGreaterThan(0);
  });
});
