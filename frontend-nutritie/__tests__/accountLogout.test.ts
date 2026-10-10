import AsyncStorage from '@react-native-async-storage/async-storage';
import { logoutPreservingUserData } from '../lib/accountLogout';

jest.mock('@react-native-async-storage/async-storage', () => ({
  removeItem: jest.fn(),
  multiRemove: jest.fn(),
}));

describe('account logout retains unsynced account data', () => {
  beforeEach(() => jest.clearAllMocks());

  test('sign-out does not purge queued meals before the account boundary seals them', async () => {
    const signOut = jest.fn(async () => ({ error: null }));
    const cancelReminders = jest.fn(async () => undefined);

    await logoutPreservingUserData({ signOut, cancelReminders });

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(cancelReminders).toHaveBeenCalledTimes(1);
    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
    expect(AsyncStorage.multiRemove).not.toHaveBeenCalled();
  });

  test('failed sign-out does not cancel reminders or clear local work', async () => {
    const cancelReminders = jest.fn(async () => undefined);
    await expect(logoutPreservingUserData({
      signOut: async () => ({ error: new Error('network') }),
      cancelReminders,
    })).rejects.toThrow('network');

    expect(cancelReminders).not.toHaveBeenCalled();
    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
    expect(AsyncStorage.multiRemove).not.toHaveBeenCalled();
  });
});
