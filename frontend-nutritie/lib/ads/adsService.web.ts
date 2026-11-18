/**
 * adsService.web.ts — Web stub for react-native-google-mobile-ads.
 * Google Mobile Ads is a native-only module (iOS/Android).
 * On web, all ads operations are safe no-ops.
 */

export const adsAvailable = false;

export function preloadInterstitial(): void {
  // no-op on web
}

export function discardPreloadedInterstitial(): void {
  // no-op on web
}

export async function refreshAdsAfterConsentChange(): Promise<void> {
  // no-op on web
}

export async function initializeAdsSdk(): Promise<void> {
  // no-op on web
}

export function isInterstitialReady(): boolean {
  return false;
}

export function showPreloadedInterstitial(): boolean {
  return false;
}

export function preloadRewardedAdWithSsv(_input: { intentId: string; customData: string }): boolean {
  return false;
}

export function discardPreloadedRewardedAd(): void {
  // no-op on web
}

export async function showRewardedAdWithSsv(_input: {
  intentId: string;
  customData: string;
}): Promise<'earned-awaiting-server' | 'dismissed' | 'unavailable'> {
  return 'unavailable';
}

export function __resetAdsServiceForTests(): void {
  // no-op
}
