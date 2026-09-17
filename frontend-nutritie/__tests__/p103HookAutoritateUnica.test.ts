import { renderHook, act, waitFor, cleanup } from '@testing-library/react-native';

import { useMeseAzi } from '../hooks/useMeseAzi';
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

describe('P1-03 — autoritatea unica, verificata pe hook-ul REAL', () => {
  test('1. totalurile hook-ului sunt EXACT cele ale calculatorului canonic', async () => {
    const { result } = await monteaza(new Date('2026-09-15T12:00:00'));

    expect(totaluriDin(result.current)).toEqual(totaluriZiAfisate(FIXTURA));
  });

  test('2. suma categoriilor din Jurnal == totalul zilei (valori canonice brute)', async () => {
    const { result } = await monteaza(new Date('2026-09-15T12:00:00'));

    const sumaCategorii = result.current.categoriiMeseList.reduce((acc, cat) => ({
      calorii: acc.calorii + cat.totalCalorii,
      proteine: acc.proteine + cat.totalProteine,
      carbohidrati: acc.carbohidrati + cat.totalCarbohidrati,
      grasimi: acc.grasimi + cat.totalGrasimi,
      fibre: acc.fibre + cat.totalFibre,
    }), { calorii: 0, proteine: 0, carbohidrati: 0, grasimi: 0, fibre: 0 });

    // Invariantul se tine pe valori brute; rotunjirea e doar la prezentare.
    const brutZi = calculeazaTotaluriZi(FIXTURA);
    expect(sumaCategorii.calorii).toBeCloseTo(brutZi.calorii, 6);
    expect(sumaCategorii.proteine).toBeCloseTo(brutZi.proteine, 6);
    expect(sumaCategorii.carbohidrati).toBeCloseTo(brutZi.carbohidrati, 6);
    expect(sumaCategorii.grasimi).toBeCloseTo(brutZi.grasimi, 6);

    // Iar totalul afisat al zilei este exact rotunjirea acelorasi valori brute.
    expect(result.current.totalCalorii).toBe(totaluriPentruAfisare(brutZi).calorii);
    expect(result.current.totalProteine).toBe(totaluriPentruAfisare(brutZi).proteine);
  });

  test('3. adaugă apoi șterge optimist → totalul inițial REVINE exact', async () => {
    const { result } = await monteaza(new Date('2026-09-15T12:00:00'));
    const initial = totaluriDin(result.current);

    const noua = masa({ id: 'temp', user_id: 'user-a', calorii: 250.44, proteine: 10.06, grasimi: 5.05, carbohidrati: 20.04 });
    await act(async () => { result.current.optimisticAddMeal(noua); });
    expect(result.current.totalCalorii).not.toBe(initial.calorii);

    await act(async () => { result.current.optimisticDeleteMeal('temp'); });
    expect(totaluriDin(result.current)).toEqual(initial);
  });

  test('4. adăugarea optimistă a unei mese deja prezente nu o numără de două ori', async () => {
    const { result } = await monteaza(new Date('2026-09-15T12:00:00'));
    const initial = totaluriDin(result.current);

    await act(async () => { result.current.optimisticAddMeal(FIXTURA[0]); });

    expect(totaluriDin(result.current)).toEqual(initial);
    expect(result.current.numarMese).toBe(FIXTURA.length);
  });

  test('5. ștergerea scade contribuția exact o dată', async () => {
    const { result } = await monteaza(new Date('2026-09-15T12:00:00'));

    await act(async () => { result.current.optimisticDeleteMeal('m2'); });

    expect(totaluriDin(result.current))
      .toEqual(totaluriZiAfisate(FIXTURA.filter((m) => m.id !== 'm2')));
  });

  test('6. editarea 500 → 650 se reflectă după refresh cu exact +150', async () => {
    mockRanduri['user-a'] = [masa({ id: 'e1', user_id: 'user-a', calorii: 500 })];
    const { result } = await monteaza(new Date('2026-09-15T12:00:00'));
    expect(result.current.totalCalorii).toBe(500);

    mockRanduri['user-a'] = [masa({ id: 'e1', user_id: 'user-a', calorii: 650 })];
    await act(async () => { await result.current.refresh(true); });

    await waitFor(() => expect(result.current.totalCalorii).toBe(650));
  });

  test('7. refresh-ul pe aceleași date nu schimbă totalul (fără drift la reîmprospătare)', async () => {
    const { result } = await monteaza(new Date('2026-09-15T12:00:00'));
    const initial = totaluriDin(result.current);

    await act(async () => { await result.current.refresh(true); });
    await act(async () => { await result.current.refresh(true); });

    expect(totaluriDin(result.current)).toEqual(initial);
  });

  test('8. „repornirea aplicației" (montare nouă) dă același total', async () => {
    const primul = await monteaza(new Date('2026-09-15T12:00:00'));
    const initial = totaluriDin(primul.result.current);
    primul.unmount();

    const alDoilea = await monteaza(new Date('2026-09-15T12:00:00'));

    expect(totaluriDin(alDoilea.result.current)).toEqual(initial);
  });
});
