/**
 * measurement.ts — Sistem de măsurare per-exercițiu (reps / greutate / timer)
 * Conform specificației NutriAI v6 (Secțiunea 6)
 */

export type MeasurementType =
  | 'reps'            // bodyweight pur: flotări, abdomene, genuflexiuni fără greutate
  | 'reps_weight'     // permite și greutate opțională: tracțiuni, flotări cu disc
  | 'weight_reps'     // greutate obligatorie + reps: împins la piept, biceps cu gantere
  | 'timed'           // timer: plank, vacuum, stat în bară
  | 'timed_weight'    // timer + greutate opțională: plank cu disc, farmer hold
  | 'distance_time'   // cardio: alergare, înot (metri + timp)
  | 'reps_assisted';  // asistat: tracțiuni la aparat cu contragreutate

export interface MeasurementSpec {
  type: MeasurementType;
  allowsWeight: boolean;
  weightOptional: boolean;
  defaultSets: number;
  defaultReps?: number;
  defaultDurationSec?: number;
  defaultWeightKg?: number;
  bodyweightFactor?: number;
  unitLabel: string;
}

const RX = {
  plank: /(plank|scândur|vacuum|stat în bară|hollow|wall sit|izometr)/i,
  bodyweight: /(flotăr|flotari|abdomen|crunch|genuflexiuni|dips|mountain|burpee|jumping|russian|dead bug|bicycle|ridicări pe vârfuri|hiperextensii)/i,
  pull: /(tracțiun|tractiun|pull[- ]?up|chin[- ]?up|ramat corp)/i,
  cardio: /(alergare|alergat|înot|inot|bicicleta|eliptic|vâsl|vasl|sărituri coard)/i,
  assisted: /(asistat|la aparat cu contragreutate|graviton)/i,
  weighted: /(bara|gantere|gantera|disc|kettlebell|helcometru|cablu|smith|leg press|hack)/i,
};

export function classifyMeasurement(ex: {
  nume: string;
  categorie?: string;
  echipament?: string;
}): MeasurementSpec {
  const s = `${ex.nume} ${ex.categorie ?? ''} ${ex.echipament ?? ''}`;

  if (RX.plank.test(s)) {
    const weightable = /disc|kettlebell|gantere|farmer/i.test(s);
    return {
      type: weightable ? 'timed_weight' : 'timed',
      allowsWeight: weightable,
      weightOptional: true,
      defaultSets: 3,
      defaultDurationSec: 45,
      unitLabel: 'Secunde',
    };
  }

  if (RX.bodyweight.test(s) && !RX.weighted.test(s)) {
    return {
      type: 'reps',
      allowsWeight: false,
      weightOptional: true,
      defaultSets: 3,
      defaultReps: 15,
      unitLabel: 'Repetări',
      bodyweightFactor: 0.65,
    };
  }

  if (RX.cardio.test(s)) {
    return {
      type: 'distance_time',
      allowsWeight: false,
      weightOptional: true,
      defaultSets: 1,
      defaultDurationSec: 600,
      unitLabel: 'Distanță / timp',
    };
  }

  if (RX.assisted.test(s)) {
    return {
      type: 'reps_assisted',
      allowsWeight: true,
      weightOptional: false,
      defaultSets: 3,
      defaultReps: 10,
      defaultWeightKg: 20,
      unitLabel: 'Repetări',
      bodyweightFactor: 0.6,
    };
  }

  if (RX.pull.test(s)) {
    return {
      type: 'reps_weight',
      allowsWeight: true,
      weightOptional: true,
      defaultSets: 3,
      defaultReps: 8,
      defaultWeightKg: 0,
      unitLabel: 'Repetări',
      bodyweightFactor: 1.0,
    };
  }

  if (RX.bodyweight.test(s) && !RX.weighted.test(s)) {
    return {
      type: 'reps',
      allowsWeight: false,
      weightOptional: true,
      defaultSets: 3,
      defaultReps: 15,
      unitLabel: 'Repetări',
      bodyweightFactor: 0.65,
    };
  }

  return {
    type: 'weight_reps',
    allowsWeight: true,
    weightOptional: false,
    defaultSets: 3,
    defaultReps: 12,
    defaultWeightKg: 20,
    unitLabel: 'Repetări',
  };
}

