import {
  getWorkoutV2Exercise,
  WORKOUT_V2_EXERCISES,
  type ExerciseMuscleRoles,
  type WorkoutV2ExerciseId,
} from '../../constants/workout-v2/exercises';
import {
  V2_MUSCLES,
  V2_MUSCLE_IDS,
  type V2MajorRegion,
  type V2MuscleId,
} from '../../constants/workout-v2/muscles';
import { flowStrengthRankForScore, type FlowStrengthRank } from '../../constants/workout-v2/ranks';

export const CURRENT_STRENGTH_WINDOW_DAYS = 90;
export const MUSCLE_ROLE_WEIGHTS = Object.freeze({ primary: 1, secondary: 0.45, stabilizers: 0.15 });
const DAY_MS = 86_400_000;
const MAJOR_REGIONS: readonly V2MajorRegion[] = ['chest', 'back', 'shoulders', 'arms', 'core', 'legs'];

export interface WorkoutV2Performance {
  id: string;
  ownerId?: string;
  sessionId: string;
  exerciseId: WorkoutV2ExerciseId;
  performedAt: string;
  reps: number;
  weightKg?: number;
  assistanceWeightKg?: number;
  setType?: 'warmup' | 'working' | 'dropset' | 'failure';
}

export type ExerciseStrengthStatus = 'RANKED' | 'INELIGIBLE' | 'BODYWEIGHT_REQUIRED' | 'NO_CURRENT_EVIDENCE';

export interface ExerciseStrengthResult {
  exerciseId: WorkoutV2ExerciseId;
  status: ExerciseStrengthStatus;
  score: number | null;
  rank: FlowStrengthRank;
  bestE1rmKg: number | null;
  bestPerformanceId: string | null;
  performedAt: string | null;
}

export interface ProgressMomentumResult {
  exerciseId: WorkoutV2ExerciseId;
  score: number;
  improvementPercent: number;
  activeWeeks: number;
  validSessions: number;
  baselineE1rmKg: number | null;
  recentE1rmKg: number | null;
}

export interface MuscleStrengthContributor {
  exerciseId: WorkoutV2ExerciseId;
  role: keyof ExerciseMuscleRoles;
  roleWeight: number;
  exerciseScore: number;
  e1rmKg: number;
  performedAt: string;
}

export interface MuscleStrengthResult {
  muscleId: V2MuscleId;
  score: number | null;
  rank: FlowStrengthRank;
  contributors: readonly MuscleStrengthContributor[];
}

export interface OverallFlowStrengthResult {
  score: number | null;
  rank: FlowStrengthRank;
  representedRegions: number;
  regions: Partial<Record<V2MajorRegion, number>>;
}

