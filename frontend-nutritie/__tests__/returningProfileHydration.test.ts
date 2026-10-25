import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';
import { restaureazaProfilSesiune } from '../lib/onboarding';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

function clientFor(data: unknown, error: unknown = null) {
  const eq = jest.fn(() => ({ maybeSingle: async () => ({ data, error }) }));
  const from = jest.fn(() => ({ select: jest.fn(() => ({ eq })) }));
  return { client: { from } as unknown as Pick<SupabaseClient, 'from'>, eq, from };
}

describe('returning profile hydration before session publication', () => {
  beforeEach(async () => { jest.clearAllMocks(); await AsyncStorage.clear(); });

  it('restores server targets using only the authenticated account filter', async () => {
    const { client, eq, from } = clientFor({ calorii_tinta: 2200, proteine_tinta: 140, carbi_tinta: 260, grasimi_tinta: 67, greutate: 75 });
    expect(await restaureazaProfilSesiune('returning', client)).toBe(true);
    expect(from).toHaveBeenCalledWith('profil');
    expect(eq).toHaveBeenCalledWith('user_id', 'returning');
    expect(await AsyncStorage.multiGet(['caloriiTinta', 'proteineTinta', 'carbiTinta', 'grasimiTinta'])).toEqual([
      ['caloriiTinta', '2200'], ['proteineTinta', '140'], ['carbiTinta', '260'], ['grasimiTinta', '67'],
    ]);
  });

  it.each([null, { calorii_tinta: '2200' }, { calorii_tinta: -1 }])('keeps the isolated local cache for an absent or invalid profile %j', async data => {
    await AsyncStorage.setItem('caloriiTinta', '2300');
    expect(await restaureazaProfilSesiune('returning', clientFor(data).client)).toBe(false);
    expect(await AsyncStorage.getItem('caloriiTinta')).toBe('2300');
  });

  it('retains offline account data and does not turn a failed read into a write', async () => {
    await AsyncStorage.setItem('caloriiTinta', '2300');
    expect(await restaureazaProfilSesiune('returning', clientFor(null, new Error('offline')).client)).toBe(false);
    expect(await AsyncStorage.getItem('caloriiTinta')).toBe('2300');
  });

  it('propagates a failed durable write so AuthContext cannot publish an unprepared account', async () => {
    jest.spyOn(AsyncStorage, 'multiSet').mockRejectedValueOnce(new Error('synthetic storage failure'));
    await expect(restaureazaProfilSesiune('returning', clientFor({ calorii_tinta: 2200 }).client)).rejects.toThrow('synthetic storage failure');
  });
});
