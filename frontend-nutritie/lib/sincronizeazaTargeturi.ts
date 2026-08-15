import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';

/**
 * REV-003: Izolare strictă a țintelor nutriționale per utilizator.
 * Țintele pending (salvate când rețeaua e indisponibilă) sunt stocate într-un
 * payload JSON scoped `@nutri_pending_macro_targets_${userId}` ce conține
 * { userId, targets, timestamp }.
 *
 * Previne contaminarea între conturi la switch / relogin și garantează că
 * un cont B nu poate citi sau sincroniza țintele contului A.
 */

export const PENDING_TARGETS_PREFIX = '@nutri_pending_macro_targets_';
export const TARGETURI_PENDING_PREFIX = PENDING_TARGETS_PREFIX;
export const TARGETURI_PENDING_KEY = 'targeturi_pending_sync';

export interface TargeturiValori {
  greutate?: number;
  greutateTinta?: number;
  caloriiTinta?: number;
  proteineTinta?: number;
  carbiTinta?: number;
  grasimiTinta?: number;
  nume?: string;
  avatar_url?: string;
}

export interface TargeturiPendingPayload {
  userId: string;
  targets: TargeturiValori;
  timestamp: string;
}

export function getPendingTargetsKey(userId: string): string {
  return `${PENDING_TARGETS_PREFIX}${userId.trim()}`;
}

export function getTargeturiPendingKey(userId?: string | null): string {
  if (userId && typeof userId === 'string' && userId.trim().length > 0) {
    return getPendingTargetsKey(userId);
  }
  return TARGETURI_PENDING_KEY;
}

/** Salvează țintele pending exclusiv în cheia scoped a utilizatorului autentificat. */
export async function salveazaTargeturiPending(
  userId: string,
  targets: TargeturiValori,
): Promise<void> {
  if (!userId || typeof userId !== 'string' || !userId.trim()) return;
  const payload: TargeturiPendingPayload = {
    userId: userId.trim(),
    targets,
    timestamp: new Date().toISOString(),
  };
  await AsyncStorage.setItem(getPendingTargetsKey(userId), JSON.stringify(payload));
}

/** Citește țintele pending doar dacă userId-ul din payload corespunde utilizatorului cerut. */
export async function citesteTargeturiPending(
  userId: string,
): Promise<TargeturiPendingPayload | null> {
  if (!userId || typeof userId !== 'string' || !userId.trim()) return null;
  try {
    const raw = await AsyncStorage.getItem(getPendingTargetsKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.userId !== userId.trim() || typeof parsed.targets !== 'object') {
      return null;
    }
    return parsed as TargeturiPendingPayload;
  } catch {
    return null;
  }
}

/** Șterge payload-ul pending pentru utilizator și curăță cheia legacy dacă există. */
export async function stergeTargeturiPending(userId: string): Promise<void> {
  if (!userId || typeof userId !== 'string' || !userId.trim()) return;
  await AsyncStorage.multiRemove([getPendingTargetsKey(userId), TARGETURI_PENDING_KEY]);
}

/**
 * Împinge țintele pending ale utilizatorului autentificat la server.
 * Idempotent: dacă nu există payload pentru `authenticatedUserId`, nu face nimic.
 * Nu va trimite NICIODATĂ țintele unui alt utilizator către contul curent.
 */
export async function sincronizeazaTargeturiLocale(
  authenticatedUserId?: string | null,
): Promise<boolean> {
  if (!authenticatedUserId || typeof authenticatedUserId !== 'string' || !authenticatedUserId.trim()) {
    return false;
  }

  const userId = authenticatedUserId.trim();

  try {
    const pendingPayload = await citesteTargeturiPending(userId);

    // Politică legacy sigură: dacă există doar cheia globală legacy fără ownership dovedit,
    // o eliminăm pentru a preveni atribuirea accidentală către contul curent.
    if (!pendingPayload) {
      await AsyncStorage.removeItem(TARGETURI_PENDING_KEY);
      return false;
    }

    if (pendingPayload.userId !== userId) {
      return false;
    }

    const { targets } = pendingPayload;
    const data: Record<string, any> = {};

    if (typeof targets.greutate === 'number' && Number.isFinite(targets.greutate)) {
      data.greutate = targets.greutate;
    }
    if (typeof targets.greutateTinta === 'number' && Number.isFinite(targets.greutateTinta)) {
      data.greutateTinta = targets.greutateTinta;
    }
    if (typeof targets.caloriiTinta === 'number' && Number.isFinite(targets.caloriiTinta)) {
      data.caloriiTinta = targets.caloriiTinta;
    }
    if (typeof targets.proteineTinta === 'number' && Number.isFinite(targets.proteineTinta)) {
      data.proteineTinta = targets.proteineTinta;
    }
    if (typeof targets.carbiTinta === 'number' && Number.isFinite(targets.carbiTinta)) {
      data.carbiTinta = targets.carbiTinta;
    }
    if (typeof targets.grasimiTinta === 'number' && Number.isFinite(targets.grasimiTinta)) {
      data.grasimiTinta = targets.grasimiTinta;
    }
    if (typeof targets.nume === 'string' && targets.nume.trim().length > 0) {
      data.nume = targets.nume.trim();
    }
    if (typeof targets.avatar_url === 'string' && targets.avatar_url.trim().length > 0) {
      data.avatar_url = targets.avatar_url.trim();
    }

    if (Object.keys(data).length === 0) {
      await stergeTargeturiPending(userId);
      return true;
    }

    const { error } = await supabase.auth.updateUser({ data });
    if (!error) {
      await stergeTargeturiPending(userId);
      return true;
    }

    return false;
  } catch {
    // Eșec de rețea / server indisponibil -> păstrăm payload-ul pentru retry
    return false;
  }
}
