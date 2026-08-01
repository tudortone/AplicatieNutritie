import { EXERCITII_DB, type Exercitiu, type MuscleActivation } from '../constants/exercitii';
import type { ExercitiuInAntrenament } from '../hooks/useAntrenamente';
import type { MuscleId } from '../components/fitness/heatColor';
import {
  mapToCanonicalMuscleIds,
  toCanonicalMuscle,
  type CanonicalMuscleWeight,
} from './muscleMapping';

export { mapToCanonicalMuscleIds, toCanonicalMuscle };
export type { CanonicalMuscleWeight };

export type MuscleLoadMap = Record<string, number>;

export interface WorkoutRankInfo {
  key: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'ELITE';
  label: string;
  color: string;
  score: number;
}

export interface WorkoutSessionMetrics {
  muscleLoad: MuscleLoadMap;
  externalVolumeKg: number;
  equivalentVolumeKg: number;
  totalSets: number;
  totalReps: number;
  sessionScore: number;
  rank: WorkoutRankInfo;
  heatLevels: Record<string, 0 | 1 | 2 | 3 | 4>;
}

/**
 * Catalog implicit folosit inclusiv la salvarea din useAntrenamente.
 *
 * Înainte, apelurile fără `catalogExercitiiMap` încercau să deducă grupele din
 * `item.nume` (de ex. „Împins la piept cu bara”). Numele exercițiului nu este o
 * cheie musculară, deci `muscle_load` ajungea gol și harta de pe Acasă se stingea
 * imediat după salvarea sesiunii.
 */
const DEFAULT_EXERCISE_CATALOG: Record<string, Exercitiu> = Object.fromEntries(
  EXERCITII_DB.map((exercise) => [exercise.id, exercise]),
);

const clamp01 = (value: number): number =>
  Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

/**
 * Întoarce activări normalizate. Prioritate:
 *  1. muscleActivations explicite;
 *  2. muschiTinta (procente 0..100 sau fracții 0..1);
 *  3. grupele exercițiului.
 */
export function getExerciseMuscleActivations(ex?: Partial<Exercitiu>): MuscleActivation[] {
  if (!ex) return [];

  if (Array.isArray(ex.muscleActivations) && ex.muscleActivations.length > 0) {
    return ex.muscleActivations
      .filter((a) => a && typeof a.muscle === 'string' && Number(a.factor) > 0)
      .map((a) => ({ ...a, factor: clamp01(Number(a.factor)) }));
  }

  const targets = ex.muschiTinta ?? {};
  const targetEntries = Object.entries(targets).filter(([, value]) => Number(value) > 0);
  if (targetEntries.length > 0) {
    const maxValue = Math.max(...targetEntries.map(([, value]) => Number(value) || 0));
    const divisor = maxValue > 1 ? 100 : 1;
    return targetEntries.map(([muscle, value]) => {
      const factor = clamp01((Number(value) || 0) / divisor);
      return {
        muscle,
        role: factor >= 0.75 ? 'primary' : factor >= 0.4 ? 'secondary' : 'stabilizer',
        factor,
      };
    });
  }

  return (ex.grupe ?? []).map((muscle, index) => ({
    muscle,
    role: index === 0 ? 'primary' : index === 1 ? 'secondary' : 'stabilizer',
    factor: index === 0 ? 1 : index === 1 ? 0.5 : 0.25,
  }));
}

export const ISO_FACTOR = 0.15;

