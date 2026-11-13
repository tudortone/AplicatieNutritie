import {
  forgotPasswordErrorKey,
  passwordRecoveryErrorKey,
  verifyRecoveryOtpErrorKey,
} from '../lib/passwordRecoveryErrors';
import ro from '../i18n/locales/ro.json';
import en from '../i18n/locales/en.json';
import fr from '../i18n/locales/fr.json';
import de from '../i18n/locales/de.json';

describe('password recovery errors', () => {
  it('does not expose provider error text or user existence', () => {
    expect(passwordRecoveryErrorKey({ message: 'User with this email was not found' }))
      .toBe('authNewPassword.errorServer');
    expect(passwordRecoveryErrorKey({ message: 'private token: secret' }))
      .toBe('authNewPassword.errorServer');
  });

  it('maps rate limiting to a controlled message', () => {
    expect(passwordRecoveryErrorKey({ status: 429 })).toBe('authNewPassword.errorRateLimit');
    expect(forgotPasswordErrorKey({ status: 429 })).toBe('authForgotPassword.errorRateLimit');
    expect(forgotPasswordErrorKey({ message: 'User not found' })).toBe('authForgotPassword.errorRequestFailed');
    expect(verifyRecoveryOtpErrorKey({ status: 429 })).toBe('authForgotPassword.errorRateLimit');
    expect(verifyRecoveryOtpErrorKey({ message: 'Token expired' })).toBe('authForgotPassword.errorInvalidOrExpiredCode');
  });

  it.each([['RO', ro], ['EN', en], ['FR', fr], ['DE', de]])(
    '%s has all recovery UI copy without emojis', (_lang, locale) => {
      for (const key of ['errorServer', 'errorRateLimit', 'showPassword', 'hidePassword', 'successTitle', 'continueBtn']) {
        expect((locale.authNewPassword as Record<string, string>)[key]).toEqual(expect.any(String));
        expect((locale.authNewPassword as Record<string, string>)[key].length).toBeGreaterThan(0);
      }
      const forgotCopy = (locale as unknown as { authForgotPassword: Record<string, string> }).authForgotPassword;
      for (const key of [
        'title',
        'subtitleStep1',
        'emailLabel',
        'sendCodeBtn',
        'step2Notice',
        'otpLabel',
        'verifyCodeBtn',
        'resendBtn',
        'changeEmailBtn',
        'errorInvalidEmail',
        'errorRateLimit',
        'errorRequestFailed',
        'errorInvalidOrExpiredCode',
        'linkExpiredBanner',
      ]) {
        expect(forgotCopy[key]).toEqual(expect.any(String));
        expect(forgotCopy[key].trim().length).toBeGreaterThan(0);
      }
    },
  );
});
