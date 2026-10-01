/**
 * adConfig.test.ts — Identificatori și configurație AdMob oficiale Google de test.
 *
 * Folosit EXCLUSIV în:
 *  - suitele de teste Jest (__tests__/*)
 *  - build-uri și medii interne de dezvoltare/testare
 *
 * NU este importat în graful de producție al aplicației mobile.
 */

export const GOOGLE_TEST_PUBLISHER_ID = 'ca-app-pub-3940256099942544';
export const GOOGLE_TEST_APP_ID_ANDROID = 'ca-app-pub-3940256099942544~3347511713';
export const GOOGLE_TEST_APP_ID_IOS = 'ca-app-pub-3940256099942544~1458002511';
export const GOOGLE_TEST_INTERSTITIAL_ANDROID = 'ca-app-pub-3940256099942544/1033173712';
export const GOOGLE_TEST_INTERSTITIAL_IOS = 'ca-app-pub-3940256099942544/4411468910';
export const GOOGLE_TEST_REWARDED_ANDROID = 'ca-app-pub-3940256099942544/5224354917';
export const GOOGLE_TEST_REWARDED_IOS = 'ca-app-pub-3940256099942544/1712485313';

export function isGoogleTestId(id: string | null | undefined): boolean {
  if (!id) return false;
  return String(id).includes(GOOGLE_TEST_PUBLISHER_ID);
}

describe('adConfig test constants and helpers', () => {
  it('correctly verifies Google AdMob test IDs', () => {
    expect(isGoogleTestId(GOOGLE_TEST_APP_ID_ANDROID)).toBe(true);
    expect(isGoogleTestId(GOOGLE_TEST_INTERSTITIAL_ANDROID)).toBe(true);
    expect(isGoogleTestId('ca-app-pub-5202280855139508~6141533757')).toBe(false);
    expect(isGoogleTestId(null)).toBe(false);
    expect(isGoogleTestId(undefined)).toBe(false);
  });
});