export function setIntensity(
  set: { reps?: number; greutate?: number; time_seconds?: number; repetari?: number },
  ex: { input_type?: string; bw_load_ratio?: number; activation?: Record<string, number> },
  muscle: string,
  bodyWeight = 75,
): number {
  const rawActivation = Number(ex.activation?.[muscle] ?? 0);
  const activationFactor = rawActivation > 1 ? rawActivation / 100 : rawActivation;
  const af = clamp01(activationFactor);
  const reps = Number(set.reps ?? set.repetari) || 0;
  const weight = Number(set.greutate) || 0;
  const timeSec = Number(set.time_seconds) || 0;

  if (ex.input_type === 'weighted_reps') return reps * weight * af;
  if (ex.input_type === 'bodyweight_reps') {
    return reps * (bodyWeight * (ex.bw_load_ratio ?? 0.65)) * af;
  }
  if (ex.input_type === 'hold') {
    return timeSec * (bodyWeight * (ex.bw_load_ratio ?? 0.65)) * ISO_FACTOR * af;
  }
  return 0;
}

function catalogInputType(ex?: Exercitiu): string {
  if ((ex as any)?.input_type) return (ex as any).input_type;
  const equipment = String(ex?.echipament ?? '').toLowerCase();
  if (/greutate corporala|greutate corporală|bodyweight|niciunul|bara fixa|bară fixă/.test(equipment)) {
    return 'bodyweight_reps';
  }
  return 'weighted_reps';
}

function addCanonicalLoad(
  target: MuscleLoadMap,
  rawMuscle: string,
  contribution: number,
): void {
  if (!Number.isFinite(contribution) || contribution <= 0) return;
  for (const { id, weight } of mapToCanonicalMuscleIds(rawMuscle)) {
    target[id] = (target[id] ?? 0) + contribution * weight;
  }
}

