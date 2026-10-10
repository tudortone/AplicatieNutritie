export type CalorieRingUpdate = 'unchanged' | 'set' | 'animate';

/** Decides whether a Home ring update represents a verified new meal save. */
export function decideCalorieRingUpdate(input: {
  previousPercent: number;
  nextPercent: number;
  verifiedSavePending: boolean;
  reducedMotion: boolean;
}): CalorieRingUpdate {
  if (!Number.isFinite(input.previousPercent) || !Number.isFinite(input.nextPercent)) return 'set';
  if (input.previousPercent === input.nextPercent) return 'unchanged';
  if (input.reducedMotion) return 'set';
  return input.verifiedSavePending ? 'animate' : 'set';
}
