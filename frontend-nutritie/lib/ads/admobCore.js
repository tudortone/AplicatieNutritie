'use strict';

/**
 * admobCore.js — Nucleul canonic unic de configurare și validare AdMob pentru GetFlow.
 *
 * Utilizat direct de:
 *  - app.config.js (configurație build Expo / AndroidManifest)
 *  - scripts/preSubmissionConfig.js (poarta pre-submit)
 *  - lib/ads/adsConfig.ts (runtime client React Native)
 *
 * Garanții non-negociabile:
 *  1. EXPO_PUBLIC_ADS_MODE este singura autoritate. Variabilele legacy (ADS_MODE etc.) sunt ignorate.
 *  2. În producție este permis EXCLUSIV modul "real" cu ID-uri reale valide. "disabled" și "test" sunt strict REPINSE.
 *  3. În modul "test", sunt permise EXCLUSIV identificatorii oficiali Google de test. Orice ID real sau mixt este RESPINS.
 *  4. În modul "disabled" (doar non-producție), reclamele nu sunt inițializate și pluginul este omis.
 */

const {
  GOOGLE_TEST_PUBLISHER_ID,
  GOOGLE_TEST_APP_ID_ANDROID,
  GOOGLE_TEST_APP_ID_IOS,
  GOOGLE_TEST_INTERSTITIAL_ANDROID,
  GOOGLE_TEST_INTERSTITIAL_IOS,
  isGoogleTestId,
} = require('./admobTestIds');

// Format canonic AdMob App ID: ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY (cu tildă ~)
const ADMOB_APP_ID_REGEX = /^ca-app-pub-\d{16}~\d{10}$/;

// Format canonic AdMob Ad Unit ID: ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY (cu slash /)
const ADMOB_UNIT_ID_REGEX = /^ca-app-pub-\d{16}\/\d{10}$/;

function isInternalProfile(env) {
  const e = env || {};
  return e.EAS_BUILD_PROFILE === 'internal';
}

function isProductionReleaseProfile(env) {
  const e = env || {};
  return e.EAS_BUILD_PROFILE === 'production';
}

function isProductionContext(env) {
  const e = env || {};
  return (
    e.EXPO_PUBLIC_APP_ENV === 'production' ||
    e.APP_ENV === 'production'
  );
}

function validateAdMobAppId(id, allowTest = false) {
  const trimmed = typeof id === 'string' ? id.trim() : '';
  if (!trimmed) {
    return { ok: false, error: 'AdMob App ID lipsește (lipseste) sau este gol.' };
  }
  if (!ADMOB_APP_ID_REGEX.test(trimmed)) {
    return {
      ok: false,
      error: 'AdMob App ID are un format invalid (așteptat: ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY, conținând tildă ~ și nu slash /).',
    };
  }
  if (!allowTest && isGoogleTestId(trimmed)) {
    return {
      ok: false,
      error: `AdMob App ID conține ID-ul Google de test (${GOOGLE_TEST_PUBLISHER_ID}), interzis în modul de producție real.`,
    };
  }
  return { ok: true };
}

function validateAdMobUnitId(id, allowTest = false) {
  const trimmed = typeof id === 'string' ? id.trim() : '';
  if (!trimmed) {
    return { ok: false, error: 'AdMob Ad Unit ID lipsește (lipseste) sau este gol.' };
  }
  if (!ADMOB_UNIT_ID_REGEX.test(trimmed)) {
    return {
      ok: false,
      error: 'AdMob Ad Unit ID are un format invalid (așteptat: ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY, conținând slash / și nu tildă ~).',
    };
  }
  if (!allowTest && isGoogleTestId(trimmed)) {
    return {
      ok: false,
      error: `AdMob Ad Unit ID conține ID-ul Google de test (${GOOGLE_TEST_PUBLISHER_ID}), interzis în modul de producție real.`,
    };
  }
  return { ok: true };
}

