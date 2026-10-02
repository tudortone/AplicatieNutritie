import {
  resolveAdsMode,
  validateAdsConfiguration,
  getAdsRuntimeConfig,
} from '../lib/ads/adsConfig';
import {
  GOOGLE_TEST_APP_ID_ANDROID,
  GOOGLE_TEST_APP_ID_IOS,
  GOOGLE_TEST_INTERSTITIAL_ANDROID,
  GOOGLE_TEST_INTERSTITIAL_IOS,
} from '../lib/ads/adConfig.test';

describe('P0-05 Review Correction — Mandatory 17-Scenario Regression Matrix', () => {
  const REAL_APP_ID = 'ca-app-pub-1234567890123456~1234567890';
  const REAL_UNIT_ID = 'ca-app-pub-1234567890123456/1234567890';

  // 1. production + disabled -> REJECT
  it('1. production + disabled -> REJECT', () => {
    expect(() =>
      resolveAdsMode({ EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_ADS_MODE: 'disabled' }),
    ).toThrow(/producție|production|interzis/i);

    const validation = validateAdsConfiguration(
      { EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_ADS_MODE: 'disabled' },
      'android',
    );
    expect(validation.ok).toBe(false);
  });

  // 2. production + test -> REJECT
  it('2. production + test -> REJECT', () => {
    expect(() =>
      resolveAdsMode({ EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_ADS_MODE: 'test' }),
    ).toThrow(/producție|production|interzis/i);

    const validation = validateAdsConfiguration(
      { EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_ADS_MODE: 'test' },
      'android',
    );
    expect(validation.ok).toBe(false);
  });

  // 3. production + missing mode -> REJECT
  it('3. production + missing mode -> REJECT', () => {
    expect(() =>
      resolveAdsMode({ EAS_BUILD_PROFILE: 'production' }),
    ).toThrow(/producție|production|obligatoriu/i);

    const validation = validateAdsConfiguration(
      { EAS_BUILD_PROFILE: 'production' },
      'android',
    );
    expect(validation.ok).toBe(false);
  });

  // 4. production + empty mode -> REJECT
  it('4. production + empty mode -> REJECT', () => {
    expect(() =>
      resolveAdsMode({ EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_ADS_MODE: '' }),
    ).toThrow(/producție|production|obligatoriu/i);

    const validation = validateAdsConfiguration(
      { EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_ADS_MODE: '' },
      'android',
    );
    expect(validation.ok).toBe(false);
  });

  // 5. production + whitespace mode -> REJECT
  it('5. production + whitespace mode -> REJECT', () => {
    expect(() =>
      resolveAdsMode({ EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_ADS_MODE: '   ' }),
    ).toThrow(/producție|production|obligatoriu/i);

    const validation = validateAdsConfiguration(
      { EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_ADS_MODE: '   ' },
      'android',
    );
    expect(validation.ok).toBe(false);
  });

  // 6. production + real + valid real IDs -> PASS
  it('6. production + real + valid real IDs -> PASS', () => {
    const mode = resolveAdsMode({ EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_ADS_MODE: 'real' });
    expect(mode).toBe('real');

    const validation = validateAdsConfiguration(
      {
        EAS_BUILD_PROFILE: 'production',
        EXPO_PUBLIC_ADS_MODE: 'real',
        EXPO_PUBLIC_ADMOB_ANDROID_APP_ID: REAL_APP_ID,
        EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID_ID: REAL_UNIT_ID,
      },
      'android',
    );
    expect(validation.ok).toBe(true);
    expect(validation.mode).toBe('real');
  });

  // 7. development + disabled -> PASS
  it('7. development + disabled -> PASS', () => {
    const mode = resolveAdsMode({ EAS_BUILD_PROFILE: 'development', EXPO_PUBLIC_ADS_MODE: 'disabled' });
    expect(mode).toBe('disabled');

    const validation = validateAdsConfiguration(
      { EAS_BUILD_PROFILE: 'development', EXPO_PUBLIC_ADS_MODE: 'disabled' },
      'android',
    );
    expect(validation.ok).toBe(true);
    expect(validation.mode).toBe('disabled');
  });

  // 8. development + missing mode -> disabled
  it('8. development + missing mode -> disabled', () => {
    expect(resolveAdsMode({ EAS_BUILD_PROFILE: 'development' })).toBe('disabled');
    expect(resolveAdsMode({})).toBe('disabled');

    const validation = validateAdsConfiguration({ EAS_BUILD_PROFILE: 'development' }, 'android');
    expect(validation.ok).toBe(true);
    expect(validation.mode).toBe('disabled');
  });

  // 9. legacy ADS_MODE=test only -> must NOT enable test mode
  it('9. legacy ADS_MODE=test only -> must NOT enable test mode', () => {
    // In dev: missing EXPO_PUBLIC_ADS_MODE defaults to disabled, ADS_MODE is ignored
    const modeDev = resolveAdsMode({ ADS_MODE: 'test' } as Record<string, string>);
    expect(modeDev).toBe('disabled');

    // In prod: missing EXPO_PUBLIC_ADS_MODE fails closed, ADS_MODE is ignored
    expect(() =>
      resolveAdsMode({ EAS_BUILD_PROFILE: 'production', ADS_MODE: 'test' } as Record<string, string>),
    ).toThrow(/producție|production/i);
  });

  // 10. EXPO_PUBLIC_ADS_MODE=real, ADS_MODE=test -> resolves REAL
  it('10. EXPO_PUBLIC_ADS_MODE=real, ADS_MODE=test -> resolves REAL', () => {
    const mode = resolveAdsMode({
      EXPO_PUBLIC_ADS_MODE: 'real',
      ADS_MODE: 'test',
    } as Record<string, string>);
    expect(mode).toBe('real');
  });

  // 11. EXPO_PUBLIC_ADS_MODE=test + real IDs -> REJECT
  it('11. EXPO_PUBLIC_ADS_MODE=test + real IDs -> REJECT', () => {
    const validation = validateAdsConfiguration(
      {
        EXPO_PUBLIC_ADS_MODE: 'test',
        EXPO_PUBLIC_ADMOB_ANDROID_APP_ID: REAL_APP_ID,
        EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID_ID: REAL_UNIT_ID,
      },
      'android',
    );
    expect(validation.ok).toBe(false);
    expect(validation.errors.some((e) => e.includes('modul test') || e.includes('oficial'))).toBe(true);
  });

  // 12. test mode + mixed real/test IDs -> REJECT
  it('12. test mode + mixed real/test IDs -> REJECT', () => {
    const mixed1 = validateAdsConfiguration(
      {
        EXPO_PUBLIC_ADS_MODE: 'test',
        EXPO_PUBLIC_ADMOB_ANDROID_APP_ID: GOOGLE_TEST_APP_ID_ANDROID,
        EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID_ID: REAL_UNIT_ID,
      },
      'android',
    );
    expect(mixed1.ok).toBe(false);

    const mixed2 = validateAdsConfiguration(
      {
        EXPO_PUBLIC_ADS_MODE: 'test',
        EXPO_PUBLIC_ADMOB_ANDROID_APP_ID: REAL_APP_ID,
        EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID_ID: GOOGLE_TEST_INTERSTITIAL_ANDROID,
      },
      'android',
    );
    expect(mixed2.ok).toBe(false);
  });

  // 13. test mode + exact official Google test IDs -> PASS
  it('13. test mode + exact official Google test IDs -> PASS', () => {
    const validation = validateAdsConfiguration(
      {
        EXPO_PUBLIC_ADS_MODE: 'test',
        EXPO_PUBLIC_ADMOB_ANDROID_APP_ID: GOOGLE_TEST_APP_ID_ANDROID,
        EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID_ID: GOOGLE_TEST_INTERSTITIAL_ANDROID,
      },
      'android',
    );
    expect(validation.ok).toBe(true);
    expect(validation.mode).toBe('test');
  });

  // 14. real mode + official Google test App ID -> REJECT
  it('14. real mode + official Google test App ID -> REJECT', () => {
    const validation = validateAdsConfiguration(
      {
        EXPO_PUBLIC_ADS_MODE: 'real',
        EXPO_PUBLIC_ADMOB_ANDROID_APP_ID: GOOGLE_TEST_APP_ID_ANDROID,
        EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID_ID: REAL_UNIT_ID,
      },
      'android',
    );
    expect(validation.ok).toBe(false);
    expect(validation.errors.some((e) => e.includes('Google de test') || e.includes('3940256099942544'))).toBe(true);
  });

  // 15. real mode + official Google test Unit ID -> REJECT
  it('15. real mode + official Google test Unit ID -> REJECT', () => {
    const validation = validateAdsConfiguration(
      {
        EXPO_PUBLIC_ADS_MODE: 'real',
        EXPO_PUBLIC_ADMOB_ANDROID_APP_ID: REAL_APP_ID,
        EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID_ID: GOOGLE_TEST_INTERSTITIAL_ANDROID,
      },
      'android',
    );
    expect(validation.ok).toBe(false);
    expect(validation.errors.some((e) => e.includes('Google de test') || e.includes('3940256099942544'))).toBe(true);
  });

  // 16. App ID passed as Unit ID -> REJECT
  it('16. App ID passed as Unit ID -> REJECT', () => {
    const validation = validateAdsConfiguration(
      {
        EXPO_PUBLIC_ADS_MODE: 'real',
        EXPO_PUBLIC_ADMOB_ANDROID_APP_ID: REAL_APP_ID,
        EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID_ID: REAL_APP_ID, // has ~ instead of /
      },
      'android',
    );
    expect(validation.ok).toBe(false);
    expect(validation.errors.some((e) => e.includes('format invalid'))).toBe(true);
  });

  // 17. Unit ID passed as App ID -> REJECT
  it('17. Unit ID passed as App ID -> REJECT', () => {
    const validation = validateAdsConfiguration(
      {
        EXPO_PUBLIC_ADS_MODE: 'real',
        EXPO_PUBLIC_ADMOB_ANDROID_APP_ID: REAL_UNIT_ID, // has / instead of ~
        EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID_ID: REAL_UNIT_ID,
      },
      'android',
    );
    expect(validation.ok).toBe(false);
    expect(validation.errors.some((e) => e.includes('format invalid'))).toBe(true);
  });
});
