import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Starea turului interactiv de pe Acasa este izolata per cont prin prefixul
 * `@getflow:home_tour_` (inregistrat si in userDataCleanup.ts).
 */
export const HOME_TOUR_STORAGE_PREFIX = '@getflow:home_tour_';

export function getHomeTourPromptKey(userId?: string | null): string {
  const scope = userId && userId.trim() ? userId.trim() : 'guest';
  return `${HOME_TOUR_STORAGE_PREFIX}${scope}_prompted_v1`;
}

export async function shouldShowHomeTourPrompt(userId?: string | null): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(getHomeTourPromptKey(userId));
    return val === null;
  } catch {
    return false;
  }
}

export async function markHomeTourPromptHandled(
  userId?: string | null,
  status: 'dismissed' | 'completed' | 'skipped' = 'dismissed',
): Promise<void> {
  try {
    await AsyncStorage.setItem(getHomeTourPromptKey(userId), status);
  } catch {
    // Non-blocking UI preference; ignore transient storage errors.
  }
}

type ReplayListener = () => void;
let pendingReplayRequest = false;
const replayListeners = new Set<ReplayListener>();

/** Solicita pornirea ghidului interactiv pe Home (de ex. din Profil). */
export function requestHomeTourReplay(): void {
  pendingReplayRequest = true;
  for (const listener of replayListeners) {
    listener();
  }
}

export function consumePendingHomeTourReplay(): boolean {
  if (!pendingReplayRequest) return false;
  pendingReplayRequest = false;
  return true;
}

export function subscribeHomeTourReplay(listener: ReplayListener): () => void {
  replayListeners.add(listener);
  return () => {
    replayListeners.delete(listener);
  };
}
