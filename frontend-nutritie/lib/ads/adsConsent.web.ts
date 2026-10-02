/**
 * adsConsent.web.ts — Web stub for ads consent.
 * Native UMP consent is not available on web.
 */

export interface AdsConsentResolution {
  canRequestAds: boolean;
  personalized: boolean;
  privacyOptionsRequired: boolean;
}

export function getCanRequestAds(): boolean {
  return false;
}

export function getConsentPersonalizedAllowed(): boolean {
  return false;
}

export function getPrivacyOptionsRequired(): boolean {
  return false;
}

export function isConsentResolved(): boolean {
  return true;
}

export async function resolveAdsConsent(): Promise<AdsConsentResolution> {
  return { canRequestAds: false, personalized: false, privacyOptionsRequired: false };
}

export async function showAdsPrivacyOptionsForm(): Promise<boolean> {
  return false;
}

export function __resetAdsConsentForTests(): void {
  // no-op
}
