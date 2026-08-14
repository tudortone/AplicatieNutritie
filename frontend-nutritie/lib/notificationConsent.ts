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

export type ReminderDomain = 'daily_meals' | 'pantry_expiry' | 'general';

export interface NotificationConsentState {
  accepted: boolean;
  grantedAt: string | null;
}

export interface ManagedReminders {
  accountId?: string;
  ids: string[];
  domains?: Partial<Record<ReminderDomain, string[]>>;
}

const CONSENT_GOL: NotificationConsentState = { accepted: false, grantedAt: null };
const MANAGED_GOL: ManagedReminders = { ids: [], domains: {} };

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

export async function getManagedReminders(domain?: ReminderDomain): Promise<ManagedReminders> {
  try {
    const brut = await AsyncStorage.getItem(MANAGED_KEY);
    if (!brut) return { ids: [], domains: {} };
    const parsed = JSON.parse(brut);
    const accountId = typeof parsed?.accountId === 'string' ? parsed.accountId : undefined;
    const rawIds: string[] = Array.isArray(parsed?.ids) ? parsed.ids : [];
    const domains: Partial<Record<ReminderDomain, string[]>> =
      parsed?.domains && typeof parsed.domains === 'object' ? parsed.domains : {};

    if (domain) {
      const domainIds = domains[domain] || (domain === 'daily_meals' && !parsed.domains ? rawIds : []);
      return { accountId, ids: domainIds, domains };
    }

    // Union complet al tuturor ID-urilor
    const allIdsSet = new Set<string>(rawIds);
    for (const dList of Object.values(domains)) {
      if (Array.isArray(dList)) {
        for (const id of dList) allIdsSet.add(id);
      }
    }

    return {
      accountId,
      ids: Array.from(allIdsSet),
      domains,
    };
  } catch {
    return { ids: [], domains: {} };
  }
}

export async function setManagedReminders(
  accountId: string | undefined,
  ids: string[],
  domain: ReminderDomain = 'daily_meals',
): Promise<void> {
  const reg = await getManagedReminders();
  const nextDomains: Partial<Record<ReminderDomain, string[]>> = {
    ...reg.domains,
    [domain]: ids,
  };

  const allIdsSet = new Set<string>();
  for (const dList of Object.values(nextDomains)) {
    if (Array.isArray(dList)) {
      for (const id of dList) allIdsSet.add(id);
    }
  }

  const stare: ManagedReminders = {
    accountId: accountId ?? reg.accountId,
    ids: Array.from(allIdsSet),
    domains: nextDomains,
  };
  await AsyncStorage.setItem(MANAGED_KEY, JSON.stringify(stare));
}

/**
 * Adaugă UN id în registry-ul de mementouri gestionate pe domeniul specificat,
 * fără să șteargă mementourile din alte domenii (BUG-073).
 */
export async function registerManagedReminder(id: string, domain: ReminderDomain = 'general'): Promise<void> {
  const reg = await getManagedReminders();
  const domainIds = reg.domains?.[domain] || [];
  if (!domainIds.includes(id)) {
    await setManagedReminders(reg.accountId, [...domainIds, id], domain);
  }
}

/** Scoate UN id din registry-ul de mementouri gestionate. */
export async function unregisterManagedReminder(id: string, domain?: ReminderDomain): Promise<void> {
  const reg = await getManagedReminders();
  if (domain) {
    const domainIds = reg.domains?.[domain] || [];
    if (domainIds.includes(id)) {
      await setManagedReminders(reg.accountId, domainIds.filter((x) => x !== id), domain);
    }
  } else {
    // Căutare în toate domeniile
    const nextDomains: Partial<Record<ReminderDomain, string[]>> = {};
    for (const [d, list] of Object.entries(reg.domains || {})) {
      if (Array.isArray(list)) {
        nextDomains[d as ReminderDomain] = list.filter((x) => x !== id);
      }
    }
    const allIdsSet = new Set<string>();
    for (const dList of Object.values(nextDomains)) {
      if (Array.isArray(dList)) {
        for (const itm of dList) allIdsSet.add(itm);
      }
    }
    const stare: ManagedReminders = {
      accountId: reg.accountId,
      ids: Array.from(allIdsSet),
      domains: nextDomains,
    };
    await AsyncStorage.setItem(MANAGED_KEY, JSON.stringify(stare));
  }
}

export async function clearManagedReminders(domain?: ReminderDomain): Promise<void> {
  if (domain) {
    const reg = await getManagedReminders();
    await setManagedReminders(reg.accountId, [], domain);
  } else {
    await AsyncStorage.setItem(MANAGED_KEY, JSON.stringify(MANAGED_GOL));
  }
}

/**
 * Anulează mementourile înregistrate de această aplicație. Dacă se specifică
 * un domeniu (ex: 'daily_meals'), anulează DOAR acel domeniu și păstrează celelalte
 * (ex: 'pantry_expiry'). Fără domeniu, anulează toate mementourile (ex: logout / revocare).
 */
export async function cancelManagedReminders(domain?: ReminderDomain): Promise<void> {
  const reg = await getManagedReminders(domain);
  const targetIds = reg.ids;
  try {
    for (const id of targetIds) {
      await Notifications.cancelScheduledNotificationAsync(id);
    }
  } catch {
    // tolerăm erori pe dispozitiv la anulare; registry-ul se actualizează oricum
  }
  await clearManagedReminders(domain);
}