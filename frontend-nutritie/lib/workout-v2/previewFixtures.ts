import type { WorkoutV2ExerciseId } from '../../constants/workout-v2/exercises';
import type { WorkoutV2Performance } from './strengthEngine';

export type WorkoutV2PreviewProfileId = 'no-data' | 'improving' | 'strong-flat' | 'strong-improving';

export interface WorkoutV2PreviewProfile {
  id: WorkoutV2PreviewProfileId;
  labelKey: `workoutV2.previewProfiles.${string}`;
  bodyweightKg?: number;
  performances: readonly WorkoutV2Performance[];
}

const DATES = [
  '2026-04-13T12:00:00.000Z', '2026-05-18T12:00:00.000Z', '2026-06-15T12:00:00.000Z',
  '2026-07-13T12:00:00.000Z', '2026-08-17T12:00:00.000Z', '2026-09-21T12:00:00.000Z',
] as const;

function series(
  profile: string,
  exerciseId: WorkoutV2ExerciseId,
  weights: readonly number[],
  reps = 5,
): WorkoutV2Performance[] {
  return weights.map((weightKg, index) => ({
    id: `${profile}:${exerciseId}:${index}`,
    sessionId: `${profile}:session:${index}`,
    exerciseId,
    performedAt: DATES[index],
    reps,
    weightKg,
    setType: 'working',
  }));
}

function profilePerformances(profile: string, low: number, high: number, flat: boolean): WorkoutV2Performance[] {
  const curve = (ratio: number) => flat
    ? Array(6).fill(high * ratio) as number[]
    : [low, low * 1.1, low * 1.22, low * 1.35, low * 1.5, high].map((value) => value * ratio);
  return [
    ...series(profile, 'barbell-bench-press', curve(1)),
    ...series(profile, 'barbell-row', curve(0.9)),
    ...series(profile, 'standing-overhead-press', curve(0.55)),
    ...series(profile, 'dumbbell-curl', curve(0.25), 8),
    ...series(profile, 'back-squat', curve(1.25)),
  ];
}

export const WORKOUT_V2_PREVIEW_PROFILES: readonly WorkoutV2PreviewProfile[] = [
  { id: 'no-data', labelKey: 'workoutV2.previewProfiles.noData', bodyweightKg: 80, performances: [] },
  {
    id: 'improving', labelKey: 'workoutV2.previewProfiles.improving', bodyweightKg: 80,
    performances: profilePerformances('improving', 35, 70, false),
  },
  {
    id: 'strong-flat', labelKey: 'workoutV2.previewProfiles.strongFlat', bodyweightKg: 80,
    performances: profilePerformances('strong-flat', 100, 100, true),
  },
  {
    id: 'strong-improving', labelKey: 'workoutV2.previewProfiles.strongImproving', bodyweightKg: 80,
    performances: profilePerformances('strong-improving', 65, 110, false),
  },
];

export const WORKOUT_V2_COMPARISON_FIXTURES = Object.freeze({
  sameBodyweightLowerLift: { ...series('same-bw-low', 'barbell-bench-press', [60]).at(0)!, performedAt: DATES[5] },
  sameBodyweightHigherLift: { ...series('same-bw-high', 'barbell-bench-press', [100]).at(0)!, performedAt: DATES[5] },
  bodyweightExercise: { ...series('push-up', 'push-up', [10], 10).at(0)!, performedAt: DATES[5], weightKg: 10 },
  assistedBodyweight: {
    ...series('assisted', 'pull-up', [0], 6).at(0)!, performedAt: DATES[5], weightKg: 0, assistanceWeightKg: 20,
  },
});

export function getWorkoutV2PreviewProfile(id: WorkoutV2PreviewProfileId): WorkoutV2PreviewProfile {
  const profile = WORKOUT_V2_PREVIEW_PROFILES.find((item) => item.id === id);
  if (!profile) throw new Error(`UNKNOWN_PREVIEW_PROFILE:${id}`);
  return profile;
}
