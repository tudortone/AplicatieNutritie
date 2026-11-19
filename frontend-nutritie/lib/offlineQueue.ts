import { verificaReluareMasa } from './payloadMese';
import { insereazaMasaCuPoza } from './mealUtils';
import { anuntaMasaSalvataVerificat, marcheazaMeseModificate } from './freshnessMese';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const OFFLINE_QUEUE_KEY_LEGACY = '@nutri_offline_meals_queue';
export const OFFLINE_QUEUE_KEY_PREFIX = '@nutri_offline_meals_queue_';

export function getOfflineQueueKey(userId?: string | null): string {
  if (userId && typeof userId === 'string' && userId.trim().length > 0) {
    return `${OFFLINE_QUEUE_KEY_PREFIX}${userId.trim()}`;
  }
  return OFFLINE_QUEUE_KEY_LEGACY;
}

export interface MasaOfflinePayload {
  id: string;
  client_operation_id?: string;
  user_id: string;
  nume: string;
  calorii: number;
  proteine: number;
  grasimi: number;
  carbohidrati: number;
  fibre: number;
  tip_masa: string;
  alimente: unknown[];
  data: string;
  /** Opțional doar pentru intrările legacy create înainte de fixul V7. */
  ora?: string;
  created_at: string;
  imagine_url?: string | null;
}

export interface SupabaseEroare {
  message: string;
  code?: string;
  status?: number;
}

export interface SupabaseMinimalClient {
  auth?: {
    getUser?: () => Promise<{ data: { user: { id: string } | null }; error: unknown | null }>;
  };
  from: (table: string) => {
    insert: (payload: any) => PromiseLike<{ error: SupabaseEroare | null }> | Promise<{ error: SupabaseEroare | null }>;
  };
}

// Mesele offline au id UUID (generareUuid/generareUuidDeterminist). Intrarile
// vechi din coada (inainte de BUG-054) pot avea id de tip `offline-...` care nu
// este UUID valid — la insert il omitem ca serverul sa genereze unul, altfel
// am trimite un text in coloana UUID si am bloca sincronizarea (22P02).
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function esteUuidValid(v: string): boolean {
  return RE_UUID.test(v);
}

const inMemoryFallbackQueues = new Map<string, MasaOfflinePayload[]>();
const userQueueLocks = new Map<string, Promise<unknown>>();
const inFlightProcessByUser = new Map<string, Promise<{ procesate: number; esuate: number }>>();
const clearGenerationByUser = new Map<string, number>();
let globalClearGeneration = 0;

function queueLockKey(userId?: string | null): string {
  return userId && typeof userId === 'string' && userId.trim().length > 0
    ? userId.trim()
    : '__global__';
}

function getClearGeneration(userId: string): number {
  return globalClearGeneration + (clearGenerationByUser.get(userId) ?? 0);
}

function withUserQueueLock<T>(userId: string | null | undefined, fn: () => Promise<T>): Promise<T> {
  const key = queueLockKey(userId);
  const previous = userQueueLocks.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(fn);
  const tracked = next.finally(() => {
    if (userQueueLocks.get(key) === tracked) {
      userQueueLocks.delete(key);
    }
  });
  userQueueLocks.set(key, tracked);
  return next;
}

/**
 * Migrează datele dintr-o eventuală coadă globală veche (`@nutri_offline_meals_queue`)
 * în cozile specifice per utilizator (`@nutri_offline_meals_queue_<userId>`),
 * prevenind pierderea de date sau execuția cross-account.
 */