function resolveAdsMode(env) {
  const currentEnv = env || (typeof process !== 'undefined' ? process.env : {});
  // Singura autoritate este EXPO_PUBLIC_ADS_MODE. Orice altă variabilă legacy (ADS_MODE etc.) este strict ignorată.
  const rawValue = currentEnv.EXPO_PUBLIC_ADS_MODE;
  const rawMode = typeof rawValue === 'string' ? rawValue.trim().toLowerCase() : '';
  const inInternal = isInternalProfile(currentEnv);
  const inProdRelease = isProductionReleaseProfile(currentEnv);
  const inProduction = isProductionContext(currentEnv);

  // Profil explicit de testare internă (EAS internal / Google Play Internal Testing track)
  if (inInternal) {
    if (!rawMode || rawMode === 'test') {
      return 'test';
    }
    if (rawMode === 'disabled') {
      throw new Error(
        'EXPO_PUBLIC_ADS_MODE="disabled" este strict interzis în profilul de testare internă (internal profile). Testarea pe pista internă Google Play necesită reclame active ("test" sau "real").',
      );
    }
    if (rawMode === 'real') {
      return 'real';
    }
    throw new Error(
      `EXPO_PUBLIC_ADS_MODE are o valoare invalidă ("${rawMode}"). În profilul intern sunt permise exclusiv "test" sau "real".`,
    );
  }

  // Profil explicit de lansare în producție publică (EAS profile production)
  if (inProdRelease) {
    if (!rawMode) {
      throw new Error(
        'EXPO_PUBLIC_ADS_MODE este obligatoriu în context de producție (production context: acceptă exclusiv "real"). Nu poate fi omis sau gol.',
      );
    }
    if (rawMode === 'disabled') {
      throw new Error(
        'EXPO_PUBLIC_ADS_MODE="disabled" este strict interzis în build-uri și medii de producție (production context). Build-ul de producție acceptă exclusiv "real" cu ID-uri AdMob reale valide.',
      );
    }
    if (rawMode === 'test') {
      throw new Error(
        'EXPO_PUBLIC_ADS_MODE="test" este strict interzis în build-uri și medii de producție (production context). Build-ul de producție acceptă exclusiv "real" cu ID-uri AdMob reale valide.',
      );
    }
    if (rawMode === 'real') {
      return 'real';
    }
    throw new Error(
      `EXPO_PUBLIC_ADS_MODE are o valoare invalidă ("${rawMode}"). În producție este permis exclusiv "real".`,
    );
  }

  // Context ambient producție (ex. EXPO_PUBLIC_APP_ENV=production fără profil EAS explicit)
  if (inProduction) {
    if (!rawMode) {
      throw new Error(
        'EXPO_PUBLIC_ADS_MODE este obligatoriu în context de producție (production context). Nu poate fi omis sau gol.',
      );
    }
    if (rawMode === 'disabled') {
      throw new Error(
        'EXPO_PUBLIC_ADS_MODE="disabled" este strict interzis în build-uri și medii de producție (production context). Build-ul de producție acceptă exclusiv "real" cu ID-uri AdMob reale valide.',
      );
    }
    if (rawMode === 'test') {
      return 'test';
    }
    if (rawMode === 'real') {
      return 'real';
    }
    throw new Error(
      `EXPO_PUBLIC_ADS_MODE are o valoare invalidă ("${rawMode}"). Valori permise: "test" | "real".`,
    );
  }

  // Context non-producție (development / test / local)
  if (!rawMode) {
    return 'disabled';
  }
  if (rawMode === 'disabled') {
    return 'disabled';
  }
  if (rawMode === 'test') {
    return 'test';
  }
  if (rawMode === 'real') {
    return 'real';
  }

  throw new Error(
    `EXPO_PUBLIC_ADS_MODE are o valoare invalidă ("${rawMode}"). Valori permise: "disabled" | "test" | "real".`,
  );
}

