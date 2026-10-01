/** Validează fail-closed că documentul legal este o pagină HTTPS publică reală. */
export function validateLegalUrl(value: string | undefined, documentName: string): string {
  const normalized = value?.trim();
  try {
    if (!normalized) throw new Error('missing');
    const url = new URL(normalized);
    const host = url.hostname.toLowerCase();
    const placeholder = host === 'localhost'
      || host === '127.0.0.1'
      || host === '0.0.0.0'
      || host === 'example.com'
      || host.endsWith('.example.com')
      || host.endsWith('.example')
      || host.endsWith('.invalid')
      || host.endsWith('.test');
    if (url.protocol !== 'https:' || placeholder || url.pathname === '/') throw new Error('invalid');
    return url.toString();
  } catch {
    throw new Error(`Document legal indisponibil: ${documentName} trebuie configurat cu un URL HTTPS public real`);
  }
}

export function getLegalUrls(overrides?: {
  termsUrl?: string;
  privacyUrl?: string;
}): { termsUrl: string; privacyUrl: string } {
  // Accesul static este obligatoriu pentru ca Expo să inline-uiască EXPO_PUBLIC_* la build.
  return {
    termsUrl: validateLegalUrl(
      overrides?.termsUrl ?? process.env.EXPO_PUBLIC_TERMS_OF_SERVICE_URL,
      'EXPO_PUBLIC_TERMS_OF_SERVICE_URL',
    ),
    privacyUrl: validateLegalUrl(
      overrides?.privacyUrl ?? process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL,
      'EXPO_PUBLIC_PRIVACY_POLICY_URL',
    ),
  };
}
