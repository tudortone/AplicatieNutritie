import React from 'react';
import { Alert, Platform, Linking } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import AuthScreen from '../app/auth';

const mockBrowser = jest.fn();
const mockAuthorize = jest.fn();
const mockExchange = jest.fn();
const mockSignInWithPassword = jest.fn();
const mockSignUp = jest.fn();
const mockResend = jest.fn();
let mockSession: any = null;
const mockSessionPush = jest.fn();
const mockRouter = { replace: jest.fn(), push: mockSessionPush };
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: jest.fn(), openAuthSessionAsync: (url: string, redirect: string) => mockBrowser(url, redirect) }));
jest.mock('../supabase', () => ({ supabase: { auth: {
  signInWithOAuth: (options: unknown) => mockAuthorize(options),
  exchangeCodeForSession: (code: string) => mockExchange(code),
  getSession: async () => ({ data: { session: mockSession }, error: null }),
  signInWithPassword: (creds: unknown) => mockSignInWithPassword(creds),
  signUp: (creds: unknown) => mockSignUp(creds),
  resend: (params: unknown) => mockResend(params),
} } }));
jest.mock('../hooks/useAppStore', () => ({
  useAppStore: (selector?: (s: { setOnboardingDone: jest.Mock; setSkipOnboardingToAuth: jest.Mock }) => unknown) => {
    const state = { setOnboardingDone: jest.fn(), setSkipOnboardingToAuth: jest.fn() };
    return typeof selector === 'function' ? selector(state) : state;
  },
}));
jest.mock('../lib/onboarding', () => ({
  incarcaDateOnboarding: async () => null,
  construiesteMetadataOnboarding: () => ({}),
  sincronizeazaOnboardingLaProfil: jest.fn(async () => undefined),
}));
jest.mock('../hooks/useResponsiveLayout', () => ({ useResponsiveLayout: () => ({ contentMaxWidth: 520 }) }));
jest.mock('../hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
jest.mock('../context/ThemeContext', () => ({ useTheme: () => ({ colors: { accent: '#fff', accentGradient: ['#fff', '#fff'], background: '#000', surfaceBg: '#111', cardBorder: '#222', textPrimary: '#fff', textSecondary: '#888', danger: '#f55', success: '#3d9' } }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('../components/ui/PressableScale', () => ({ PressableScale: ({ children, onPress, ...props }: any) => { const { Pressable } = require('react-native'); return <Pressable onPress={onPress} {...props}>{children}</Pressable>; } }));
jest.mock('../components/ui/KeyboardAwareScreen', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('expo-blur', () => ({ BlurView: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('lucide-react-native', () => {
  const Icon = () => null;
  return { Scan: Icon, ArrowRight: Icon, Mail: Icon, Lock: Icon, AlertCircle: Icon, CheckCircle2: Icon, Circle: Icon, Eye: Icon, EyeOff: Icon, Sparkles: Icon, ShieldCheck: Icon, FileText: Icon, RefreshCw: Icon };
});

describe('AUTH-OAUTH-001 auth UI cancellation and retry', () => {
  const originalPlatform = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockAuthorize.mockResolvedValue({ data: { url: 'https://provider.invalid' }, error: null });
    mockSignInWithPassword.mockReset();
    mockSignUp.mockReset();
    mockResend.mockReset();
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

  it('explains fixture-only QA without opening a real OAuth browser session', async () => {
    const previousEnvironment = process.env.EXPO_PUBLIC_APP_ENV;
    process.env.EXPO_PUBLIC_APP_ENV = 'qa';
    try {
      Platform.OS = 'android';
      const view = await render(<AuthScreen />);
      await fireEvent.press(view.getByLabelText('Continuă cu Google'));
      expect(view.getByText('auth.qaOAuthUnavailable')).toBeTruthy();
      expect(mockAuthorize).not.toHaveBeenCalled();
      expect(mockBrowser).not.toHaveBeenCalled();
    } finally {
      if (previousEnvironment === undefined) delete process.env.EXPO_PUBLIC_APP_ENV;
      else process.env.EXPO_PUBLIC_APP_ENV = previousEnvironment;
    }
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

    await fireEvent.changeText(view.getByPlaceholderText('auth.emailPlaceholder'), 'tester@getflow.app');
    await fireEvent.changeText(view.getByPlaceholderText('auth.passwordPlaceholder'), 'SuperSecure123');
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

  it('routes "Forgot password?" cleanly to /auth/forgot-password without Alert.alert and omits admin alias', async () => {
    Platform.OS = 'android';
    const view = await render(<AuthScreen />);

    await fireEvent.changeText(view.getByPlaceholderText('auth.emailPlaceholder'), 'user@getflow.app');
    await fireEvent.press(view.getByLabelText('auth.forgotPasswordA11y'));

    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/auth/forgot-password',
      params: { email: 'user@getflow.app' },
    });
    expect(Alert.alert).not.toHaveBeenCalled();

    mockRouter.push.mockClear();
    await fireEvent.changeText(view.getByPlaceholderText('auth.emailPlaceholder'), 'admin');
    await fireEvent.press(view.getByLabelText('auth.forgotPasswordA11y'));
    expect(mockRouter.push).toHaveBeenCalledWith('/auth/forgot-password');
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('shows neutral password rules and confirm password field when switching to Sign-Up', async () => {
    Platform.OS = 'android';
    const view = await render(<AuthScreen />);

    await fireEvent.press(view.getByTestId('auth-mode-signup-tab'));

    expect(view.getByTestId('auth-confirm-password-input')).toBeTruthy();
    const minLengthText = view.getByText('auth.ruleMinLength');
    const flattened = Array.isArray(minLengthText.props.style)
      ? Object.assign({}, ...minLengthText.props.style)
      : minLengthText.props.style;
    expect(flattened.color).toBe('#888');
  });

  it('blocks sign-up when passwords do not match and shows validation error', async () => {
    Platform.OS = 'android';
    const view = await render(<AuthScreen />);

    await fireEvent.press(view.getByTestId('auth-mode-signup-tab'));
    await fireEvent.changeText(view.getByPlaceholderText('auth.signUpEmailPlaceholder'), 'newuser@getflow.app');
    await fireEvent.changeText(view.getByPlaceholderText('auth.passwordPlaceholder'), 'StrongPass1');
    await fireEvent.changeText(view.getByTestId('auth-confirm-password-input'), 'StrongPass2');
    await fireEvent.press(view.getByLabelText('auth.signUpButton'));

    expect(view.getByText('authValidation.passwordMismatch')).toBeTruthy();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('shows dedicated inline account-created card with resend & sign-in actions instead of Alert.alert', async () => {
    Platform.OS = 'android';
    mockSignUp.mockResolvedValue({
      data: { user: { id: 'new-u1', identities: [{ id: 'id-1' }] }, session: null },
      error: null,
    });
    mockResend.mockResolvedValue({ data: {}, error: null });
    const view = await render(<AuthScreen />);

    await fireEvent.press(view.getByTestId('auth-mode-signup-tab'));
    await fireEvent.changeText(view.getByPlaceholderText('auth.signUpEmailPlaceholder'), 'nou@getflow.app');
    await fireEvent.changeText(view.getByPlaceholderText('auth.passwordPlaceholder'), 'StrongPass1');
    await fireEvent.changeText(view.getByTestId('auth-confirm-password-input'), 'StrongPass1');
    await fireEvent.press(view.getByLabelText('auth.signUpButton'));

    await waitFor(() => expect(view.getByTestId('auth-signup-success-card')).toBeTruthy());
    expect(view.getByText('auth.signUpSuccessTitle')).toBeTruthy();
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(mockSignUp).toHaveBeenCalledWith(expect.objectContaining({
      email: 'nou@getflow.app',
      password: 'StrongPass1',
    }));

    // Cooldown starts at 60s, so resend button is disabled initially; switching to sign-in preserves email
    expect(view.getByTestId('auth-signup-resend-btn').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(view.getByTestId('auth-signup-goto-signin'));
    await waitFor(() => expect(view.getByPlaceholderText('auth.emailPlaceholder').props.value).toBe('nou@getflow.app'));
  });

  it('treats Supabase empty identities on signUp as existing account instead of false success', async () => {
    Platform.OS = 'android';
    mockSignUp.mockResolvedValue({
      data: { user: { id: 'existing-u1', identities: [] }, session: null },
      error: null,
    });
    const view = await render(<AuthScreen />);

    await fireEvent.press(view.getByTestId('auth-mode-signup-tab'));
    await fireEvent.changeText(view.getByPlaceholderText('auth.signUpEmailPlaceholder'), 'exists@getflow.app');
    await fireEvent.changeText(view.getByPlaceholderText('auth.passwordPlaceholder'), 'StrongPass1');
    await fireEvent.changeText(view.getByTestId('auth-confirm-password-input'), 'StrongPass1');
    await fireEvent.press(view.getByLabelText('auth.signUpButton'));

    await waitFor(() => expect(view.getByText('auth.errUserAlreadyRegistered')).toBeTruthy());
    expect(view.queryByTestId('auth-signup-success-card')).toBeNull();
    expect(view.getByTestId('auth-existing-account-signin-btn')).toBeTruthy();
  });

  it('does not show verify-email alert when signUp returns an active session immediately', async () => {
    Platform.OS = 'android';
    mockSignUp.mockResolvedValue({
      data: { user: { id: 'instant-u1' }, session: { user: { id: 'instant-u1' }, access_token: 'tok' } },
      error: null,
    });
    const view = await render(<AuthScreen />);

    await fireEvent.press(view.getByTestId('auth-mode-signup-tab'));
    await fireEvent.changeText(view.getByPlaceholderText('auth.signUpEmailPlaceholder'), 'instant@getflow.app');
    await fireEvent.changeText(view.getByPlaceholderText('auth.passwordPlaceholder'), 'StrongPass1');
    await fireEvent.changeText(view.getByTestId('auth-confirm-password-input'), 'StrongPass1');
    await fireEvent.press(view.getByLabelText('auth.signUpButton'));

    await waitFor(() => expect(mockSignUp).toHaveBeenCalledTimes(1));
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(view.queryByTestId('auth-signup-success-card')).toBeNull();
  });
});
