import AsyncStorage from '@react-native-async-storage/async-storage';

const ACTIVE_LOCAL_USER_KEY = 'nutriai_active_local_user_v1';

// Preferințe strict legate de dispozitiv, care pot rămâne după logout.
const DEVICE_KEYS = new Set([
  'nutriai_theme',
  'nutriai-onboarding_done',
  'biometric_enabled',
  'notifications_enabled',
]);

const USER_EXACT_KEYS = new Set([
  'greutate', 'greutateTinta', 'caloriiTinta', 'proteineTinta',
  'carbiTinta', 'grasimiTinta', 'nume_profil', 'avatar_url',
  'sex', 'varsta', 'inaltime', 'nivel_activitate', 'obiectiv',
  'greutate_istoric', 'favorite_foods', 'chat_history',
  'current_workout_session', 'current_workout_session_meta',
  'nutriai_active_workout_timer', 'nutriai_antrenamente_local_v2',
  'nutriai_workouts', 'gamificare_v1', 'nutriai_quests_v1',
  'notificari_v1',
  'nutriai_last_workout_reset_date', 'nutriai_last_opened_date',
  'nutriai:last_reset_date', 'nutriai_apa_azi_ml',
  'nutriai_temp_calorii_azi', 'nutriai_mese_cache_azi',
  // Date de sănătate strict per-utilizator — alt cont pe același telefon
  // nu trebuie să moștenească pașii/obiectivul/furnizorul contului precedent.
  'health_sync_enabled', 'health_step_goal', 'health_sync_provider',
]);

const USER_PREFIXES = [
  'chat_history_', 'nutriai_mese_', 'nutriai_apa_', 'nutriai_camara_',
  'nutriai_quest', 'nutriai_workout', 'manual_steps_',
];

export async function clearLocalUserData(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const removable = keys.filter((key) => {
    if (key === ACTIVE_LOCAL_USER_KEY) return true;
    if (DEVICE_KEYS.has(key)) return false;
    return USER_EXACT_KEYS.has(key) || USER_PREFIXES.some((prefix) => key.startsWith(prefix));
  });
  if (removable.length) await AsyncStorage.multiRemove(removable);
}

/**
 * Protejează un telefon folosit de mai multe conturi. La schimbarea userului,
 * starea locală a contului anterior este eliminată înainte de încărcarea UI-ului.
 */
export async function prepareLocalDataForUser(userId: string): Promise<void> {
  const previous = await AsyncStorage.getItem(ACTIVE_LOCAL_USER_KEY);
  if (previous && previous !== userId) await clearLocalUserData();
  await AsyncStorage.setItem(ACTIVE_LOCAL_USER_KEY, userId);
}
