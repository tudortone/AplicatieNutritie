export type CompanionStageId = 'egg' | 'fox' | 'lynx' | 'wolf' | 'titan';
export type BeaconStatus = 'optimal' | 'near_limit' | 'exceeded';

export interface CompanionStageInfo {
  stage: number;
  id: CompanionStageId;
  nameKey: string;
  defaultName: string;
  minStreak: number;
  nextStreak: number | null;
}

export interface BeaconStatusInfo {
  status: BeaconStatus;
  color: string;
  labelKey: string;
  defaultLabel: string;
  descKey: string;
  defaultDesc: string;
  percent: number;
  differenceKcal: number;
}

export const COMPANION_STAGES: CompanionStageInfo[] = [
  {
    stage: 1,
    id: 'egg',
    nameKey: 'flowCompanion.stage1Name',
    defaultName: 'Spark Egg',
    minStreak: 0,
    nextStreak: 3,
  },
  {
    stage: 2,
    id: 'fox',
    nameKey: 'flowCompanion.stage2Name',
    defaultName: 'Pui de Foc',
    minStreak: 3,
    nextStreak: 7,
  },
  {
    stage: 3,
    id: 'lynx',
    nameKey: 'flowCompanion.stage3Name',
    defaultName: 'Râs Electric',
    minStreak: 7,
    nextStreak: 14,
  },
  {
    stage: 4,
    id: 'wolf',
    nameKey: 'flowCompanion.stage4Name',
    defaultName: 'Lup Cosmic',
    minStreak: 14,
    nextStreak: 30,
  },
  {
    stage: 5,
    id: 'titan',
    nameKey: 'flowCompanion.stage5Name',
    defaultName: 'Dragon Flow',
    minStreak: 30,
    nextStreak: null,
  },
];

export function getCompanionStage(streak: number): CompanionStageInfo {
  const safeStreak = Math.max(0, Number.isFinite(streak) ? Math.floor(streak) : 0);
  if (safeStreak >= 30) return COMPANION_STAGES[4];
  if (safeStreak >= 14) return COMPANION_STAGES[3];
  if (safeStreak >= 7) return COMPANION_STAGES[2];
  if (safeStreak >= 3) return COMPANION_STAGES[1];
  return COMPANION_STAGES[0];
}

export function getDaysUntilNextEvolution(streak: number): number | null {
  const stage = getCompanionStage(streak);
  if (stage.nextStreak === null) return null;
  const safeStreak = Math.max(0, Number.isFinite(streak) ? Math.floor(streak) : 0);
  return Math.max(1, stage.nextStreak - safeStreak);
}

export function getEvolutionProgressPercent(streak: number): number {
  const safeStreak = Math.max(0, Number.isFinite(streak) ? Math.floor(streak) : 0);
  const currentStage = getCompanionStage(safeStreak);
  if (currentStage.nextStreak === null) return 100;

  const currentMin = currentStage.minStreak;
  const nextTarget = currentStage.nextStreak;
  const range = nextTarget - currentMin;
  const progress = safeStreak - currentMin;

  return Math.min(100, Math.max(0, Math.round((progress / range) * 100)));
}

export function getLimitBeaconStatus(
  caloriiConsumate: number,
  caloriiTinta: number
): BeaconStatusInfo {
  const tinta = Number.isFinite(caloriiTinta) && caloriiTinta > 0 ? caloriiTinta : 2000;
  const consumat = Number.isFinite(caloriiConsumate) && caloriiConsumate >= 0 ? caloriiConsumate : 0;
  const ratio = consumat / tinta;
  const percent = Math.round(ratio * 100);
  const diff = consumat - tinta;

  if (ratio > 1.0) {
    return {
      status: 'exceeded',
      color: '#EF4444', // Red warning
      labelKey: 'flowCompanion.exceeded',
      defaultLabel: 'Limită atinsă',
      descKey: 'flowCompanion.exceededDesc',
      defaultDesc: 'Ținta calorică a fost depășită. Concentrează-te pe hidratare și odihnă.',
      percent,
      differenceKcal: diff,
    };
  }

  if (ratio >= 0.85) {
    return {
      status: 'near_limit',
      color: '#F59E0B', // Amber warning
      labelKey: 'flowCompanion.nearLimit',
      defaultLabel: 'Aproape de limită',
      descKey: 'flowCompanion.nearLimitDesc',
      defaultDesc: 'Ai atins peste 85% din bugetul caloric de azi. Alege mese ușoare!',
      percent,
      differenceKcal: Math.max(0, tinta - consumat),
    };
  }

  return {
    status: 'optimal',
    color: '#C5F467', // Lime neon
    labelKey: 'flowCompanion.optimal',
    defaultLabel: 'În grafic',
    descKey: 'flowCompanion.optimalDesc',
    defaultDesc: 'Calorii în zona optimă. Ai energie liberă pentru restul zilei!',
    percent,
    differenceKcal: Math.max(0, tinta - consumat),
  };
}
