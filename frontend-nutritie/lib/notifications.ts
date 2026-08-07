import * as Notifications from 'expo-notifications';
import {
  getConsent,
  cancelManagedReminders,
  setManagedReminders,
} from './notificationConsent';

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
    body: 'Scanează mâncarea pentru a-ți urmări macronutrienții.',
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

/**
 * Programează mementurile zilnice de masă.
 *
 * TASK-16: gated pe consimțământ — fără consimțământ explicit (getConsent) NU
 * programează și NU cere permisiunea OS. Anulează DOAR mementurile create de
 * aplicație (cancelManagedReminders), nu cancel-all. Trigger-ul DailyTriggerInput
 * este ora locală a dispozitivului (fără câmp de fusi orar; OS-ul gestionează
 * ora de vară/iernă) — nu adăuga aici un câmp timezone.
 */
export async function scheduleDailyMealReminders(
  reminders: NotificationScheduleConfig[] = DEFAULT_MEAL_REMINDERS,
  accountId?: string
): Promise<string[]> {
  const consent = await getConsent();
  if (!consent.accepted) {
    return [];
  }

  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) {
    return [];
  }

  // Anulăm DOAR mementurile create anterior de aplicație, apoi le reprogramăm —
  // evităm duplicatele fără a atinge notificări străine.
  await cancelManagedReminders();

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

  await setManagedReminders(accountId, scheduledIds);
  return scheduledIds;
}

export async function cancelAllMealReminders(): Promise<void> {
  await cancelManagedReminders();
}