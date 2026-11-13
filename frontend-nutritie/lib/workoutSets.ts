/**
 * workoutSets.ts — sursa unică pentru "cum se măsoară" un exercițiu.
 *
 * Ecranul de antrenament folosea aceleași două câmpuri (greutate + repetări)
 * pentru orice exercițiu, deși catalogul definește deja `masurare`.
 * Pentru plank asta însemna "kg × repetări", ceea ce nu are sens.
 */

import { classifyMeasurement, type MeasurementSpec } from './measurement';
import type { Exercitiu } from '../constants/exercitii';
import { sportI18n as i18n, type SportTranslateFn } from './sportI18n';
import type { SetExercitiu } from '../hooks/useAntrenamente';

const defaultT: SportTranslateFn = (key, opts) => i18n.t(key, opts);

/** Un set logat. `time_seconds` este citit deja de fitnessEngine pentru exercițiile izometrice. */
export type LoggedSet = SetExercitiu & { time_seconds?: number };

export type SetFields = {
  spec: MeasurementSpec;
  usesReps: boolean;
  usesTime: boolean;
  usesWeight: boolean;
  weightRequired: boolean;
  /** Etichetă scurtă afișată pe cardul exercițiului. */
  modeLabel: string;
};

const TIMED_TYPES = new Set(['timed', 'timed_weight', 'hold', 'distance_time']);
const NO_WEIGHT_TYPES = new Set(['reps', 'timed', 'bodyweight_reps', 'distance_time']);

export function resolveMeasurement(ex?: Partial<Exercitiu> | null): MeasurementSpec {
  if (!ex) return classifyMeasurement({ nume: '' });
  if (ex.masurare) return ex.masurare;
  return classifyMeasurement({
    nume: String(ex.nume ?? ''),
    categorie: ex.categorie ? String(ex.categorie) : undefined,
    echipament: ex.echipament,
  });
}

export function getSetFields(
  ex?: Partial<Exercitiu> | null,
  t: SportTranslateFn = defaultT,
): SetFields {
  const spec = resolveMeasurement(ex);
  const usesTime = TIMED_TYPES.has(spec.type);
  const usesReps = !usesTime;
  const usesWeight = spec.allowsWeight && !NO_WEIGHT_TYPES.has(spec.type);
  const weightRequired = usesWeight && !spec.weightOptional;

  let modeLabel = t('sport.measurement.modes.weight_reps');
  if (spec.type === 'timed') modeLabel = t('sport.measurement.modes.timed');
  else if (spec.type === 'timed_weight') modeLabel = t('sport.measurement.modes.timed_weight');
  else if (spec.type === 'distance_time') modeLabel = t('sport.measurement.modes.distance_time');
  else if (spec.type === 'reps') modeLabel = t('sport.measurement.modes.reps');
  else if (spec.type === 'reps_weight') modeLabel = t('sport.measurement.modes.reps_weight');
  else if (spec.type === 'reps_assisted') modeLabel = t('sport.measurement.modes.reps_assisted');

  return { spec, usesReps, usesTime, usesWeight, weightRequired, modeLabel };
}

export function formatSeconds(
  totalSeconds: number,
  t: SportTranslateFn = defaultT,
): string {
  const value = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return minutes > 0
    ? `${minutes}:${String(seconds).padStart(2, '0')} ${t('sport.measurement.units.min')}`
    : `${seconds}${t('sport.measurement.units.secShort')}`;
}

export function formatWeight(value?: number | null): string {
  const numeric = Number(value) || 0;
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1).replace(/\.0$/, '');
}

/** Text scurt pentru un set, adaptat tipului de măsurare. */
export function describeSet(
  set: LoggedSet,
  fields: SetFields,
  t: SportTranslateFn = defaultT,
): string {
  if (fields.usesTime) {
    const base = formatSeconds(set.time_seconds ?? 0, t);
    return fields.usesWeight && (set.greutate ?? 0) > 0
      ? `${base} · ${formatWeight(set.greutate)} ${t('sport.measurement.units.kg')}`
      : base;
  }
  const reps = `${Math.max(0, Number(set.repetari) || 0)} ${t('sport.measurement.units.repShort')}`;
  if (!fields.usesWeight || (set.greutate ?? 0) <= 0) return reps;
  return `${formatWeight(set.greutate)} ${t('sport.measurement.units.kg')} × ${reps}`;
}

export type ExerciseSummary = {
  sets: number;
  workingSets: number;
  reps: number;
  seconds: number;
  volumeKg: number;
  bestWeightKg: number;
};

export function summarizeSets(sets: LoggedSet[] | undefined, fields: SetFields): ExerciseSummary {
  const summary: ExerciseSummary = { sets: 0, workingSets: 0, reps: 0, seconds: 0, volumeKg: 0, bestWeightKg: 0 };
  for (const set of sets ?? []) {
    summary.sets += 1;
    const isWarmup = set.set_type === 'warmup';
    if (!isWarmup) summary.workingSets += 1;
    const weight = Math.max(0, Number(set.greutate) || 0);
    const reps = Math.max(0, Number(set.repetari) || 0);
    const seconds = Math.max(0, Number(set.time_seconds) || 0);
    summary.reps += reps;
    summary.seconds += seconds;
    if (weight > summary.bestWeightKg) summary.bestWeightKg = weight;
    if (!isWarmup && !fields.usesTime) summary.volumeKg += weight * reps;
  }
  return summary;
}

/** Rezumat pentru lista "ce ai lucrat": "3 seturi · 450 kg" sau "3 seturi · 2:15 min". */
export function summaryLabel(
  summary: ExerciseSummary,
  fields: SetFields,
  t: SportTranslateFn = defaultT,
): string {
  const setsLabel = `${summary.sets} ${
    summary.sets === 1 ? t('sport.measurement.setSingular') : t('sport.measurement.setPlural')
  }`;
  if (fields.usesTime) return `${setsLabel} · ${formatSeconds(summary.seconds, t)}`;
  if (summary.volumeKg > 0) {
    return `${setsLabel} · ${t('sport.measurement.volumeKgLabel', { kg: Math.round(summary.volumeKg) })}`;
  }
  return `${setsLabel} · ${summary.reps} ${t('sport.measurement.units.repShort')}`;
}

/** Un set este valid doar dacă are valoarea cerută de tipul său de măsurare. */
export function validateLoggedSet(
  set: LoggedSet,
  fields: SetFields,
  t: SportTranslateFn = defaultT,
): string | null {
  if (fields.usesTime) {
    if ((set.time_seconds ?? 0) <= 0) return t('sport.measurement.errors.startTimerOrDuration');
  } else if ((Number(set.repetari) || 0) <= 0) {
    return t('sport.measurement.errors.enterValidReps');
  }
  if (fields.weightRequired && (Number(set.greutate) || 0) <= 0) {
    return t('sport.measurement.errors.enterWeightForEx');
  }
  return null;
}
