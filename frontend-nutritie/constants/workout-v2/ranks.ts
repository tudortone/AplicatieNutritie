export type FlowStrengthRankKey = 'NO_DATA' | 'FOUNDATION' | 'FORGE' | 'DRIVE' | 'SURGE' | 'FLOW';

export interface FlowStrengthRank {
  key: FlowStrengthRankKey;
  min: number;
  max: number;
  level: 0 | 1 | 2 | 3 | 4 | 5;
  nameKey: `workoutV2.strength.ranks.${Lowercase<FlowStrengthRankKey>}`;
}

export const FLOW_STRENGTH_RANKS = [
  { key: 'NO_DATA', min: 0, max: 0, level: 0, nameKey: 'workoutV2.strength.ranks.no_data' },
  { key: 'FOUNDATION', min: 1, max: 19, level: 1, nameKey: 'workoutV2.strength.ranks.foundation' },
  { key: 'FORGE', min: 20, max: 39, level: 2, nameKey: 'workoutV2.strength.ranks.forge' },
  { key: 'DRIVE', min: 40, max: 59, level: 3, nameKey: 'workoutV2.strength.ranks.drive' },
  { key: 'SURGE', min: 60, max: 79, level: 4, nameKey: 'workoutV2.strength.ranks.surge' },
  { key: 'FLOW', min: 80, max: 100, level: 5, nameKey: 'workoutV2.strength.ranks.flow' },
] as const satisfies readonly FlowStrengthRank[];

export function flowStrengthRankForScore(score: number | null, hasEnoughEvidence = true): FlowStrengthRank {
  if (score === null || !hasEnoughEvidence || score <= 0) return FLOW_STRENGTH_RANKS[0];
  const bounded = Math.max(1, Math.min(100, Math.round(score)));
  return FLOW_STRENGTH_RANKS.find((rank) => rank.key !== 'NO_DATA' && bounded >= rank.min && bounded <= rank.max)
    ?? FLOW_STRENGTH_RANKS[0];
}