async function migreazaCoadaVecheDacaExista(): Promise<void> {
  try {
    const rawLegacy = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY_LEGACY);
    if (!rawLegacy) return;
    const parsedLegacy = JSON.parse(rawLegacy);
    if (Array.isArray(parsedLegacy) && parsedLegacy.length > 0) {
      const perUser: Record<string, MasaOfflinePayload[]> = {};
      for (const item of parsedLegacy) {
        if (item && typeof item === 'object' && item.user_id) {
          const uid = String(item.user_id).trim();
          if (!perUser[uid]) perUser[uid] = [];
          if (!perUser[uid].some((m) => m.id === item.id)) {
            perUser[uid].push(item);
          }
        }
      }
      for (const [uid, items] of Object.entries(perUser)) {
        const userKey = getOfflineQueueKey(uid);
        const existingRaw = await AsyncStorage.getItem(userKey);
        const existing: MasaOfflinePayload[] = existingRaw ? JSON.parse(existingRaw) : [];
        const merged = [...existing];
        for (const itm of items) {
          if (!merged.some((m) => m.id === itm.id)) {
            merged.push(itm);
          }
        }
        await AsyncStorage.setItem(userKey, JSON.stringify(merged));
      }
    }
    await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY_LEGACY);
  } catch (err) {
    if (__DEV__) console.warn('[OfflineQueue] Eroare la migrarea cozii legacy:', err);
  }
}

export async function getOfflineQueue(userId?: string | null): Promise<MasaOfflinePayload[]> {
  await migreazaCoadaVecheDacaExista();
  if (userId && typeof userId === 'string' && userId.trim().length > 0) {
    const key = getOfflineQueueKey(userId);
    try {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) return [...(inMemoryFallbackQueues.get(key) || [])];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [...(inMemoryFallbackQueues.get(key) || [])];
    }
  }

  // Când userId nu este specificat, agregăm toate elementele existente
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const userKeys = allKeys.filter((k) => k.startsWith(OFFLINE_QUEUE_KEY_PREFIX));
    if (userKeys.length === 0) {
      const legacyRaw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY_LEGACY);
      if (!legacyRaw) return [...(inMemoryFallbackQueues.get(OFFLINE_QUEUE_KEY_LEGACY) || [])];
      const parsed = JSON.parse(legacyRaw);
      return Array.isArray(parsed) ? parsed : [];
    }
    const entries = await AsyncStorage.multiGet(userKeys);
    const combined: MasaOfflinePayload[] = [];
    for (const [, val] of entries) {
      if (val) {
        try {
          const arr = JSON.parse(val);
          if (Array.isArray(arr)) combined.push(...arr);
        } catch {}
      }
    }
    return combined;
  } catch {
    const fallbackList: MasaOfflinePayload[] = [];
    for (const list of inMemoryFallbackQueues.values()) {
      fallbackList.push(...list);
    }
    return fallbackList;
  }
}

/**
 * F-11: intoarce `true` doar daca scrierea pe DISC a reusit.
 *
 * Inainte, semnatura era `Promise<void>` si inghitea orice eroare de la
 * AsyncStorage: coada cadea tacut pe copia din memorie, iar apelantii afisau
 * oricum „Salvat offline". Daca aplicatia era ucisa inainte de o sincronizare
 * (eveniment banal pe Android), masa disparea complet — desi utilizatorului i se
 * confirmase salvarea. Apelantii trebuie sa poata spune adevarul.
 */
export async function saveOfflineQueue(queue: MasaOfflinePayload[], userId?: string | null): Promise<boolean> {
  const key = getOfflineQueueKey(userId);
  inMemoryFallbackQueues.set(key, [...queue]);
  try {
    await AsyncStorage.setItem(key, JSON.stringify(queue));
    return true;
  } catch (err) {
    if (__DEV__) console.warn('[OfflineQueue] Eroare la salvarea pe disc:', err);
    return false;
  }
}

export async function pushOfflineMeal(payload: MasaOfflinePayload): Promise<number> {
  if (!payload || !payload.user_id) return 0;
  const userId = payload.user_id;
  return withUserQueueLock(userId, async () => {
    const current = await getOfflineQueue(userId);
    // Prevenim duplicatele după id
    if (current.some((item) => item.id === payload.id)) {
      return current.length;
    }
    const updated = [...current, payload];
    await saveOfflineQueue(updated, userId);
    return updated.length;
  });
}

/**
 * F-11: varianta care spune daca masa a ajuns cu adevarat pe disc.
 *
 * `pushOfflineMeal` isi pastreaza contractul (numarul de elemente din coada),
 * ca sa nu rupem apelantii existenti. Ecranele care confirma utilizatorului
 * „Salvat offline" trebuie insa sa foloseasca `persistat`: daca e `false`, masa
 * exista DOAR in memorie si dispare la inchiderea aplicatiei, deci mesajul
 * corect este unul de eroare, nu de succes.
 */
