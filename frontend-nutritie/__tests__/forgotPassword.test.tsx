import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import ForgotPasswordScreen from '../app/auth/forgot-password';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);
let mockParams: Record<string, string> = {};
let mockIsOffline = false;

const mockResetPasswordForEmail = jest.fn();
const mockVerifyOtp = jest.fn();
const mockAlert = jest.spyOn(Alert, 'alert');

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: mockCanGoBack,
  }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('react-i18next', () => {
  const ro = require('../i18n/locales/ro.json');
  function resolveKey(obj: Record<string, unknown>, path: string, opts?: Record<string, unknown>): string {
    let curr: unknown = obj;
    for (const part of path.split('.')) {
      if (curr && typeof curr === 'object' && part in (curr as Record<string, unknown>)) {
        curr = (curr as Record<string, unknown>)[part];
      } else {
        return typeof opts?.defaultValue === 'string' ? opts.defaultValue : path;
      }
    }
    if (typeof curr !== 'string') return path;
    return Object.entries(opts ?? {}).reduce(
      (acc, [k, v]) => (k === 'defaultValue' ? acc : acc.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v))),
      curr,
    );
  }
  return {
    useTranslation: () => ({
      t: (k: string, opts?: Record<string, unknown>) => resolveKey(ro, k, opts),
    }),
  };
});
jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#090C0E',
      surface: '#12161A',
      surfaceElevated: '#181D22',
      accent: '#CCFF00',
      accentSecondary: '#A855F7',
      accentGradient: ['#CCFF00', '#A8FF3E'],
      textOnAccent: '#000000',
      textPrimary: '#FFFFFF',
      textSecondary: '#8B93A0',
      textTertiary: '#9AA0B0',
      cardBg: '#12161A',
      cardBorder: 'rgba(255,255,255,0.08)',
      inputBg: 'rgba(255,255,255,0.04)',
      inputBorder: 'rgba(255,255,255,0.06)',
      disabledBg: '#2A323D',
      disabledText: '#64748B',
      danger: '#F87171',
      dangerBg: 'rgba(255,77,77,0.12)',
      dangerBorder: 'rgba(255,77,77,0.3)',
      warning: '#FB923C',
      success: '#4ADE80',
      border: 'rgba(255,255,255,0.08)',
      overlayLight: 'rgba(255,255,255,0.04)',
      overlayStrong: 'rgba(255,255,255,0.08)',
    },
  }),
}));
jest.mock('../hooks/useResponsiveLayout', () => ({
  useResponsiveLayout: () => ({ contentMaxWidth: 520 }),
}));
jest.mock('../hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));
jest.mock('../hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isConnected: !mockIsOffline, isInternetReachable: !mockIsOffline, isOffline: mockIsOffline }),
}));
jest.mock('../components/ui/KeyboardAwareScreen', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('../components/ui/PressableScale', () => ({
  PressableScale: ({ children, onPress, disabled, ...props }: any) => {
    const { Pressable } = require('react-native');
    return <Pressable onPress={onPress} disabled={disabled} {...props}>{children}</Pressable>;
  },
}));
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  impactAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Error: 'Error', Success: 'Success' },
  ImpactFeedbackStyle: { Light: 'Light' },
}));
jest.mock('lucide-react-native', () => {
  const ReactMock = require('react');
  const { View } = require('react-native');
  const Icon = (props: any) => ReactMock.createElement(View, props);
  return {
    KeyRound: Icon,
    Mail: Icon,
    ShieldCheck: Icon,
    ArrowLeft: Icon,
    ArrowRight: Icon,
    X: Icon,
    WifiOff: Icon,
    AlertCircle: Icon,
    CheckCircle2: Icon,
    RefreshCw: Icon,
  };
});
jest.mock('../lib/oauthFlow', () => ({
  OAUTH_REDIRECT_URI: 'nutriai://auth/callback',
}));
jest.mock('../supabase', () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: (email: string, options: unknown) => mockResetPasswordForEmail(email, options),
      verifyOtp: (params: unknown) => mockVerifyOtp(params),
    },
  },
}));