/** Calculează volum, încărcare musculară, scor și rank pentru o sesiune. */
export function computeWorkoutMetrics(
  exercitiiInAntrenament: ExercitiuInAntrenament[],
  catalogExercitiiMap: Record<string, Exercitiu> = DEFAULT_EXERCISE_CATALOG,
  bodyWeight = 75,
): WorkoutSessionMetrics {
  const muscleLoad: MuscleLoadMap = {};
  let externalVolumeKg = 0;
  let equivalentVolumeKg = 0;
  let totalSets = 0;
  let totalReps = 0;
  let heavySetsCount = 0;

  for (const item of exercitiiInAntrenament ?? []) {
    const catalogEx = catalogExercitiiMap[item.exercitiuId];
    const activations = getExerciseMuscleActivations(catalogEx);
    const inputType = catalogInputType(catalogEx);
    const bwRatio = Number((catalogEx as any)?.bw_load_ratio ?? catalogEx?.masurare?.bodyweightFactor ?? 0.65);

    for (const set of item.seturi ?? []) {
      const reps = Math.max(0, Number(set.repetari) || 0);
      const weight = Math.max(0, Number(set.greutate) || 0);
      const timeSec = Math.max(0, Number((set as any).time_seconds) || 0);
      if (reps <= 0 && timeSec <= 0) continue;

      totalSets += 1;
      totalReps += reps;

      // Seturile de încălzire apar în istoricul sesiunii, dar nu intră în volum,
      // scor sau heatmap, conform textului din UI.
      if (set.set_type === 'warmup') continue;

      let baseLoad = 0;
      if (inputType === 'weighted_reps' && weight > 0) {
        baseLoad = weight * reps;
        externalVolumeKg += baseLoad;
        if (weight >= 50 || (weight >= 20 && reps >= 10)) heavySetsCount += 1;
      } else if (inputType === 'bodyweight_reps') {
        baseLoad = reps * bodyWeight * bwRatio;
        equivalentVolumeKg += baseLoad;
      } else if (inputType === 'hold') {
        baseLoad = timeSec * bodyWeight * bwRatio * ISO_FACTOR;
        equivalentVolumeKg += baseLoad;
      } else {
        // Exercițiu necatalogat / fără greutate: păstrăm un proxy modest, astfel
        // încât sesiunea să nu dispară complet din heatmap.
        baseLoad = Math.max(1, reps) * (weight > 0 ? weight : 10);
        if (weight > 0) externalVolumeKg += baseLoad;
        else equivalentVolumeKg += baseLoad;
      }

      const explicitActivation = (catalogEx as any)?.activation as Record<string, number> | undefined;
      if (explicitActivation && Object.keys(explicitActivation).length > 0) {
        for (const [muscle, rawFactor] of Object.entries(explicitActivation)) {
          const numeric = Number(rawFactor) || 0;
          const factor = clamp01(numeric > 1 ? numeric / 100 : numeric);
          addCanonicalLoad(muscleLoad, muscle, baseLoad * factor);
        }
      } else if (activations.length > 0) {
        for (const activation of activations) {
          addCanonicalLoad(muscleLoad, activation.muscle, baseLoad * clamp01(activation.factor));
        }
      } else if (catalogEx?.categorie) {
        // Ultimul fallback este categoria, nu numele liber al exercițiului.
        addCanonicalLoad(muscleLoad, catalogEx.categorie, baseLoad);
      }
    }
  }

  const sessionScore = Math.max(
    0,
    Math.round(externalVolumeKg * 0.15) +
      totalSets * 12 +
      heavySetsCount * 25 +
      Math.round(equivalentVolumeKg * 0.08),
  );

  let rank: WorkoutRankInfo;
  if (sessionScore < 150) rank = { key: 'BRONZE', label: 'Începător', color: '#CD7F32', score: sessionScore };
  else if (sessionScore < 350) rank = { key: 'SILVER', label: 'Activ', color: '#C0C0C0', score: sessionScore };
  else if (sessionScore < 650) rank = { key: 'GOLD', label: 'Atlet', color: '#FFD700', score: sessionScore };
  else if (sessionScore < 1000) rank = { key: 'PLATINUM', label: 'Avansat', color: '#00F0FF', score: sessionScore };
  else rank = { key: 'ELITE', label: 'Elite NutriAI', color: '#CCFF00', score: sessionScore };

  const maxLoad = Math.max(0, ...Object.values(muscleLoad));
  const heatLevels: Record<string, 0 | 1 | 2 | 3 | 4> = {};
  for (const [muscle, load] of Object.entries(muscleLoad)) {
    const ratio = maxLoad > 0 ? load / maxLoad : 0;
    heatLevels[muscle] = ratio <= 0 ? 0 : ratio > 0.75 ? 4 : ratio > 0.5 ? 3 : ratio > 0.25 ? 2 : 1;
  }

  return {
    muscleLoad,
    externalVolumeKg: Math.round(externalVolumeKg * 10) / 10,
    equivalentVolumeKg: Math.round(equivalentVolumeKg * 10) / 10,
    totalSets,
    totalReps,
    sessionScore,
    rank,
    heatLevels,
  };
}

export function computeDailyMuscleIntensity(
  sessions: Array<{ exercitiuId: string; serii: number; volumKg: number; durataSec: number }>,
  database: Exercitiu[],
): Partial<Record<MuscleId, number>> {
  const catalog = new Map(database.map((exercise) => [exercise.id, exercise]));
  const accumulated: Partial<Record<MuscleId, number>> = {};

  for (const session of sessions ?? []) {
    const exercise = catalog.get(session.exercitiuId);
    if (!exercise) continue;
    const effort = session.volumKg > 0
      ? session.volumKg
      : session.durataSec > 0
        ? session.durataSec * 1.2
        : Math.max(1, session.serii) * 40;

    for (const activation of getExerciseMuscleActivations(exercise)) {
      for (const { id, weight } of mapToCanonicalMuscleIds(activation.muscle)) {
        accumulated[id] = (accumulated[id] ?? 0) + effort * activation.factor * weight;
      }
    }
  }

  const maxLoad = Math.max(0, ...Object.values(accumulated).map((value) => value ?? 0));
  if (maxLoad <= 0) return {};

  const output: Partial<Record<MuscleId, number>> = {};
  for (const [muscle, value] of Object.entries(accumulated)) {
    output[muscle as MuscleId] = clamp01((value ?? 0) / maxLoad);
  }
  return output;
}

