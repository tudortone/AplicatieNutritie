import { finalizeConfirmedAccountDeletion } from '../lib/accountDeletion';

jest.mock('../lib/notificationConsent', () => ({ cancelManagedReminders: jest.fn() }));
jest.mock('../lib/offlineQueue', () => ({ clearOfflineQueue: jest.fn() }));
jest.mock('../lib/userDataCleanup', () => ({ purgeLocalDataForUser: jest.fn() }));
jest.mock('../lib/ads/adGateStore', () => ({ purgeAdGateState: jest.fn() }));

describe('P1-13 — finalizarea locala dupa stergerea confirmata de server', () => {
  test('purjeaza datele contului si inchide sesiunea inainte de succes UI', async () => {
    const calls: string[] = [];
    const result = await finalizeConfirmedAccountDeletion({
      userId: 'user-A',
      purgeUserData: async (id) => { calls.push(`purge:${id}`); },
      clearUserQueue: async (id) => { calls.push(`queue:${id}`); },
      cancelReminders: async () => { calls.push('reminders'); },
      purgeAdState: (id) => { calls.push(`ads:${id}`); },
      signOut: async () => { calls.push('signout'); return { error: null }; },
    });

    expect(result).toEqual({ localCleanupComplete: true });
    expect(calls).toEqual(['purge:user-A', 'queue:user-A', 'reminders', 'ads:user-A', 'signout']);
  });

  test('nu declara curatarea completa, dar incearca sign-out chiar daca purjarea esueaza', async () => {
    const signOut = jest.fn(async () => ({ error: null }));
    const result = await finalizeConfirmedAccountDeletion({
      userId: 'user-A',
      purgeUserData: async () => { throw new Error('disk unavailable'); },
      clearUserQueue: async () => {},
      cancelReminders: async () => {},
      purgeAdState: () => {},
      signOut,
    });

    expect(result).toEqual({ localCleanupComplete: false });
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
