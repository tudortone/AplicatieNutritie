import {
  getAdsRuntimeConfig,
  resolveAdsMode,
  validateAdMobAppId,
  validateAdMobUnitId,
  validateAdsConfiguration,
} from '../lib/ads/adsConfig';
import {
  GOOGLE_TEST_PUBLISHER_ID,
  GOOGLE_TEST_APP_ID_ANDROID,
  GOOGLE_TEST_APP_ID_IOS,
  GOOGLE_TEST_INTERSTITIAL_ANDROID,
  GOOGLE_TEST_INTERSTITIAL_IOS,
} from '../lib/ads/adConfig.test';
import { evaluateAdEligibility, AD_GATE_INITIAL_STATE } from '../lib/ads/adGate';

describe('P0-05: AdMob Configuration Hardening & Canonical Mode', () => {
  const envInitial = { ...process.env };
  const REAL_FIXTURE_APP_ID_ANDROID = 'ca-app-pub-1234567890123456~1234567890';
  const REAL_FIXTURE_APP_ID_IOS = 'ca-app-pub-1234567890123456~0987654321';
  const REAL_FIXTURE_UNIT_ID_ANDROID = 'ca-app-pub-1234567890123456/1234567890';
  const REAL_FIXTURE_UNIT_ID_IOS = 'ca-app-pub-1234567890123456/0987654321';

  beforeEach(() => {
    // Clear ambient app, EAS, Sentry, and AdMob environment variables to ensure test hermeticity
    for (const k of Object.keys(process.env)) {
      const u = k.toUpperCase();
      if (
        u.startsWith('EXPO_PUBLIC_') ||
        u.startsWith('EAS_') ||
        u.startsWith('SENTRY_') ||
        u === 'APP_ENV' ||
        u === 'ADS_MODE'
      ) {
        delete process.env[k];
      }
    }
  });

  afterAll(() => {
    for (const k of Object.keys(process.env)) {
      if (!(k in envInitial)) {
        delete process.env[k];
      }
    }
    Object.assign(process.env, envInitial);
  });

  // TEST 1 — disabled mode
  it('TEST 1 — ADS_MODE=disabled resolves intentionally disabled without requiring IDs', () => {
    const mode = resolveAdsMode({ EXPO_PUBLIC_ADS_MODE: 'disabled' });
    expect(mode).toBe('disabled');

    const validation = validateAdsConfiguration({ EXPO_PUBLIC_ADS_MODE: 'disabled' }, 'android');
    expect(validation.ok).toBe(true);
    expect(validation.mode).toBe('disabled');
    expect(validation.errors).toHaveLength(0);

    const runtime = getAdsRuntimeConfig('android', { adsMode: 'disabled' });
    expect(runtime.mode).toBe('disabled');
    expect(runtime.enabled).toBe(false);
    expect(runtime.androidAppId).toBeNull();
    expect(runtime.interstitialAndroidUnitId).toBeNull();
  });

  // TEST 2 — test mode
  it('TEST 2 — ADS_MODE=test accepts Google test App ID and test unit IDs in non-production context', () => {
    const mode = resolveAdsMode({ EXPO_PUBLIC_ADS_MODE: 'test' });
    expect(mode).toBe('test');

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

    // Internal/test mode resolves Google test IDs when provided via environment or overrides
    const runtime = getAdsRuntimeConfig('android', {
      adsMode: 'test',
      androidAppId: GOOGLE_TEST_APP_ID_ANDROID,
      interstitialAndroidUnitId: GOOGLE_TEST_INTERSTITIAL_ANDROID,
    });
    expect(runtime.mode).toBe('test');
    expect(runtime.enabled).toBe(true);
    expect(runtime.androidAppId).toBe(GOOGLE_TEST_APP_ID_ANDROID);
    expect(runtime.interstitialAndroidUnitId).toBe(GOOGLE_TEST_INTERSTITIAL_ANDROID);
  });

  // TEST 3 — real mode with real-shaped IDs
  it('TEST 3 — ADS_MODE=real with valid non-test fixtures is accepted', () => {
    const validation = validateAdsConfiguration(
      {
        EXPO_PUBLIC_ADS_MODE: 'real',
        EXPO_PUBLIC_ADMOB_ANDROID_APP_ID: REAL_FIXTURE_APP_ID_ANDROID,
        EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID_ID: REAL_FIXTURE_UNIT_ID_ANDROID,
      },
      'android',
    );
    expect(validation.ok).toBe(true);
    expect(validation.mode).toBe('real');
    expect(validation.errors).toHaveLength(0);

    const runtime = getAdsRuntimeConfig('android', {
      adsMode: 'real',
      androidAppId: REAL_FIXTURE_APP_ID_ANDROID,
      interstitialAndroidUnitId: REAL_FIXTURE_UNIT_ID_ANDROID,
    });
    expect(runtime.mode).toBe('real');
    expect(runtime.enabled).toBe(true);
    expect(runtime.androidAppId).toBe(REAL_FIXTURE_APP_ID_ANDROID);
    expect(runtime.interstitialAndroidUnitId).toBe(REAL_FIXTURE_UNIT_ID_ANDROID);
  });

  // TEST 4 — real mode missing App ID
  it('TEST 4 — ADS_MODE=real missing App ID fails closed', () => {
    const validation = validateAdsConfiguration(
      {
        EXPO_PUBLIC_ADS_MODE: 'real',
        EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID_ID: REAL_FIXTURE_UNIT_ID_ANDROID,
      },
      'android',
    );
    expect(validation.ok).toBe(false);
    expect(validation.errors.some((e) => e.includes('App ID') && e.includes('lipseste'))).toBe(true);

    const runtime = getAdsRuntimeConfig('android', {
      adsMode: 'real',
      interstitialAndroidUnitId: REAL_FIXTURE_UNIT_ID_ANDROID,
    });
    expect(runtime.enabled).toBe(false);
  });

  // TEST 5 — real mode Google test App ID
  it('TEST 5 — ADS_MODE=real rejects Google test App ID', () => {
    const validation = validateAdsConfiguration(
      {
        EXPO_PUBLIC_ADS_MODE: 'real',
        EXPO_PUBLIC_ADMOB_ANDROID_APP_ID: GOOGLE_TEST_APP_ID_ANDROID,
        EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID_ID: REAL_FIXTURE_UNIT_ID_ANDROID,
      },
      'android',
    );
    expect(validation.ok).toBe(false);
    expect(validation.errors.some((e) => e.includes(GOOGLE_TEST_PUBLISHER_ID) || e.includes('Google de test'))).toBe(true);

    const runtime = getAdsRuntimeConfig('android', {
      adsMode: 'real',
      androidAppId: GOOGLE_TEST_APP_ID_ANDROID,
      interstitialAndroidUnitId: REAL_FIXTURE_UNIT_ID_ANDROID,
    });
    expect(runtime.enabled).toBe(false);
  });

  // TEST 6 — real mode Google test interstitial unit
  it('TEST 6 — ADS_MODE=real rejects Google test interstitial unit', () => {
    const validation = validateAdsConfiguration(
      {
        EXPO_PUBLIC_ADS_MODE: 'real',
        EXPO_PUBLIC_ADMOB_ANDROID_APP_ID: REAL_FIXTURE_APP_ID_ANDROID,
        EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID_ID: GOOGLE_TEST_INTERSTITIAL_ANDROID,
      },
      'android',
    );
    expect(validation.ok).toBe(false);
    expect(validation.errors.some((e) => e.includes(GOOGLE_TEST_PUBLISHER_ID) || e.includes('Google de test'))).toBe(true);

    const runtime = getAdsRuntimeConfig('android', {
      adsMode: 'real',
      androidAppId: REAL_FIXTURE_APP_ID_ANDROID,
      interstitialAndroidUnitId: GOOGLE_TEST_INTERSTITIAL_ANDROID,
    });
    expect(runtime.enabled).toBe(false);
  });

  // TEST 7 — real mode malformed App ID
  it('TEST 7 — ADS_MODE=real rejects malformed App ID', () => {
    // Ad unit ID accidentally supplied as App ID (has / instead of ~)
    const unitAsApp = validateAdsConfiguration(
      {
        EXPO_PUBLIC_ADS_MODE: 'real',
        EXPO_PUBLIC_ADMOB_ANDROID_APP_ID: REAL_FIXTURE_UNIT_ID_ANDROID,
        EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID_ID: REAL_FIXTURE_UNIT_ID_ANDROID,
      },
      'android',
    );
    expect(unitAsApp.ok).toBe(false);
    expect(unitAsApp.errors.some((e) => e.includes('App ID') && e.includes('format invalid'))).toBe(true);

    // Arbitrary malformed string
    const malformed = validateAdsConfiguration(
      {
        EXPO_PUBLIC_ADS_MODE: 'real',
        EXPO_PUBLIC_ADMOB_ANDROID_APP_ID: 'not-an-admob-id',
        EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID_ID: REAL_FIXTURE_UNIT_ID_ANDROID,
      },
      'android',
    );
    expect(malformed.ok).toBe(false);
  });

  // TEST 8 — real mode malformed unit ID
  it('TEST 8 — ADS_MODE=real rejects malformed unit ID', () => {
    // App ID accidentally supplied as Unit ID (has ~ instead of /)
    const appAsUnit = validateAdsConfiguration(
      {
        EXPO_PUBLIC_ADS_MODE: 'real',
        EXPO_PUBLIC_ADMOB_ANDROID_APP_ID: REAL_FIXTURE_APP_ID_ANDROID,
        EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID_ID: REAL_FIXTURE_APP_ID_ANDROID,
      },
      'android',
    );
    expect(appAsUnit.ok).toBe(false);
    expect(appAsUnit.errors.some((e) => e.includes('Ad Unit ID') && e.includes('format invalid'))).toBe(true);

    // Short / random string
    const malformed = validateAdsConfiguration(
      {
        EXPO_PUBLIC_ADS_MODE: 'real',
        EXPO_PUBLIC_ADMOB_ANDROID_APP_ID: REAL_FIXTURE_APP_ID_ANDROID,
        EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID_ID: 'invalid_unit_id',
      },
      'android',
    );
    expect(malformed.ok).toBe(false);
  });

  // TEST 9 — unknown ADS_MODE
  it('TEST 9 — unknown ADS_MODE is rejected', () => {
    expect(() => resolveAdsMode({ EXPO_PUBLIC_ADS_MODE: 'staging' })).toThrow(/invalid/i);
    expect(() => resolveAdsMode({ EXPO_PUBLIC_ADS_MODE: 'production' })).toThrow(/invalid/i);

    const validation = validateAdsConfiguration({ EXPO_PUBLIC_ADS_MODE: 'invalid_mode' }, 'android');
    expect(validation.ok).toBe(false);
    expect(validation.errors.some((e) => e.includes('invalid') || e.includes('necunoscut'))).toBe(true);
  });

  // TEST 10 — no ADS_MODE in production/release context
  it('TEST 10 — no ADS_MODE in production context fails closed and does NOT silently become test mode', () => {
    // In production build profile or production env, missing ADS_MODE must be rejected
    expect(() =>
      resolveAdsMode({ EAS_BUILD_PROFILE: 'production' }),
    ).toThrow(/production/i);

    expect(() =>
      resolveAdsMode({ EXPO_PUBLIC_APP_ENV: 'production' }),
    ).toThrow(/production/i);

    const validation = validateAdsConfiguration({ EXPO_PUBLIC_APP_ENV: 'production' }, 'android');
    expect(validation.ok).toBe(false);
    expect(validation.errors.some((e) => e.includes('producție') || e.includes('production'))).toBe(true);

    // Also: setting ADS_MODE=test in production context is strictly prohibited
    expect(() =>
      resolveAdsMode({ EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_ADS_MODE: 'test' }),
    ).toThrow(/production/i);
  });

  // TEST 11 — no ADS_MODE in explicit development context
  it('TEST 11 — no ADS_MODE in explicit development context defaults deterministically to disabled', () => {
    const modeDev = resolveAdsMode({ EAS_BUILD_PROFILE: 'development' });
    expect(modeDev).toBe('disabled');

    const modeEmpty = resolveAdsMode({});
    expect(modeEmpty).toBe('disabled');

    const runtime = getAdsRuntimeConfig('android', {});
    expect(runtime.mode).toBe('disabled');
    expect(runtime.enabled).toBe(false);
  });

  // TEST 12 — tester/premium entitlement logic
  it('TEST 12 — P0-03 tester and premium entitlement ad suppression remains preserved', () => {
    const state = AD_GATE_INITIAL_STATE;
    // With 3 photo analyses, free user is eligible
    const readyState = { ...state, successfulAnalysisCount: 3 };

    // FREE user: eligible
    const freeDecizie = evaluateAdEligibility(readyState, {
      hasFullAccess: false,
      nowMs: Date.now(),
      source: 'photo',
      everyN: 3,
      minIntervalSeconds: 600,
    });
    expect(freeDecizie.eligible).toBe(true);

    // TESTER / PREMIUM user (hasFullAccess = true): strictly suppressed
    const fullAccessDecizie = evaluateAdEligibility(readyState, {
      hasFullAccess: true,
      nowMs: Date.now(),
      source: 'photo',
      everyN: 3,
      minIntervalSeconds: 600,
    });
    expect(fullAccessDecizie.eligible).toBe(false);

    // Chat source suppression with hasFullAccess
    const chatReadyState = { ...state, chatMessageCount: 20 };
    const chatFullAccessDecizie = evaluateAdEligibility(chatReadyState, {
      hasFullAccess: true,
      nowMs: Date.now(),
      source: 'chat',
      everyN: 15,
      minIntervalSeconds: 600,
    });
    expect(chatFullAccessDecizie.eligible).toBe(false);
  });

  // TEST 13 — existing ad cadence
  it('TEST 13 — ad cadence (photo 3, chat 15, 600-second cooldown) remains preserved', () => {
    const baseNow = 1000000;
    const state = AD_GATE_INITIAL_STATE;

    // Photo cadence: 1 and 2 are not eligible; 3 is eligible
    expect(
      evaluateAdEligibility({ ...state, successfulAnalysisCount: 1 }, {
        hasFullAccess: false,
        nowMs: baseNow,
        source: 'photo',
        everyN: 3,
        minIntervalSeconds: 600,
      }).eligible,
    ).toBe(false);

    expect(
      evaluateAdEligibility({ ...state, successfulAnalysisCount: 2 }, {
        hasFullAccess: false,
        nowMs: baseNow,
        source: 'photo',
        everyN: 3,
        minIntervalSeconds: 600,
      }).eligible,
    ).toBe(false);

    const photoEligible = evaluateAdEligibility({ ...state, successfulAnalysisCount: 3 }, {
      hasFullAccess: false,
      nowMs: baseNow,
      source: 'photo',
      everyN: 3,
      minIntervalSeconds: 600,
    });
    expect(photoEligible.eligible).toBe(true);

    // Chat cadence: 14 is not eligible; 15 is eligible
    expect(
      evaluateAdEligibility({ ...state, chatMessageCount: 14 }, {
        hasFullAccess: false,
        nowMs: baseNow,
        source: 'chat',
        everyN: 15,
        minIntervalSeconds: 600,
      }).eligible,
    ).toBe(false);

    expect(
      evaluateAdEligibility({ ...state, chatMessageCount: 15 }, {
        hasFullAccess: false,
        nowMs: baseNow,
        source: 'chat',
        everyN: 15,
        minIntervalSeconds: 600,
      }).eligible,
    ).toBe(true);

    // 600-second shared cooldown between photo and chat
    const stateAfterAd = {
      ...state,
      successfulAnalysisCount: 6,
      chatMessageCount: 25,
      lastAdShownAtMs: baseNow,
    };

    // At +300s (5 minutes later), cooldown is active -> NOT eligible
    expect(
      evaluateAdEligibility(stateAfterAd, {
        hasFullAccess: false,
        nowMs: baseNow + 300 * 1000,
        source: 'photo',
        everyN: 3,
        minIntervalSeconds: 600,
      }).eligible,
    ).toBe(false);

    expect(
      evaluateAdEligibility(stateAfterAd, {
        hasFullAccess: false,
        nowMs: baseNow + 300 * 1000,
        source: 'chat',
        everyN: 15,
        minIntervalSeconds: 600,
      }).eligible,
    ).toBe(false);

    // At +601s, cooldown has expired -> eligible
    expect(
      evaluateAdEligibility(stateAfterAd, {
        hasFullAccess: false,
        nowMs: baseNow + 601 * 1000,
        source: 'photo',
        everyN: 3,
        minIntervalSeconds: 600,
      }).eligible,
    ).toBe(true);
  });

  describe('ID format and helper validation tests', () => {
    it('validateAdMobAppId enforces format ca-app-pub-\\d{16}~\\d{10} and rejects / or wrong lengths', () => {
      expect(validateAdMobAppId(REAL_FIXTURE_APP_ID_ANDROID, false).ok).toBe(true);
      expect(validateAdMobAppId(GOOGLE_TEST_APP_ID_ANDROID, true).ok).toBe(true);
      expect(validateAdMobAppId(GOOGLE_TEST_APP_ID_ANDROID, false).ok).toBe(false);
      // Contains slash instead of tilde
      expect(validateAdMobAppId(REAL_FIXTURE_UNIT_ID_ANDROID, false).ok).toBe(false);
      expect(validateAdMobAppId('', false).ok).toBe(false);
      expect(validateAdMobAppId(null, false).ok).toBe(false);
      expect(validateAdMobAppId('ca-app-pub-1234567890123456~12345', false).ok).toBe(false);
    });

    it('validateAdMobUnitId enforces format ca-app-pub-\\d{16}/\\d{10} and rejects ~ or wrong lengths', () => {
      expect(validateAdMobUnitId(REAL_FIXTURE_UNIT_ID_ANDROID, false).ok).toBe(true);
      expect(validateAdMobUnitId(GOOGLE_TEST_INTERSTITIAL_ANDROID, true).ok).toBe(true);
      expect(validateAdMobUnitId(GOOGLE_TEST_INTERSTITIAL_ANDROID, false).ok).toBe(false);
      // Contains tilde instead of slash
      expect(validateAdMobUnitId(REAL_FIXTURE_APP_ID_ANDROID, false).ok).toBe(false);
      expect(validateAdMobUnitId('', false).ok).toBe(false);
      expect(validateAdMobUnitId(null, false).ok).toBe(false);
      expect(validateAdMobUnitId('ca-app-pub-1234567890123456/123', false).ok).toBe(false);
    });

    it('iOS platform uses iOS IDs and validates them accordingly', () => {
      const validIos = validateAdsConfiguration(
        {
          EXPO_PUBLIC_ADS_MODE: 'real',
          EXPO_PUBLIC_ADMOB_IOS_APP_ID: REAL_FIXTURE_APP_ID_IOS,
          EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS_ID: REAL_FIXTURE_UNIT_ID_IOS,
        },
        'ios',
      );
      expect(validIos.ok).toBe(true);
      expect(validIos.mode).toBe('real');

      const runtimeIos = getAdsRuntimeConfig('ios', {
        adsMode: 'real',
        iosAppId: REAL_FIXTURE_APP_ID_IOS,
        interstitialIosUnitId: REAL_FIXTURE_UNIT_ID_IOS,
      });
      expect(runtimeIos.enabled).toBe(true);
      expect(runtimeIos.iosAppId).toBe(REAL_FIXTURE_APP_ID_IOS);
    });
  });

  describe('Phase 3 Contract: Production vs Internal/Test AdMob Isolation', () => {
    const PROD_APP_ID = 'ca-app-pub-5202280855139508~6141533757';
    const PROD_INTERSTITIAL_ID = 'ca-app-pub-5202280855139508/1542500110';
    const PROD_REWARDED_ID = 'ca-app-pub-5202280855139508/3566028223';

    it('PRODUCTION: uses only real GetFlow App ID and ad units', () => {
      const validation = validateAdsConfiguration(
        {
          EXPO_PUBLIC_ADS_MODE: 'real',
          EXPO_PUBLIC_ADMOB_ANDROID_APP_ID: PROD_APP_ID,
          EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID_ID: PROD_INTERSTITIAL_ID,
          EXPO_PUBLIC_ADMOB_REWARDED_ANDROID_ID: PROD_REWARDED_ID,
        },
        'android',
      );
      expect(validation.ok).toBe(true);
      expect(validation.mode).toBe('real');
      expect(validation.androidAppId).toBe(PROD_APP_ID);
      expect(validation.interstitialAndroidUnitId).toBe(PROD_INTERSTITIAL_ID);

      const runtime = getAdsRuntimeConfig('android', {
        adsMode: 'real',
        androidAppId: PROD_APP_ID,
        interstitialAndroidUnitId: PROD_INTERSTITIAL_ID,
        rewardedAndroidUnitId: PROD_REWARDED_ID,
      });
      expect(runtime.enabled).toBe(true);
      expect(runtime.mode).toBe('real');
      expect(runtime.androidAppId).toBe(PROD_APP_ID);
      expect(runtime.interstitialAndroidUnitId).toBe(PROD_INTERSTITIAL_ID);
      expect(runtime.rewardedAndroidUnitId).toBe(PROD_REWARDED_ID);
    });

    it('INTERNAL/TEST: uses Google official test IDs', () => {
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

      const runtime = getAdsRuntimeConfig('android', {
        adsMode: 'test',
        androidAppId: GOOGLE_TEST_APP_ID_ANDROID,
        interstitialAndroidUnitId: GOOGLE_TEST_INTERSTITIAL_ANDROID,
      });
      expect(runtime.enabled).toBe(true);
      expect(runtime.mode).toBe('test');
      expect(runtime.androidAppId).toBe(GOOGLE_TEST_APP_ID_ANDROID);
      expect(runtime.interstitialAndroidUnitId).toBe(GOOGLE_TEST_INTERSTITIAL_ANDROID);
    });

    it('FAIL CLOSED: Production never silently falls back to a test ID if an environment value is absent', () => {
      const runtimeWithoutAppId = getAdsRuntimeConfig('android', {
        adsMode: 'real',
        androidAppId: '',
        interstitialAndroidUnitId: PROD_INTERSTITIAL_ID,
      });
      expect(runtimeWithoutAppId.enabled).toBe(false);
      expect(runtimeWithoutAppId.androidAppId).toBeNull();
      expect(runtimeWithoutAppId.interstitialAndroidUnitId).toBeNull();

      const runtimeWithoutUnitId = getAdsRuntimeConfig('android', {
        adsMode: 'real',
        androidAppId: PROD_APP_ID,
        interstitialAndroidUnitId: '',
      });
      expect(runtimeWithoutUnitId.enabled).toBe(false);
      expect(runtimeWithoutUnitId.androidAppId).toBeNull();
      expect(runtimeWithoutUnitId.interstitialAndroidUnitId).toBeNull();
    });

    it('FAIL CLOSED: Production rejects Google sample test IDs and disables ads', () => {
      const runtimeWithTestApp = getAdsRuntimeConfig('android', {
        adsMode: 'real',
        androidAppId: GOOGLE_TEST_APP_ID_ANDROID,
        interstitialAndroidUnitId: PROD_INTERSTITIAL_ID,
      });
      expect(runtimeWithTestApp.enabled).toBe(false);
      expect(runtimeWithTestApp.androidAppId).toBeNull();

      const runtimeWithTestUnit = getAdsRuntimeConfig('android', {
        adsMode: 'real',
        androidAppId: PROD_APP_ID,
        interstitialAndroidUnitId: GOOGLE_TEST_INTERSTITIAL_ANDROID,
      });
      expect(runtimeWithTestUnit.enabled).toBe(false);
      expect(runtimeWithTestUnit.interstitialAndroidUnitId).toBeNull();
    });
  });
});
