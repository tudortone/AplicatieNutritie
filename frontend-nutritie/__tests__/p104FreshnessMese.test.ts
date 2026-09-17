import { renderHook, act, waitFor } from '@testing-library/react-native';

import { useMeseAzi } from '../hooks/useMeseAzi';
import { marcheazaMeseModificate, aboneazaLaModificariMese } from '../lib/freshnessMese';
import type { Masa } from '../types';

/**
 * P1-04 — prospețimea datelor canonice după o salvare VERIFICATĂ.
 *
 * ==========================================================================
 * DEFECTUL
 * ==========================================================================
 * Fiecare ecran are propria instanță `useMeseAzi`. `refresh()` din chat sau din
 * jurnal împrospătează DOAR instanța acelui ecran — Home rămâne cu datele vechi.
 * Home se baza pe `useFocusRefresh`, care are un **throttle de 5 secunde**: dacă
 * utilizatorul a fost pe Home cu mai puțin de 5s în urmă (scanare rapidă de
 * barcode, salvare din chat), refresh-ul la focus este SĂRIT și Home afișează
 * totaluri vechi. Corectitudinea datelor depindea deci de un cronometru.
 *
 * Remedierea: un semnal determinist de invalidare, emis DOAR după persistare
 * verificată și consumat în interiorul `useMeseAzi`, deci toți consumatorii
 * canonici (Home, Jurnal, statistici) se împrospătează fără temporizator.
 * Semnalul este scopat pe proprietar (P0-02): un semnal al lui A nu împrospătează B.
 */

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

let mockUtilizator = { id: USER_A, user_metadata: {} as Record<string, unknown> };
let mockRanduri: Record<string, Masa[]> = {};
let mockNumarInterogari = 0;

jest.mock('../supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn(async () => ({ data: { user: mockUtilizator }, error: null })) },
    from: jest.fn(() => {
      let userId = '';
      const c: Record<string, unknown> = {
        select: () => c,
        eq: (_col: string, v: string) => { userId = v; return c; },
        gte: () => c,
        lte: () => c,
        order: async () => {
          mockNumarInterogari += 1;
          return { data: mockRanduri[userId] || [], error: null };
        },
      };
      return c;
    }),
  },
}));

jest.mock('../lib/sincronizeazaTargeturi', () => ({ citesteTargeturiPending: jest.fn(async () => null) }));

const masa = (p: Partial<Masa> & { id: string }): Masa => ({
  user_id: USER_A, nume: 'Masă', calorii: 0, proteine: 0, grasimi: 0, carbohidrati: 0,
  created_at: '2026-09-16T10:00:00.000Z', tip_masa: 'pranz', ...p,
});

const demontari: Array<() => void> = [];
async function monteaza() {
  const r = await renderHook(() => useMeseAzi(new Date('2026-09-16T12:00:00')));
  demontari.push(() => { try { r.unmount(); } catch { /* deja demontat */ } });
  await waitFor(() => expect(r.result.current.loading).toBe(false));
  return r;
}
afterEach(() => { while (demontari.length) demontari.pop()!(); });

beforeEach(() => {
  mockUtilizator = { id: USER_A, user_metadata: {} };
  mockRanduri = { [USER_A]: [masa({ id: 'm1', calorii: 500 })], [USER_B]: [] };
  mockNumarInterogari = 0;
});

describe('P1-04 — semnalul de prospețime este determinist și scopat pe proprietar', () => {
  test('1. un semnal pentru utilizatorul CURENT reîncarcă datele canonice', async () => {
    const { result } = await monteaza();
    expect(result.current.totalCalorii).toBe(500);
    const interogariInainte = mockNumarInterogari;

    // Serverul are acum masa nouă; semnalul vine după persistarea verificată.
    mockRanduri[USER_A] = [masa({ id: 'm1', calorii: 500 }), masa({ id: 'm2', calorii: 320 })];
    await act(async () => { marcheazaMeseModificate(USER_A); });

    await waitFor(() => expect(result.current.totalCalorii).toBe(820));
    expect(mockNumarInterogari).toBeGreaterThan(interogariInainte);
  });

  test('2. FĂRĂ semnal, datele nu se reîncarcă singure (testul nu trece vacuu)', async () => {
    const { result } = await monteaza();
    const interogariInainte = mockNumarInterogari;

    mockRanduri[USER_A] = [masa({ id: 'm1', calorii: 500 }), masa({ id: 'm2', calorii: 320 })];
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(mockNumarInterogari).toBe(interogariInainte);
    expect(result.current.totalCalorii).toBe(500);
  });

  test('3. P0-02: un semnal pentru ALT utilizator NU împrospătează sesiunea curentă', async () => {
    const { result } = await monteaza();
    const interogariInainte = mockNumarInterogari;

    mockRanduri[USER_A] = [masa({ id: 'm1', calorii: 500 }), masa({ id: 'x', calorii: 999 })];
    await act(async () => { marcheazaMeseModificate(USER_B); });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(mockNumarInterogari).toBe(interogariInainte);
    expect(result.current.totalCalorii).toBe(500);
  });

  test('4. reîmprospătarea NU depinde de vreun cronometru: se întâmplă imediat', async () => {
    const { result } = await monteaza();
    mockRanduri[USER_A] = [masa({ id: 'm2', calorii: 111 })];

    await act(async () => { marcheazaMeseModificate(USER_A); });

    // Fără `advanceTimers`, fără așteptare artificială — doar semnalul.
    await waitFor(() => expect(result.current.totalCalorii).toBe(111));
  });

  test('5. semnalele repetate nu strică starea (o salvare = o reîmprospătare logică)', async () => {
    const { result } = await monteaza();
    mockRanduri[USER_A] = [masa({ id: 'm2', calorii: 250 })];

    await act(async () => {
      marcheazaMeseModificate(USER_A);
      marcheazaMeseModificate(USER_A);
    });

    await waitFor(() => expect(result.current.totalCalorii).toBe(250));
  });
});

describe('P1-04 — contractul modulului de prospețime', () => {
  test('6. abonații primesc proprietarul semnalului', () => {
    const primite: (string | null)[] = [];
    const dezabonare = aboneazaLaModificariMese((userId) => primite.push(userId));

    marcheazaMeseModificate(USER_A);
    marcheazaMeseModificate(USER_B);

    expect(primite).toEqual([USER_A, USER_B]);
    dezabonare();
  });

  test('7. dezabonarea chiar oprește notificările (fără scurgeri)', () => {
    const primite: unknown[] = [];
    const dezabonare = aboneazaLaModificariMese((u) => primite.push(u));
    dezabonare();

    marcheazaMeseModificate(USER_A);

    expect(primite).toHaveLength(0);
  });

  test('8. un semnal fără proprietar valid este ignorat (nu împrospătează pe nimeni)', () => {
    const primite: unknown[] = [];
    const dezabonare = aboneazaLaModificariMese((u) => primite.push(u));

    marcheazaMeseModificate('' as string);
    marcheazaMeseModificate(null as unknown as string);

    expect(primite).toHaveLength(0);
    dezabonare();
  });
});
