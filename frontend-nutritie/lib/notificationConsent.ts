/**
 * notificationConsent.ts — Sursa unică de adevăr pentru consimțământul de
 * notificări + registrul ID-urilor de memento create de aplicație.
 *
 * TASK-16: notificările NU se programează la login; se programează doar după un
 * consimțământ explicit, cu marcaj de timp, persisat pe dispozitiv. Aplicația
 * anulează DOAR mementourile pe care le-a creat (niciodată cancel-all).
 *
 * Regula de bază: aici nu se stochează text nici identități de utilizator — doar
 * flag-uri, un timp și id-uri de notificare. Astfel starea este independentă de
 * limbă (supraviețuiește schimbării de limbă) și nu expune date personale.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

const CONSENT_KEY = 'nutriai_notification_consent';
const MANAGED_KEY = 'nutriai_managed_reminders';

export interface NotificationConsentState {
  accepted: boolean;
  grantedAt: string | null;
}

export interface ManagedReminders {
  accountId?: string;
  ids: string[];
}

const CONSENT_GOL: NotificationConsentState = { accepted: false, grantedAt: null };
const MANAGED_GOL: ManagedReminders = { ids: [] };

export async function getConsent(): Promise<NotificationConsentState> {
  try {
    const brut = await AsyncStorage.getItem(CONSENT_KEY);
    if (!brut) return { ...CONSENT_GOL };
    const parsed = JSON.parse(brut);
    return {
      accepted: parsed?.accepted === true,
      grantedAt: typeof parsed?.grantedAt === 'string' ? parsed.grantedAt : null,
    };
  } catch {
    return { ...CONSENT_GOL };
  }
}

export async function grantConsent(): Promise<void> {
  const stare: NotificationConsentState = {
    accepted: true,
    grantedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(CONSENT_KEY, JSON.stringify(stare));
}

export async function revokeConsent(): Promise<void> {
  await AsyncStorage.setItem(CONSENT_KEY, JSON.stringify(CONSENT_GOL));
}

export async function getManagedReminders(): Promise<ManagedReminders> {
  try {
    const brut = await AsyncStorage.getItem(MANAGED_KEY);
    if (!brut) return { ids: [] };
    const parsed = JSON.parse(brut);
    return {
      accountId: typeof parsed?.accountId === 'string' ? parsed.accountId : undefined,
      ids: Array.isArray(parsed?.ids) ? parsed.ids : [],
    };
  } catch {
    return { ids: [] };
  }
}

export async function setManagedReminders(accountId: string | undefined, ids: string[]): Promise<void> {
  const stare: ManagedReminders = { accountId, ids };
  await AsyncStorage.setItem(MANAGED_KEY, JSON.stringify(stare));
}

export async function clearManagedReminders(): Promise<void> {
  await AsyncStorage.setItem(MANAGED_KEY, JSON.stringify(MANAGED_GOL));
}

/**
 * Anulează DOAR mementurile înregistrate de această aplicație (registry-ul
 * MANAGED_KEY). Nu apelează niciodată cancelAllScheduledNotificationsAsync, ca
 * să nu șteargă notificări pe care aplicația nu le-a creat.
 */
export async function cancelManagedReminders(): Promise<void> {
  const { ids } = await getManagedReminders();
  try {
    for (const id of ids) {
      await Notifications.cancelScheduledNotificationAsync(id);
    }
  } catch {
    // tolerăm erori pe dispozitiv la anulare; registry-ul se golește oricum
  }
  await clearManagedReminders();
}