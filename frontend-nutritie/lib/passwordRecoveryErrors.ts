type ProviderError = { status?: number; message?: string } | null | undefined;

// Do not render provider messages: they may reveal account existence or token details.
export function passwordRecoveryErrorKey(error: ProviderError):
  'authNewPassword.errorRateLimit' | 'authNewPassword.errorServer' {
  return error?.status === 429
    ? 'authNewPassword.errorRateLimit'
    : 'authNewPassword.errorServer';
}
