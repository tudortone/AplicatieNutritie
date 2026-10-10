import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SUPPORT_EMAIL, buildSupportMailto } from '../constants/support';
import { SupportEmailFooter } from '../components/ui/SupportEmailFooter';
import { FeedbackModal } from '../components/ui/FeedbackModal';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockClipboardSet = jest.fn(async (_value: string) => true);
const mockSubmitFeedback = jest.fn();
const mockT = (key: string) => ({
  'profile.supportEmailLabel': 'Support email',
  'profile.supportEmailCopy': 'Copy',
  'profile.supportEmailCopied': 'Copied',
  'profile.supportEmailCopyA11y': 'Copy support email address',
  'profile.supportEmailOpenA11y': 'Open email app',
  'profile.supportEmailCopyFailed': 'Could not copy address',
  'profile.supportEmailOpenFailed': 'Could not open email app',
  'profile.feedbackTitle': 'Feedback',
  'profile.feedbackDescription': 'Tell us how to improve the app.',
  'profile.feedbackInputA11y': 'Feedback message',
  'profile.feedbackInputHint': 'Do not include sensitive information.',
  'profile.feedbackPrivacyNote': 'Do not include sensitive information.',
  'profile.feedbackSubmit': 'Send feedback',
  'profile.feedbackValidation': 'Write a message before submitting.',
  'profile.feedbackSubmitFailed': 'Feedback could not be saved.',
  'profile.feedbackTemporarilyUnavailable': 'Feedback submission is temporarily unavailable. You can contact us by email.',
  'profile.feedbackContactSupport': 'Contact GetFlow support by email',
  'profile.feedbackSavedTitle': 'Thank you',
  'profile.feedbackSavedMessage': 'Your message has been saved.',
  'common.close': 'Close',
} as Record<string, string>)[key] || key;

jest.mock('expo-clipboard', () => ({ setStringAsync: (value: string) => mockClipboardSet(value) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));
jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ colors: {
    background: '#080D16', cardBg: '#111C2C', cardBorder: '#263B58', accent: '#B6F500',
    accentGradient: ['#B6F500', '#8DCB00'],
    textPrimary: '#FFFFFF', textSecondary: '#AAB4C2', inputBg: '#111C2C', inputBorder: '#263B58',
    success: '#58D68D', danger: '#FF6677',
  } }),
}));
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ session: { access_token: 'test-access-token' } }) }));
jest.mock('../lib/feedback', () => ({ submitFeedback: (...args: unknown[]) => mockSubmitFeedback(...args) }));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(async () => undefined),
  NotificationFeedbackType: { Success: 'success' },
}));

describe('Profile support email footer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders the single complete support address with a compact accessible footer', async () => {
    const screen = await render(<SupportEmailFooter />);
    expect(screen.getByTestId('profile-support-email-footer')).toBeTruthy();
    expect(screen.getByText('Support email')).toBeTruthy();
    expect(screen.getByText(SUPPORT_EMAIL)).toBeTruthy();
    expect(screen.getByTestId('support-email-copy').props.accessibilityRole).toBe('button');
  });

  test('opens the exact mailto composer without treating this as sent mail', async () => {
    const openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    expect(buildSupportMailto()).toBe('mailto:supportgetflow@gmail.com');
    const screen = await render(<SupportEmailFooter />);
    fireEvent.press(screen.getByTestId('support-email-open'));
    await waitFor(() => expect(openSpy).toHaveBeenCalledWith('mailto:supportgetflow@gmail.com'));
    openSpy.mockRestore();
  });

  test('copies the address and confirms only the local copy action', async () => {
    const screen = await render(<SupportEmailFooter />);
    fireEvent.press(screen.getByTestId('support-email-copy'));
    await waitFor(() => expect(screen.getByText('Copied')).toBeTruthy());
    expect(mockClipboardSet).toHaveBeenCalledWith('supportgetflow@gmail.com');
  });
});

describe('Feedback modal unavailable production dependency', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubmitFeedback.mockReset();
  });

  test('keeps submissions disabled and offers the verified support email fallback', async () => {
    const openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const screen = await render(<FeedbackModal visible onClose={jest.fn()} />);
    expect(screen.getByText('Feedback submission is temporarily unavailable. You can contact us by email.')).toBeTruthy();
    expect(screen.getByTestId('feedback-contact-support')).toBeTruthy();
    expect(screen.queryByTestId('feedback-submit')).toBeNull();
    expect(screen.queryByTestId('feedback-message-input')).toBeNull();
    fireEvent.press(screen.getByTestId('feedback-contact-support'));
    await waitFor(() => expect(openSpy).toHaveBeenCalledWith('mailto:supportgetflow@gmail.com'));
    expect(mockSubmitFeedback).not.toHaveBeenCalled();
    expect(screen.queryByText('Your message has been saved.')).toBeNull();
    openSpy.mockRestore();
  });
});

describe('feedback localization parity', () => {
  test('RO, EN, FR, DE have translated support and feedback copy', () => {
    const locales = [
      require('../i18n/locales/ro.json').profile,
      require('../i18n/locales/en.json').profile,
      require('../i18n/locales/fr.json').profile,
      require('../i18n/locales/de.json').profile,
    ];
    for (const locale of locales) {
      expect(locale.supportEmailLabel).toBeTruthy();
      expect(locale.supportEmailCopy).toBeTruthy();
      expect(locale.feedbackTitle).toBeTruthy();
      expect(locale.feedbackSubmit).toBeTruthy();
      expect(locale.feedbackSavedMessage).toBeTruthy();
      expect(locale.feedbackTemporarilyUnavailable).toBeTruthy();
      expect(locale.feedbackContactSupport).toBeTruthy();
    }
  });
});
