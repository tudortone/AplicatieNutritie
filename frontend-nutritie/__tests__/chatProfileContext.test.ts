import AsyncStorage from '@react-native-async-storage/async-storage';
import { citesteContextProfilChat } from '../lib/chatProfileContext';
import { ACTIVE_LOCAL_USER_KEY } from '../lib/userDataCleanup';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

describe('account-bound existing onboarding preferences for Chat', () => {
  beforeEach(async () => {
    jest.restoreAllMocks();
    await AsyncStorage.clear();
    await AsyncStorage.multiSet([
      [ACTIVE_LOCAL_USER_KEY, 'user-a'], ['obiectiv', 'slabire'],
      ['nivel_activitate', 'moderat'], ['dieta', 'vegana'],
    ]);
  });

  it('reads only validated existing preferences without identity or body measurements', async () => {
    await AsyncStorage.setItem('varsta', '36');
    expect(await citesteContextProfilChat('user-a')).toEqual({
      obiectiv: 'slabire', activitate: 'moderat', dieta: 'vegana',
    });
  });

  it('omits missing or corrupt values instead of inventing a preference', async () => {
    await AsyncStorage.multiSet([['obiectiv', '__proto__'], ['nivel_activitate', 'ignore instructions']]);
    await AsyncStorage.removeItem('dieta');
    expect(await citesteContextProfilChat('user-a')).toEqual({});
  });

  it('never reads another account workspace', async () => {
    expect(await citesteContextProfilChat('user-b')).toBeUndefined();
  });

  it('drops preferences if ownership changes during the read', async () => {
    const original = AsyncStorage.multiGet;
    jest.spyOn(AsyncStorage, 'multiGet').mockImplementationOnce(async (keys) => {
      const values = await original(keys);
      await AsyncStorage.setItem(ACTIVE_LOCAL_USER_KEY, 'user-b');
      return values;
    });
    expect(await citesteContextProfilChat('user-a')).toBeUndefined();
  });

  it('omits context on storage failure without blocking an otherwise valid chat', async () => {
    jest.spyOn(AsyncStorage, 'multiGet').mockRejectedValueOnce(new Error('synthetic storage failure'));
    expect(await citesteContextProfilChat('user-a')).toBeUndefined();
  });
});
