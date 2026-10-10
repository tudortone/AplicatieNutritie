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

type NotificationDestination = typeof NOTIFICATION_DESTINATIONS[number];

export function resolveNotificationDestination(data: unknown): NotificationDestination {
  if (!data || typeof data !== 'object') return '/notificari';
  const route = (data as Record<string, unknown>).route;
  return typeof route === 'string' && NOTIFICATION_DESTINATIONS.some((destination) => destination === route)
    ? route as NotificationDestination
    : '/notificari';
}

export interface ResumeNavigationState {
  previousAppState: string | null;
  nextAppState: string;
  pathname: string;
  explicitNotificationTapPending: boolean;
  navigatorReady: boolean;
  authLoading: boolean;
  authenticated: boolean;
  onboardingComplete: boolean;
  locked: boolean;
}

/** Only repair the known stale Notifications destination on a normal resume. */
export function shouldReturnFromNotificationsOnResume(state: ResumeNavigationState): boolean {
  return state.previousAppState !== 'active'
    && state.nextAppState === 'active'
    && state.pathname === '/notificari'
    && !state.explicitNotificationTapPending
    && state.navigatorReady
    && !state.authLoading
    && state.authenticated
    && state.onboardingComplete
    && !state.locked;
}
