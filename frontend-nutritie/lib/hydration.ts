import { isValidBodyWeightKg } from './profileWeight';

export { isValidBodyWeightKg };

export const WATER_ML_PER_KG = 35;
export const WATER_GLASS_ML = 250;

export function calculateDailyWaterTargetMl(weightKg: unknown): number | null {
  if (!isValidBodyWeightKg(weightKg)) return null;
  return Math.round(weightKg * WATER_ML_PER_KG);
}

export function glassesToMilliliters(glasses: number): number {
  return glasses * WATER_GLASS_ML;
}
