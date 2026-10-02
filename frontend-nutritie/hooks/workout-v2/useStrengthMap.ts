import { useMemo } from 'react';

import {
  computeStrengthMap,
  type WorkoutV2Performance,
  type WorkoutV2StrengthMap,
} from '../../lib/workout-v2/strengthEngine';

export function useStrengthMap(
  performances: readonly WorkoutV2Performance[],
  bodyweightKg: number | undefined,
  nowIso: string,
  ownerId?: string,
): WorkoutV2StrengthMap {
  return useMemo(
    () => computeStrengthMap(performances, bodyweightKg, nowIso, ownerId),
    [performances, bodyweightKg, nowIso, ownerId],
  );
}
