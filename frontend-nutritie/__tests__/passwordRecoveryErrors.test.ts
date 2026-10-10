import { passwordRecoveryErrorKey } from '../lib/passwordRecoveryErrors';
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
  });

  it.each([['RO', ro], ['EN', en], ['FR', fr], ['DE', de]])(
    '%s has all recovery UI copy', (_lang, locale) => {
      for (const key of ['errorServer', 'errorRateLimit', 'showPassword', 'hidePassword']) {
        expect((locale.authNewPassword as Record<string, string>)[key]).toEqual(expect.any(String));
        expect((locale.authNewPassword as Record<string, string>)[key].length).toBeGreaterThan(0);
      }
    },
  );
});
