const MIN_CURRENT_WEIGHT_KG = 30;
const MAX_CURRENT_WEIGHT_KG = 250;

export interface ProfileWeightSources {
  pendingKg?: unknown;
  metadataKg?: unknown;
  storedKg?: unknown;
}

export function isValidBodyWeightKg(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= MIN_CURRENT_WEIGHT_KG
    && value <= MAX_CURRENT_WEIGHT_KG;
}

function parseStoredWeight(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return isValidBodyWeightKg(parsed) ? parsed : null;
}

export function resolveProfileWeightKg({ pendingKg, metadataKg, storedKg }: ProfileWeightSources): number | null {
  if (isValidBodyWeightKg(pendingKg)) return pendingKg;
  if (isValidBodyWeightKg(metadataKg)) return metadataKg;
  return parseStoredWeight(storedKg);
}
