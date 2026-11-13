type ProviderError = { status?: number; message?: string; code?: string } | null | undefined;

function isRateLimited(error: ProviderError): boolean {
  return (
    error?.status === 429 ||
    error?.code === 'over_email_send_rate_limit' ||
    error?.code === 'over_request_rate_limit'
  );
}

// Do not render provider messages: they may reveal account existence or token details.
export function passwordRecoveryErrorKey(error: ProviderError):
  'authNewPassword.errorRateLimit' | 'authNewPassword.errorServer' {
  return isRateLimited(error)
    ? 'authNewPassword.errorRateLimit'
    : 'authNewPassword.errorServer';
}

export function forgotPasswordErrorKey(error: ProviderError):
  'authForgotPassword.errorRateLimit' | 'authForgotPassword.errorRequestFailed' {
  return isRateLimited(error)
    ? 'authForgotPassword.errorRateLimit'
    : 'authForgotPassword.errorRequestFailed';
}

export function verifyRecoveryOtpErrorKey(error: ProviderError):
  'authForgotPassword.errorRateLimit' | 'authForgotPassword.errorInvalidOrExpiredCode' {
  return isRateLimited(error)
    ? 'authForgotPassword.errorRateLimit'
    : 'authForgotPassword.errorInvalidOrExpiredCode';
}