describe('app/auth/forgot-password — UI & recovery flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
    mockIsOffline = false;
    mockAlert.mockClear();
    mockResetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    mockVerifyOtp.mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('prefills a valid email passed via route params and blocks invalid email inline without Alert.alert', async () => {
    mockParams = { email: 'user@getflow.app' };
    const view = await render(<ForgotPasswordScreen />);

    const emailInput = view.getByTestId('forgot-email-input');
    expect(emailInput.props.value).toBe('user@getflow.app');

    await fireEvent.press(view.getByTestId('forgot-clear-email'));
    expect(emailInput.props.value).toBe('');

    await fireEvent.changeText(emailInput, 'not-an-email');
    await fireEvent.press(view.getByTestId('forgot-send-btn'));

    await waitFor(() => expect(view.getByTestId('forgot-error-banner')).toBeTruthy());
    expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
    expect(mockAlert).not.toHaveBeenCalled();
  });

  it('never pre-populates the internal admin alias and displays expired-link notice cleanly', async () => {
    mockParams = { email: 'admin', reason: 'link_expired' };
    const view = await render(<ForgotPasswordScreen />);

    expect(view.getByTestId('forgot-email-input').props.value).toBe('');
    expect(view.getByTestId('forgot-link-expired-banner')).toBeTruthy();
  });

  it('warns offline inline and skips network calls when device is offline', async () => {
    mockIsOffline = true;
    const view = await render(<ForgotPasswordScreen />);

    expect(view.getByTestId('forgot-offline-banner')).toBeTruthy();
    await fireEvent.changeText(view.getByTestId('forgot-email-input'), 'user@getflow.app');
    await fireEvent.press(view.getByTestId('forgot-send-btn'));

    expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('sends resetPasswordForEmail with recovery redirect, transitions to step 2 OTP with neutral copy and cleans timer on unmount', async () => {
    jest.useFakeTimers();
    const view = await render(<ForgotPasswordScreen />);

    await fireEvent.changeText(view.getByTestId('forgot-email-input'), '  Elena@GetFlow.App  ');
    await fireEvent.press(view.getByTestId('forgot-send-btn'));

    await waitFor(() =>
      expect(mockResetPasswordForEmail).toHaveBeenCalledWith('elena@getflow.app', {
        redirectTo: 'nutriai://auth/callback?flow=recovery',
      }),
    );

    await waitFor(() => expect(view.getByTestId('forgot-otp-input')).toBeTruthy());
    const noticeChildren = view.getByTestId('forgot-step2-notice').props.children;
    expect(Array.isArray(noticeChildren) ? noticeChildren.join('') : String(noticeChildren)).toContain('elena@getflow.app');
    expect(view.getByTestId('forgot-resend-btn').props.accessibilityState.disabled).toBe(true);

    await act(async () => {
      jest.advanceTimersByTime(60000);
    });
    expect(view.getByTestId('forgot-resend-btn').props.accessibilityState.disabled).toBe(false);

    await view.unmount();
  });

  it('never exposes raw provider errors or account existence on 429 or server errors', async () => {
    mockResetPasswordForEmail.mockResolvedValueOnce({
      data: {},
      error: { status: 429, message: 'secret rate info' },
    });
    const view = await render(<ForgotPasswordScreen />);
    await fireEvent.changeText(view.getByTestId('forgot-email-input'), 'a@b.ro');
    await fireEvent.press(view.getByTestId('forgot-send-btn'));

    await waitFor(() => expect(view.getByTestId('forgot-error-banner')).toBeTruthy());
    expect(view.queryByText(/secret rate info/)).toBeNull();
    expect(view.getByText(/Prea multe/i)).toBeTruthy();
  });

  it('normalizes pasted 6-digit OTP code, verifies via verifyOtp(recovery), and navigates to /auth/noua-parola', async () => {
    const view = await render(<ForgotPasswordScreen />);
    await fireEvent.changeText(view.getByTestId('forgot-email-input'), 'user@getflow.app');
    await fireEvent.press(view.getByTestId('forgot-send-btn'));

    await waitFor(() => expect(view.getByTestId('forgot-verify-btn')).toBeTruthy());
    expect(view.getByTestId('forgot-verify-btn').props.accessibilityState.disabled).toBe(true);

    await fireEvent.changeText(view.getByTestId('forgot-otp-input'), '12 34-56ab');
    expect(view.getByTestId('forgot-otp-input').props.value).toBe('123456');
    expect(view.getByTestId('forgot-verify-btn').props.accessibilityState.disabled).toBe(false);

    await fireEvent.press(view.getByTestId('forgot-verify-btn'));
    await waitFor(() =>
      expect(mockVerifyOtp).toHaveBeenCalledWith({
        email: 'user@getflow.app',
        token: '123456',
        type: 'recovery',
      }),
    );
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/auth/noua-parola'));
  });

  it('shows controlled inline error when OTP is invalid or expired and supports switching email', async () => {
    mockVerifyOtp.mockResolvedValueOnce({ data: { session: null }, error: { message: 'Token has expired or is invalid' } });
    const view = await render(<ForgotPasswordScreen />);
    await fireEvent.changeText(view.getByTestId('forgot-email-input'), 'user@getflow.app');
    await fireEvent.press(view.getByTestId('forgot-send-btn'));

    await waitFor(() => expect(view.getByTestId('forgot-otp-input')).toBeTruthy());
    await fireEvent.changeText(view.getByTestId('forgot-otp-input'), '654321');
    await fireEvent.press(view.getByTestId('forgot-verify-btn'));

    await waitFor(() => expect(view.getByTestId('forgot-error-banner')).toBeTruthy());
    expect(view.queryByText(/Token has expired/)).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();

    await fireEvent.press(view.getByTestId('forgot-change-email-btn'));
    await waitFor(() => expect(view.getByTestId('forgot-send-btn')).toBeTruthy());
  });
});