export interface WorkoutV2StrengthMap {
  exercises: Partial<Record<WorkoutV2ExerciseId, ExerciseStrengthResult>>;
  momentum: Partial<Record<WorkoutV2ExerciseId, ProgressMomentumResult>>;
  muscles: Record<V2MuscleId, MuscleStrengthResult>;
  overall: OverallFlowStrengthResult;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function validBodyweight(value: number | undefined): value is number {
  return Number.isFinite(value) && (value ?? 0) > 0;
}

export function estimateE1rm(effectiveLoadKg: number, reps: number): number | null {
  if (!Number.isFinite(effectiveLoadKg) || effectiveLoadKg <= 0) return null;
  if (!Number.isInteger(reps) || reps < 1 || reps > 12) return null;
  return effectiveLoadKg * (1 + reps / 30);
}

export function effectiveLoadForSet(
  exerciseId: WorkoutV2ExerciseId,
  performance: Pick<WorkoutV2Performance, 'weightKg' | 'assistanceWeightKg'>,
  bodyweightKg: number | undefined,
): number | null {
  const exercise = getWorkoutV2Exercise(exerciseId);
  if (!exercise?.strengthEligible || !exercise.loadInterpretation) return null;
  const external = performance.weightKg ?? 0;
  const assistance = performance.assistanceWeightKg ?? 0;
  if (!Number.isFinite(external) || external < 0 || !Number.isFinite(assistance) || assistance < 0) return null;
  if (exercise.loadInterpretation === 'bodyweight_plus_external_minus_assistance') {
    if (!validBodyweight(bodyweightKg) || exercise.bodyweightFactor === undefined) return null;
    const effective = bodyweightKg * exercise.bodyweightFactor + external - assistance;
    return effective > 0 ? effective : null;
  }
  return external > 0 ? external : null;
}

function validPerformanceE1rm(
  performance: WorkoutV2Performance,
  bodyweightKg: number | undefined,
): number | null {
  if (performance.setType === 'warmup') return null;
  const load = effectiveLoadForSet(performance.exerciseId, performance, bodyweightKg);
  return load === null ? null : estimateE1rm(load, performance.reps);
}

export function computeExerciseStrength(
  exerciseId: WorkoutV2ExerciseId,
  performances: readonly WorkoutV2Performance[],
  bodyweightKg: number | undefined,
  nowIso: string,
  ownerId?: string,
): ExerciseStrengthResult {
  const exercise = getWorkoutV2Exercise(exerciseId);
  const empty = (status: ExerciseStrengthStatus): ExerciseStrengthResult => ({
    exerciseId, status, score: null, rank: flowStrengthRankForScore(null), bestE1rmKg: null,
    bestPerformanceId: null, performedAt: null,
  });
  if (!exercise?.strengthEligible || !exercise.strengthNormalizationAnchor) return empty('INELIGIBLE');
  if (!validBodyweight(bodyweightKg)) return empty('BODYWEIGHT_REQUIRED');
  const now = new Date(nowIso).getTime();
  if (!Number.isFinite(now)) return empty('NO_CURRENT_EVIDENCE');
  let best: { row: WorkoutV2Performance; e1rm: number } | null = null;
  for (const row of performances) {
    if (ownerId && row.ownerId !== ownerId) continue;
    if (row.exerciseId !== exerciseId) continue;
    const performedAt = new Date(row.performedAt).getTime();
    const ageDays = (now - performedAt) / DAY_MS;
    if (!Number.isFinite(performedAt) || ageDays < 0 || ageDays > CURRENT_STRENGTH_WINDOW_DAYS) continue;
    const e1rm = validPerformanceE1rm(row, bodyweightKg);
    if (e1rm !== null && (!best || e1rm > best.e1rm)) best = { row, e1rm };
  }
  if (!best) return empty('NO_CURRENT_EVIDENCE');
  const relativeStrength = best.e1rm / bodyweightKg;
  const normalizedStrength = relativeStrength / exercise.strengthNormalizationAnchor;
  const score = Math.round(100 * clamp(normalizedStrength / 2, 0, 1));
  return {
    exerciseId, status: 'RANKED', score, rank: flowStrengthRankForScore(score),
    bestE1rmKg: best.e1rm, bestPerformanceId: best.row.id, performedAt: best.row.performedAt,
  };
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function utcWeekKey(iso: string): string | null {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

export function computeProgressMomentum(
  exerciseId: WorkoutV2ExerciseId,
  performances: readonly WorkoutV2Performance[],
  bodyweightKg: number | undefined,
  ownerId?: string,
): ProgressMomentumResult {
  const sessionBest = new Map<string, { performedAt: string; e1rm: number }>();
  for (const row of performances) {
    if (ownerId && row.ownerId !== ownerId) continue;
    if (row.exerciseId !== exerciseId) continue;
    const e1rm = validPerformanceE1rm(row, bodyweightKg);
    if (e1rm === null || !Number.isFinite(new Date(row.performedAt).getTime())) continue;
    const existing = sessionBest.get(row.sessionId);
    if (!existing || e1rm > existing.e1rm) sessionBest.set(row.sessionId, { performedAt: row.performedAt, e1rm });
  }
  const sessions = [...sessionBest.values()].sort((a, b) => new Date(a.performedAt).getTime() - new Date(b.performedAt).getTime());
  const baseline = median(sessions.slice(0, 3).map((item) => item.e1rm));
  const recent = median(sessions.slice(-3).map((item) => item.e1rm));
  const improvement = baseline && recent ? ((recent - baseline) / baseline) * 100 : 0;
  const progressSignal = clamp(improvement / 30, 0, 1);
  const activeWeeks = new Set(sessions.map((item) => utcWeekKey(item.performedAt)).filter(Boolean)).size;
  const consistencySignal = clamp(activeWeeks / 8, 0, 1);
  const evidenceSignal = clamp(sessions.length / 6, 0, 1);
  return {
    exerciseId,
    score: Math.round(100 * (0.65 * progressSignal + 0.25 * consistencySignal + 0.10 * evidenceSignal)),
    improvementPercent: Math.round(improvement * 10) / 10,
    activeWeeks,
    validSessions: sessions.length,
    baselineE1rmKg: baseline,
    recentE1rmKg: recent,
  };
}

function roleForMuscle(roles: ExerciseMuscleRoles, muscleId: V2MuscleId): keyof ExerciseMuscleRoles | null {
  if (roles.primary.includes(muscleId)) return 'primary';
  if (roles.secondary.includes(muscleId)) return 'secondary';
  if (roles.stabilizers.includes(muscleId)) return 'stabilizers';
  return null;
}

export function computeMuscleStrength(
  muscleId: V2MuscleId,
  exerciseResults: Partial<Record<WorkoutV2ExerciseId, ExerciseStrengthResult>>,
): MuscleStrengthResult {
  const contributors: MuscleStrengthContributor[] = [];
  for (const exercise of WORKOUT_V2_EXERCISES) {
    const result = exerciseResults[exercise.id];
    const role = roleForMuscle(exercise.muscles, muscleId);
    if (!role || result?.score === null || result?.bestE1rmKg === null || !result?.performedAt) continue;
    contributors.push({
      exerciseId: exercise.id, role, roleWeight: MUSCLE_ROLE_WEIGHTS[role], exerciseScore: result.score,
      e1rmKg: result.bestE1rmKg, performedAt: result.performedAt,
    });
  }
  contributors.sort((a, b) => (b.exerciseScore * b.roleWeight) - (a.exerciseScore * a.roleWeight));
  const top = contributors.slice(0, 4);
  if (top.length === 0) return { muscleId, score: null, rank: flowStrengthRankForScore(null), contributors: [] };
  const weightedMean = top.reduce((sum, item) => sum + item.exerciseScore * item.roleWeight, 0)
    / top.reduce((sum, item) => sum + item.roleWeight, 0);
  const coverage = top.length === 1 ? 0.65 : top.length === 2 ? 0.85 : 1;
  const score = Math.round(weightedMean * coverage);
  return { muscleId, score, rank: flowStrengthRankForScore(score), contributors: top };
}

export function computeOverallFlowRank(
  regions: Partial<Record<V2MajorRegion, number>>,
): OverallFlowStrengthResult {
  const valid = MAJOR_REGIONS.flatMap((region) => {
    const score = regions[region];
    return Number.isFinite(score) ? [{ region, score: clamp(score as number, 0, 100) }] : [];
  });
  if (valid.length === 0) return { score: null, rank: flowStrengthRankForScore(null), representedRegions: 0, regions };
  const mean = valid.reduce((sum, item) => sum + item.score, 0) / valid.length;
  const score = Math.round(mean * (valid.length / MAJOR_REGIONS.length));
  return { score, rank: flowStrengthRankForScore(score, valid.length >= 3), representedRegions: valid.length, regions };
}

export function computeStrengthMap(
  performances: readonly WorkoutV2Performance[],
  bodyweightKg: number | undefined,
  nowIso: string,
  ownerId?: string,
): WorkoutV2StrengthMap {
  const exercises: Partial<Record<WorkoutV2ExerciseId, ExerciseStrengthResult>> = {};
  const momentum: Partial<Record<WorkoutV2ExerciseId, ProgressMomentumResult>> = {};
  for (const exercise of WORKOUT_V2_EXERCISES) {
    if (!exercise.strengthEligible) continue;
    exercises[exercise.id] = computeExerciseStrength(exercise.id, performances, bodyweightKg, nowIso, ownerId);
    momentum[exercise.id] = computeProgressMomentum(exercise.id, performances, bodyweightKg, ownerId);
  }
  const muscles = Object.fromEntries(V2_MUSCLE_IDS.map((muscleId) => [
    muscleId, computeMuscleStrength(muscleId, exercises),
  ])) as Record<V2MuscleId, MuscleStrengthResult>;
  const regions: Partial<Record<V2MajorRegion, number>> = {};
  for (const region of MAJOR_REGIONS) {
    const regionMuscles = V2_MUSCLE_IDS
      .filter((muscleId) => V2_MUSCLES[muscleId].majorRegion === region)
      .map((muscleId) => muscles[muscleId]);
    const distinctExercises = new Set(regionMuscles.flatMap((muscle) => muscle.contributors.map((item) => item.exerciseId)));
    const hasPrimaryEvidence = regionMuscles.some((muscle) => muscle.contributors.some((item) => item.role === 'primary'));
    // Secondary/stabilizer work is meaningful, but one compound movement cannot
    // establish an entire major region by itself.
    if (!hasPrimaryEvidence && distinctExercises.size < 2) continue;
    const scores = regionMuscles
      .map((muscle) => muscle.score)
      .filter((score): score is number => score !== null);
    if (scores.length > 0) regions[region] = Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
  }
  return { exercises, momentum, muscles, overall: computeOverallFlowRank(regions) };
}
