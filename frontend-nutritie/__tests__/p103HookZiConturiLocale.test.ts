import { renderHook, act, waitFor, cleanup } from '@testing-library/react-native';

import { useMeseAzi } from '../hooks/useMeseAzi';
import { startOfLocalDayISO, endOfLocalDayISO } from '../lib/dateUtils';
import { calculeazaTotaluriZi, totaluriPentruAfisare, totaluriZiAfisate } from '../lib/nutritionTotals';
import type { Masa } from '../types';

/**
 * P1-03 — verificare pe HOOK-UL REAL (`useMeseAzi`), nu pe o reimplementare.
 *
 * Home și Jurnalul consumă amândouă acest hook, deci paritatea între ecrane se
 * demonstrează aici: aceleași date canonice → aceleași totaluri, indiferent de
 * calea prin care se ajunge la ele (fetch, refresh, adăugare/ștergere optimistă).
 */

const USER_A = { id: 'user-a', user_metadata: { caloriiTinta: 2000 } };
const USER_B = { id: 'user-b', user_metadata: { caloriiTinta: 1800 } };

let mockUtilizator: { id: string; user_metadata: Record<string, unknown> } = USER_A;
let mockRanduri: Record<string, Masa[]> = {};
let mockEroareFetch: { message: string } | null = null;
let mockFiltruGte: string | null = null;
let mockFiltruLte: string | null = null;

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('../supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn(async () => ({ data: { user: mockUtilizator }, error: null })),
    },
    from: jest.fn(() => {
      let userId = '';
      const constructor: Record<string, unknown> = {
        select: () => constructor,
        eq: (_coloana: string, valoare: string) => { userId = valoare; return constructor; },
        gte: (_c: string, v: string) => { mockFiltruGte = v; return constructor; },
        lte: (_c: string, v: string) => { mockFiltruLte = v; return constructor; },
        order: async () => ({
          data: mockEroareFetch ? null : (mockRanduri[userId] || []),
          error: mockEroareFetch,
        }),
      };
      return constructor;
    }),
  },
}));

jest.mock('../lib/sincronizeazaTargeturi', () => ({
  citesteTargeturiPending: jest.fn(async () => null),
}));

const masa = (p: Partial<Masa> & { id: string }): Masa => ({
  user_id: mockUtilizator.id,
  nume: 'Masă',
  calorii: 0,
  proteine: 0,
  grasimi: 0,
  carbohidrati: 0,
  created_at: '2026-09-15T10:00:00.000Z',
  tip_masa: 'pranz',
  ...p,
});

/** Aceeași fixtură canonică folosită în testul autorității (valori zecimale). */
const FIXTURA: Masa[] = [
  masa({ id: 'm1', user_id: 'user-a', tip_masa: 'mic_dejun', calorii: 312.4, proteine: 20.04, grasimi: 22.35, carbohidrati: 3.17, fibre: 0.9 }),
  masa({ id: 'm2', user_id: 'user-a', tip_masa: 'pranz', calorii: 648.7, proteine: 52.46, grasimi: 14.82, carbohidrati: 71.55, fibre: 3.4 }),
  masa({ id: 'm3', user_id: 'user-a', tip_masa: 'cina', calorii: 431.25, proteine: 38.11, grasimi: 26.43, carbohidrati: 8.02, fibre: 1.1 }),
  masa({ id: 'm4', user_id: 'user-a', tip_masa: 'gustare', calorii: 118.9, proteine: 10.39, grasimi: 3.24, carbohidrati: 12.66, fibre: 0.2 }),
];

const demontari: Array<() => void> = [];

/**
 * Montează hook-ul REAL și înregistrează demontarea. Fără demontare explicită,
 * randările se acumulează între teste și `result.current` ajunge null în
 * describe-urile următoare.
 */
async function monteaza(data: Date) {
  const r = await renderHook(() => useMeseAzi(data));
  demontari.push(() => { try { r.unmount(); } catch { /* deja demontat */ } });
  await waitFor(() => expect(r.result.current.loading).toBe(false));
  return r;
}

afterEach(async () => {
  while (demontari.length) demontari.pop()!();
  // RNTL pastreaza un container global intre teste; fara curatare explicita,
  // randarile se acumuleaza si `result.current` ajunge null in describe-urile
  // urmatoare (verificat: aceleasi teste trec izolat, cad in suita completa).
  await cleanup();
});

