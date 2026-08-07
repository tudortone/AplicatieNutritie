import {
  requestNotificationPermissions,
  scheduleDailyMealReminders,
  cancelAllMealReminders,
  DEFAULT_MEAL_REMINDERS,
} from '../lib/notifications';
import {
  grantConsent,
  revokeConsent,
  setManagedReminders,
  getManagedReminders,
  clearManagedReminders,
  cancelManagedReminders,
} from '../lib/notificationConsent';
import * as Notifications from 'expo-notifications';

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
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  scheduleNotificationAsync: jest.fn(async () => 'notif_id_123'),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => {}),
}));

describe('U-07 — Notificări locale (gate pe consimțământ explicit)', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await revokeConsent();
    await clearManagedReminders();
  });

  test('1. Permisiunile sunt solicitate și returnează true când sunt acordate', async () => {
    const granted = await requestNotificationPermissions();
    expect(granted).toBe(true);
    expect(Notifications.getPermissionsAsync).toHaveBeenCalled();
  });

  test('2. Fără consimțământ NU se programează și NU se cere permisiunea', async () => {
    const ids = await scheduleDailyMealReminders();
    expect(ids.length).toBe(0);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
  });

  test('3. Cu consimțământ, programează 3 mementouri și NU folosește cancel-all', async () => {
    await grantConsent();
    const ids = await scheduleDailyMealReminders();
    expect(ids.length).toBe(3);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(3);
    // cancel-all este interzis — nu trebuie apelat niciodată.
    expect(Notifications.cancelAllScheduledNotificationsAsync).not.toHaveBeenCalled();
    // registry curea nou = fără anulări individuale la o primă programare.
    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();

    expect(Notifications.scheduleNotificationAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          title: DEFAULT_MEAL_REMINDERS[2].title,
        }),
        trigger: expect.objectContaining({
          hour: 19,
          minute: 30,
        }),
      })
    );
  });

  test('4. Dacă permisiunile sunt refuzate, nu se programează nimic', async () => {
    await grantConsent();
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'denied' });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'denied' });

    const ids = await scheduleDailyMealReminders();
    expect(ids.length).toBe(0);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  test('5. cancelAllMealReminders anulează DOAR id-urile gestionate, nu toata lista', async () => {
    await setManagedReminders('user_123', ['rem_a', 'rem_b', 'rem_c']);
    await cancelAllMealReminders();

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(3);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenNthCalledWith(1, 'rem_a');
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenNthCalledWith(2, 'rem_b');
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenNthCalledWith(3, 'rem_c');
    // cancel-all interzis pe tot fluxul.
    expect(Notifications.cancelAllScheduledNotificationsAsync).not.toHaveBeenCalled();

    const stare = await getManagedReminders();
    expect(stare.ids.length).toBe(0);
  });

  test('6. Reprogramarea curăță id-urile vechi și le înlocuiește cu altele noi', async () => {
    await grantConsent();
    await setManagedReminders('acc_beta', ['stale_1', 'stale_2']);

    const ids = await scheduleDailyMealReminders(DEFAULT_MEAL_REMINDERS, 'acc_beta');

    // anulează vechile 2 mementouri, apoi programează 3 noi
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(2);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenNthCalledWith(1, 'stale_1');
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenNthCalledWith(2, 'stale_2');
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(3);
    expect(ids.length).toBe(3);

    const stare = await getManagedReminders();
    expect(stare.ids.length).toBe(3);
    expect(stare.accountId).toBe('acc_beta');
  });

  test('7. cancelManagedReminders goleste registrul si nu atinge alte notificari', async () => {
    await setManagedReminders('s1', ['x', 'y']);
    await cancelManagedReminders();
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(2);
    expect(Notifications.cancelAllScheduledNotificationsAsync).not.toHaveBeenCalled();
    const stare = await getManagedReminders();
    expect(stare.ids.length).toBe(0);
  });
});