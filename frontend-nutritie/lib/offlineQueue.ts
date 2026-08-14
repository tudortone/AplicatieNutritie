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

export async function saveOfflineQueue(queue: MasaOfflinePayload[], userId?: string | null): Promise<void> {
  const key = getOfflineQueueKey(userId);
  inMemoryFallbackQueues.set(key, [...queue]);
  try {
    await AsyncStorage.setItem(key, JSON.stringify(queue));
  } catch (err) {
    if (__DEV__) console.warn('[OfflineQueue] Eroare la salvarea pe disc:', err);
  }
}

export async function pushOfflineMeal(payload: MasaOfflinePayload): Promise<number> {
  if (!payload || !payload.user_id) return 0;
  const userId = payload.user_id;
  const current = await getOfflineQueue(userId);
  // Prevenim duplicatele după id
  if (current.some((item) => item.id === payload.id)) {
    return current.length;
  }
  const updated = [...current, payload];
  await saveOfflineQueue(updated, userId);
  return updated.length;
}

export async function popOfflineMeal(userId?: string | null): Promise<MasaOfflinePayload | null> {
  if (userId) {
    const current = await getOfflineQueue(userId);
    if (current.length === 0) return null;
    const [removed, ...remaining] = current;
    await saveOfflineQueue(remaining, userId);
    return removed;
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
    const key = getOfflineQueueKey(userId);
    inMemoryFallbackQueues.delete(key);
    try {
      await AsyncStorage.removeItem(key);
    } catch {}
  } else {
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

  let queue = await getOfflineQueue(activeUid);
  if (queue.length === 0) {
    return { procesate: 0, esuate: 0 };
  }

  let procesate = 0;
  let esuate = 0;
  const pentruReincercare: MasaOfflinePayload[] = [];

  while (queue.length > 0) {
    const masa = queue[0];

    // Gardă strictă de izolare cont: dacă un item are user_id diferit de utilizatorul
    // conectat, nu îl trimitem în Supabase (ar pica la RLS sau ar polua DB-ul).
    if (masa.user_id !== activeUid) {
      queue.shift();
      continue;
    }

    try {
      const { error } = await supabaseClient.from('mese').insert({
        // BUG-054: trimitem id-ul deterministic al meselor offline. Daca un sync
        // partial a inserat deja randul, PK-ul UUID (23505) il detecteaza si
        // tratam eroarea ca succes — fara masa duplicata la reluare.
        ...(esteUuidValid(masa.id) ? { id: masa.id } : {}),
        user_id: masa.user_id,
        nume: masa.nume,
        calorii: masa.calorii,
        proteine: masa.proteine,
        grasimi: masa.grasimi,
        carbohidrati: masa.carbohidrati,
        fibre: masa.fibre,
        tip_masa: masa.tip_masa,
        alimente: masa.alimente,
        data: masa.data,
        // BUG-018: fara created_at, DB pune server-now si masa offline ajunge in
        // ziua sincronizarii, nu in ziua consumului (useMeseAzi filtreaza dupa
        // created_at). Tinem timestamp-ul din momentul salvarii.
        created_at: masa.created_at,
        imagine_url: masa.imagine_url ?? null,
      });

      if (error) {
        if (error.code === '23505') {
          // BUG-054: rand deja inserat de o sincronizare partiala precedenta
          // (insertul a ajuns la DB, dar pop-ul din coada a esuat). Idempotent:
          // il scoatem din coada si il consideram procesat, fara duplicat.
          queue.shift();
          procesate++;
          continue;
        }

        if (!error.code && !error.status) {
          // Eroare de transport (fara cod Postgres/status HTTP) — reteaua e
          // indisponibila. Oprim pasul ca sa pastram ordinea FIFO si mesajele.
          esuate++;
          break;
        }

        // BUG-060: serverul a raspuns cu o eroare pentru ACEST payload (ex.
        // constraint, payload invalid). Un singur item respins NU mai blocheaza
        // restul cozii: il reincadram la final pentru o reincercare ulterioara
        // si continuam cu urmatoarele (daca totul s-ar bloca pe primul, restul
        // meselor offline nu s-ar sincroniza niciodata).
        queue.shift();
        pentruReincercare.push(masa);
        esuate++;
        continue;
      }

      // Succes -> scoatem primul element din coadă
      queue.shift();
      procesate++;
    } catch {
      // Eroare lansata (fetch rejected) — tot retea indisponibila. Pastram masa.
      esuate++;
      break;
    }
  }

  await saveOfflineQueue([...queue, ...pentruReincercare], activeUid);
  return { procesate, esuate };
}
