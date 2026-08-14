import * as Notifications from 'expo-notifications';
import {
  getManagedReminders,
  setManagedReminders,
  registerManagedReminder,
  unregisterManagedReminder,
  cancelManagedReminders,
  clearManagedReminders,
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
}));

describe('BUG-073 — Izolarea pe domenii a registrului de notificări gestionate', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await clearManagedReminders();
  });

  test('1. Programarea mementourilor de masă nu șterge notificările din cămară', async () => {
    // 1. Înregistrăm o notificare de cămară
    await registerManagedReminder('pantry_notif_1', 'pantry_expiry');

    const reg1 = await getManagedReminders();
    expect(reg1.ids).toContain('pantry_notif_1');

    // 2. Setăm mementourile zilnice de masă
    await setManagedReminders('acc_123', ['meal_notif_1', 'meal_notif_2'], 'daily_meals');

    // 3. Verificăm că ambele domenii coexistă
    const reg2 = await getManagedReminders();
    expect(reg2.ids).toContain('pantry_notif_1');
    expect(reg2.ids).toContain('meal_notif_1');
    expect(reg2.ids).toContain('meal_notif_2');

    // Verificăm sub-registrele
    const mealsReg = await getManagedReminders('daily_meals');
    expect(mealsReg.ids).toEqual(['meal_notif_1', 'meal_notif_2']);

    const pantryReg = await getManagedReminders('pantry_expiry');
    expect(pantryReg.ids).toEqual(['pantry_notif_1']);
  });

  test('2. Anularea domeniului daily_meals anulează DOAR notificările de masă', async () => {
    await setManagedReminders('acc_123', ['meal_1', 'meal_2'], 'daily_meals');
    await registerManagedReminder('pantry_1', 'pantry_expiry');

    // Anulăm doar daily_meals
    await cancelManagedReminders('daily_meals');

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('meal_1');
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('meal_2');
    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalledWith('pantry_1');

    // Registrul general păstrează pantry_1
    const regFinal = await getManagedReminders();
    expect(regFinal.ids).toEqual(['pantry_1']);
  });

  test('3. Anularea globală (logout) anulează TOATE domeniile', async () => {
    await setManagedReminders('acc_123', ['meal_1'], 'daily_meals');
    await registerManagedReminder('pantry_1', 'pantry_expiry');

    // Anulăm tot
    await cancelManagedReminders();

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('meal_1');
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('pantry_1');

    const regFinal = await getManagedReminders();
    expect(regFinal.ids).toEqual([]);
  });
});
