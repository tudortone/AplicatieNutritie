type ProviderError = { status?: number; message?: string; code?: string; name?: string } | null | undefined;

function isRateLimited(error: ProviderError): boolean {
  return (
    error?.status === 429 ||
    error?.code === 'over_email_send_rate_limit' ||
    error?.code === 'over_request_rate_limit'
  );
}

function isInvalidEmailFormatError(error: ProviderError): boolean {
  if (!error) return false;
  if (error.code === 'email_address_invalid' || error.code === 'validation_failed') {
    return true;
  }
  const msg = (error.message || '').toLowerCase();
  if ((error.status === 400 || error.status === 422) && msg.includes('email') && msg.includes('invalid')) {
    return true;
  }
  return false;
}

function isNetworkFailure(error: ProviderError): boolean {
  if (!error) return false;
  if (error.status === 0) return true;
  const msg = (error.message || '').toLowerCase();
  return (
    msg.includes('network request failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('network error') ||
    msg.includes('timed out') ||
    msg.includes('timeout')
  );
}

function isEmailServiceUnavailable(error: ProviderError): boolean {
  if (!error) return false;
  if (typeof error.status === 'number' && error.status >= 500) return true;
  if (error.code === 'unexpected_failure' || error.code === 'smtp_error') return true;
  const msg = (error.message || '').toLowerCase();
  return msg.includes('smtp') || msg.includes('error sending recovery email');
}

// Do not render provider messages: they may reveal account existence or token details.
export function passwordRecoveryErrorKey(error: ProviderError):
  'authNewPassword.errorRateLimit' | 'authNewPassword.errorServer' {
  return isRateLimited(error)
    ? 'authNewPassword.errorRateLimit'
    : 'authNewPassword.errorServer';
}

export type ForgotPasswordErrorKey =
  | 'authForgotPassword.errorRateLimit'
  | 'authForgotPassword.errorInvalidEmail'
  | 'authForgotPassword.errorEmailServiceUnavailable'
  | 'authForgotPassword.errorNetwork'
  | 'authForgotPassword.errorRequestFailed';

export function forgotPasswordErrorKey(error: ProviderError): ForgotPasswordErrorKey {
  if (isRateLimited(error)) return 'authForgotPassword.errorRateLimit';
  if (isInvalidEmailFormatError(error)) return 'authForgotPassword.errorInvalidEmail';
  if (isEmailServiceUnavailable(error)) return 'authForgotPassword.errorEmailServiceUnavailable';
  if (isNetworkFailure(error)) return 'authForgotPassword.errorNetwork';
  return 'authForgotPassword.errorRequestFailed';
}

export function verifyRecoveryOtpErrorKey(error: ProviderError):
  'authForgotPassword.errorRateLimit' | 'authForgotPassword.errorInvalidOrExpiredCode' {
  return isRateLimited(error)
    ? 'authForgotPassword.errorRateLimit'
    : 'authForgotPassword.errorInvalidOrExpiredCode';
}

const DOMAIN_TYPO_MAP: Record<string, string> = {
  'gmail.comt': 'gmail.com',
  'gmail.comtt': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.cpm': 'gmail.com',
  'gmail.vom': 'gmail.com',
  'gmail.cim': 'gmail.com',
  'gmail.cm': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'yahoo.comt': 'yahoo.com',
  'yahoo.con': 'yahoo.com',
  'yahoo.cpm': 'yahoo.com',
  'yahoo.vom': 'yahoo.com',
  'yaho.com': 'yahoo.com',
  'yhoo.com': 'yahoo.com',
  'yaoo.com': 'yahoo.com',
  'yahoo.rot': 'yahoo.ro',
  'yaho.ro': 'yahoo.ro',
  'hotmail.comt': 'hotmail.com',
  'hotmail.con': 'hotmail.com',
  'hotmail.cpm': 'hotmail.com',
  'hotmal.com': 'hotmail.com',
  'hotmial.com': 'hotmail.com',
  'outlook.comt': 'outlook.com',
  'outlook.con': 'outlook.com',
  'outlook.cpm': 'outlook.com',
  'outlok.com': 'outlook.com',
  'outllok.com': 'outlook.com',
  'icloud.comt': 'icloud.com',
  'icloud.con': 'icloud.com',
  'icoud.com': 'icloud.com',
  'iclud.com': 'icloud.com',
  'proton.met': 'proton.me',
  'protonmail.comt': 'protonmail.com',
  'protonmail.con': 'protonmail.com',
};

export interface EmailDomainSuggestion {
  suggestedEmail: string;
  suggestedDomain: string;
}

export function suggestRecoveryEmailDomain(rawEmail: string): EmailDomainSuggestion | null {
  const trimmed = rawEmail.trim().toLowerCase();
  const atIndex = trimmed.indexOf('@');
  if (atIndex <= 0 || trimmed.indexOf('@', atIndex + 1) !== -1) return null;

  const localPart = trimmed.slice(0, atIndex);
  const domainPart = trimmed.slice(atIndex + 1);
  if (!localPart || /\s/.test(localPart) || domainPart.length < 3 || /\s/.test(domainPart)) {
    return null;
  }

  let fixedDomain = DOMAIN_TYPO_MAP[domainPart] ?? null;
  if (!fixedDomain) {
    const trailingComMatch = /^([a-z0-9.-]+)\.com(t+|r|n)$/.exec(domainPart);
    if (trailingComMatch) {
      fixedDomain = `${trailingComMatch[1]}.com`;
    }
  }

  if (!fixedDomain || fixedDomain === domainPart) return null;
  return {
    suggestedEmail: `${localPart}@${fixedDomain}`,
    suggestedDomain: fixedDomain,
  };
}
