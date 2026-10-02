/**
 * adsService.web.ts — Web stub for react-native-google-mobile-ads.
 * Google Mobile Ads is a native-only module (iOS/Android).
 * On web, all ads operations are safe no-ops.
 */

export const adsAvailable = false;

export function preloadInterstitial(): void {
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

export function __resetAdsServiceForTests(): void {
  // no-op
}