export async function pushOfflineMealVerificat(
  payload: MasaOfflinePayload,
): Promise<{ persistat: boolean; lungime: number; duplicat: boolean }> {
  if (!payload || !payload.user_id) return { persistat: false, lungime: 0, duplicat: false };
  const userId = payload.user_id;
  return withUserQueueLock(userId, async () => {
    const current = await getOfflineQueue(userId);
    if (current.some((item) => item.id === payload.id)) {
      return { persistat: true, lungime: current.length, duplicat: true };
    }
    const updated = [...current, payload];
    const persistat = await saveOfflineQueue(updated, userId);
    return { persistat, lungime: updated.length, duplicat: false };
  });
}

export async function popOfflineMeal(userId?: string | null): Promise<MasaOfflinePayload | null> {
  if (userId) {
    return withUserQueueLock(userId, async () => {
      const current = await getOfflineQueue(userId);
      if (current.length === 0) return null;
      const [removed, ...remaining] = current;
      await saveOfflineQueue(remaining, userId);
      return removed;
    });
  }

  const all = await getOfflineQueue();
  if (all.length === 0) return null;
  const [removed] = all;
  if (removed && removed.user_id) {
    await popOfflineMeal(removed.user_id);
  }
  return removed;
}

export async function clearOfflineQueue(userId?: string | null): Promise<void> {
  if (userId) {
    const uid = userId.trim();
    clearGenerationByUser.set(uid, (clearGenerationByUser.get(uid) ?? 0) + 1);
    await withUserQueueLock(uid, async () => {
      const key = getOfflineQueueKey(uid);
      inMemoryFallbackQueues.delete(key);
      try {
        await AsyncStorage.removeItem(key);
      } catch {}
    });
  } else {
    globalClearGeneration += 1;
    inMemoryFallbackQueues.clear();
    try {
      await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY_LEGACY);
      const allKeys = await AsyncStorage.getAllKeys();
      const userQueueKeys = allKeys.filter((k) => k.startsWith(OFFLINE_QUEUE_KEY_PREFIX));
      if (userQueueKeys.length > 0) {
        await AsyncStorage.multiRemove(userQueueKeys);
      }
    } catch {}
  }
}

