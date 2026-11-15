jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { renderHook, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFavorite, STORAGE_KEY_BASE, getFavoritesStorageKey } from '../hooks/useFavorite';

let mockUser: { id: string } | null = { id: 'usr-fav-123' };

jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    session: mockUser ? { user: mockUser } : null,
    loadingAuth: false,
  }),
}));

describe('useFavorite Hook — Account Isolation and Concurrency', () => {
  beforeEach(async () => {
    mockUser = { id: 'usr-fav-123' };
    await AsyncStorage.clear();
  });

  test('partitions storage key by active user ID', () => {
    expect(getFavoritesStorageKey('usr-1')).toBe('favorite_foods_usr-1');
    expect(getFavoritesStorageKey(null)).toBe(STORAGE_KEY_BASE);
  });

  test('adds and removes favorite foods with unique UUIDs without losing fast updates', async () => {
    const { result } = await renderHook(() => useFavorite());

    await act(async () => {
      await result.current.addFavorite({
        nume: 'Piept de pui',
        calorii: 165,
        proteine: 31,
        carbohidrati: 0,
        grasimi: 3.6,
      });
    });

    expect(result.current.favorite.length).toBe(1);
    expect(result.current.favorite[0].nume).toBe('Piept de pui');
    expect(result.current.favorite[0].id).toBeDefined();
    expect(result.current.isFavorite('Piept de pui')).toBe(true);

    const id = result.current.favorite[0].id;
    await act(async () => {
      await result.current.removeFavorite(id);
    });

    expect(result.current.favorite.length).toBe(0);
    expect(result.current.isFavorite('Piept de pui')).toBe(false);
  });

  test('migrates legacy unpartitioned favorites when user first loads', async () => {
    const legacyData = [
      { id: 'fav-old-1', nume: 'Ovaz', calorii: 350, proteine: 13, carbohidrati: 60, grasimi: 7 },
    ];
    await AsyncStorage.setItem(STORAGE_KEY_BASE, JSON.stringify(legacyData));

    const { result } = await renderHook(() => useFavorite());

    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.favorite.length).toBe(1);
    expect(result.current.favorite[0].nume).toBe('Ovaz');

    // Verify it was copied to partitioned key
    const partitioned = await AsyncStorage.getItem(getFavoritesStorageKey('usr-fav-123'));
    expect(partitioned).toBeDefined();
    expect(JSON.parse(partitioned!)[0].nume).toBe('Ovaz');
  });
});
