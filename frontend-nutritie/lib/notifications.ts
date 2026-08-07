import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export interface NotificationScheduleConfig {
  id: string;
  title: string;
  body: string;
  hour: number;
  minute: number;
}

export const DEFAULT_MEAL_REMINDERS: NotificationScheduleConfig[] = [
  {
    id: 'reminder_mic_dejun',
    title: '☀️ Bună dimineața!',
    body: 'Nu uita să îți înregistrezi micul dejun în NutriAI.',
    hour: 8,
    minute: 30,
  },
  {
    id: 'reminder_pranz',
    title: '🥗 Ora prânzului!',
    body: 'Scanează mâncarea pentru a-ți urmări macronuțrienții.',
    hour: 13,
    minute: 0,
  },
  {
    id: 'reminder_cina',
    title: '🌙 Bună seara!',
    body: 'Adaugă cina pentru a-ți completa jurnalul alimentar de azi.',
    hour: 19,
    minute: 30,
  },
];

export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    return finalStatus === 'granted';
  } catch {
    return false;
  }
}

export async function scheduleDailyMealReminders(
  reminders: NotificationScheduleConfig[] = DEFAULT_MEAL_REMINDERS
): Promise<string[]> {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) {
    return [];
  }

  // Curățăm mementourile anterioare pentru a evita duplicatele
  await cancelAllMealReminders();

  const scheduledIds: string[] = [];

  for (const reminder of reminders) {
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: reminder.title,
          body: reminder.body,
          sound: true,
          badge: 1,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: reminder.hour,
          minute: reminder.minute,
        } as unknown as Notifications.DailyTriggerInput,
      });

      scheduledIds.push(id);
    } catch (err) {
      if (__DEV__) console.warn(`[Notifications] Eroare la programarea ${reminder.id}:`, err);
    }
  }

  return scheduledIds;
}

export async function cancelAllMealReminders(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // Ignoră erorile la anulare
  }
}