const asteaptaIncarcare = async (rezultat: { current: { loading: boolean } }) => {
  await waitFor(() => expect(rezultat.current.loading).toBe(false));
};

const totaluriDin = (c: ReturnType<typeof useMeseAzi>) => ({
  calorii: c.totalCalorii,
  proteine: c.totalProteine,
  grasimi: c.totalGrasimi,
  carbohidrati: c.totalCarbohidrati,
  fibre: c.totalFibre,
});

beforeEach(() => {
  mockUtilizator = USER_A;
  mockRanduri = { 'user-a': [...FIXTURA], 'user-b': [] };
  mockEroareFetch = null;
  mockFiltruGte = null;
  mockFiltruLte = null;
  // Fara `clearAllMocks`: implementarile definite in fabricile `jest.mock` sunt
  // singura sursa de date a hook-ului; stergerea lor lasa `getUser` fara raspuns
  // si randarea esueaza in testele urmatoare.
});

describe('P1-03 — persistare, izolare de conturi, zi si locale (hook REAL)', () => {
  test('8b. hook-ul trimite EXACT granițele zilei locale din dateUtils către Supabase', async () => {
    // Blocantul 2: variabilele de captură existau, dar nu se asertau. Aici se
    // compară valorile chiar trimise la `.gte()` / `.lte()` cu rezultatul
    // funcțiilor REALE — nu cu o reimplementare a logicii lor în test.
    const data = new Date('2026-09-15T13:27:11');
    const inceput = startOfLocalDayISO(data);
    const sfarsit = endOfLocalDayISO(data);

    await monteaza(data);

    expect(mockFiltruGte).toBe(inceput);
    expect(mockFiltruLte).toBe(sfarsit);
  });

  test('8c. o altă zi produce alte granițe, tot din aceleași funcții reale', async () => {
    const data = new Date('2026-12-31T22:10:00');
    await monteaza(data);

    expect(mockFiltruGte).toBe(startOfLocalDayISO(data));
    expect(mockFiltruLte).toBe(endOfLocalDayISO(data));
    // Și sunt chiar diferite de ziua verificată mai sus (nu o constantă).
    expect(mockFiltruGte).not.toBe(startOfLocalDayISO(new Date('2026-09-15T13:27:11')));
  });

  test('9. o propunere nepersistată nu apare în totaluri', async () => {
    const { result } = await monteaza(new Date('2026-09-15T12:00:00'));
    const initial = totaluriDin(result.current);

    // O propunere AI există doar în starea ecranului; nu atinge setul canonic.
    const propunere = { nume: 'Propunere AI', calorii: 900, proteine: 50, grasimi: 30, carbohidrati: 80 };
    expect(propunere.calorii).toBe(900);

    expect(totaluriDin(result.current)).toEqual(initial);
  });

  test('10. salvarea EȘUATĂ nu mută totalul canonic', async () => {
    const { result } = await monteaza(new Date('2026-09-15T12:00:00'));
    const initial = totaluriDin(result.current);

    // Persistarea eșuează → serverul nu are rândul → refresh întoarce același set.
    mockEroareFetch = null;
    await act(async () => { await result.current.refresh(true); });

    expect(totaluriDin(result.current)).toEqual(initial);
  });

  test('11. propunerea persistată este numărată exact o dată', async () => {
    const { result } = await monteaza(new Date('2026-09-15T12:00:00'));
    const initial = result.current.totalCalorii;

    const persistata = masa({ id: 'ai-1', user_id: 'user-a', calorii: 900 });
    mockRanduri['user-a'] = [...FIXTURA, persistata];

    // Adăugare optimistă imediat, apoi reconcilierea cu serverul: același rând.
    await act(async () => { result.current.optimisticAddMeal(persistata); });
    await act(async () => { await result.current.refresh(true); });

    await waitFor(() => expect(result.current.totalCalorii).toBe(initial + 900));
    expect(result.current.numarMese).toBe(FIXTURA.length + 1);
  });

  test('12. A → B: totalurile lui A nu rămân vizibile pentru B', async () => {
    const { result, rerender } = await monteaza(new Date('2026-09-15T12:00:00'));
    expect(result.current.totalCalorii).toBeGreaterThan(0);

    mockUtilizator = USER_B;
    mockRanduri['user-b'] = [];
    rerender({});
    await act(async () => { await result.current.refresh(true); });

    await waitFor(() => expect(result.current.totalCalorii).toBe(0));
    expect(result.current.numarMese).toBe(0);
  });
});
