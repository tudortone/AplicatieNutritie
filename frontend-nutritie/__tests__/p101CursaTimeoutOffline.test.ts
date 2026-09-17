import AsyncStorage from '@react-native-async-storage/async-storage';

import { construiestePayloadMasaManuala } from '../lib/payloadMese';
import {
  pushOfflineMealVerificat,
  processOfflineQueue,
  clearOfflineQueue,
  type MasaOfflinePayload,
  type SupabaseMinimalClient,
} from '../lib/offlineQueue';

/**
 * P1-01 — cursa TIMEOUT ↔ COADĂ OFFLINE (defectul D2).
 *
 * ==========================================================================
 * SCENARIUL REAL
 * ==========================================================================
 * Timeout-ul de 9s din `AddMealBottomSheet` este LOCAL. Serverul poate reuși
 * exact în timp ce clientul renunță:
 *
 *   1. INSERT online reușește în Postgres
 *   2. răspunsul întârzie / se pierde
 *   3. timeout-ul clientului se declanșează
 *   4. masa intră în coada offline
 *   5. reluarea cozii inserează AL DOILEA rând
 *
 * Cauza: payload-ul online nu avea deloc `id` (DB genera `gen_random_uuid()`),
 * iar payload-ul offline primea un `generareUuid()` NOU, fără legătură cu rândul
 * deja scris. Două rânduri dintr-o singură acțiune a utilizatorului.
 *
 * Remedierea: aceeași acțiune logică → același `id` derivat din `idOperatie`,
 * deci reluarea din coadă se ciocnește pe cheia primară (23505), tratată ca
 * „deja sincronizat".
 */

jest.mock('@react-native-async-storage/async-storage', () => {
  const stocare = new Map<string, string>();
  return {
    getItem: jest.fn(async (k: string) => stocare.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => { stocare.set(k, v); }),
    removeItem: jest.fn(async (k: string) => { stocare.delete(k); }),
    getAllKeys: jest.fn(async () => [...stocare.keys()]),
    multiRemove: jest.fn(async (chei: string[]) => { chei.forEach((k) => stocare.delete(k)); }),
    __stocare: stocare,
  };
});

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/** Postgres simulat: cheia primară `mese.id` este singura autoritate de unicitate. */
function creeazaBazaDate() {
  const randuri = new Map<string, Record<string, unknown>>();
  const inserturi: Record<string, unknown>[] = [];
  const client: SupabaseMinimalClient = {
    from: () => ({
      // P1-01: verificarea reluării citește rândul persistat pe 23505; fake-ul
      // trebuie să modeleze această citire, altfel contractul nu e exercitat.
      select: () => ({
        eq: (_coloana: string, valoare: string) => ({
          maybeSingle: async () => ({ data: randuri.get(valoare) ?? null, error: null }),
        }),
      }),
      insert: async (rand: Record<string, unknown>) => {
        inserturi.push(rand);
        const id = rand.id as string | undefined;
        if (!id) {
          // Fără id, DB-ul generează unul nou la FIECARE insert — exact defectul.
          randuri.set(`auto-${randuri.size}-${Math.random()}`, rand);
          return { error: null };
        }
        if (randuri.has(id)) {
          return { error: { code: '23505', message: 'duplicate key value violates unique constraint "mese_pkey"' } };
        }
        randuri.set(id, rand);
        return { error: null };
      },
    }),
  } as unknown as SupabaseMinimalClient;
  return { client, randuri, inserturi };
}

const NUTRITIE = { calorii: 320, proteine: 24, grasimi: 12, carbohidrati: 28, fibre: 3 };

const payloadOfflineDin = (payload: { id: string; user_id: string; nume: string }): MasaOfflinePayload => ({
  id: payload.id,
  user_id: payload.user_id,
  nume: payload.nume,
  ...NUTRITIE,
  tip_masa: 'pranz',
  alimente: [],
  data: '2026-09-16',
  created_at: '2026-09-16T12:00:00.000Z',
});

beforeEach(async () => {
  (AsyncStorage as unknown as { __stocare: Map<string, string> }).__stocare.clear();
  await clearOfflineQueue(USER_A);
  await clearOfflineQueue(USER_B);
});

