import AsyncStorage from '@react-native-async-storage/async-storage';
import { purgeLocalImageDrafts } from './imageOptimizer';

/**
 * P0-02 local account boundary.
 *
 * Older features read logical keys such as `greutate` or `apa_2026-09-13`
 * while their screen is active. This module treats them as the active user's
 * workspace. At every identity transition it seals that workspace below one
 * canonical user namespace, then restores the incoming user's workspace before
 * AuthContext publishes the identity. The registry is also the cleanup source,
 * so logout and migration cannot drift into separate hand-maintained lists.
 */

export const ACTIVE_LOCAL_USER_KEY = 'nutriai_active_local_user_v1';
export const USER_STORAGE_PREFIX = '@nutriai:user:v1:';
export const USER_STORAGE_REGISTRY_LOGICAL_KEY = '__registry__';
export const USER_STORAGE_TRANSITION_KEY = '@nutriai:user-transition:v1';
export const PENDING_DELETED_USER_KEY = '@getflow:pending-account-deletion:v1';

// Preferences and shared reference caches which intentionally survive users.
export const DEVICE_GLOBAL_EXACT_KEYS = new Set([
  'nutriai_theme',
  'getflow_language',
  'biometric_lock_enabled',
  'biometric_last_active_timestamp',
  'notifications_enabled',
  'nutriai_notification_consent',
  'nutriai_managed_reminders',
  'exercitii_cache',
  'exercitii_last_sync',
  PENDING_DELETED_USER_KEY,
]);

// Canonical registry of legacy logical keys whose active copy is user-bound.
// Dynamic keys are covered by USER_BOUND_PREFIXES below.
export const USER_BOUND_EXACT_KEYS = new Set([
  'greutate', 'greutateTinta', 'caloriiTinta', 'proteineTinta',
  'carbiTinta', 'grasimiTinta', 'nume_profil', 'avatar_url',
  'sex', 'varsta', 'inaltime', 'nivel_activitate', 'obiectiv',
  'greutate_istoric', 'favorite_foods', 'chat_history',
  'current_workout_session', 'current_workout_session_meta',
  'nutriai_active_workout_timer', 'nutriai_antrenamente_local_v2',
  'nutriai_workouts', 'gamificare_v1',
  'gamificare_v2_server_authoritative',
  'nutriai_quests_v1', 'nutriai_rewards_v1',
  'notificari_v1',
  'nutriai_last_workout_reset_date', 'nutriai_last_opened_date',
  'nutriai:last_reset_date', 'nutriai_apa_azi_ml',
  'nutriai_temp_calorii_azi', 'nutriai_mese_cache_azi',
  'health_sync_enabled', 'health_step_goal', 'health_sync_provider',
  'targeturi_pending_sync',
  'nutriai_image_cache_index_v1', 'nutriai:image-drafts',
  'nutriai_tip_closed_date', 'jurnal_poze_activate',
  'nutriai_camara_local_v3', 'nutriai_pantry_expiry_notif_enabled',
  'exercitii_recente', 'ascundeCardHealth',
]);

export const USER_BOUND_PREFIXES = [
  'apa_',
  'steps_total_',
  'manual_steps_',
  'nutriai_mese_',
  'nutriai_apa_',
  'nutriai_camara_',
  'nutriai_quest',
  'nutriai_workout',
  'targeturi_pending_sync_',
] as const;

// These stores already include a verified Supabase user id in their own key.
// They stay durable across logout and are not copied into the active workspace.
export const ALREADY_USER_SCOPED_PREFIXES = [
  'chat_history_',
  '@nutri_offline_meals_queue_',
  '@nutri_pending_macro_targets_',
] as const;

// Pre-auth onboarding may set this before the first login, so it is not part of
// ambiguous legacy cleanup. Once an authenticated owner exits, it must reset.
const SESSION_RESET_KEYS = ['nutriai-onboarding_done'] as const;

type TransitionPhase = 'started' | 'snapshot_done' | 'workspace_cleared' | 'restored';
type TransitionJournal = {
  version: 1;
  fromUserId: string | null;
  toUserId: string | null;
  phase: TransitionPhase;
};

function requireUserId(userId: string): string {
  const normalized = typeof userId === 'string' ? userId.trim() : '';
  if (!normalized) throw new TypeError('Este necesar id-ul canonic al utilizatorului autentificat.');
  return normalized;
}

export function userStorageKey(userId: string, logicalKey: string): string {
  const owner = encodeURIComponent(requireUserId(userId));
  if (!logicalKey) throw new TypeError('Cheia logică user-bound nu poate fi goală.');
  return `${USER_STORAGE_PREFIX}${owner}:${encodeURIComponent(logicalKey)}`;
}

function registryKey(userId: string): string {
  return userStorageKey(userId, USER_STORAGE_REGISTRY_LOGICAL_KEY);
}

