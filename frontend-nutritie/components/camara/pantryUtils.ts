import type { ProdusCamara } from '../../hooks/useCamara';
import { calculateDaysUntilExpiry } from '../../hooks/useDaysUntilExpiry';

export type PantryFilter = 'all' | 'expiring' | 'low' | 'frozen' | 'ambient';
export type PantrySort = 'urgency' | 'low_stock' | 'alpha' | 'recent';
export type PantryExpiryStatus = 'frozen' | 'expired' | 'danger' | 'warning' | 'fresh';

export interface PantryExpiryMeta {
  daysLeft: number;
  progress: number;
  status: PantryExpiryStatus;
}

const DAY_MS = 86_400_000;
export const LOW_STOCK_GRAMS_THRESHOLD = 150;

export function normalizePantryText(text: string): string {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function computeExpiryMeta(item: ProdusCamara, nowMs: number = Date.now()): PantryExpiryMeta {
  const fallbackDays = item.is_congelat ? 90 : 14;
  const computedDays = calculateDaysUntilExpiry(item.data_expirare);
  const daysLeft =
    computedDays !== null
      ? computedDays
      : typeof item.zile_valabilitate === 'number'
        ? item.zile_valabilitate
        : fallbackDays;

  if (item.is_congelat) {
    const frozenProgress = Math.min(1, Math.max(0.15, daysLeft / 90));
    return { daysLeft: Math.max(0, daysLeft), progress: frozenProgress, status: 'frozen' };
  }

  let windowDays = fallbackDays;
  if (item.data_expirare && item.created_at) {
    const start = new Date(item.created_at).getTime();
    const end = new Date(item.data_expirare).getTime();
    if (!Number.isNaN(start) && !Number.isNaN(end) && end > start) {
      windowDays = Math.max(1, Math.round((end - start) / DAY_MS));
    }
  } else if (typeof item.zile_valabilitate === 'number' && item.zile_valabilitate > 0) {
    windowDays = Math.max(windowDays, item.zile_valabilitate);
  }

  // Fallback for fractional hours when data_expirare is set today
  let msProgress = Math.min(1, Math.max(0, daysLeft / windowDays));
  if (item.data_expirare) {
    const expMs = new Date(item.data_expirare).getTime();
    if (!Number.isNaN(expMs)) {
      const startMs = item.created_at ? new Date(item.created_at).getTime() : expMs - windowDays * DAY_MS;
      const totalSpan = Math.max(expMs - (Number.isNaN(startMs) ? expMs - windowDays * DAY_MS : startMs), DAY_MS);
      msProgress = Math.min(1, Math.max(0, (expMs - nowMs) / totalSpan));
    }
  }

  let status: PantryExpiryStatus = 'fresh';
  if (daysLeft < 0) status = 'expired';
  else if (daysLeft <= 1) status = 'danger';
  else if (daysLeft <= 3) status = 'warning';

  const visualProgress = status === 'expired' ? 0.06 : Math.max(0.1, msProgress);
  return { daysLeft, progress: visualProgress, status };
}

export function isLowStockItem(item: ProdusCamara): boolean {
  if (typeof item.cantitate_g === 'number' && item.cantitate_g > 0) {
    return item.cantitate_g <= LOW_STOCK_GRAMS_THRESHOLD;
  }
  return (item.cantitate || 1) <= 1;
}

export function isExpiringSoonItem(item: ProdusCamara, nowMs: number = Date.now()): boolean {
  if (item.is_congelat) return false;
  return computeExpiryMeta(item, nowMs).daysLeft <= 3;
}

export function matchesPantryQuery(item: ProdusCamara, query: string): boolean {
  const q = normalizePantryText(query);
  if (!q) return true;
  if (normalizePantryText(item.nume).includes(q)) return true;
  if (item.brand && normalizePantryText(item.brand).includes(q)) return true;
  if (item.barcode && item.barcode.toLowerCase().includes(q)) return true;
  return false;
}

export function matchesPantryFilter(item: ProdusCamara, filter: PantryFilter, nowMs: number = Date.now()): boolean {
  switch (filter) {
    case 'expiring':
      return isExpiringSoonItem(item, nowMs);
    case 'low':
      return isLowStockItem(item);
    case 'frozen':
      return Boolean(item.is_congelat);
    case 'ambient':
      return !item.is_congelat;
    case 'all':
    default:
      return true;
  }
}

export function sortPantryItems(items: ProdusCamara[], sortMode: PantrySort, nowMs: number = Date.now()): ProdusCamara[] {
  const copy = [...items];
  copy.sort((a, b) => {
    if (sortMode === 'alpha') {
      return a.nume.localeCompare(b.nume);
    }
    if (sortMode === 'recent') {
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    }
    if (sortMode === 'low_stock') {
      const lowDiff = Number(isLowStockItem(b)) - Number(isLowStockItem(a));
      if (lowDiff !== 0) return lowDiff;
      const aMeasure = typeof a.cantitate_g === 'number' && a.cantitate_g > 0 ? a.cantitate_g : (a.cantitate || 1) * 100;
      const bMeasure = typeof b.cantitate_g === 'number' && b.cantitate_g > 0 ? b.cantitate_g : (b.cantitate || 1) * 100;
      return aMeasure - bMeasure;
    }
    // 'urgency': non-frozen sooner-to-expire first, then frozen by daysLeft, then newest
    const metaA = computeExpiryMeta(a, nowMs);
    const metaB = computeExpiryMeta(b, nowMs);
    if (Boolean(a.is_congelat) !== Boolean(b.is_congelat)) {
      return a.is_congelat ? 1 : -1;
    }
    if (metaA.daysLeft !== metaB.daysLeft) {
      return metaA.daysLeft - metaB.daysLeft;
    }
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
  });
  return copy;
}
