// URL-uri publice ale documentelor legale (Termeni și Condiții / Politica de
// Confidențialitate). Se configurează prin variabile de mediu Expo
// (EXPO_PUBLIC_TERMS_URL / EXPO_PUBLIC_PRIVACY_URL) și se deschid în browser
// extern prin Linking.openURL.
//
// Validăm că sunt URL-uri HTTPS publice (nu pagini locale), altfel refuzăm să
// deschidem ceva suspect sau neconfigurat — fail-closed.

const REGEX_URL_HTTPS_PUBLIC = /^https:\/\/[^/]+\/.+/;

function citesteURL(variabila: string): string {
  const valoare = process.env[variabila]?.trim();
  if (!valoare || !REGEX_URL_HTTPS_PUBLIC.test(valoare)) {
    throw new Error(`Document legal indisponibil: ${variabila} trebuie configurat cu un URL HTTPS public`);
  }
  return valoare;
}

export function getLegalUrls(): { termsUrl: string; privacyUrl: string } {
  return {
    termsUrl: citesteURL('EXPO_PUBLIC_TERMS_URL'),
    privacyUrl: citesteURL('EXPO_PUBLIC_PRIVACY_URL'),
  };
}