import AsyncStorage from '@react-native-async-storage/async-storage';

const OFFLINE_QUEUE_KEY = '@nutri_offline_meals_queue';

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

export interface SupabaseMinimalClient {
  from: (table: string) => {
    insert: (payload: any) => PromiseLike<{ error: { message: string } | null }> | Promise<{ error: { message: string } | null }>;
  };
}



let inMemoryFallbackQueue: MasaOfflinePayload[] = [];


export async function getOfflineQueue(): Promise<MasaOfflinePayload[]> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [...inMemoryFallbackQueue];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [...inMemoryFallbackQueue];
  }
}

export async function saveOfflineQueue(queue: MasaOfflinePayload[]): Promise<void> {
  inMemoryFallbackQueue = [...queue];
  try {
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    if (__DEV__) console.warn('[OfflineQueue] Eroare la salvarea pe disc:', err);
  }
}

export async function pushOfflineMeal(payload: MasaOfflinePayload): Promise<number> {
  const current = await getOfflineQueue();
  // Prevenim duplicatele după id
  if (current.some((item) => item.id === payload.id)) {
    return current.length;
  }
  const updated = [...current, payload];
  await saveOfflineQueue(updated);
  return updated.length;
}

export async function popOfflineMeal(): Promise<MasaOfflinePayload | null> {
  const current = await getOfflineQueue();
  if (current.length === 0) return null;
  const [removed, ...remaining] = current;
  await saveOfflineQueue(remaining);
  return removed;
}

export async function clearOfflineQueue(): Promise<void> {
  inMemoryFallbackQueue = [];
  try {
    await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY);
  } catch {
    // Ignoră erorile la curățare
  }
}

export async function processOfflineQueue(supabaseClient: SupabaseMinimalClient): Promise<{ procesate: number; esuate: number }> {
  let queue = await getOfflineQueue();
  if (queue.length === 0 || !supabaseClient) {
    return { procesate: 0, esuate: 0 };
  }

  let procesate = 0;
  let esuate = 0;

  while (queue.length > 0) {
    const masa = queue[0];
    try {
      const { error } = await supabaseClient.from('mese').insert({
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
        // Dacă e o eroare de rețea/server (ex: conexiune indisponibilă), oprim procesarea ca să păstrăm ordinea FIFO
        esuate++;
        break;
      }

      // Succes -> scoatem primul element din coadă
      queue.shift();
      procesate++;
      await saveOfflineQueue(queue);
    } catch {
      esuate++;
      break;
    }
  }

  return { procesate, esuate };
}
