
import { Exercitiu, MuscleActivation } from '../constants/exercitii';
import { ExercitiuInAntrenament } from '../hooks/useAntrenamente';

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
 * Obține factorii de activare ai unui exercițiu.
 * Dacă nu sunt specificați explicit, alocă:
 * - Primul mușchi din ex.grupe -> primary (1.0)
 * - Al doilea mușchi din ex.grupe -> secondary (0.5)
 * - Următorii -> stabilizer (0.25)
 */
export function getExerciseMuscleActivations(ex?: Partial<Exercitiu>): MuscleActivation[] {
  if (!ex) return [];
  if (ex.muscleActivations && ex.muscleActivations.length > 0) {
    return ex.muscleActivations;
  }
  const grupe = ex.grupe || [];
  return grupe.map((m, idx) => {
    let role: 'primary' | 'secondary' | 'stabilizer' = 'stabilizer';
    let factor = 0.25;
    if (idx === 0) {
      role = 'primary';
      factor = 1.0;
    } else if (idx === 1) {
      role = 'secondary';
      factor = 0.5;
    }
    return {
      muscle: m.toLowerCase().trim(),
      role,
      factor,
    };
  });
}

export const ISO_FACTOR = 0.15;

/**
 * 1.4 Formule intensitate / volum din specificație
 */
export function setIntensity(
  set: { reps?: number; greutate?: number; time_seconds?: number; repetari?: number },
  ex: { input_type?: string; bw_load_ratio?: number; activation?: Record<string, number> },
  muscle: string,
  bodyWeight = 75
): number {
  const af = ex.activation?.[muscle] ?? 0;
  const reps = Number(set.reps ?? set.repetari) || 0;
  const weight = Number(set.greutate) || 0;
  const timeSec = Number(set.time_seconds) || 0;

  if (ex.input_type === 'weighted_reps') return reps * weight * af;
  if (ex.input_type === 'bodyweight_reps') return reps * (bodyWeight * (ex.bw_load_ratio ?? 0.65)) * af;
  if (ex.input_type === 'hold') return timeSec * (bodyWeight * (ex.bw_load_ratio ?? 0.65)) * ISO_FACTOR * af;
  return 0;
}

/**
 * Calculează metricile de volum, activare musculară, scor și rank pentru un antrenament.
 */