export function isUserBoundWorkspaceKey(key: string): boolean {
  if (!key || key.startsWith(USER_STORAGE_PREFIX)) return false;
  if (DEVICE_GLOBAL_EXACT_KEYS.has(key)) return false;
  if (ALREADY_USER_SCOPED_PREFIXES.some((prefix) => key.startsWith(prefix))) return false;
  return USER_BOUND_EXACT_KEYS.has(key) || USER_BOUND_PREFIXES.some((prefix) => key.startsWith(prefix));
}

async function readRegistry(userId: string): Promise<string[]> {
  const raw = await AsyncStorage.getItem(registryKey(userId));
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? [...new Set(parsed.filter((key): key is string => typeof key === 'string' && isUserBoundWorkspaceKey(key)))]
      : [];
  } catch {
    return [];
  }
}

async function currentWorkspaceKeys(): Promise<string[]> {
  const allKeys = await AsyncStorage.getAllKeys();
  return allKeys.filter(isUserBoundWorkspaceKey);
}

async function snapshotWorkspace(userId: string): Promise<void> {
  const owner = requireUserId(userId);
  const currentKeys = await currentWorkspaceKeys();
  const previousRegistry = await readRegistry(owner);
  const currentSet = new Set(currentKeys);
  const deletedLogicalKeys = previousRegistry.filter((key) => !currentSet.has(key));

  if (deletedLogicalKeys.length > 0) {
    await AsyncStorage.multiRemove(deletedLogicalKeys.map((key) => userStorageKey(owner, key)));
  }

  if (currentKeys.length > 0) {
    const values = await AsyncStorage.multiGet(currentKeys);
    const scopedValues: [string, string][] = values
      .filter((entry): entry is [string, string] => entry[1] !== null)
      .map(([key, value]) => [userStorageKey(owner, key), value]);
    if (scopedValues.length > 0) await AsyncStorage.multiSet(scopedValues);
  }

  await AsyncStorage.setItem(registryKey(owner), JSON.stringify(currentKeys));
}

async function clearWorkspace(): Promise<void> {
  const keys = await currentWorkspaceKeys();
  if (keys.length > 0) await AsyncStorage.multiRemove(keys);
}

async function restoreWorkspace(userId: string): Promise<void> {
  const owner = requireUserId(userId);
  const logicalKeys = await readRegistry(owner);
  if (logicalKeys.length === 0) return;
  const scopedKeys = logicalKeys.map((key) => userStorageKey(owner, key));
  const stored = await AsyncStorage.multiGet(scopedKeys);
  const workspaceValues: [string, string][] = [];
  stored.forEach(([, value], index) => {
    if (value !== null) workspaceValues.push([logicalKeys[index], value]);
  });
  if (workspaceValues.length > 0) await AsyncStorage.multiSet(workspaceValues);
}

function parseJournal(raw: string | null): TransitionJournal | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<TransitionJournal>;
    const validUser = (value: unknown) => value === null || (typeof value === 'string' && value.trim().length > 0);
    const phases: TransitionPhase[] = ['started', 'snapshot_done', 'workspace_cleared', 'restored'];
    if (parsed.version !== 1 || !validUser(parsed.fromUserId) || !validUser(parsed.toUserId) || !phases.includes(parsed.phase as TransitionPhase)) {
      return null;
    }
    return parsed as TransitionJournal;
  } catch {
    return null;
  }
}

async function writeJournal(journal: TransitionJournal): Promise<void> {
  await AsyncStorage.setItem(USER_STORAGE_TRANSITION_KEY, JSON.stringify(journal));
}

async function completeTransition(journal: TransitionJournal): Promise<void> {
  let current = journal;

  if (current.phase === 'started') {
    if (current.fromUserId) await snapshotWorkspace(current.fromUserId);
    current = { ...current, phase: 'snapshot_done' };
    await writeJournal(current);
  }

  if (current.phase === 'snapshot_done') {
    await clearWorkspace();
    if (current.fromUserId) await AsyncStorage.multiRemove([...SESSION_RESET_KEYS]);
    current = { ...current, phase: 'workspace_cleared' };
    await writeJournal(current);
  }

  if (current.phase === 'workspace_cleared') {
    // A failed multiSet may have restored only part of a workspace. Clearing
    // again makes this phase idempotent before the complete retry.
    await clearWorkspace();
    if (current.toUserId) await restoreWorkspace(current.toUserId);
    current = { ...current, phase: 'restored' };
    await writeJournal(current);
  }

  if (current.toUserId) {
    await AsyncStorage.setItem(ACTIVE_LOCAL_USER_KEY, current.toUserId);
  } else {
    await AsyncStorage.removeItem(ACTIVE_LOCAL_USER_KEY);
  }
  await AsyncStorage.removeItem(USER_STORAGE_TRANSITION_KEY);
}

async function recoverPendingTransition(): Promise<void> {
  const raw = await AsyncStorage.getItem(USER_STORAGE_TRANSITION_KEY);
  if (!raw) return;
  const journal = parseJournal(raw);
  if (!journal) {
    // Unknown/corrupt ownership state is never assigned to an account.
    await clearWorkspace();
    await AsyncStorage.multiRemove([...SESSION_RESET_KEYS]);
    await AsyncStorage.removeItem(ACTIVE_LOCAL_USER_KEY);
    await AsyncStorage.removeItem(USER_STORAGE_TRANSITION_KEY);
    return;
  }
  await completeTransition(journal);
}