function validateAdsConfiguration(env, platform = 'android') {
  const currentEnv = env || {};
  const platformNormalizata = platform === 'ios' ? 'ios' : 'android';
  const errors = [];
  let mode;

  try {
    mode = resolveAdsMode(currentEnv);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
    return { ok: false, mode: undefined, errors };
  }

  if (mode === 'disabled') {
    return {
      ok: true,
      mode: 'disabled',
      androidAppId: null,
      iosAppId: null,
      interstitialAndroidUnitId: null,
      interstitialIosUnitId: null,
      errors: [],
    };
  }

  const isIos = platformNormalizata === 'ios';
  const officialTestAppId = isIos ? GOOGLE_TEST_APP_ID_IOS : GOOGLE_TEST_APP_ID_ANDROID;
  const officialTestUnitId = isIos ? GOOGLE_TEST_INTERSTITIAL_IOS : GOOGLE_TEST_INTERSTITIAL_ANDROID;

  const rawAndroidAppId = currentEnv.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID?.trim() || '';
  const rawIosAppId = currentEnv.EXPO_PUBLIC_ADMOB_IOS_APP_ID?.trim() || '';
  const rawAndroidUnitId = currentEnv.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID_ID?.trim() || '';
  const rawIosUnitId = currentEnv.EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS_ID?.trim() || '';

  const rawTargetAppId = isIos ? rawIosAppId : rawAndroidAppId;
  const rawTargetUnitId = isIos ? rawIosUnitId : rawAndroidUnitId;

  if (mode === 'test') {
    // Blocker 3: În modul test, sunt permise EXCLUSIV identificatorii oficiali Google de test.
    if (rawTargetAppId && rawTargetAppId !== officialTestAppId) {
      errors.push(
        `În modul test, este permis exclusiv App ID-ul oficial Google de test (${officialTestAppId}). Nu se acceptă ID-uri reale sau modificate.`,
      );
    }
    if (rawTargetUnitId && rawTargetUnitId !== officialTestUnitId) {
      errors.push(
        `În modul test, este permis exclusiv Ad Unit ID-ul oficial Google de test (${officialTestUnitId}). Nu se acceptă ID-uri reale sau modificate.`,
      );
    }

    if (errors.length > 0) {
      return { ok: false, mode: 'test', errors };
    }

    return {
      ok: true,
      mode: 'test',
      androidAppId: GOOGLE_TEST_APP_ID_ANDROID,
      iosAppId: GOOGLE_TEST_APP_ID_IOS,
      interstitialAndroidUnitId: GOOGLE_TEST_INTERSTITIAL_ANDROID,
      interstitialIosUnitId: GOOGLE_TEST_INTERSTITIAL_IOS,
      errors: [],
    };
  }

  // mode === 'real': ID-uri de producție reale
  const appResult = validateAdMobAppId(rawTargetAppId, false);
  if (!appResult.ok && appResult.error) {
    errors.push(appResult.error);
  }

  const unitResult = validateAdMobUnitId(rawTargetUnitId, false);
  if (!unitResult.ok && unitResult.error) {
    errors.push(unitResult.error);
  }

  const ok = errors.length === 0;
  return {
    ok,
    mode: 'real',
    androidAppId: ok && !isIos ? rawAndroidAppId : (ok ? rawAndroidAppId || null : null),
    iosAppId: ok && isIos ? rawIosAppId : (ok ? rawIosAppId || null : null),
    interstitialAndroidUnitId: ok && !isIos ? rawAndroidUnitId : (ok ? rawAndroidUnitId || null : null),
    interstitialIosUnitId: ok && isIos ? rawIosUnitId : (ok ? rawIosUnitId || null : null),
    errors,
  };
}

module.exports = {
  GOOGLE_TEST_PUBLISHER_ID,
  GOOGLE_TEST_APP_ID_ANDROID,
  GOOGLE_TEST_APP_ID_IOS,
  GOOGLE_TEST_INTERSTITIAL_ANDROID,
  GOOGLE_TEST_INTERSTITIAL_IOS,
  ADMOB_APP_ID_REGEX,
  ADMOB_UNIT_ID_REGEX,
  isProductionContext,
  isGoogleTestId,
  validateAdMobAppId,
  validateAdMobUnitId,
  resolveAdsMode,
  validateAdsConfiguration,
};
