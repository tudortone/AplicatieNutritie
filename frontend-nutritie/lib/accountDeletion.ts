import { cancelManagedReminders } from './notificationConsent';
import { clearOfflineQueue } from './offlineQueue';
import { purgeLocalDataForUser } from './userDataCleanup';
import { purgeAdGateState } from './ads/adGateStore';

type SignOutResult = void | { error?: unknown | null };

type FinalizeDependencies = {
  userId: string;
  purgeUserData?: (userId: string) => Promise<void>;
  clearUserQueue?: (userId: string) => Promise<void>;
  cancelReminders?: () => Promise<void>;
  purgeAdState?: (userId: string) => void;
  signOut: () => Promise<SignOutResult>;
};

/**
 * Rulează după ce backendul a confirmat ștergerea definitivă. Toate operațiile
 * sunt încercate, inclusiv sign-out, iar apelantul primește un verdict explicit
 * pentru a nu afișa „toate datele au fost șterse” când discul local a eșuat.
 */
export async function finalizeConfirmedAccountDeletion({
  userId,
  purgeUserData = purgeLocalDataForUser,
  clearUserQueue = clearOfflineQueue,
  cancelReminders = cancelManagedReminders,
  purgeAdState = purgeAdGateState,
  signOut,
}: FinalizeDependencies): Promise<{ localCleanupComplete: boolean }> {
  let localCleanupComplete = true;
  const attempt = async (operation: () => Promise<unknown>) => {
    try {
      await operation();
    } catch {
      localCleanupComplete = false;
    }
  };

  await attempt(() => purgeUserData(userId));
  await attempt(() => clearUserQueue(userId));
  await attempt(() => cancelReminders());
  await attempt(async () => purgeAdState(userId));
  await attempt(async () => {
    const result = await signOut();
    if (result && typeof result === 'object' && 'error' in result && result.error) {
      throw result.error;
    }
  });

  return { localCleanupComplete };
}
