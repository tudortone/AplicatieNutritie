import { renderHook, waitFor, cleanup } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMeseAzi } from '../hooks/useMeseAzi';
import { clearJournalCache } from '../lib/journalCache';

let mockUser: { id: string; user_metadata: Record<string, unknown> } = { id: 'user-a', user_metadata: {} };
let mockPending: { userId: string; targets: Record<string, unknown> } | null = null;

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('../supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn(async () => ({ data: { user: mockUser }, error: null })) },
    from: jest.fn(() => {
      const query = {
        select: () => query,
        eq: () => query,
        gte: () => query,
        lte: () => query,
        order: async () => ({ data: [], error: null }),
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
});
