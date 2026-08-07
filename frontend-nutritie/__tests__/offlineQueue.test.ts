import {
  pushOfflineMeal,
  getOfflineQueue,
  popOfflineMeal,
  clearOfflineQueue,
  processOfflineQueue,
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
    clear: jest.fn(async () => {
      store = {};
    }),
  };
});

describe('U-04 — Coadă offline FIFO pentru salvarea meselor', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await clearOfflineQueue();
  });

  const masaSample1: MasaOfflinePayload = {
    id: 'off_001',
    user_id: 'user_123',
    nume: 'Omletă cu legume (150g)',
    calorii: 250,
    proteine: 20,
    grasimi: 15,
    carbohidrati: 5,
    fibre: 0,
    tip_masa: 'mic_dejun',
    alimente: [{ nume: 'Omletă', grame: 150 }],
    data: '2026-08-07',
    created_at: new Date().toISOString(),
  };

  const masaSample2: MasaOfflinePayload = {
    id: 'off_002',
    user_id: 'user_123',
    nume: 'Piept de pui cu orez (300g)',
    calorii: 450,
    proteine: 40,
    grasimi: 8,
    carbohidrati: 50,
    fibre: 0,
    tip_masa: 'pranz',
    alimente: [{ nume: 'Piept pui', grame: 150 }, { nume: 'Orez', grame: 150 }],
    data: '2026-08-07',
    created_at: new Date().toISOString(),
  };

  test(' Adăugare mese în coadă menține ordinea FIFO și ignoră duplicatele', async () => {
    await pushOfflineMeal(masaSample1);
    await pushOfflineMeal(masaSample2);

    const queue = await getOfflineQueue();
    expect(queue.length).toBe(2);
    expect(queue[0].id).toBe('off_001');
    expect(queue[1].id).toBe('off_002');

    // Duplicate ID -> ignorat
    await pushOfflineMeal(masaSample1);
    const queueDup = await getOfflineQueue();
    expect(queueDup.length).toBe(2);
  });

  test('2. Extractie FIFO prin popOfflineMeal', async () => {
    await pushOfflineMeal(masaSample1);
    await pushOfflineMeal(masaSample2);

    const extras1 = await popOfflineMeal();
    expect(extras1?.id).toBe('off_001');

    const ramas = await getOfflineQueue();
    expect(ramas.length).toBe(1);
    expect(ramas[0].id).toBe('off_002');
  });

  test('3. processOfflineQueue trimite mesele în Supabase în ordine FIFO', async () => {
    await pushOfflineMeal(masaSample1);
    await pushOfflineMeal(masaSample2);

    const inserari: any[] = [];
    const supabaseFake = {
      from: (tabela: string) => ({
        insert: async (payload: any) => {
          if (tabela === 'mese') {
            inserari.push(payload);
            return { error: null };
          }
          return { error: null };
        },
      }),
    };

    const rezultat = await processOfflineQueue(supabaseFake);
    expect(rezultat.procesate).toBe(2);
    expect(rezultat.esuate).toBe(0);
    expect(inserari.length).toBe(2);
    expect(inserari[0].nume).toContain('Omletă');
    expect(inserari[1].nume).toContain('Piept de pui');

    const finalQueue = await getOfflineQueue();
    expect(finalQueue.length).toBe(0);
  });

  test('4. Când Supabase eșuează din nou, procesarea se oprește fără pierderea meselor rămas', async () => {
    await pushOfflineMeal(masaSample1);
    await pushOfflineMeal(masaSample2);

    const supabaseFail = {
      from: () => ({
        insert: async () => ({ error: new Error('Rețea indisponibilă') }),
      }),
    };

    const rezultat = await processOfflineQueue(supabaseFail);
    expect(rezultat.procesate).toBe(0);
    expect(rezultat.esuate).toBe(1);

    const queueRamasa = await getOfflineQueue();
    expect(queueRamasa.length).toBe(2);
  });
});
