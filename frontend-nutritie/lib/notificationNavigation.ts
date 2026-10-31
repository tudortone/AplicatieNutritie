const NOTIFICATION_DESTINATIONS = [
  '/',
  '/notificari',
  '/camera',
  '/(tabs)',
  '/(tabs)/istoric',
  '/(tabs)/statistici',
  '/(tabs)/antrenamente',
  '/(tabs)/chat',
  '/(tabs)/profil',
] as const;

export type NotificationDestination = typeof NOTIFICATION_DESTINATIONS[number];

export interface NotificationResponseLike {
  actionIdentifier?: unknown;
  notification?: {
    date?: unknown;
    request?: {
      identifier?: unknown;
      content?: { data?: unknown };
    };
  };
}

export function resolveNotificationDestination(data: unknown): NotificationDestination {
  if (!data || typeof data !== 'object') return '/notificari';
  const route = (data as Record<string, unknown>).route;
  return typeof route === 'string' && NOTIFICATION_DESTINATIONS.some((destination) => destination === route)
    ? route as NotificationDestination
    : '/notificari';
}

/**
 * Stable identity for one notification interaction. The delivery timestamp is
 * included because repeating local notifications reuse a request identifier.
 * No title, body, or notification data is persisted.
 */
export function getNotificationResponseKey(response: NotificationResponseLike): string | null {
  const requestId = response.notification?.request?.identifier;
  if (typeof requestId !== 'string' || !requestId) return null;
  const date = response.notification?.date;
  const action = response.actionIdentifier;
  return JSON.stringify([
    requestId,
    typeof date === 'number' || typeof date === 'string' ? date : null,
    typeof action === 'string' ? action : '',
  ]);
}

export interface NotificationResponseDispatcherDependencies {
  loadHandledKeys: () => Promise<string[]>;
  saveHandledKeys: (keys: string[]) => Promise<void>;
  navigate: (destination: NotificationDestination, response: NotificationResponseLike) => void;
  getLastResponse: () => NotificationResponseLike | null;
  clearLastResponse: () => void;
}

export interface NotificationResponseSubscription {
  remove: () => void;
}

/** Subscribe only to actual response events; do not route from a stale startup snapshot. */
export function subscribeToNotificationResponses(
  subscribe: (listener: (response: NotificationResponseLike) => void) => NotificationResponseSubscription,
  dispatch: (response: NotificationResponseLike) => Promise<boolean>,
): () => void {
  const subscription = subscribe((response) => {
    void dispatch(response).catch(() => {});
  });
  return () => subscription.remove();
}

/**
 * Serializes native response events, deduplicates cold-start/listener delivery
 * and process-restart replays, and clears Expo's native last-response state only
 * when it still refers to the response being handled.
 */
export function createNotificationResponseDispatcher(
  dependencies: NotificationResponseDispatcherDependencies,
): (response: NotificationResponseLike) => Promise<boolean> {
  let handledKeys: string[] = [];
  let storageLoaded = false;
  let queue: Promise<unknown> = Promise.resolve();

  const clearIfCurrent = (key: string) => {
    try {
      if (getNotificationResponseKey(dependencies.getLastResponse() ?? {}) === key) {
        dependencies.clearLastResponse();
      }
    } catch {
      // Navigation must remain usable if a platform does not expose this API.
    }
  };

  return (response) => {
    const result = queue.then(async () => {
      const key = getNotificationResponseKey(response);
      if (!key) return false;

      if (!storageLoaded) {
        try {
          const stored = await dependencies.loadHandledKeys();
          handledKeys = stored.filter((entry) => typeof entry === 'string');
        } catch {
          // The in-memory guard still prevents duplicate event delivery this run.
        }
        storageLoaded = true;
      }

      if (handledKeys.includes(key)) {
        clearIfCurrent(key);
        return false;
      }

      // Record before navigation so parallel/replayed native events cannot push
      // the same destination twice. Persist only the opaque response key.
      handledKeys = [...handledKeys, key];
      try {
        await dependencies.saveHandledKeys(handledKeys);
      } catch {
        // A transient storage failure should not discard a real user tap.
      }

      const data = response.notification?.request?.content?.data;
      dependencies.navigate(resolveNotificationDestination(data), response);
      clearIfCurrent(key);
      return true;
    });

    queue = result.then(() => undefined, () => undefined);
    return result;
  };
}