export async function processOfflineQueue(
  supabaseClient: SupabaseMinimalClient,
  authenticatedUserId?: string | null,
): Promise<{ procesate: number; esuate: number }> {
  if (!supabaseClient) {
    return { procesate: 0, esuate: 0 };
  }

  // BUG-068: Determinăm utilizatorul autentificat curent. Niciodată nu procesăm
  // sau sincronizăm coada altui utilizator sub sesiunea utilizatorului activ.
  let activeUid = authenticatedUserId;
  if (!activeUid && typeof supabaseClient.auth?.getUser === 'function') {
    try {
      const { data } = await supabaseClient.auth.getUser();
      activeUid = data?.user?.id || null;
    } catch {}
  }

  if (!activeUid) {
    return { procesate: 0, esuate: 0 };
  }

  const normalizedUid = activeUid.trim();
  const existingRun = inFlightProcessByUser.get(normalizedUid);
  if (existingRun) {
    return existingRun;
  }

  const runPromise = (async (): Promise<{ procesate: number; esuate: number }> => {
    const startClearGen = getClearGeneration(normalizedUid);
    const queue = await withUserQueueLock(normalizedUid, () => getOfflineQueue(normalizedUid));
    const queueSnapshot = [...queue];
    if (queue.length === 0) {
      return { procesate: 0, esuate: 0 };
    }

    let procesate = 0;
    let esuate = 0;
    const pentruReincercare: MasaOfflinePayload[] = [];
    const sincronizate = new Set<string>();
    const deEliminat = new Set<string>();

    while (queue.length > 0) {
      if (getClearGeneration(normalizedUid) !== startClearGen) {
        break;
      }
      const masa = queue[0];

      if (masa.user_id !== normalizedUid) {
        queue.shift();
        deEliminat.add(masa.id);
        continue;
      }

      const clientOpId =
        typeof masa.client_operation_id === 'string' && masa.client_operation_id.trim() !== ''
          ? masa.client_operation_id.trim()
          : (esteUuidValid(masa.id) || (typeof masa.id === 'string' && masa.id.trim() !== '' && isNaN(Number(masa.id))))
            ? masa.id.trim()
            : undefined;

      try {
        const { error } = await insereazaMasaCuPoza(supabaseClient as never, {
          ...(clientOpId
            ? { client_operation_id: clientOpId }
            : !isNaN(Number(masa.id)) && typeof masa.id !== 'boolean'
            ? { id: Number(masa.id) }
            : {}),
          user_id: masa.user_id,
          nume: masa.nume,
          calorii: Math.round(Number(masa.calorii) || 0),
          proteine: Math.round(Number(masa.proteine) || 0),
          grasimi: Math.round(Number(masa.grasimi) || 0),
          carbohidrati: Math.round(Number(masa.carbohidrati) || 0),
          fibre: Math.round((Number(masa.fibre) || 0) * 10) / 10,
          tip_masa: masa.tip_masa,
          alimente: masa.alimente,
          data: masa.data,
          ora: masa.ora ?? null,
          created_at: masa.created_at,
          imagine_url: masa.imagine_url ?? null,
        });

        if (error) {
          if (error.code === '23505') {
            const verificare = await verificaReluareMasa(
              supabaseClient as never,
              {
                ...masa,
                ...(clientOpId ? { client_operation_id: clientOpId } : {}),
              } as unknown as { id: string } & Record<string, unknown>,
            );
            if (verificare.tip === 'reluare_confirmata') {
              queue.shift();
              sincronizate.add(masa.id);
              procesate++;
              continue;
            }
            if (verificare.tip === 'conflict_continut') {
              queue.shift();
              deEliminat.add(masa.id);
              esuate++;
              continue;
            }
            esuate++;
            break;
          }

          if (!error.code && !error.status) {
            esuate++;
            break;
          }

          queue.shift();
          pentruReincercare.push(masa);
          esuate++;
          continue;
        }

        queue.shift();
        sincronizate.add(masa.id);
        procesate++;
      } catch {
        esuate++;
        break;
      }
    }

    await withUserQueueLock(normalizedUid, async () => {
      // P0-07: Dacă coada a fost ștearsă în timpul flush-ului (logout/ștergere cont),
      // nu rescriem niciodată intrările vechi înapoi în AsyncStorage.
      if (getClearGeneration(normalizedUid) !== startClearGen) {
        return;
      }
      const ramase = new Map<string, MasaOfflinePayload>();
      for (const masa of [...queue, ...pentruReincercare]) ramase.set(masa.id, masa);

      const live = await getOfflineQueue(normalizedUid);
      const rezultat: MasaOfflinePayload[] = [];
      const vazute = new Set<string>();
      for (const masa of live) {
        if (sincronizate.has(masa.id) || deEliminat.has(masa.id)) continue;
        if (vazute.has(masa.id)) continue;
        vazute.add(masa.id);
        rezultat.push(ramase.get(masa.id) ?? masa);
      }
      for (const masa of pentruReincercare) {
        if (!vazute.has(masa.id)) {
          vazute.add(masa.id);
          rezultat.push(masa);
        }
      }

      await saveOfflineQueue(rezultat, normalizedUid);
    });

    if (procesate > 0 && getClearGeneration(normalizedUid) === startClearGen) {
      marcheazaMeseModificate(normalizedUid);
      const salvate = queueSnapshot.filter((masa) => sincronizate.has(masa.id));
      anuntaMasaSalvataVerificat(
        normalizedUid,
        salvate.map((masa) => masa.id),
        [...new Set(salvate.map((masa) => String(masa.data ?? masa.created_at ?? '').slice(0, 10)))],
      );
    }

    return { procesate, esuate };
  })();

  inFlightProcessByUser.set(normalizedUid, runPromise);
  try {
    return await runPromise;
  } finally {
    if (inFlightProcessByUser.get(normalizedUid) === runPromise) {
      inFlightProcessByUser.delete(normalizedUid);
    }
  }
}
