import { getWorkoutV2Exercise } from '../../constants/workout-v2/exercises';
import { validateSessionForFinish, type ActiveWorkoutSession } from './sessionModel';

export interface WorkoutV2HistorySet {
  serie: number;
  repetari: number;
  greutate?: number;
  assistance_weight_kg?: number;
  time_seconds?: number;
  distance_km?: number;
  completed: true;
  set_type: 'working';
}

export interface WorkoutV2HistoryExercise {
  schemaVersion: 2;
  exercitiuId: string;
  nume: string;
  seturi: WorkoutV2HistorySet[];
  durataMin?: number;
  kcal: number;
  rest_time_seconds?: number;
}

export interface WorkoutV2HistoryPayload {
  nume: string;
  tip: 'forta_v2' | 'mixt_v2' | 'cardio_v2';
  durata_min: number;
  calorii_arse: number;
  exercitii: WorkoutV2HistoryExercise[];
}

export function toWorkoutHistoryPayload(
  session: ActiveWorkoutSession,
  completedAt: string,
): WorkoutV2HistoryPayload {
  const errors = validateSessionForFinish(session);
  if (errors.length > 0) throw new Error(`WORKOUT_INCOMPLETE:${errors.join(',')}`);
  const completedTime = new Date(completedAt).getTime();
  const startedTime = new Date(session.startedAt).getTime();
  if (!Number.isFinite(completedTime) || !Number.isFinite(startedTime) || completedTime < startedTime) {
    throw new Error('INVALID_WORKOUT_TIME');
  }
  const hasStrength = session.blocks.some((block) => block.kind === 'strength');
  const hasCardio = session.blocks.some((block) => block.kind === 'cardio');
  const tip = hasStrength && hasCardio ? 'mixt_v2' : hasCardio ? 'cardio_v2' : 'forta_v2';
  return {
    nume: session.name,
    tip,
    durata_min: Math.max(1, Math.round((completedTime - startedTime) / 60_000)),
    calorii_arse: 0,
    exercitii: session.blocks.map((block) => {
      const exercise = getWorkoutV2Exercise(block.exerciseId);
      if (block.kind === 'cardio') {
        return {
          schemaVersion: 2,
          exercitiuId: block.exerciseId,
          nume: exercise?.nameKey ?? block.exerciseId,
          seturi: [{
            serie: 1,
            repetari: 0,
            time_seconds: block.actualDurationSeconds,
            distance_km: block.distanceKm,
            completed: true,
            set_type: 'working',
          }],
          durataMin: Math.round((block.actualDurationSeconds ?? 0) / 60),
          kcal: 0,
        };
      }
      return {
        schemaVersion: 2,
        exercitiuId: block.exerciseId,
        nume: exercise?.nameKey ?? block.exerciseId,
        seturi: block.sets.map((set, index) => ({
          serie: index + 1,
          repetari: set.actualReps ?? 0,
          greutate: set.actualWeightKg,
          assistance_weight_kg: set.assistanceWeightKg,
          completed: true,
          set_type: 'working',
        })),
        kcal: 0,
        rest_time_seconds: block.restSeconds,
      };
    }),
  };
}

export function fromWorkoutHistoryRow(row: {
  id: string;
  exercitii?: Array<{ schemaVersion?: number; exercitiuId?: string }>;
}): { kind: 'v2' | 'legacy'; id: string } {
  const isV2 = (row.exercitii ?? []).some((exercise) => exercise.schemaVersion === 2);
  return { kind: isV2 ? 'v2' : 'legacy', id: row.id };
}
