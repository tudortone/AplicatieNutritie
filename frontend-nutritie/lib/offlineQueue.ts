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

export interface SupabaseEroare {
  message: string;
  code?: string;
  status?: number;
}

export interface SupabaseMinimalClient {
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
  const pentruReincercare: MasaOfflinePayload[] = [];

  while (queue.length > 0) {
    const masa = queue[0];
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

  await saveOfflineQueue([...queue, ...pentruReincercare]);
  return { procesate, esuate };
}
