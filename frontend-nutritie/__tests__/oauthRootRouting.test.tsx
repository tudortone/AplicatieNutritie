import React from 'react';
import { render, waitFor, act } from '@testing-library/react-native';
import RootLayout from '../app/_layout';

const mockReplace = jest.fn();
const mockRouter = { replace: mockReplace, push: jest.fn() };
let mockPath = '/auth/callback';
let mockSession: { user: { id: string }; access_token: string } | null = null;
let mockDone = false;
let mockLoading = false;
const mockSetDone = jest.fn(async () => { mockDone = true; });
const mockSync = jest.fn();
const mockRestore = jest.fn(async (_profile: unknown) => {});
const mockFetch = jest.fn();
const mockPassthrough = ({ children }: { children: React.ReactNode }) => <>{children}</>;

jest.mock('expo-router', () => {
  const Stack = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  Stack.Screen = () => null;
  return { Stack, useRouter: () => mockRouter, usePathname: () => mockPath, useSegments: () => mockPath.startsWith('/auth') ? ['auth'] : ['onboarding'] };
});
jest.mock('../context/AuthContext', () => ({ AuthProvider: (props: { children: React.ReactNode }) => mockPassthrough(props), useAuth: () => ({ session: mockSession, loadingAuth: mockLoading }) }));
jest.mock('../context/ThemeContext', () => ({ AppThemeProvider: (props: { children: React.ReactNode }) => mockPassthrough(props), useTheme: () => ({ colors: { background: '#000', accent: '#fff' } }) }));
jest.mock('../hooks/useAppStore', () => ({ useAppStore: () => ({ isOnboardingDone: mockDone, syncFromAsyncStorage: mockSync, setOnboardingDone: mockSetDone }) }));
jest.mock('../context/OnboardingContext', () => ({ OnboardingProvider: (props: { children: React.ReactNode }) => mockPassthrough(props) }));
jest.mock('../context/NotificationBannerContext', () => ({ NotificationBannerProvider: (props: { children: React.ReactNode }) => mockPassthrough(props) }));
jest.mock('../context/GamificareContext', () => ({ GamificareProvider: (props: { children: React.ReactNode }) => mockPassthrough(props) }));
jest.mock('../context/PremiumContext', () => ({ PremiumProvider: (props: { children: React.ReactNode }) => mockPassthrough(props) }));
jest.mock('../context/FlowCreditsContext', () => ({
  FlowCreditsProvider: (props: { children: React.ReactNode }) => mockPassthrough(props),
  useFlowCredits: () => ({ balance: { total: 0 }, loading: false, unlimited: false, open: jest.fn() }),
}));
jest.mock('../components/FlowCreditsModalHost', () => ({ FlowCreditsModalHost: () => null }));
jest.mock('../context/AdsContext', () => ({ AdsProvider: (props: { children: React.ReactNode }) => mockPassthrough(props) }));
jest.mock('../components/GlobalErrorBoundary', () => ({ GlobalErrorBoundary: (props: { children: React.ReactNode }) => mockPassthrough(props) }));
jest.mock('@gorhom/bottom-sheet', () => ({ BottomSheetModalProvider: (props: { children: React.ReactNode }) => mockPassthrough(props) }));
jest.mock('react-native-gesture-handler', () => ({ GestureHandlerRootView: (props: { children: React.ReactNode }) => mockPassthrough(props) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaProvider: (props: { children: React.ReactNode }) => mockPassthrough(props) }));
jest.mock('@react-navigation/native', () => ({ DarkTheme: { colors: {} }, ThemeProvider: (props: { children: React.ReactNode }) => mockPassthrough(props) }));
jest.mock('@sentry/react-native', () => ({}));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('expo-notifications', () => ({}));
jest.mock('expo-constants', () => ({ __esModule: true, default: { appOwnership: 'expo' } }));
jest.mock('../hooks/useBiometrics', () => ({ useBiometrics: () => ({ isLocked: false }) }));
jest.mock('../components/LockScreen', () => () => null);
jest.mock('../components/OfflineBanner', () => () => null);
jest.mock('../hooks/useDailySync', () => ({ useDailySync: () => {} }));
jest.mock('../hooks/useNetworkStatus', () => ({ useNetworkStatus: () => ({ isOffline: false }) }));
jest.mock('../lib/notifications', () => ({ scheduleDailyMealReminders: jest.fn() }));
jest.mock('../lib/notificationConsent', () => ({ getConsent: async () => ({ accepted: false }), getManagedReminders: async () => ({ ids: [] }), cancelManagedReminders: async () => {} }));
jest.mock('../lib/offlineQueue', () => ({ processOfflineQueue: async () => {} }));
jest.mock('../lib/sincronizeazaTargeturi', () => ({ sincronizeazaTargeturiLocale: async () => {} }));
jest.mock('../lib/onboarding', () => ({ restaureazaProfilLocal: (profile: unknown) => mockRestore(profile) }));
jest.mock('../supabase', () => ({ supabase: {} }));
jest.mock('../i18n', () => ({}));

describe('AUTH-OAUTH-001 real root routing gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EXPO_PUBLIC_API_URL = 'https://api.invalid';
    global.fetch = mockFetch;
    mockPath = '/auth/callback'; mockSession = null; mockDone = false; mockLoading = false;
  });

  it('does not evict a cold callback before exchange even with incomplete onboarding', async () => {
    await render(<RootLayout />);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('does not evict a warm callback with an old session', async () => {
    mockSession = { user: { id: 'old' }, access_token: 'test-old' };
    mockDone = true;
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ exista: false }) });
    await render(<RootLayout />);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('holds completion while fetching a returning profile, then restores it and routes directly to tabs', async () => {
    mockPath = '/auth/complete';
    mockSession = { user: { id: 'returning' }, access_token: 'test-returning' };
    let resolveProfile!: (value: unknown) => void;
    mockFetch.mockImplementation(() => new Promise(resolve => { resolveProfile = resolve; }));
    await render(<RootLayout />);
    expect(mockReplace).not.toHaveBeenCalled();
    await act(async () => resolveProfile({ ok: true, json: async () => ({ exista: true, complet: true, profil: { caloriiTinta: 2000 } }) }));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(tabs)'));
    expect(mockRestore).toHaveBeenCalledWith({ caloriiTinta: 2000 });
    expect(mockReplace).not.toHaveBeenCalledWith('/onboarding');
  });

  it('routes a new account without profile or completed local plan to onboarding', async () => {
    mockPath = '/auth/complete';
    mockSession = { user: { id: 'new' }, access_token: 'test-new' };
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ exista: false }) });
    await render(<RootLayout />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/onboarding'));
    expect(mockReplace).not.toHaveBeenCalledWith('/(tabs)');
  });
});
