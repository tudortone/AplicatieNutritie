import { checkAndSchedulePantryExpiryNotification } from '../lib/pantryNotifications';
import {
  grantConsent,
  revokeConsent,
  getManagedReminders,
  clearManagedReminders,
  cancelManagedReminders,
  registerManagedReminder,
} from '../lib/notificationConsent';
import type { ProdusCamara } from '../hooks/useCamara';
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

jest.mock('expo-notifications', () => {
  let urmatorulId = 0;
  let programate: any[] = [];
  return {
    SchedulableTriggerInputTypes: { DAILY: 'daily' },
    getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
    requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
    scheduleNotificationAsync: jest.fn(async (args: any) => {
      urmatorulId += 1;
      const id = `pantry_${urmatorulId}`;
      programate.push({ identifier: id, content: args.content });
      return id;
    }),
    getAllScheduledNotificationsAsync: jest.fn(async () => [...programate]),
    cancelScheduledNotificationAsync: jest.fn(async (id: string) => {
      programate = programate.filter((n) => n.identifier !== id);
    }),
    cancelAllScheduledNotificationsAsync: jest.fn(async () => {
      programate = [];
    }),
    setNotificationChannelAsync: jest.fn(async () => {}),
    __resetProgramate: () => {
      programate = [];
      urmatorulId = 0;
    },
  };
});

const produseCuExpirare: ProdusCamara[] = [
  {
    id: 'c1',
    user_id: 'user_a',
    barcode: '5940001000001',
    nume: 'Lapte',
    calorii_100g: 60,
    proteine_100g: 3.2,
    grasimi_100g: 3,
    carbohidrati_100g: 4.8,
    created_at: '2026-08-01T08:00:00.000Z',
    is_congelat: false,
    zile_valabilitate: 1,
  },
];

const produseFaraExpirare: ProdusCamara[] = [
  {
    id: 'c2',
    user_id: 'user_a',
    barcode: '5940002000002',
    nume: 'Conserve',
    calorii_100g: 120,
    proteine_100g: 8,
    grasimi_100g: 5,
    carbohidrati_100g: 10,
    created_at: '2026-08-01T08:00:00.000Z',
    is_congelat: true,
    zile_valabilitate: 90,
  },
];

describe('BUG-057 — Notificarea de expirare cămară e izolată la deconectare/revocare', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    (Notifications as any).__resetProgramate();
    await revokeConsent();
    await clearManagedReminders();
  });

  test('1. Fără consimțământ NU programează și NU înregistrează id în registry', async () => {
    await checkAndSchedulePantryExpiryNotification(produseCuExpirare);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    const stare = await getManagedReminders();
    expect(stare.ids.length).toBe(0);
  });

  test('2. Cu consimțământ, înregistrează id-ul notificării de cămară în registry', async () => {
    await grantConsent();
    await checkAndSchedulePantryExpiryNotification(produseCuExpirare);

    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          data: expect.objectContaining({ type: 'pantry_expiry' }),
        }),
        trigger: expect.objectContaining({ hour: 10, minute: 0 }),
      })
    );

    const stare = await getManagedReminders();
    expect(stare.ids).toContain('pantry_1');
  });

  test('3. cancelManagedReminders anulează și notificarea de cămară (izolare la logout/revocare)', async () => {
    await grantConsent();
    await checkAndSchedulePantryExpiryNotification(produseCuExpirare);
    // pregătim și un memento de masă în registry, ca să verificăm coexistența
    await registerManagedReminder('masa_1');

    // logout/revocare/comutare cont:
    await cancelManagedReminders();

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('pantry_1');
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('masa_1');
    expect(Notifications.cancelAllScheduledNotificationsAsync).not.toHaveBeenCalled();
    const stare = await getManagedReminders();
    expect(stare.ids.length).toBe(0);
  });

  test('4. Reprogramarea înlocuiește id-ul vechi din registry cu cel nou', async () => {
    await grantConsent();
    await checkAndSchedulePantryExpiryNotification(produseCuExpirare);
    expect((await getManagedReminders()).ids).toEqual(['pantry_1']);

    // re-rulare: anulează pantry_1 veche, programează pantry_2, înlocuiește registry
    await checkAndSchedulePantryExpiryNotification(produseCuExpirare);

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('pantry_1');
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
    const stare = await getManagedReminders();
    expect(stare.ids).toEqual(['pantry_2']);
  });

  test('5. Fără produse în prag de expirare, scoate id-ul vechi din registry', async () => {
    await grantConsent();
    await checkAndSchedulePantryExpiryNotification(produseCuExpirare);
    expect((await getManagedReminders()).ids).toEqual(['pantry_1']);

    // ecranul se deschide din nou, dar niciun produs nu mai expiră mâine
    await checkAndSchedulePantryExpiryNotification(produseFaraExpirare);

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('pantry_1');
    const stare = await getManagedReminders();
    expect(stare.ids).toEqual([]);
  });
});