describe('P1-01 — timeout local după o scriere reușită pe server', () => {
  test('1. INSERT online reușit + timeout + replay din coadă → UN SINGUR rând', async () => {
    const { client, randuri } = creeazaBazaDate();
    const idOperatie = 'OP-MANUALA-1';

    // Acțiunea utilizatorului: un singur tap pe „Salvează".
    const payload = construiestePayloadMasaManuala({
      user_id: USER_A, idOperatie, nume: 'Pui cu orez', ...NUTRITIE, tip_masa: 'pranz',
    });

    // (1) INSERT-ul online chiar reușește pe server…
    await client.from('mese').insert(payload as unknown as Record<string, unknown>);
    expect(randuri.size).toBe(1);

    // (2) …dar clientul nu află: timeout local → aceeași acțiune intră în coadă.
    const { persistat } = await pushOfflineMealVerificat(payloadOfflineDin(payload));
    expect(persistat).toBe(true);

    // (3) Reconectare: coada se reia.
    const rezultat = await processOfflineQueue(client, USER_A);

    // Coliziunea pe cheia primară e recunoscută drept „deja sincronizat".
    expect(randuri.size).toBe(1);
    expect(rezultat.esuate).toBe(0);
  });

  test('2. payload-ul offline moștenește EXACT id-ul folosit online', async () => {
    const idOperatie = 'OP-MANUALA-2';
    const payload = construiestePayloadMasaManuala({
      user_id: USER_A, idOperatie, nume: 'Iaurt', ...NUTRITIE, tip_masa: 'gustare',
    });
    const offline = payloadOfflineDin(payload);

    // Aici era ruptura: online fără id, offline cu `generareUuid()` nou.
    expect(offline.id).toBe(payload.id);
  });

  test('3. reluarea cozii de două ori nu adaugă rânduri', async () => {
    const { client, randuri } = creeazaBazaDate();
    const payload = construiestePayloadMasaManuala({
      user_id: USER_A, idOperatie: 'OP-MANUALA-3', nume: 'Somon', ...NUTRITIE, tip_masa: 'cina',
    });

    await pushOfflineMealVerificat(payloadOfflineDin(payload));
    await processOfflineQueue(client, USER_A);
    await pushOfflineMealVerificat(payloadOfflineDin(payload));
    await processOfflineQueue(client, USER_A);

    expect(randuri.size).toBe(1);
  });

  test('4. dublu tap → două payload-uri cu ACELAȘI id → un singur rând', async () => {
    const { client, randuri } = creeazaBazaDate();
    const comun = { user_id: USER_A, idOperatie: 'OP-DUBLU-TAP', nume: 'Omletă', ...NUTRITIE, tip_masa: 'mic_dejun' };

    const tap1 = construiestePayloadMasaManuala(comun);
    const tap2 = construiestePayloadMasaManuala(comun);

    await client.from('mese').insert(tap1 as unknown as Record<string, unknown>);
    await client.from('mese').insert(tap2 as unknown as Record<string, unknown>);

    expect(randuri.size).toBe(1);
  });

  test('5. concurență: 10 scrieri simultane ale aceleiași operații → un singur rând', async () => {
    const { client, randuri } = creeazaBazaDate();
    const comun = { user_id: USER_A, idOperatie: 'OP-CONCURENT', nume: 'Paste', ...NUTRITIE, tip_masa: 'pranz' };

    await Promise.all(Array.from({ length: 10 }, () => {
      const p = construiestePayloadMasaManuala(comun);
      return client.from('mese').insert(p as unknown as Record<string, unknown>);
    }));

    expect(randuri.size).toBe(1);
  });

  test('6. două acțiuni deliberate cu același conținut → DOUĂ rânduri', async () => {
    const { client, randuri } = creeazaBazaDate();
    const baza = { user_id: USER_A, nume: 'Iaurt grecesc 200g', ...NUTRITIE, tip_masa: 'gustare' };

    const primaMasa = construiestePayloadMasaManuala({ ...baza, idOperatie: 'OP-A' });
    const aDouaMasa = construiestePayloadMasaManuala({ ...baza, idOperatie: 'OP-B' });

    await client.from('mese').insert(primaMasa as unknown as Record<string, unknown>);
    await client.from('mese').insert(aDouaMasa as unknown as Record<string, unknown>);

    expect(randuri.size).toBe(2);
  });
});

describe('P1-01 — izolarea conturilor în coada offline (P0-02 păstrat)', () => {
  test('7. coada lui A nu se execută sub sesiunea lui B', async () => {
    const { client, randuri } = creeazaBazaDate();
    const payload = construiestePayloadMasaManuala({
      user_id: USER_A, idOperatie: 'OP-A-QUEUE', nume: 'Masa lui A', ...NUTRITIE, tip_masa: 'pranz',
    });
    await pushOfflineMealVerificat(payloadOfflineDin(payload));

    // Se comută pe B și se reia coada sub sesiunea lui B.
    const rezultat = await processOfflineQueue(client, USER_B);

    expect(rezultat.procesate).toBe(0);
    expect(randuri.size).toBe(0);
  });

  test('8. revenirea la A reia corect aceeași operație, o singură dată', async () => {
    const { client, randuri } = creeazaBazaDate();
    const payload = construiestePayloadMasaManuala({
      user_id: USER_A, idOperatie: 'OP-A-RETUR', nume: 'Masa lui A', ...NUTRITIE, tip_masa: 'pranz',
    });
    await pushOfflineMealVerificat(payloadOfflineDin(payload));

    await processOfflineQueue(client, USER_B);
    await processOfflineQueue(client, USER_A);

    expect(randuri.size).toBe(1);
    expect([...randuri.values()][0].user_id).toBe(USER_A);
  });

  test('9. identitatea nu poate fi forjată: același idOperatie sub alt user → alt rând', async () => {
    const { client, randuri } = creeazaBazaDate();
    const comun = { idOperatie: 'OP-PARTAJAT', nume: 'Aceeași masă', ...NUTRITIE, tip_masa: 'pranz' };

    const aMasa = construiestePayloadMasaManuala({ ...comun, user_id: USER_A });
    const bMasa = construiestePayloadMasaManuala({ ...comun, user_id: USER_B });

    await client.from('mese').insert(aMasa as unknown as Record<string, unknown>);
    await client.from('mese').insert(bMasa as unknown as Record<string, unknown>);

    expect(randuri.size).toBe(2);
  });
});
