import {
  getWorkoutV2Exercise,
  type WorkoutV2ExerciseId,
} from '../../constants/workout-v2/exercises';

export const WORKOUT_TEMPLATE_SCHEMA_VERSION = 1 as const;

export interface StrengthTemplateBlock {
  id: string;
  kind: 'strength';
  exerciseId: WorkoutV2ExerciseId;
  sets: number;
  reps: number;
  weightKg?: number;
  restSeconds: number;
  note?: string;
}

export interface CardioTemplateBlock {
  id: string;
  kind: 'cardio';
  exerciseId: WorkoutV2ExerciseId;
  durationSeconds?: number;
  distanceKm?: number;
  paceSecondsPerKm?: number;
  resistance?: number;
  note?: string;
}

export type WorkoutTemplateBlock = StrengthTemplateBlock | CardioTemplateBlock;

export interface WorkoutTemplate {
  id: string;
  ownerId: string;
  schemaVersion: typeof WORKOUT_TEMPLATE_SCHEMA_VERSION;
  name: string;
  sourcePresetId?: string;
  blocks: readonly WorkoutTemplateBlock[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkoutPreset {
  id: string;
  nameKey: `workoutV2.presets.${string}`;
  blocks: readonly WorkoutTemplateBlock[];
}

export function createTemplateBlock(
  exerciseId: WorkoutV2ExerciseId,
  blockId: string,
): WorkoutTemplateBlock {
  const exercise = getWorkoutV2Exercise(exerciseId);
  if (!exercise) throw new Error(`UNKNOWN_EXERCISE:${exerciseId}`);
  if (exercise.kind === 'cardio') {
    return {
      id: blockId,
      kind: 'cardio',
      exerciseId,
      durationSeconds: exercise.defaults.durationSeconds,
    };
  }
  return {
    id: blockId,
    kind: 'strength',
    exerciseId,
    sets: exercise.defaults.sets,
    reps: exercise.defaults.reps ?? 1,
    weightKg: exercise.defaults.weightKg,
    restSeconds: exercise.defaults.restSeconds,
  };
}

export function instantiatePreset(
  preset: WorkoutPreset,
  ownerId: string,
  templateId: string,
  now: string,
): WorkoutTemplate {
  return {
    id: templateId,
    ownerId,
    schemaVersion: WORKOUT_TEMPLATE_SCHEMA_VERSION,
    name: preset.nameKey,
    sourcePresetId: preset.id,
    blocks: preset.blocks.map((block) => ({ ...block, id: `${templateId}:${block.id}` })),
    createdAt: now,
    updatedAt: now,
  };
}

export function renameTemplate(template: WorkoutTemplate, name: string, now: string): WorkoutTemplate {
  const normalized = name.trim();
  if (!normalized) throw new Error('TEMPLATE_NAME_REQUIRED');
  return { ...template, name: normalized, updatedAt: now };
}

export function addTemplateExercise(
  template: WorkoutTemplate,
  exerciseId: WorkoutV2ExerciseId,
  blockId: string,
  now: string,
): WorkoutTemplate {
  if (template.blocks.some((block) => block.id === blockId)) throw new Error('DUPLICATE_BLOCK_ID');
  return { ...template, blocks: [...template.blocks, createTemplateBlock(exerciseId, blockId)], updatedAt: now };
}

export function removeTemplateBlock(template: WorkoutTemplate, blockId: string, now: string): WorkoutTemplate {
  const blocks = template.blocks.filter((block) => block.id !== blockId);
  if (blocks.length === template.blocks.length) throw new Error('TEMPLATE_BLOCK_NOT_FOUND');
  return { ...template, blocks, updatedAt: now };
}

export function duplicateTemplateBlock(
  template: WorkoutTemplate,
  blockId: string,
  newBlockId: string,
  now: string,
): WorkoutTemplate {
  if (template.blocks.some((block) => block.id === newBlockId)) throw new Error('DUPLICATE_BLOCK_ID');
  const index = template.blocks.findIndex((block) => block.id === blockId);
  if (index < 0) throw new Error('TEMPLATE_BLOCK_NOT_FOUND');
  const blocks = [...template.blocks];
  blocks.splice(index + 1, 0, { ...blocks[index], id: newBlockId });
  return { ...template, blocks, updatedAt: now };
}

export function moveTemplateBlock(
  template: WorkoutTemplate,
  fromIndex: number,
  toIndex: number,
  now: string,
): WorkoutTemplate {
  if (fromIndex < 0 || fromIndex >= template.blocks.length) throw new Error('INVALID_SOURCE_INDEX');
  const destination = Math.max(0, Math.min(template.blocks.length - 1, toIndex));
  const blocks = [...template.blocks];
  const [moved] = blocks.splice(fromIndex, 1);
  blocks.splice(destination, 0, moved);
  return { ...template, blocks, updatedAt: now };
}

export function updateTemplateBlock(
  template: WorkoutTemplate,
  blockId: string,
  update: Partial<Omit<StrengthTemplateBlock, 'id' | 'kind' | 'exerciseId'>>,
  now: string,
): WorkoutTemplate {
  let found = false;
  const blocks = template.blocks.map((block) => {
    if (block.id !== blockId) return block;
    if (block.kind !== 'strength') throw new Error('INCOMPATIBLE_BLOCK_UPDATE');
    found = true;
    return { ...block, ...update };
  });
  if (!found) throw new Error('TEMPLATE_BLOCK_NOT_FOUND');
  return { ...template, blocks, updatedAt: now };
}

export function updateCardioTemplateBlock(
  template: WorkoutTemplate,
  blockId: string,
  update: Partial<Omit<CardioTemplateBlock, 'id' | 'kind' | 'exerciseId'>>,
  now: string,
): WorkoutTemplate {
  let found = false;
  const blocks = template.blocks.map((block) => {
    if (block.id !== blockId) return block;
    if (block.kind !== 'cardio') throw new Error('INCOMPATIBLE_BLOCK_UPDATE');
    found = true;
    return { ...block, ...update };
  });
  if (!found) throw new Error('TEMPLATE_BLOCK_NOT_FOUND');
  return { ...template, blocks, updatedAt: now };
}

