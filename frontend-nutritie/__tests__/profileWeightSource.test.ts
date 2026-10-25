import { act, renderHook, waitFor, cleanup } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMeseAzi } from '../hooks/useMeseAzi';
import { clearJournalCache } from '../lib/journalCache';
import { calculeazaPlan, salveazaDateOnboarding, sincronizeazaOnboardingLaProfil, type DateOnboarding } from '../lib/onboarding';

let mockUser: { id: string; user_metadata: Record<string, unknown> } = { id: 'user-a', user_metadata: {} };
let mockPending: { userId: string; targets: Record<string, unknown> } | null = null;
let mockAuthListener: ((event: string, session: { user: typeof mockUser } | null) => void) | undefined;
let mockPendingAQuery: ((resolve: (result: { data: any[]; error: null }) => void) => void) | undefined;

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('../supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn(async () => ({ data: { user: mockUser }, error: null })),
      onAuthStateChange: jest.fn((listener: typeof mockAuthListener) => {
        mockAuthListener = listener;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      }),
    },
    from: jest.fn(() => {
      let queryUserId: string | null = null;
      const query = {
        select: () => query,
        eq: (column: string, value: string) => {
          if (column === 'user_id') queryUserId = value;
          return query;
        },
        gte: () => query,
        lte: () => query,
        order: async () => {
          if (queryUserId === 'user-a' && mockPendingAQuery) {
            const deferQuery = mockPendingAQuery;
            mockPendingAQuery = undefined;
            return new Promise<{ data: any[]; error: null }>((resolve) => deferQuery(resolve));
          }
          return { data: queryUserId === 'user-b' ? [{
            id: 'meal-b', user_id: 'user-b', created_at: '2026-09-23T10:00:00Z',
            calorii: 321, proteine: 20, carbohidrati: 30, grasimi: 10, fibre: 2,
          }] : [], error: null };
        },
      };
      return query;
    }),
  },
}));

jest.mock('../lib/sincronizeazaTargeturi', () => ({
  citesteTargeturiPending: jest.fn(async () => mockPending),
}));

describe('useMeseAzi real profile weight source', () => {
  beforeEach(async () => {
    clearJournalCache();
    mockUser = { id: 'user-a', user_metadata: {} };
    mockPending = null;
    mockAuthListener = undefined;
    mockPendingAQuery = undefined;
    await AsyncStorage.clear();
  });

  afterEach(async () => {
    await cleanup();
  });

  async function readWeight() {
    const hook = await renderHook(() => useMeseAzi(new Date('2026-09-23T12:00:00')));
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    return hook.result.current;
  }

  it('keeps the legacy fallback while reporting no actual weight', async () => {
    const result = await readWeight();
    expect(result.greutate).toBe(75);
    expect(result.greutateIntrodusaKg).toBeNull();
  });

  it('prefers pending weight, then metadata, then restored local weight', async () => {
    mockUser = { id: 'user-a', user_metadata: { greutate: 70 } };
    mockPending = { userId: 'user-a', targets: { greutate: 82 } };
    await AsyncStorage.setItem('greutate', '68.5');
    expect((await readWeight()).greutateIntrodusaKg).toBe(82);

    mockPending = null;
    expect((await readWeight()).greutateIntrodusaKg).toBe(70);

    mockUser = { id: 'user-a', user_metadata: {} };
    expect((await readWeight()).greutateIntrodusaKg).toBe(68.5);
  });

  it('rejects a pending weight payload belonging to another user', async () => {
    mockPending = { userId: 'user-b', targets: { greutate: 82 } };
    mockUser = { id: 'user-a', user_metadata: {} };
    const result = await readWeight();
    expect(result.greutate).toBe(75);
    expect(result.greutateIntrodusaKg).toBeNull();
  });

  it('uses restored onboarding targets when pending and metadata targets are invalid', async () => {
    mockUser.user_metadata = { caloriiTinta: 0, proteineTinta: -5, carbiTinta: 0, grasimiTinta: -1 };
    mockPending = { userId: 'user-a', targets: { caloriiTinta: -1, proteineTinta: 0, carbiTinta: NaN, grasimiTinta: Infinity } };
    await AsyncStorage.multiSet([
      ['caloriiTinta', '2150'], ['proteineTinta', '135'], ['carbiTinta', '260'], ['grasimiTinta', '65'],
    ]);
    const result = await readWeight();
    expect([result.caloriiTinta, result.proteineTinta, result.carbiTinta, result.grasimiTinta])
      .toEqual([2150, 135, 260, 65]);
  });

  it('uses the actual persisted onboarding plan in the dashboard and Chat shared hook', async () => {
    const answers: DateOnboarding = {
      gen: 'feminin', dataNasterii: '2000-01-20', inaltimeCm: 160, greutateKg: 55,
      scop: 'masa', greutateTintaKg: 60, activitate: 'sedentar', ritmKgSaptamana: 0.25, dieta: 'vegana',
    };
    await salveazaDateOnboarding(answers);
    const client = { from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      upsert: async () => ({ error: null }),
    }) };
    expect(await sincronizeazaOnboardingLaProfil('user-a', client)).toBe(true);
    const plan = calculeazaPlan(answers)!;
    const result = await readWeight();
    expect([result.caloriiTinta, result.proteineTinta, result.carbiTinta, result.grasimiTinta])
      .toEqual([plan.calorii, plan.proteineG, plan.carbohidratiG, plan.grasimiG]);
  });

  it('drops a late user-A Journal query before user-B data is displayed', async () => {
    let resolveUserA: ((result: { data: any[]; error: null }) => void) | undefined;
    mockUser = { id: 'user-a', user_metadata: {} };
    mockPendingAQuery = (resolve) => { resolveUserA = resolve; };

    const hook = await renderHook(() => useMeseAzi(new Date('2026-09-23T12:00:00')));
    await waitFor(() => expect(resolveUserA).toBeDefined());

    mockUser = { id: 'user-b', user_metadata: {} };
    await act(async () => {
      mockAuthListener?.('SIGNED_IN', { user: mockUser });
    });
    await waitFor(() => {
      expect(hook.result.current.user?.id).toBe('user-b');
      expect(hook.result.current.mese.map((meal) => meal.id)).toEqual(['meal-b']);
    });

    await act(async () => {
      resolveUserA?.({ data: [{
        id: 'meal-a', user_id: 'user-a', created_at: '2026-09-23T09:00:00Z',
        calorii: 999, proteine: 40, carbohidrati: 80, grasimi: 30, fibre: 5,
      }], error: null });
    });

    expect(hook.result.current.user?.id).toBe('user-b');
    expect(hook.result.current.mese.map((meal) => meal.id)).toEqual(['meal-b']);
  });
});
