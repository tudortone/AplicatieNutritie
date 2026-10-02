import { Masa } from '../types';
import { localDayKey } from './dateUtils';
import { aboneazaLaModificariMese } from './freshnessMese';

/**
 * Bounded In-Memory Journal Date Cache.
 *
 * Provides instant (< 1ms) retrieval of meals for recently accessed dates.
 * Features:
 * - Bounded size: Max 30 days (LRU eviction prevents memory leaks).
 * - Automatic deterministic invalidation via `aboneazaLaModificariMese`.
 * - Granular optimistic additions, updates, and deletions.
 */

export interface CachedDayData {
  dayKey: string;
  mese: Masa[];
  timestamp: number;
}

const MAX_CACHE_ENTRIES = 30;
const cacheMap = new Map<string, CachedDayData>();

/**
 * Retrieve cached meals for a given date key ('YYYY-MM-DD').
 * Returns undefined if not in cache.
 */
export function getCachedJournalDay(dayKey: string): Masa[] | undefined {
  const entry = cacheMap.get(dayKey);
  if (!entry) return undefined;

  // Refresh LRU position (delete and re-insert)
  cacheMap.delete(dayKey);
  cacheMap.set(dayKey, entry);

  // Return a cloned shallow array so consumer mutations don't corrupt cache
  return [...entry.mese];
}

/**
 * Check if meals for a date key are present in cache.
 */
export function hasCachedJournalDay(dayKey: string): boolean {
  return cacheMap.has(dayKey);
}

/**
 * Store meals for a given date key with LRU eviction.
 */
export function setCachedJournalDay(dayKey: string, mese: Masa[]): void {
  if (!dayKey || !Array.isArray(mese)) return;

  // If already exists, delete first to refresh LRU order
  if (cacheMap.has(dayKey)) {
    cacheMap.delete(dayKey);
  } else if (cacheMap.size >= MAX_CACHE_ENTRIES) {
    // Evict oldest entry (first item in Map)
    const oldestKey = cacheMap.keys().next().value;
    if (oldestKey) {
      cacheMap.delete(oldestKey);
    }
  }

  cacheMap.set(dayKey, {
    dayKey,
    mese: [...mese],
    timestamp: Date.now(),
  });
}

/**
 * Clear the entire journal cache (e.g. after user logout or global freshness signal).
 */
export function clearJournalCache(): void {
  cacheMap.clear();
}

/**
 * Invalidate a specific day key from cache.
 */
export function invalidateCachedJournalDay(dayKey: string): void {
  cacheMap.delete(dayKey);
}

/**
 * Optimistically add a meal to the cached day.
 */
export function optimisticAddCachedMeal(dayKey: string, meal: Masa): void {
  const entry = cacheMap.get(dayKey);
  if (!entry) return;

  if (meal?.id && entry.mese.some((m) => m.id === meal.id)) return;
  entry.mese = [meal, ...entry.mese];
  entry.timestamp = Date.now();
}

/**
 * Optimistically delete a meal from the cached day.
 */
export function optimisticDeleteCachedMeal(dayKey: string, mealId: string): void {
  const entry = cacheMap.get(dayKey);
  if (!entry) return;

  entry.mese = entry.mese.filter((m) => m.id !== mealId);
  entry.timestamp = Date.now();
}

/**
 * Optimistically update a meal in the cached day.
 */
export function optimisticUpdateCachedMeal(dayKey: string, meal: Masa): void {
  const entry = cacheMap.get(dayKey);
  if (!entry || !meal?.id) return;

  entry.mese = entry.mese.map((m) => (m.id === meal.id ? { ...m, ...meal } : m));
  entry.timestamp = Date.now();
}

/**
 * Get current cache size (used for diagnostics and tests).
 */
export function getJournalCacheSize(): number {
  return cacheMap.size;
}

// Deterministic subscription: whenever meals are modified anywhere in the app
// (AddMealBottomSheet, Photo AI, Coach, manual delete, quantity edit),
// clear the cache to guarantee fresh canonical data from Supabase.
aboneazaLaModificariMese((_userId) => {
  clearJournalCache();
});
