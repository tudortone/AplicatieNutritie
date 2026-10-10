import { isValidBodyWeightKg } from './profileWeight';

export interface RecordedWeight {
  date: string;
  weightKg: number;
}

export type WeightProjection =
  | { status: 'unavailable'; reason: 'invalid_inputs' | 'insufficient_measurements' | 'goal_already_reached' | 'no_progress_toward_goal' }
  | { status: 'estimated'; targetDate: string; lastMeasurementDate: string; weeklyChangeKg: number; measurementCount: number };

export interface WeightProjectionInput {
  history: readonly RecordedWeight[];
  targetWeightKg: unknown;
  asOfDate: string;
}

const MIN_WEIGHT_KG = 30;
const MAX_WEIGHT_KG = 250;
const MIN_MEASUREMENTS = 3;
const MIN_SPAN_DAYS = 14;
const WINDOW_DAYS = 60;
const MAX_WEEKLY_CHANGE_RATIO = 0.005;
const MIN_WEEKLY_CHANGE_KG = 0.02;
const MAX_PROJECTION_DAYS = 365 * 5;

function validDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validWeight(value: unknown): value is number {
  return isValidBodyWeightKg(value) && value >= MIN_WEIGHT_KG && value <= MAX_WEIGHT_KG;
}

function daysBetween(start: string, end: string): number {
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  return Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86_400_000);
}

function addDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/** Sanitizes stored history without inventing a baseline or mutating storage. */
export function normalizeWeightHistory(raw: unknown, asOfDate: string): RecordedWeight[] {
  if (!Array.isArray(raw) || !validDateKey(asOfDate)) return [];
  const byDate = new Map<string, RecordedWeight>();
  for (const value of raw) {
    if (!value || typeof value !== 'object') continue;
    const row = value as Record<string, unknown>;
    const date = row.date ?? row.data;
    const weightKg = row.weightKg ?? row.greutate;
    if (!validDateKey(date) || date > asOfDate || !validWeight(weightKg)) continue;
    byDate.set(date, { date, weightKg });
  }
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}

export function latestMeasuredWeightKg(history: readonly RecordedWeight[]): number | null {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const measurement = history[index];
    if (measurement && validDateKey(measurement.date) && validWeight(measurement.weightKg)) return measurement.weightKg;
  }
  return null;
}

/**
 * Conservative projection from actual measured trend only. Dietary intake and
 * a calorie goal are deliberately not treated as energy expenditure. The
 * target date is anchored to the latest measurement, so it does not drift as
 * time passes without new user data.
 */
export function calculateConservativeWeightProjection(input: WeightProjectionInput): WeightProjection {
  if (!validDateKey(input.asOfDate) || !validWeight(input.targetWeightKg) || !Array.isArray(input.history)) {
    return { status: 'unavailable', reason: 'invalid_inputs' };
  }
  const measurements = normalizeWeightHistory(input.history, input.asOfDate);
  const latest = measurements[measurements.length - 1];
  if (!latest) return { status: 'unavailable', reason: 'insufficient_measurements' };
  const distance = Math.abs(latest.weightKg - input.targetWeightKg);
  if (distance < 0.1) return { status: 'unavailable', reason: 'goal_already_reached' };

  const window = measurements.filter((measurement) => daysBetween(measurement.date, latest.date) <= WINDOW_DAYS);
  const first = window[0];
  if (window.length < MIN_MEASUREMENTS || !first || daysBetween(first.date, latest.date) < MIN_SPAN_DAYS) {
    return { status: 'unavailable', reason: 'insufficient_measurements' };
  }

  const originDays = window.map((measurement) => daysBetween(first.date, measurement.date));
  const meanDay = originDays.reduce((sum, day) => sum + day, 0) / originDays.length;
  const meanWeight = window.reduce((sum, measurement) => sum + measurement.weightKg, 0) / window.length;
  const numerator = window.reduce((sum, measurement, index) => sum + (originDays[index]! - meanDay) * (measurement.weightKg - meanWeight), 0);
  const denominator = originDays.reduce((sum, day) => sum + (day - meanDay) ** 2, 0);
  if (denominator <= 0) return { status: 'unavailable', reason: 'insufficient_measurements' };

  const weeklyTrend = (numerator / denominator) * 7;
  const needsLoss = latest.weightKg > input.targetWeightKg;
  if (Math.abs(weeklyTrend) < MIN_WEEKLY_CHANGE_KG || (needsLoss && weeklyTrend >= 0) || (!needsLoss && weeklyTrend <= 0)) {
    return { status: 'unavailable', reason: 'no_progress_toward_goal' };
  }

  const weeklyChangeKg = Math.min(Math.abs(weeklyTrend), latest.weightKg * MAX_WEEKLY_CHANGE_RATIO);
  const daysToGoal = Math.ceil((distance / weeklyChangeKg) * 7);
  if (!Number.isFinite(daysToGoal) || daysToGoal <= 0 || daysToGoal > MAX_PROJECTION_DAYS) {
    return { status: 'unavailable', reason: 'no_progress_toward_goal' };
  }
  return {
    status: 'estimated',
    targetDate: addDays(latest.date, daysToGoal),
    lastMeasurementDate: latest.date,
    weeklyChangeKg: Math.round(weeklyChangeKg * 100) / 100,
    measurementCount: window.length,
  };
}
