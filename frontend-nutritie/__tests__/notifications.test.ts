import {
  requestNotificationPermissions,
  scheduleDailyMealReminders,
  cancelAllMealReminders,
  DEFAULT_MEAL_REMINDERS,
} from '../lib/notifications';
import * as Notifications from 'expo-notifications';

jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  scheduleNotificationAsync: jest.fn(async () => 'notif_id_123'),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => {}),
}));


describe('U-07 — Notificări locale memento mesem', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('1. Permisiunile sunt solicitate și returnează true când sunt acordate', async () => {
    const granted = await requestNotificationPermissions();
    expect(granted).toBe(true);
    expect(Notifications.getPermissionsAsync).toHaveBeenCalled();
  });

  test('2. scheduleDailyMealReminders programează cele 3 mementouri zilnice implicite', async () => {
    const ids = await scheduleDailyMealReminders();
    expect(ids.length).toBe(3);
    expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(3);

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

  test('3. cancelAllMealReminders curăță toate notificările programate', async () => {
    await cancelAllMealReminders();
    expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
  });

  test('4. Dacă permisiunile sunt refuzate, nu se programează nicio notificare', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'denied' });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'denied' });

    const ids = await scheduleDailyMealReminders();
    expect(ids.length).toBe(0);
  });
});
