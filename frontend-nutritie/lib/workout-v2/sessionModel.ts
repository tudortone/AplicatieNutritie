import type { WorkoutV2ExerciseId } from '../../constants/workout-v2/exercises';
import type { WorkoutTemplate } from './templateModel';

export interface ActualWorkoutSet {
  id: string;
  plannedReps: number;
  plannedWeightKg?: number;
  actualReps?: number;
  actualWeightKg?: number;
  assistanceWeightKg?: number;
  completed: boolean;
}

export interface ActiveStrengthBlock {
  id: string;
  kind: 'strength';
  exerciseId: WorkoutV2ExerciseId;
  restSeconds: number;
  note?: string;
  sets: readonly ActualWorkoutSet[];
}

export interface ActiveCardioBlock {
  id: string;
  kind: 'cardio';
  exerciseId: WorkoutV2ExerciseId;
  plannedDurationSeconds?: number;
  actualDurationSeconds?: number;
  distanceKm?: number;
  paceSecondsPerKm?: number;
  resistance?: number;
  completed: boolean;
  note?: string;
}

export type ActiveWorkoutBlock = ActiveStrengthBlock | ActiveCardioBlock;

export interface ActiveWorkoutSession {
  id: string;
  ownerId: string;
  sourceTemplateId: string;
  schemaVersion: 1;
  name: string;
  blocks: readonly ActiveWorkoutBlock[];
  startedAt: string;
  updatedAt: string;
}

export function startWorkoutFromTemplate(
  template: WorkoutTemplate,
  sessionId: string,
  now: string,
): ActiveWorkoutSession {
  return {
    id: sessionId,
    ownerId: template.ownerId,
    sourceTemplateId: template.id,
    schemaVersion: 1,
    name: template.name,
    blocks: template.blocks.map((block) => block.kind === 'cardio'
      ? {
          id: block.id, kind: 'cardio' as const, exerciseId: block.exerciseId,
          plannedDurationSeconds: block.durationSeconds, completed: false, note: block.note,
        }
      : {
          id: block.id, kind: 'strength' as const, exerciseId: block.exerciseId,
          restSeconds: block.restSeconds, note: block.note,
          sets: Array.from({ length: block.sets }, (_, index) => ({
            id: `${block.id}:set-${index + 1}`,
            plannedReps: block.reps,
            plannedWeightKg: block.weightKg,
            completed: false,
          })),
        }),
    startedAt: now,
    updatedAt: now,
  };
}

export function addActualSet(
  session: ActiveWorkoutSession,
  blockId: string,
  setId: string,
): ActiveWorkoutSession {
  const blocks = session.blocks.map((block) => {
    if (block.id !== blockId) return block;
    if (block.kind !== 'strength') throw new Error('NOT_A_STRENGTH_BLOCK');
    if (block.sets.some((set) => set.id === setId)) throw new Error('DUPLICATE_SET_ID');
    const previous = block.sets[block.sets.length - 1];
    return {
      ...block,
      sets: [...block.sets, {
        id: setId,
        plannedReps: previous?.plannedReps ?? 1,
        plannedWeightKg: previous?.plannedWeightKg,
        completed: false,
      }],
    };
  });
  return { ...session, blocks };
}

export function completeSet(
  session: ActiveWorkoutSession,
  blockId: string,
  setId: string,
  actual: { reps: number; weightKg?: number; assistanceWeightKg?: number },
): ActiveWorkoutSession {
  if (!Number.isFinite(actual.reps) || actual.reps <= 0) throw new Error('INVALID_REPS');
  let found = false;
  const blocks = session.blocks.map((block) => {
    if (block.id !== blockId) return block;
    if (block.kind !== 'strength') throw new Error('NOT_A_STRENGTH_BLOCK');
    const sets = block.sets.map((set) => {
      if (set.id !== setId) return set;
      found = true;
      return {
        ...set,
        actualReps: actual.reps,
        actualWeightKg: actual.weightKg,
        assistanceWeightKg: actual.assistanceWeightKg,
        completed: true,
      };
    });
    return { ...block, sets };
  });
  if (!found) throw new Error('SET_NOT_FOUND');
  return { ...session, blocks };
}

export function completeCardioBlock(
  session: ActiveWorkoutSession,
  blockId: string,
  actual: { durationSeconds?: number; distanceKm?: number; paceSecondsPerKm?: number; resistance?: number },
): ActiveWorkoutSession {
  if ((actual.durationSeconds ?? 0) <= 0 && (actual.distanceKm ?? 0) <= 0) {
    throw new Error('CARDIO_RESULT_REQUIRED');
  }
  let found = false;
  const blocks = session.blocks.map((block) => {
    if (block.id !== blockId) return block;
    if (block.kind !== 'cardio') throw new Error('NOT_A_CARDIO_BLOCK');
    found = true;
    return { ...block, ...actual, completed: true };
  });
  if (!found) throw new Error('BLOCK_NOT_FOUND');
  return { ...session, blocks };
}


export function validateSessionForFinish(session: ActiveWorkoutSession): string[] {
  const errors: string[] = [];
  for (const block of session.blocks) {
    if (block.kind === 'strength' && block.sets.some((set) => !set.completed)) errors.push(`INCOMPLETE_BLOCK:${block.id}`);
    if (block.kind === 'cardio' && !block.completed) errors.push(`INCOMPLETE_BLOCK:${block.id}`);
  }
  return errors;
}