export function normalizeMuscleLoadToIntensity(
  muscleLoad?: MuscleLoadMap,
): Partial<Record<MuscleId, number>> {
  if (!muscleLoad) return {};
  const accumulated: Partial<Record<MuscleId, number>> = {};

  for (const [key, rawValue] of Object.entries(muscleLoad)) {
    const value = Number(rawValue) || 0;
    if (value <= 0) continue;
    for (const { id, weight } of mapToCanonicalMuscleIds(key)) {
      accumulated[id] = (accumulated[id] ?? 0) + value * weight;
    }
  }

  const output: Partial<Record<MuscleId, number>> = {};
  const expectedMaxTonnage = 5000;
  for (const [muscle, value] of Object.entries(accumulated)) {
    output[muscle as MuscleId] = clamp01(
      Math.log10((value ?? 0) + 1) / Math.log10(expectedMaxTonnage + 1),
    );
  }
  return output;
}

export interface TonageRank {
  tier: 'F' | 'E' | 'D' | 'C' | 'B' | 'A' | 'S' | 'SS';
  title: string;
  minKg: number;
  maxKg: number;
  color: string;
  glowColor: string;
  bgColor: string;
  stars: number;
  animType: 'pulse' | 'shimmer' | 'fire' | 'lightning' | 'plasma';
}

export const RANKS: TonageRank[] = [
  { tier: 'F', title: 'Novice Lifter', minKg: 0, maxKg: 1000, color: '#94A3B8', glowColor: 'rgba(148,163,184,0.3)', bgColor: 'rgba(148,163,184,0.08)', stars: 0, animType: 'pulse' },
  { tier: 'E', title: 'Iron Rookie', minKg: 1000, maxKg: 5000, color: '#38BDF8', glowColor: 'rgba(56,189,248,0.4)', bgColor: 'rgba(56,189,248,0.1)', stars: 1, animType: 'pulse' },
  { tier: 'D', title: 'Gym Challenger', minKg: 5000, maxKg: 15000, color: '#34D399', glowColor: 'rgba(52,211,153,0.4)', bgColor: 'rgba(52,211,153,0.1)', stars: 2, animType: 'shimmer' },
  { tier: 'C', title: 'Bronze Warrior', minKg: 15000, maxKg: 35000, color: '#F59E0B', glowColor: 'rgba(245,158,11,0.45)', bgColor: 'rgba(245,158,11,0.1)', stars: 2, animType: 'shimmer' },
  { tier: 'B', title: 'Silver Gladiator', minKg: 35000, maxKg: 75000, color: '#E2E8F0', glowColor: 'rgba(226,232,240,0.5)', bgColor: 'rgba(226,232,240,0.1)', stars: 3, animType: 'fire' },
  { tier: 'A', title: 'Elite Gold Lifter', minKg: 75000, maxKg: 150000, color: '#FFD700', glowColor: 'rgba(255,215,0,0.55)', bgColor: 'rgba(255,215,0,0.12)', stars: 4, animType: 'fire' },
  { tier: 'S', title: 'Master Beast', minKg: 150000, maxKg: 300000, color: '#FF1E42', glowColor: 'rgba(255,30,66,0.6)', bgColor: 'rgba(255,30,66,0.12)', stars: 5, animType: 'lightning' },
  { tier: 'SS', title: 'GOD OF IRON', minKg: 300000, maxKg: 1e7, color: '#00F0FF', glowColor: 'rgba(0,240,255,0.7)', bgColor: 'rgba(0,240,255,0.15)', stars: 5, animType: 'plasma' },
];

export function getRankByTonage(kg: number): TonageRank {
  for (let index = RANKS.length - 1; index >= 0; index -= 1) {
    if (kg >= RANKS[index].minKg) return RANKS[index];
  }
  return RANKS[0];
}