async function purgeDeletedUserData(owner: string): Promise<void> {
  // Fișierele trebuie eliminate înaintea indexului AsyncStorage care dovedește
  // proprietatea lor. Helper-ul este idempotent și nu atinge directoarele altui cont.
  await purgeLocalImageDrafts(owner);
  const registry = await readRegistry(owner);
  const allKeys = await AsyncStorage.getAllKeys();
  const chatPrefix = `chat_history_${owner}_`;
  const independentlyScoped = allKeys.filter((key) =>
    key === `chat_history_${owner}` ||
    key.startsWith(chatPrefix) ||
    key === `@nutri_offline_meals_queue_${owner}` ||
    key === `@nutri_pending_macro_targets_${owner}`,
  );
  const scoped = [
    ...registry.map((key) => userStorageKey(owner, key)),
    registryKey(owner),
    ...independentlyScoped,
  ];
  if (scoped.length > 0) await AsyncStorage.multiRemove([...new Set(scoped)]);

  const active = await AsyncStorage.getItem(ACTIVE_LOCAL_USER_KEY);
  if (active === owner) {
    await clearWorkspace();
    await AsyncStorage.multiRemove([...SESSION_RESET_KEYS]);
    await AsyncStorage.removeItem(ACTIVE_LOCAL_USER_KEY);
  }
}

async function recoverPendingDeletedUser(): Promise<void> {
  const pending = await AsyncStorage.getItem(PENDING_DELETED_USER_KEY);
  if (!pending || typeof pending !== 'string' || !pending.trim()) return;
  await purgeDeletedUserData(pending.trim());
  await AsyncStorage.removeItem(PENDING_DELETED_USER_KEY);
}

async function transitionWorkspace(fromUserId: string | null, toUserId: string | null): Promise<void> {
  const journal: TransitionJournal = {
    version: 1,
    fromUserId,
    toUserId,
    phase: 'started',
  };
  await writeJournal(journal);
  await completeTransition(journal);
}

/** Seal the active user's workspace on a confirmed logout. */
export async function clearLocalUserData(): Promise<void> {
  await recoverPendingDeletedUser();
  await recoverPendingTransition();
  const previous = await AsyncStorage.getItem(ACTIVE_LOCAL_USER_KEY);
  if (previous) {
    await transitionWorkspace(previous, null);
  } else {
    // Ownerless legacy data is ambiguous and may not be claimed later.
    await clearWorkspace();
  }
}

/**
 * Cold-start guard for a device with no authenticated session. It preserves
 * pre-auth onboarding staging (not in the registry), but seals a workspace
 * whose owner marker survived an interrupted logout/process death.
 */
export async function prepareLocalDataForNoSession(): Promise<boolean> {
  await recoverPendingDeletedUser();
  await recoverPendingTransition();
  const previous = await AsyncStorage.getItem(ACTIVE_LOCAL_USER_KEY);
  if (previous) {
    await transitionWorkspace(previous, null);
    return true;
  }
  await clearWorkspace();
  return false;
}

/** Irreversible local purge used only after remote account deletion succeeds. */
export async function purgeLocalDataForUser(userId: string): Promise<void> {
  const owner = requireUserId(userId);
  await recoverPendingTransition();
  // Jurnalul precede orice ștergere locală. Dacă procesul moare, următorul
  // bootstrap fără sesiune (sau următoarea tranziție) reia purjarea idempotent.
  await AsyncStorage.setItem(PENDING_DELETED_USER_KEY, owner);
  await purgeDeletedUserData(owner);
  await AsyncStorage.removeItem(PENDING_DELETED_USER_KEY);
}

/**
 * Prepare the logical-key workspace before AuthContext exposes userId.
 * Returns true only for a direct A -> B transition with an explicit old owner.
 */
export async function prepareLocalDataForUser(userId: string): Promise<boolean> {
  const incoming = requireUserId(userId);
  await recoverPendingDeletedUser();
  await recoverPendingTransition();
  const previous = await AsyncStorage.getItem(ACTIVE_LOCAL_USER_KEY);

  if (previous === incoming) {
    // The active owner marker makes legacy adoption verifiable. Presence of the
    // registry is the one-time migration marker; later keys are captured when
    // this account actually leaves, not on every token refresh.
    if (await AsyncStorage.getItem(registryKey(incoming)) === null) {
      await snapshotWorkspace(incoming);
    }
    return false;
  }

  if (!previous) {
    // Keep the onboarding flag only when it is backed by the current pre-auth
    // questionnaire. A lone flag is ambiguous legacy state from another user.
    const onboardingDraft = await AsyncStorage.getItem('nutriai-onboarding-date');
    if (!onboardingDraft) await AsyncStorage.multiRemove([...SESSION_RESET_KEYS]);
  }

  await transitionWorkspace(previous || null, incoming);
  return Boolean(previous);
}
