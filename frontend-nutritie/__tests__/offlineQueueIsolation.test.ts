import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  pushOfflineMeal,
  getOfflineQueue,
  clearOfflineQueue,
  processOfflineQueue,
  getOfflineQueueKey,
  OFFLINE_QUEUE_KEY_LEGACY,
  MasaOfflinePayload,
} from '../lib/offlineQueue';

jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn(async (key: string) => store[key] || null),
    setItem: jest.fn(async (key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn(async (key: string) => {
      delete store[key];
    }),
    multiRemove: jest.fn(async (keys: string[]) => {
      for (const k of keys) delete store[k];
    }),
    getAllKeys: jest.fn(async () => Object.keys(store)),
    clear: jest.fn(async () => {
      store = {};
    }),
  };
});

describe('BUG-068 — Izolarea cozii offline per utilizator și migrare legacy', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await clearOfflineQueue();
  });

  const mealUserA: MasaOfflinePayload = {
    id: '11111111-1111-4111-8111-111111111111',
    user_id: 'user_A',
    nume: 'Mic Dejun User A',
    calorii: 350,
    proteine: 25,
    grasimi: 12,
    carbohidrati: 30,
    fibre: 4,
    tip_masa: 'mic_dejun',
    alimente: [{ nume: 'Ouă', grame: 100 }],
    data: '2026-08-14',
    created_at: '2026-08-14T08:00:00.000Z',
  };

  const mealUserB: MasaOfflinePayload = {
    id: '22222222-2222-4222-8222-222222222222',
    user_id: 'user_B',
    nume: 'Prânz User B',
    calorii: 600,
    proteine: 45,
    grasimi: 20,
    carbohidrati: 60,
    fibre: 6,
    tip_masa: 'pranz',
    alimente: [{ nume: 'Somon cu cartofi', grame: 250 }],
    data: '2026-08-14',
    created_at: '2026-08-14T13:00:00.000Z',
  };

  test('1. Cheia de stocare este izolată per utilizator', () => {
    expect(getOfflineQueueKey('user_A')).toBe('@nutri_offline_meals_queue_user_A');
    expect(getOfflineQueueKey('user_B')).toBe('@nutri_offline_meals_queue_user_B');
    expect(getOfflineQueueKey(null)).toBe('@nutri_offline_meals_queue');
  });

  test('2. Salvarea meselor din contul A nu este vizibilă în contul B', async () => {
    await pushOfflineMeal(mealUserA);
    await pushOfflineMeal(mealUserB);

    const queueA = await getOfflineQueue('user_A');
    const queueB = await getOfflineQueue('user_B');

    expect(queueA.length).toBe(1);
    expect(queueA[0].id).toBe(mealUserA.id);
    expect(queueA[0].user_id).toBe('user_A');

    expect(queueB.length).toBe(1);
    expect(queueB[0].id).toBe(mealUserB.id);
    expect(queueB[0].user_id).toBe('user_B');
  });

  test('3. processOfflineQueue sub sesiunea User A procesează DOAR mesele lui User A', async () => {
    await pushOfflineMeal(mealUserA);
    await pushOfflineMeal(mealUserB);

    const inserari: any[] = [];
    const supabaseUserA = {
      auth: { getUser: async () => ({ data: { user: { id: 'user_A' } }, error: null }) },
      from: () => ({
        insert: async (payload: any) => {
          inserari.push(payload);
          return { error: null };
        },
      }),
    };

    const resA = await processOfflineQueue(supabaseUserA as any, 'user_A');
    expect(resA.procesate).toBe(1);
    expect(resA.esuate).toBe(0);
    expect(inserari.length).toBe(1);
    expect(inserari[0].user_id).toBe('user_A');
    expect(inserari[0].nume).toBe('Mic Dejun User A');

    // Coada lui User A este acum goală
    const queueAFinal = await getOfflineQueue('user_A');
    expect(queueAFinal.length).toBe(0);

    // Coada lui User B a rămas neatinsă
    const queueBFinal = await getOfflineQueue('user_B');
    expect(queueBFinal.length).toBe(1);
    expect(queueBFinal[0].id).toBe(mealUserB.id);
  });

  test('4. Migrează automat coada veche nespecifică (legacy) în cozi per utilizator', async () => {
    // Simulăm o coadă legacy rămasă din versiuni anterioare
    const legacyItems = [mealUserA, mealUserB];
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY_LEGACY, JSON.stringify(legacyItems));

    // La primul apel getOfflineQueue, migrarea se execută transparent
    const queueA = await getOfflineQueue('user_A');
    const queueB = await getOfflineQueue('user_B');

    expect(queueA.length).toBe(1);
    expect(queueA[0].id).toBe(mealUserA.id);

    expect(queueB.length).toBe(1);
    expect(queueB[0].id).toBe(mealUserB.id);

    // Cheia legacy este curățată
    const legacyRaw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY_LEGACY);
    expect(legacyRaw).toBeNull();
  });
});
