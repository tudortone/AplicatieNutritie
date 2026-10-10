import { resolveNotificationDestination, shouldReturnFromNotificationsOnResume } from '../lib/resumeNavigation';

const normalResume = {
  previousAppState: 'background',
  nextAppState: 'active',
  pathname: '/notificari',
  explicitNotificationTapPending: false,
  navigatorReady: true,
  authLoading: false,
  authenticated: true,
  onboardingComplete: true,
  locked: false,
};

describe('resume navigation safeguards', () => {
  it('returns a normal resumed Notifications route to Home only when safe', () => {
    expect(shouldReturnFromNotificationsOnResume(normalResume)).toBe(true);
  });

  it.each([
    ['not a resume', { ...normalResume, previousAppState: 'active' }],
    ['explicit notification tap', { ...normalResume, explicitNotificationTapPending: true }],
    ['OAuth callback', { ...normalResume, pathname: '/auth/callback' }],
    ['onboarding', { ...normalResume, onboardingComplete: false }],
    ['locked app', { ...normalResume, locked: true }],
    ['auth still loading', { ...normalResume, authLoading: true }],
  ])('does not redirect during %s', (_label, state) => {
    expect(shouldReturnFromNotificationsOnResume(state)).toBe(false);
  });

  it('respects only known in-app destinations from an explicit notification', () => {
    expect(resolveNotificationDestination({ route: '/(tabs)/istoric' })).toBe('/(tabs)/istoric');
    expect(resolveNotificationDestination({ route: 'https://example.com' })).toBe('/notificari');
    expect(resolveNotificationDestination(null)).toBe('/notificari');
  });
});
