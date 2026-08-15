import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import {
  getManagedReminders,
  setManagedReminders,
  registerManagedReminder,
  unregisterManagedReminder,
  cancelManagedReminders,
  clearManagedReminders,
  migreazaRegistryLegacy,
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
    multiRemove: jest.fn(async (keys: string[]) => {
      for (const k of keys) delete store[k];
    }),
    clear: jest.fn(async () => {
      store = {};
    }),
  };
});

jest.mock('expo-notifications', () => ({
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
}));

const cancelNotifMock = Notifications.cancelScheduledNotificationAsync as jest.Mock;

describe('BUG-073 & REV-004 — Registru notificări gestionate & migrare legacy', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    cancelNotifMock.mockResolvedValue(undefined);
  });

  test('1. Programarea mementourilor de masă nu șterge notificările din cămară', async () => {
    await registerManagedReminder('pantry_notif_1', 'pantry_expiry');

    const reg1 = await getManagedReminders();
    expect(reg1.ids).toContain('pantry_notif_1');

    await setManagedReminders('acc_123', ['meal_notif_1', 'meal_notif_2'], 'daily_meals');

    const reg2 = await getManagedReminders();
    expect(reg2.ids).toContain('pantry_notif_1');
    expect(reg2.ids).toContain('meal_notif_1');
    expect(reg2.ids).toContain('meal_notif_2');

    const mealsReg = await getManagedReminders('daily_meals');
    expect(mealsReg.ids).toEqual(['meal_notif_1', 'meal_notif_2']);

    const pantryReg = await getManagedReminders('pantry_expiry');
    expect(pantryReg.ids).toEqual(['pantry_notif_1']);
  });

  test('2. Anularea domeniului daily_meals anulează DOAR notificările de masă', async () => {
    await setManagedReminders('acc_123', ['meal_1', 'meal_2'], 'daily_meals');
    await registerManagedReminder('pantry_1', 'pantry_expiry');

    await cancelManagedReminders('daily_meals');

    expect(cancelNotifMock).toHaveBeenCalledWith('meal_1');
    expect(cancelNotifMock).toHaveBeenCalledWith('meal_2');
    expect(cancelNotifMock).not.toHaveBeenCalledWith('pantry_1');

    const regFinal = await getManagedReminders();
    expect(regFinal.ids).toEqual(['pantry_1']);
  });

  test('3. Anularea globală (logout) anulează TOATE domeniile', async () => {
    await setManagedReminders('acc_123', ['meal_1'], 'daily_meals');
    await registerManagedReminder('pantry_1', 'pantry_expiry');

    await cancelManagedReminders();

    expect(cancelNotifMock).toHaveBeenCalledWith('meal_1');
    expect(cancelNotifMock).toHaveBeenCalledWith('pantry_1');

    const regFinal = await getManagedReminders();
    expect(regFinal.ids).toEqual([]);
  });

  describe('REV-004 — Migrare deterministă a formatului legacy fără ID-uri orfane', () => {
    test('1. format legacy real -> prima operație pe daily_meals nu pierde ID-urile existente (nu lasă orfani)', async () => {
      // Format legacy în AsyncStorage: conține ids dar nu conține obiectul domains
      const legacyState = { accountId: 'acc_legacy', ids: ['meal_legacy_1', 'pantry_legacy_1'] };
      await AsyncStorage.setItem('nutriai_managed_reminders', JSON.stringify(legacyState));

      // Prima operație pe noul format (actualizare memento mese)
      await setManagedReminders('acc_legacy', ['meal_new_1', 'meal_new_2'], 'daily_meals');

      const reg = await getManagedReminders();
      // ID-urile din cămară/general moștenite din legacy nu au fost șterse din urmărire
      expect(reg.ids).toContain('pantry_legacy_1');
      expect(reg.ids).toContain('meal_new_1');
      expect(reg.ids).toContain('meal_new_2');

      const dailyMeals = await getManagedReminders('daily_meals');
      expect(dailyMeals.ids).toEqual(['meal_new_1', 'meal_new_2']);
    });

    test('2. format legacy real -> prima operație pe cămară nu pierde ID-urile de masă', async () => {
      const legacyState = { accountId: 'acc_legacy', ids: ['meal_legacy_1', 'pantry_legacy_1'] };
      await AsyncStorage.setItem('nutriai_managed_reminders', JSON.stringify(legacyState));

      await registerManagedReminder('pantry_new_1', 'pantry_expiry');

      const reg = await getManagedReminders();
      expect(reg.ids).toContain('meal_legacy_1');
      expect(reg.ids).toContain('pantry_new_1');
    });

    test('3. migrarea este idempotentă la multiple citiri și scrieri', async () => {
      const legacyState = { accountId: 'acc_legacy', ids: ['id_1', 'id_2'] };
      const m1 = migreazaRegistryLegacy(legacyState);
      const m2 = migreazaRegistryLegacy(m1);

      expect(m1.ids).toEqual(['id_1', 'id_2']);
      expect(m2.ids).toEqual(['id_1', 'id_2']);
      expect(m2.domains?.general).toEqual(['id_1', 'id_2']);
    });

    test('4. logout anulează toate ID-urile migrate și curente', async () => {
      const legacyState = { accountId: 'acc_legacy', ids: ['legacy_rem_1', 'legacy_rem_2'] };
      await AsyncStorage.setItem('nutriai_managed_reminders', JSON.stringify(legacyState));

      await registerManagedReminder('pantry_active_1', 'pantry_expiry');

      await cancelManagedReminders();

      expect(cancelNotifMock).toHaveBeenCalledWith('legacy_rem_1');
      expect(cancelNotifMock).toHaveBeenCalledWith('legacy_rem_2');
      expect(cancelNotifMock).toHaveBeenCalledWith('pantry_active_1');

      const reg = await getManagedReminders();
      expect(reg.ids).toEqual([]);
    });

    test('5. eșecul la anularea unei notificări pe dispozitiv o păstrează în registry pentru retry', async () => {
      await setManagedReminders('acc_1', ['ok_id', 'fail_id'], 'daily_meals');

      cancelNotifMock.mockImplementation(async (id: string) => {
        if (id === 'fail_id') throw new Error('OS cancel failed');
      });

      await cancelManagedReminders();

      // fail_id este reținut în registry pentru reîncercare, nu e pierdut
      const reg = await getManagedReminders();
      expect(reg.ids).toContain('fail_id');
      expect(reg.ids).not.toContain('ok_id');
    });
  });
});
