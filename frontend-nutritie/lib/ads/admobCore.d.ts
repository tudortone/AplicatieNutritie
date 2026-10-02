export type AdsMode = 'disabled' | 'test' | 'real';

export const GOOGLE_TEST_PUBLISHER_ID: string;
export const GOOGLE_TEST_APP_ID_ANDROID: string;
export const GOOGLE_TEST_APP_ID_IOS: string;
export const GOOGLE_TEST_INTERSTITIAL_ANDROID: string;
export const GOOGLE_TEST_INTERSTITIAL_IOS: string;
export const ADMOB_APP_ID_REGEX: RegExp;
export const ADMOB_UNIT_ID_REGEX: RegExp;

export function isProductionContext(env?: Record<string, string | undefined>): boolean;
export function isGoogleTestId(id: string | null | undefined): boolean;
export function validateAdMobAppId(
  id: string | null | undefined,
  allowTest?: boolean,
): { ok: boolean; error?: string };
export function validateAdMobUnitId(
  id: string | null | undefined,
  allowTest?: boolean,
): { ok: boolean; error?: string };
export function resolveAdsMode(env?: Record<string, string | undefined>): AdsMode;
export function validateAdsConfiguration(
  env: Record<string, string | undefined>,
  platform?: 'android' | 'ios',
): {
  ok: boolean;
  mode?: AdsMode;
  androidAppId?: string | null;
  iosAppId?: string | null;
  interstitialAndroidUnitId?: string | null;
  interstitialIosUnitId?: string | null;
  errors: string[];
};
