import React from 'react';
import { Alert, Platform, Linking } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import AuthScreen from '../app/auth';

const mockBrowser = jest.fn();
const mockAuthorize = jest.fn();
const mockExchange = jest.fn();
const mockSignInWithPassword = jest.fn();
let mockSession: any = null;
const mockRouter = { replace: jest.fn() };
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: jest.fn(), openAuthSessionAsync: (url: string, redirect: string) => mockBrowser(url, redirect) }));
jest.mock('../supabase', () => ({ supabase: { auth: {
  signInWithOAuth: (options: unknown) => mockAuthorize(options),
  exchangeCodeForSession: (code: string) => mockExchange(code),
  getSession: async () => ({ data: { session: mockSession }, error: null }),
  signInWithPassword: (creds: unknown) => mockSignInWithPassword(creds),
} } }));
jest.mock('../hooks/useAppStore', () => ({ useAppStore: () => ({ setOnboardingDone: jest.fn() }) }));
jest.mock('../lib/onboarding', () => ({ incarcaDateOnboarding: async () => null }));
jest.mock('../hooks/useResponsiveLayout', () => ({ useResponsiveLayout: () => ({ contentMaxWidth: 520 }) }));
jest.mock('../context/ThemeContext', () => ({ useTheme: () => ({ colors: { accent: '#fff', accentGradient: ['#fff', '#fff'], background: '#000', surfaceBg: '#111', cardBorder: '#222', textPrimary: '#fff', textSecondary: '#888' } }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('../components/ui/PressableScale', () => ({ PressableScale: ({ children, onPress, ...props }: any) => { const { Pressable } = require('react-native'); return <Pressable onPress={onPress} {...props}>{children}</Pressable>; } }));
jest.mock('../components/ui/KeyboardAwareScreen', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('expo-blur', () => ({ BlurView: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('lucide-react-native', () => {
  const Icon = () => null;
  return { Scan: Icon, ArrowRight: Icon, Mail: Icon, Lock: Icon, AlertCircle: Icon, CheckCircle2: Icon, Circle: Icon, Eye: Icon, EyeOff: Icon, Sparkles: Icon, ShieldCheck: Icon, FileText: Icon };
});

describe('AUTH-OAUTH-001 auth UI cancellation and retry', () => {
  const originalPlatform = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockAuthorize.mockResolvedValue({ data: { url: 'https://provider.invalid' }, error: null });
    mockSignInWithPassword.mockReset();
    mockSession = null;
    Platform.OS = originalPlatform;
  });

  afterEach(() => {
    Platform.OS = originalPlatform;
  });

  it('hides Apple on Android release surfaces while preserving Google and email auth', async () => {
    Platform.OS = 'android';
    const view = await render(<AuthScreen />);

    expect(view.queryByLabelText('Continuă cu Apple')).toBeNull();
    expect(view.getByLabelText('Continuă cu Google')).toBeTruthy();
    expect(view.getByPlaceholderText('auth.emailPlaceholder')).toBeTruthy();
  });

  it.each(['ios', 'web'] as const)('keeps Apple available on %s', async platform => {
    Platform.OS = platform;
    const view = await render(<AuthScreen />);
    expect(view.getByLabelText('Continuă cu Apple')).toBeTruthy();
  });

  it.each(['cancel', 'dismiss'])('re-enables Google after %s and shows localized feedback', async type => {
    mockBrowser.mockResolvedValue({ type });
    const view = await render(<AuthScreen />);
    await fireEvent.press(view.getByLabelText('Continuă cu Google'));
    await waitFor(() => expect(view.getByText('oauth.cancelled')).toBeTruthy());
    expect(view.getByLabelText('Continuă cu Google').props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(view.getByLabelText('Continuă cu Google'));
    expect(mockAuthorize).toHaveBeenCalledTimes(2);
    expect(mockExchange).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('re-enables Google on a provider failure without displaying its raw details', async () => {
    mockAuthorize.mockResolvedValue({ data: { url: null }, error: { message: 'private-provider-data' } });
    const view = await render(<AuthScreen />);
    await fireEvent.press(view.getByLabelText('Continuă cu Google'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('alerts.titluri.eroareOAuth', 'alerts.mesaje.problemaConexiuneOAuth'));
    expect(view.getByLabelText('Continuă cu Google').props.accessibilityState.disabled).toBe(false);
  });

  it('uses the canonical native redirect, validates success and establishes the exchanged session', async () => {
    mockBrowser.mockResolvedValue({ type: 'success', url: 'nutriai://auth/callback?code=fresh-code' });
    mockExchange.mockImplementation(async () => {
      mockSession = { user: { id: 'user-new' }, access_token: 'secret' };
      return { data: { session: mockSession }, error: null };
    });
    const view = await render(<AuthScreen />);

    await fireEvent.press(view.getByLabelText('Continuă cu Google'));

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/auth/complete'));
    expect(mockAuthorize).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'nutriai://auth/callback', skipBrowserRedirect: true },
    });
    expect(mockBrowser).toHaveBeenCalledWith('https://provider.invalid', 'nutriai://auth/callback');
    expect(mockExchange).toHaveBeenCalledWith('fresh-code');
  });

  it('renders terms and privacy policy legal consent notice with accessible links', async () => {
    Platform.OS = 'android';
    process.env.EXPO_PUBLIC_TERMS_OF_SERVICE_URL = 'https://getflow.app/termeni-si-conditii';
    process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL = 'https://getflow.app/politica-de-confidentialitate';
    const openUrlSpy = jest.spyOn(Linking, 'openURL').mockImplementation(async () => true);
    const view = await render(<AuthScreen />);

    expect(view.getByTestId('auth-legal-consent')).toBeTruthy();
    expect(view.getByText('authLegal.terms')).toBeTruthy();
    expect(view.getByText('authLegal.privacy')).toBeTruthy();
    expect(view.getByLabelText('authLegal.termsA11y')).toBeTruthy();
    expect(view.getByLabelText('authLegal.privacyA11y')).toBeTruthy();

    await fireEvent.press(view.getByLabelText('authLegal.termsA11y'));
    expect(openUrlSpy).toHaveBeenCalledWith(expect.stringContaining('http'));

    await fireEvent.press(view.getByLabelText('authLegal.privacyA11y'));
    expect(openUrlSpy).toHaveBeenCalledWith(expect.stringContaining('http'));
  });

  it('preserves email/password login flow on Android and passes credentials to Supabase', async () => {
    Platform.OS = 'android';
    mockSignInWithPassword.mockResolvedValue({ data: { user: { id: 'user-email' }, session: { user: { id: 'user-email' } } }, error: null });
    const view = await render(<AuthScreen />);

    fireEvent.changeText(view.getByPlaceholderText('auth.emailPlaceholder'), 'tester@getflow.app');
    fireEvent.changeText(view.getByPlaceholderText('auth.passwordPlaceholder'), 'SuperSecure123');
    await waitFor(() => {
      expect(view.getByPlaceholderText('auth.emailPlaceholder').props.value).toBe('tester@getflow.app');
      expect(view.getByPlaceholderText('auth.passwordPlaceholder').props.value).toBe('SuperSecure123');
    });
    await fireEvent.press(view.getByLabelText('auth.signInButton'));

    await waitFor(() => {
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: 'tester@getflow.app',
        password: 'SuperSecure123',
      });
    });
  });

  it('guarantees Apple login is not rendered on Android production', async () => {
    Platform.OS = 'android';
    const view = await render(<AuthScreen />);
    expect(view.queryByLabelText('Continuă cu Apple')).toBeNull();
    expect(view.queryByText('Apple')).toBeNull();
  });
});