export function computeSessionLoad(
  spec: MeasurementSpec,
  input: {
    sets: number;
    reps?: number;
    weightKg?: number;
    durationSec?: number;
    bodyweightKg: number;
  }
): number {
  const { sets, reps = 0, weightKg = 0, durationSec = 0, bodyweightKg } = input;

  switch (spec.type) {
    case 'reps':
      return sets * reps * bodyweightKg * (spec.bodyweightFactor ?? 0.65);
    case 'reps_weight':
    case 'reps_assisted':
      return (
        sets * reps * (bodyweightKg * (spec.bodyweightFactor ?? 0.8) + weightKg)
      );
    case 'weight_reps':
      return sets * reps * weightKg;
    case 'timed':
      return sets * durationSec * bodyweightKg * 0.02;
    case 'timed_weight':
      return sets * durationSec * (bodyweightKg * 0.02 + weightKg * 0.05);
    case 'distance_time':
      return 0;
    default:
      return sets * reps * weightKg;
  }
}

// ============================================================================
// NUTRIAI v7 — MODUL 1: VALIDARE & RANDARE DINAMICĂ + FORMULE INTENSITATE
// ============================================================================

export type InputType =
  | 'hold'
  | 'bodyweight_reps'
  | 'weighted_reps'
  | 'reps'
  | 'reps_weight'
  | 'weight_reps'
  | 'timed'
  | 'timed_weight'
  | 'distance_time'
  | 'reps_assisted';

export interface SetInput {
  reps?: number;
  weight_kg?: number;
  time_seconds?: number;
  sets?: number;
}

export const FIELDS_BY_TYPE: Record<string, (keyof SetInput)[]> = {
  hold: ['time_seconds'],
  timed: ['time_seconds'],
  timed_weight: ['time_seconds', 'weight_kg'],
  bodyweight_reps: ['reps'],
  reps: ['reps'],
  weighted_reps: ['weight_kg', 'reps'],
  weight_reps: ['weight_kg', 'reps'],
  reps_weight: ['weight_kg', 'reps'],
  reps_assisted: ['weight_kg', 'reps'],
  distance_time: ['time_seconds'],
};

export function getFieldsForType(t: InputType | string): (keyof SetInput)[] {
  return FIELDS_BY_TYPE[t] || ['weight_kg', 'reps'];
}

export function validateSet(t: InputType | string, input: SetInput): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const fields = getFieldsForType(t);
  for (const field of fields) {
    const v = input[field];
    if (v === undefined || v === null || Number.isNaN(v)) {
      errors.push(`Câmpul "${field}" este obligatoriu.`);
    } else if (typeof v !== 'number' || v <= 0) {
      errors.push(`Câmpul "${field}" trebuie să fie un număr pozitiv.`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export const ISO_FACTOR = 0.15;

/**
 * Calculează intensitatea pe set pentru un anumit mușchi conform specificațiilor v7 (Secțiunea 1.4).
 */
export function setIntensity(
  set: SetInput,
  ex: {
    input_type?: string;
    type?: string;
    activation?: Record<string, number>;
    bw_load_ratio?: number;
  },
  muscle: string,
  bodyWeight: number
): number {
  const af = ex.activation?.[muscle] ?? 0;
  if (af <= 0) return 0;

  const type = ex.input_type || ex.type || 'weighted_reps';
  const reps = Number(set.reps) || 0;
  const weight_kg = Number(set.weight_kg) || 0;
  const time_seconds = Number(set.time_seconds) || 0;
  const sets = Number(set.sets) || 1;

  if (
    type === 'weighted_reps' ||
    type === 'weight_reps' ||
    type === 'reps_weight' ||
    type === 'reps_assisted'
  ) {
    const totalWeight = weight_kg > 0 ? weight_kg : bodyWeight * 0.8;
    return sets * reps * totalWeight * af;
  }

  if (type === 'bodyweight_reps' || type === 'reps') {
    const bwRatio = ex.bw_load_ratio ?? 0.65;
    return sets * reps * (bodyWeight * bwRatio) * af;
  }

  if (type === 'hold' || type === 'timed' || type === 'timed_weight') {
    const bwRatio = ex.bw_load_ratio ?? 0.65;
    return sets * time_seconds * (bodyWeight * bwRatio + weight_kg) * ISO_FACTOR * af;
  }

  return 0;
}
