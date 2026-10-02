import type { WorkoutV2ExerciseId } from './exercises';
import { createTemplateBlock, type WorkoutPreset } from '../../lib/workout-v2/templateModel';

function preset(
  id: string,
  exerciseIds: readonly WorkoutV2ExerciseId[],
): WorkoutPreset {
  return {
    id,
    nameKey: `workoutV2.presets.${id.replace('-', '')}`,
    blocks: exerciseIds.map((exerciseId, index) => createTemplateBlock(exerciseId, `${id}-${index + 1}`)),
  };
}

export const WORKOUT_V2_PRESETS = [
  preset('push', ['barbell-bench-press', 'standing-overhead-press', 'incline-dumbbell-press', 'dumbbell-lateral-raise', 'overhead-triceps-extension']),
  preset('pull', ['pull-up', 'barbell-row', 'one-arm-dumbbell-row', 'dumbbell-curl']),
  preset('legs', ['back-squat', 'romanian-deadlift', 'weighted-lunge', 'hip-thrust']),
  preset('upper', ['barbell-bench-press', 'barbell-row', 'standing-overhead-press', 'pull-up', 'dumbbell-curl']),
  preset('lower', ['front-squat', 'romanian-deadlift', 'weighted-lunge', 'plank']),
  preset('full-body', ['back-squat', 'barbell-bench-press', 'barbell-row', 'farmer-carry']),
  preset('beginner', ['goblet-squat', 'push-up', 'one-arm-dumbbell-row', 'plank']),
  preset('home-dumbbells', ['goblet-squat', 'incline-dumbbell-press', 'one-arm-dumbbell-row', 'weighted-lunge', 'dumbbell-curl']),
] as const satisfies readonly WorkoutPreset[];
