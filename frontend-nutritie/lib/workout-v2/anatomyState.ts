import type { V2MuscleId } from '../../constants/workout-v2/muscles';

export type ExerciseHighlightRole = 'NEUTRAL' | 'PRIMARY' | 'SECONDARY' | 'STABILIZER';
export type StrengthLevel = 'NO_DATA' | 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3' | 'LEVEL_4' | 'LEVEL_5';

export type AnatomyV2DisplayMode =
  | {
      mode: 'exercise';
      primary: readonly V2MuscleId[];
      secondary: readonly V2MuscleId[];
      stabilizers: readonly V2MuscleId[];
    }
  | {
      mode: 'strength';
      scores: Partial<Record<V2MuscleId, number>>;
    };

export type AnatomyV2DisplayState = ExerciseHighlightRole | StrengthLevel;

function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, score));
}

export function strengthLevelForScore(score: number | undefined): StrengthLevel {
  if (score === undefined || !Number.isFinite(score) || score <= 0) return 'NO_DATA';
  const value = clampScore(score);
  if (value < 20) return 'LEVEL_1';
  if (value < 40) return 'LEVEL_2';
  if (value < 60) return 'LEVEL_3';
  if (value < 80) return 'LEVEL_4';
  return 'LEVEL_5';
}

export function resolveAnatomyV2State(
  mode: AnatomyV2DisplayMode,
  muscleId: V2MuscleId,
): AnatomyV2DisplayState {
  if (mode.mode === 'strength') return strengthLevelForScore(mode.scores[muscleId]);
  if (mode.primary.includes(muscleId)) return 'PRIMARY';
  if (mode.secondary.includes(muscleId)) return 'SECONDARY';
  if (mode.stabilizers.includes(muscleId)) return 'STABILIZER';
  return 'NEUTRAL';
}

