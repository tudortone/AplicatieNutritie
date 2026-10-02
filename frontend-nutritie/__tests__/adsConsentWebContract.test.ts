import {
  __resetAdsConsentForTests,
  getCanRequestAds,
  getConsentPersonalizedAllowed,
  getPrivacyOptionsRequired,
  resolveAdsConsent,
  showAdsPrivacyOptionsForm,
} from '../lib/ads/adsConsent.web';

test('web consent exposes the privacy options API and never permits native ads', async () => {
  __resetAdsConsentForTests();

  expect(getPrivacyOptionsRequired()).toBe(false);
  expect(getCanRequestAds()).toBe(false);
  expect(getConsentPersonalizedAllowed()).toBe(false);
  expect(await resolveAdsConsent()).toEqual({
    canRequestAds: false,
    personalized: false,
    privacyOptionsRequired: false,
  });
  expect(await showAdsPrivacyOptionsForm()).toBe(false);
  expect(getPrivacyOptionsRequired()).toBe(false);
  expect(getCanRequestAds()).toBe(false);
  expect(getConsentPersonalizedAllowed()).toBe(false);
});