export function computeWorkoutMetrics(
  exercitiiInAntrenament: ExercitiuInAntrenament[],
  catalogExercitiiMap?: Record<string, any>,
  bodyWeight = 75
): WorkoutSessionMetrics {
  const muscleLoad: MuscleLoadMap = {};
  let externalVolumeKg = 0;
  let equivalentVolumeKg = 0;
  let totalSets = 0;
  let totalReps = 0;
  let heavySetsCount = 0;

  for (const item of exercitiiInAntrenament) {
    const catalogEx = catalogExercitiiMap?.[item.exercitiuId];
    const activations = getExerciseMuscleActivations(catalogEx || { grupe: [item.nume] });
    const inputType = catalogEx?.input_type || (catalogEx?.echipament === 'bodyweight' ? 'bodyweight_reps' : 'weighted_reps');
    const bwRatio = catalogEx?.bw_load_ratio ?? 0.65;

    for (const set of item.seturi || []) {
      const reps = Number(set.repetari) || 0;
      const weight = Number(set.greutate) || 0;
      const timeSec = Number((set as any).time_seconds) || 0;

      if (reps <= 0 && timeSec <= 0) continue;

      totalSets += 1;
      totalReps += reps;

      if (inputType === 'weighted_reps' && weight > 0) {
        externalVolumeKg += weight * reps;
        if (weight >= 50 || (weight >= 20 && reps >= 10)) {
          heavySetsCount += 1;
        }
      } else if (inputType === 'bodyweight_reps') {
        equivalentVolumeKg += reps * (bodyWeight * bwRatio);
      } else if (inputType === 'hold') {
        equivalentVolumeKg += timeSec * (bodyWeight * bwRatio) * ISO_FACTOR;
      } else if (weight <= 0) {
        equivalentVolumeKg += reps * 10;
      }

      // Încărcătură musculară conform formulei sau proxy
      if (catalogEx?.activation && Object.keys(catalogEx.activation).length > 0) {
        for (const [mKey, afVal] of Object.entries(catalogEx.activation)) {
          const mName = mKey.toLowerCase().trim();
          const loadContrib = setIntensity(
            { reps, greutate: weight, time_seconds: timeSec },
            catalogEx,
            mKey,
            bodyWeight
          );
          muscleLoad[mName] = (muscleLoad[mName] || 0) + loadContrib;
        }
      } else {
        const proxyWeight = weight > 0 ? weight : (inputType === 'hold' ? timeSec * ISO_FACTOR * bodyWeight * bwRatio : 10);
        for (const act of activations) {
          const muscleKey = act.muscle.toLowerCase().trim();
          const currentLoad = muscleLoad[muscleKey] || 0;
          muscleLoad[muscleKey] = currentLoad + (reps || 1) * proxyWeight * act.factor;
        }
      }
    }
  }

  // Scor sesiune: derivat din volum extern, seturi, seturi grele și volum echivalent
  const volumePoints = Math.round(externalVolumeKg * 0.15);
  const setsPoints = totalSets * 12;
  const heavyBonus = heavySetsCount * 25;
  const eqPoints = Math.round(equivalentVolumeKg * 0.08);

  const sessionScore = Math.max(0, volumePoints + setsPoints + heavyBonus + eqPoints);

  // Determinare Mastery Rank
  let rank: WorkoutRankInfo;
  if (sessionScore < 150) {
    rank = { key: 'BRONZE', label: 'Începător', color: '#CD7F32', score: sessionScore };
  } else if (sessionScore < 350) {
    rank = { key: 'SILVER', label: 'Activ', color: '#C0C0C0', score: sessionScore };
  } else if (sessionScore < 650) {
    rank = { key: 'GOLD', label: 'Atlet', color: '#FFD700', score: sessionScore };
  } else if (sessionScore < 1000) {
    rank = { key: 'PLATINUM', label: 'Avansat', color: '#00F0FF', score: sessionScore };
  } else {
    rank = { key: 'ELITE', label: 'Elite NutriAI', color: '#CCFF00', score: sessionScore };
  }

  // Normalizare heatLevels (0..4) pentru Body Heatmap
  const loads = Object.values(muscleLoad);
  const maxLoad = loads.length > 0 ? Math.max(...loads) : 0;
  const heatLevels: Record<string, 0 | 1 | 2 | 3 | 4> = {};

  for (const [muscle, load] of Object.entries(muscleLoad)) {
    if (load <= 0 || maxLoad <= 0) {
      heatLevels[muscle] = 0;
    } else {
      const ratio = load / maxLoad;
      if (ratio > 0.75) heatLevels[muscle] = 4;
      else if (ratio > 0.5) heatLevels[muscle] = 3;
      else if (ratio > 0.25) heatLevels[muscle] = 2;
      else heatLevels[muscle] = 1;
    }
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

import { ALL_MUSCLE_IDS } from '../components/fitness/heatColor';
import type { MuscleId } from '../components/fitness/heatColor';

/**
 * Mapează orice denumire (canonică, din catalog sau în română/engleză) către MuscleId canonic.
 */
export function mapToCanonicalMuscleIds(key: string): { id: MuscleId; weight: number }[] {
  const g = key.toLowerCase().trim();
  // Verificare directă dacă este un MuscleId canonic:
  // FIX: lista era duplicata manual si putea ramane in urma fata de heatColor.ts
  // (o denumire nou adaugata acolo nu era recunoscuta aici => muschi mort pe harta).
  const validIds: MuscleId[] = ALL_MUSCLE_IDS as unknown as MuscleId[];
  if (validIds.includes(g as MuscleId)) {
    return [{ id: g as MuscleId, weight: 1.0 }];
  }

  // Mappings din nume comune / grupe spre MuscleId canonic:
  // IMPORTANT: specific înainte de generic!
  if (/pectorali|piept|pectoral/i.test(g)) return [{ id: 'pectorali', weight: 1.0 }];
  if (/deltoid anterior|umeri anteriori/i.test(g)) return [{ id: 'deltoid_anterior', weight: 1.0 }];
  if (/deltoid lateral|umeri laterali/i.test(g)) return [{ id: 'deltoid_lateral', weight: 1.0 }];
  if (/deltoid posterior|umeri posteriori/i.test(g)) return [{ id: 'deltoid_posterior', weight: 1.0 }];
  if (/^umeri$|deltoizi/i.test(g)) return [
    { id: 'deltoid_anterior', weight: 0.8 },
    { id: 'deltoid_lateral', weight: 0.8 },
    { id: 'deltoid_posterior', weight: 0.5 },
  ];
  // antrebrate / antebraț trebuie să vină ÎNAINTE de brate/brațe
  if (/antebrate|antebraț|brahioradial/i.test(g)) return [{ id: 'antebrate', weight: 1.0 }];
  if (/biceps/i.test(g)) return [{ id: 'biceps', weight: 1.0 }];
  if (/triceps/i.test(g)) return [{ id: 'triceps', weight: 1.0 }];
  // Generic: brate/brațe/brahial → distribuie la biceps, triceps și antebraț
  if (/^brate$|^brațe$|brahial/i.test(g)) return [
    { id: 'biceps', weight: 0.7 },
    { id: 'triceps', weight: 0.7 },
    { id: 'antebrate', weight: 0.4 },
  ];
  if (/abdomen|abdomeni|core/i.test(g)) return [{ id: 'abdomen', weight: 1.0 }];
  if (/oblici/i.test(g)) return [{ id: 'oblici', weight: 0.85 }];
  if (/trapez/i.test(g)) return [{ id: 'trapez', weight: 0.85 }];
  // Specific: "spate" ca grup generic → distribuie
  if (/^spate$/i.test(g)) return [
    { id: 'dorsali', weight: 1.0 },
    { id: 'trapez', weight: 0.6 },
    { id: 'romboizi', weight: 0.6 },
    { id: 'lombari', weight: 0.4 },
  ];
  if (/dorsali/i.test(g)) return [{ id: 'dorsali', weight: 1.0 }];
  if (/lombari|coloană/i.test(g)) return [{ id: 'lombari', weight: 0.8 }];
  if (/romboizi/i.test(g)) return [{ id: 'romboizi', weight: 0.75 }];
  if (/fesieri|șolduri/i.test(g)) return [{ id: 'fesieri', weight: 0.9 }];
  // Specific: "picioare" generic → distribuie
  if (/^picioare$/i.test(g)) return [
    { id: 'cvadriceps', weight: 1.0 },
    { id: 'ischiogambieri', weight: 0.7 },
    { id: 'fesieri', weight: 0.7 },
    { id: 'gambe', weight: 0.4 },
  ];
  if (/cvadriceps/i.test(g)) return [{ id: 'cvadriceps', weight: 1.0 }];
  if (/ischiogambieri|femurali/i.test(g)) return [{ id: 'ischiogambieri', weight: 0.9 }];
  if (/gambe/i.test(g)) return [{ id: 'gambe', weight: 0.8 }];
  // abductori INAINTE de adductori (altfel regex-ul /adductori/ prinde și "abductori")
  if (/abductori|fesier mijlociu/i.test(g)) return [{ id: 'abductori', weight: 1.0 }];
  if (/adductori/i.test(g)) return [{ id: 'adductori', weight: 0.7 }];
  // Chei non-musculare: nu genereaza incarcare, dar nici avertisment in consola.
  if (/mobilitate|stretching|incalzire|echilibru/i.test(g)) return [];
  if (/full-body|corp_intreg|cardio/i.test(g)) return [
    { id: 'cvadriceps', weight: 0.7 },
    { id: 'pectorali', weight: 0.6 },
    { id: 'dorsali', weight: 0.6 },
    { id: 'abdomen', weight: 0.6 },
  ];

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.warn('[muscle] cheie nemapată:', g);
  }
  return [];
}

export function computeDailyMuscleIntensity(
  sesiuniAzi: Array<{ exercitiuId: string; serii: number; volumKg: number; durataSec: number }>,
  db: Exercitiu[]
): Partial<Record<MuscleId, number>> {
  const acc: Record<string, number> = {};
  let maxLoad = 0;
  for (const s of sesiuniAzi) {
    const ex = db.find((e) => e.id === s.exercitiuId);
    if (!ex?.muschiTinta) continue;
    const effort = s.volumKg > 0 ? s.volumKg : s.durataSec > 0 ? s.durataSec * 1.2 : s.serii * 40;
    for (const [m, pct] of Object.entries(ex.muschiTinta)) {
      const canonicals = mapToCanonicalMuscleIds(m);
      for (const { id, weight } of canonicals) {
        const contrib = effort * ((pct as number) / 100) * weight;
        acc[id] = (acc[id] ?? 0) + contrib;
        if (acc[id] > maxLoad) maxLoad = acc[id];
      }
    }
  }
  const out: Partial<Record<MuscleId, number>> = {};
  if (maxLoad <= 0) return out;
  for (const [m, v] of Object.entries(acc)) {
    out[m as MuscleId] = Math.min(1, v / maxLoad);
  }
  return out;
}

export function normalizeMuscleLoadToIntensity(
  muscleLoad?: MuscleLoadMap
): Partial<Record<MuscleId, number>> {
  const out: Partial<Record<MuscleId, number>> = {};
  if (!muscleLoad) return out;
  
  const acc: Record<string, number> = {};
  for (const [key, val] of Object.entries(muscleLoad)) {
    if (val <= 0) continue;
    const canonicals = mapToCanonicalMuscleIds(key);
    for (const { id, weight } of canonicals) {
      acc[id] = (acc[id] ?? 0) + val * weight;
    }
  }

  for (const [key, val] of Object.entries(acc)) {
    // Scalare logaritmică bazată pe volum absolut așteptat per mușchi (aprox 5000kg)
    // Astfel, 1 set ușor (ex 500kg volum) va fi galben, 5000kg va fi roșu intens.
    const expectedMaxTonnage = 5000;
    out[key as MuscleId] = Math.min(1, Math.max(0, Math.log10(val + 1) / Math.log10(expectedMaxTonnage + 1)));
  }
  return out;
}

/* ─────────────────────────────────────────────────────────── MASTERY TONAGE RANKS */
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
  {
    tier: 'F', title: 'Novice Lifter', minKg: 0, maxKg: 1000,
    color: '#94A3B8', glowColor: 'rgba(148,163,184,0.3)', bgColor: 'rgba(148,163,184,0.08)',
    stars: 0, animType: 'pulse',
  },
  {
    tier: 'E', title: 'Iron Rookie', minKg: 1000, maxKg: 5000,
    color: '#38BDF8', glowColor: 'rgba(56,189,248,0.4)', bgColor: 'rgba(56,189,248,0.1)',
    stars: 1, animType: 'pulse',
  },
  {
    tier: 'D', title: 'Gym Challenger', minKg: 5000, maxKg: 15000,
    color: '#34D399', glowColor: 'rgba(52,211,153,0.4)', bgColor: 'rgba(52,211,153,0.1)',
    stars: 2, animType: 'shimmer',
  },
  {
    tier: 'C', title: 'Bronze Warrior', minKg: 15000, maxKg: 35000,
    color: '#F59E0B', glowColor: 'rgba(245,158,11,0.45)', bgColor: 'rgba(245,158,11,0.1)',
    stars: 2, animType: 'shimmer',
  },
  {
    tier: 'B', title: 'Silver Gladiator', minKg: 35000, maxKg: 75000,
    color: '#E2E8F0', glowColor: 'rgba(226,232,240,0.5)', bgColor: 'rgba(226,232,240,0.1)',
    stars: 3, animType: 'fire',
  },
  {
    tier: 'A', title: 'Elite Gold Lifter', minKg: 75000, maxKg: 150000,
    color: '#FFD700', glowColor: 'rgba(255,215,0,0.55)', bgColor: 'rgba(255,215,0,0.12)',
    stars: 4, animType: 'fire',
  },
  {
    tier: 'S', title: 'Master Beast', minKg: 150000, maxKg: 300000,
    color: '#FF1E42', glowColor: 'rgba(255,30,66,0.6)', bgColor: 'rgba(255,30,66,0.12)',
    stars: 5, animType: 'lightning',
  },
  {
    tier: 'SS', title: 'GOD OF IRON', minKg: 300000, maxKg: 1e7,
    color: '#00F0FF', glowColor: 'rgba(0,240,255,0.7)', bgColor: 'rgba(0,240,255,0.15)',
    stars: 5, animType: 'plasma',
  },
];

export function getRankByTonage(kg: number): TonageRank {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (kg >= RANKS[i].minKg) return RANKS[i];
  }
  return RANKS[0];
}
