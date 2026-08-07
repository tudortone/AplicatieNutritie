import * as Notifications from 'expo-notifications';
import {
  getConsent,
  grantConsent,
  revokeConsent,
  getManagedReminders,
  setManagedReminders,
  clearManagedReminders,
  cancelManagedReminders,
} from '../lib/notificationConsent';

jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn(async (key: string) => store[key] || null),
    setItem: jest.fn(async (key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn(async (key: string) => {
      delete store[key];
    }),
    clear: jest.fn(async () => {
      store = {};
    }),
  };
});

jest.mock('expo-notifications', () => ({
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => {}),
}));

describe('TASK-16 — Consimțământ notificări (sursă unică + registry gestionat)', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await clearManagedReminders();
    await revokeConsent();
  });

  test('1. Starea implicită: fără consimțământ', async () => {
    const stare = await getConsent();
    expect(stare.accepted).toBe(false);
    expect(stare.grantedAt).toBeNull();
  });

  test('2. grantConsent persists accepted + timestamp; supraviețuiește re-citirii (restart)', async () => {
    await grantConsent();
    // re-citire fără altă interacțiune = echivalentul unui restart/re-mount
    const stare = await getConsent();
    expect(stare.accepted).toBe(true);
    expect(stare.grantedAt).toBeTruthy();
    expect(Date.parse(stare.grantedAt as string)).not.toBeNaN();
  });

  test('3. revokeConsent readuce la fără consimțământ', async () => {
    await grantConsent();
    await revokeConsent();
    const stare = await getConsent();
    expect(stare.accepted).toBe(false);
    expect(stare.grantedAt).toBeNull();
  });

  test('4. Registrul mementourilor: gol implicit, se completează și se golește', async () => {
    expect((await getManagedReminders()).ids).toEqual([]);

    await setManagedReminders('user_123', ['rem_1', 'rem_2']);
    const popVal = await getManagedReminders();
    expect(popVal.accountId).toBe('user_123');
    expect(popVal.ids).toEqual(['rem_1', 'rem_2']);

    await clearManagedReminders();
    expect((await getManagedReminders()).ids).toEqual([]);
  });

  test('5. cancelManagedReminders anulează DOAR id-urile gestionate și goleste registrul', async () => {
    await setManagedReminders('acc1', ['r1', 'r2', 'r3']);
    await cancelManagedReminders();

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(3);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenNthCalledWith(1, 'r1');
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenNthCalledWith(2, 'r2');
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenNthCalledWith(3, 'r3');
    // cancel-all este interzis pe întregul flux de notificări.
    expect(Notifications.cancelAllScheduledNotificationsAsync).not.toHaveBeenCalled();

    expect((await getManagedReminders()).ids).toEqual([]);
  });

  test('6. Contul următor nu moștenește reminderile contului precedent', async () => {
    await setManagedReminders('cont_a', ['a1']);
    await setManagedReminders('cont_b', ['b1', 'b2']);

    // noul cont înlocuiește registrul; id-urile vechi nu mai sunt atinse la cancel
    await cancelManagedReminders();
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(2);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenNthCalledWith(1, 'b1');
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenNthCalledWith(2, 'b2');
    expect((await getManagedReminders()).accountId).toBeUndefined();

    const stare = await getConsent();
    expect(stare.accepted).toBe(false);
  });
});