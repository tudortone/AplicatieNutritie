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

  test('BUG-018 — procesarea pastreaza created_at-ul consumului, nu server-now', async () => {
    const createdAt = '2026-08-05T19:30:00.000Z';
    const masaCuTimestamp = {
      ...masaSample1,
      id: 'off_018',
      created_at: createdAt,
      imagine_url: 'https://ik.imagekit.io/x/foto.jpg',
    };
    await pushOfflineMeal(masaCuTimestamp);

    const inserari: any[] = [];
    const supabaseFake = {
      from: () => ({
        insert: async (payload: any) => {
          inserari.push(payload);
          return { error: null };
        },
      }),
    };

    const rezultat = await processOfflineQueue(supabaseFake as any);
    expect(rezultat.procesate).toBe(1);
    expect(inserari[0].created_at).toBe(createdAt);
    expect(inserari[0].imagine_url).toBe('https://ik.imagekit.io/x/foto.jpg');
    expect(inserari[0].data).toBe(masaSample1.data);
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

  test('BUG-054 — 23505 (deja inserat) e tratat idempotent, fără duplicat în coadă', async () => {
    const idUuid = '11111111-1111-4111-8111-111111111111';
    await pushOfflineMeal({ ...masaSample1, id: idUuid });

    const inserari: any[] = [];
    const supabaseFake = {
      from: () => ({
        insert: async (payload: any) => {
          inserari.push(payload);
          return { error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
        },
      }),
    };

    const rezultat = await processOfflineQueue(supabaseFake as any);
    // id-ul UUID e trimis în insert, ca PK-ul să poată detecta duplicatul
    expect(inserari[0].id).toBe(idUuid);
    expect(rezultat.procesate).toBe(1);
    expect(rezultat.esuate).toBe(0);

    const finalQueue = await getOfflineQueue();
    expect(finalQueue.length).toBe(0);
  });

  test('BUG-060 — un payload respins de server nu mai blochează restul cozii', async () => {
    const idUuid1 = '11111111-1111-4111-8111-111111111111';
    const idUuid2 = '22222222-2222-4222-8222-222222222222';
    await pushOfflineMeal({ ...masaSample1, id: idUuid1 });
    await pushOfflineMeal({ ...masaSample2, id: idUuid2 });

    const inserari: any[] = [];
    const supabaseFake = {
      from: () => ({
        insert: async (payload: any) => {
          inserari.push(payload);
          if (payload.id === idUuid1) {
            // Serverul respinge ACEST payload (nu e eroare de rețea)
            return { error: { code: '22P02', status: 400, message: 'invalid input syntax' } };
          }
          return { error: null };
        },
      }),
    };

    const rezultat = await processOfflineQueue(supabaseFake as any);
    // a doua masă a fost procesată chiar dacă prima a fost respinsă permanent
    expect(inserari.length).toBe(2);
    expect(rezultat.procesate).toBe(1);
    expect(rezultat.esuate).toBe(1);

    const finalQueue = await getOfflineQueue();
    expect(finalQueue.length).toBe(1);
    expect(finalQueue[0].id).toBe(idUuid1); // item respins reîncadrat pentru reîncercare
  });
});
