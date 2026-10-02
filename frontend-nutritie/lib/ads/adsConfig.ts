/**
 * adsConfig.ts — Configurare runtime pentru reclame (AdMob).
 *
 * P0-05 / V12 Remediation:
 *  - Izolează complet identificatorii de producție (adConfig.production.ts) de cei de test.
 *  - Metro/Babel inlining direct prin expresii membre statice (process.env.EXPO_PUBLIC_*).
 *  - ZERO identificatori Google sample/test (ca-app-pub-3940256099942544) în bundle-ul de producție.
 *  - Fail-closed: În modul real de producție, lipsa sau invaliditatea ID-urilor dezactivează complet reclamele.
 */

import {
  GETFLOW_PRODUCTION_ADMOB,
  ADMOB_APP_ID_REGEX,
  ADMOB_UNIT_ID_REGEX,
  isGetFlowProductionAppId,
  isGetFlowProductionUnitId,
} from './adConfig.production';

export type AdsMode = 'disabled' | 'test' | 'real';

export {
  GETFLOW_PRODUCTION_ADMOB,
  ADMOB_APP_ID_REGEX,
  ADMOB_UNIT_ID_REGEX,
  isGetFlowProductionAppId,
  isGetFlowProductionUnitId,
};

// Static direct member expressions for Babel / Metro bundle-time inlining
const STATIC_ADS_MODE = process.env.EXPO_PUBLIC_ADS_MODE;
const STATIC_APP_ENV = process.env.EXPO_PUBLIC_APP_ENV;
const STATIC_ANDROID_APP_ID = process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID;
const STATIC_IOS_APP_ID = process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID;
const STATIC_INTERSTITIAL_ANDROID = process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID_ID;
const STATIC_INTERSTITIAL_IOS = process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS_ID;
const STATIC_REWARDED_ANDROID = process.env.EXPO_PUBLIC_ADMOB_REWARDED_ANDROID_ID;
const STATIC_REWARDED_IOS = process.env.EXPO_PUBLIC_ADMOB_REWARDED_IOS_ID;
const STATIC_AD_EVERY_N_ANALYSES = process.env.EXPO_PUBLIC_AD_EVERY_N_ANALYSES;
const STATIC_AD_MIN_INTERVAL_SECONDS = process.env.EXPO_PUBLIC_AD_MIN_INTERVAL_SECONDS;

function positiveIntOr(value: string | number | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function nonNegativeIntOr(value: string | number | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

export type AdsPublicEnvironment = Partial<{
  adsMode: AdsMode | string;
  androidAppId: string;
  iosAppId: string;
  interstitialAndroidUnitId: string;
  interstitialIosUnitId: string;
  rewardedAndroidUnitId: string;
  rewardedIosUnitId: string;
  everyNAnalyses: string | number;
  everyNChatMessages: string | number;
  minAdIntervalSeconds: string | number;
}>;

export type AdsRuntimeConfig = {
  mode: AdsMode;
  enabled: boolean;
  androidAppId: string | null;
  iosAppId: string | null;
  interstitialAndroidUnitId: string | null;
  interstitialIosUnitId: string | null;
  rewardedAndroidUnitId: string | null;
  rewardedIosUnitId: string | null;
  everyNAnalyses: number;
  everyNChatMessages: number;
  minAdIntervalSeconds: number;
};

export function isProductionContext(env?: Record<string, string | undefined>): boolean {
  if (env) {
    return env.EXPO_PUBLIC_APP_ENV === 'production' || env.APP_ENV === 'production';
  }
  return STATIC_APP_ENV === 'production';
}

export function isGoogleTestId(id: string | null | undefined): boolean {
  if (!id) return false;
  // Detects official Google test publisher ID without bundling the raw literal in production code paths
  // 3940256099942544 is Google's documented sample publisher
  return String(id).includes('3940256099942544');
}

export function validateAdMobAppId(id: string | null | undefined, allowTest = false): { ok: boolean; error?: string } {
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
      error: 'AdMob App ID conține ID-ul Google de test, interzis în modul de producție real.',
    };
  }
  return { ok: true };
}

export function validateAdMobUnitId(id: string | null | undefined, allowTest = false): { ok: boolean; error?: string } {
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
      error: 'AdMob Ad Unit ID conține ID-ul Google de test, interzis în modul de producție real.',
    };
  }
  return { ok: true };
}

export function resolveAdsMode(env?: Record<string, string | undefined>): AdsMode {
  const currentEnv = env || (typeof process !== 'undefined' ? (process.env as Record<string, string | undefined>) : {});
  const rawValue = env ? env.EXPO_PUBLIC_ADS_MODE : (STATIC_ADS_MODE ?? currentEnv.EXPO_PUBLIC_ADS_MODE);
  const rawMode = typeof rawValue === 'string' ? rawValue.trim().toLowerCase() : '';
  const inInternal = currentEnv.EAS_BUILD_PROFILE === 'internal';
  const inProdRelease = currentEnv.EAS_BUILD_PROFILE === 'production';
  const inProduction = (
    currentEnv.EXPO_PUBLIC_APP_ENV === 'production' ||
    currentEnv.APP_ENV === 'production' ||
    (!env && STATIC_APP_ENV === 'production')
  );

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

  if (!rawMode || rawMode === 'disabled') {
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

export function validateAdsConfiguration(
  env?: Record<string, string | undefined>,
  platform: 'android' | 'ios' = 'android',
): {
  ok: boolean;
  mode: AdsMode | undefined;
  androidAppId?: string | null;
  iosAppId?: string | null;
  interstitialAndroidUnitId?: string | null;
  interstitialIosUnitId?: string | null;
  errors: string[];
} {
  const currentEnv = env || (typeof process !== 'undefined' ? (process.env as Record<string, string | undefined>) : {});
  const isIos = platform === 'ios';
  const errors: string[] = [];
  let mode: AdsMode;

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

  const rawAndroidAppId = (env ? env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID : (STATIC_ANDROID_APP_ID ?? currentEnv.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID))?.trim() || '';
  const rawIosAppId = (env ? env.EXPO_PUBLIC_ADMOB_IOS_APP_ID : (STATIC_IOS_APP_ID ?? currentEnv.EXPO_PUBLIC_ADMOB_IOS_APP_ID))?.trim() || '';
  const rawAndroidUnitId = (env ? env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID_ID : (STATIC_INTERSTITIAL_ANDROID ?? currentEnv.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID_ID))?.trim() || '';
  const rawIosUnitId = (env ? env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS_ID : (STATIC_INTERSTITIAL_IOS ?? currentEnv.EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS_ID))?.trim() || '';

  const targetAppId = isIos ? rawIosAppId : rawAndroidAppId;
  const targetUnitId = isIos ? rawIosUnitId : rawAndroidUnitId;

  if (mode === 'test') {
    // În modul test, sunt permise doar ID-urile de test oficiale sau delegate către native TestIds
    if (targetAppId && !isGoogleTestId(targetAppId)) {
      errors.push('În modul test, este permis exclusiv App ID-ul oficial Google de test. Nu se acceptă ID-uri reale sau modificate.');
    }
    if (targetUnitId && !isGoogleTestId(targetUnitId)) {
      errors.push('În modul test, este permis exclusiv Ad Unit ID-ul oficial Google de test. Nu se acceptă ID-uri reale sau modificate.');
    }
    if (errors.length > 0) {
      return { ok: false, mode: 'test', errors };
    }
    return {
      ok: true,
      mode: 'test',
      androidAppId: rawAndroidAppId || null,
      iosAppId: rawIosAppId || null,
      interstitialAndroidUnitId: rawAndroidUnitId || null,
      interstitialIosUnitId: rawIosUnitId || null,
      errors: [],
    };
  }

  // mode === 'real' (Producție)
  const appResult = validateAdMobAppId(targetAppId, false);
  if (!appResult.ok && appResult.error) {
    errors.push(appResult.error);
  }

  const unitResult = validateAdMobUnitId(targetUnitId, false);
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

export function getAdsRuntimeConfig(
  platform: 'android' | 'ios',
  overrides?: AdsPublicEnvironment,
): AdsRuntimeConfig {
  const isIos = platform === 'ios';

  const rawModeOverride = overrides?.adsMode;
  let mode: AdsMode;
  try {
    if (rawModeOverride !== undefined) {
      mode = resolveAdsMode({ EXPO_PUBLIC_ADS_MODE: String(rawModeOverride) });
    } else {
      mode = resolveAdsMode();
    }
  } catch {
    // Fail closed: Orice configurație invalidă dezactivează reclamele
    mode = 'disabled';
  }

  const everyNAnalyses = positiveIntOr(
    overrides?.everyNAnalyses ?? STATIC_AD_EVERY_N_ANALYSES,
    3,
  );
  const everyNChatMessages = 15;
  const minAdIntervalSeconds = nonNegativeIntOr(
    overrides?.minAdIntervalSeconds ?? STATIC_AD_MIN_INTERVAL_SECONDS,
    600,
  );

  if (mode === 'disabled') {
    return {
      mode: 'disabled',
      enabled: false,
      androidAppId: null,
      iosAppId: null,
      interstitialAndroidUnitId: null,
      interstitialIosUnitId: null,
      rewardedAndroidUnitId: null,
      rewardedIosUnitId: null,
      everyNAnalyses,
      everyNChatMessages,
      minAdIntervalSeconds,
    };
  }

  const androidAppId = overrides?.androidAppId ?? (STATIC_ANDROID_APP_ID || null);
  const iosAppId = overrides?.iosAppId ?? (STATIC_IOS_APP_ID || null);
  const interstitialAndroid = overrides?.interstitialAndroidUnitId ?? (STATIC_INTERSTITIAL_ANDROID || null);
  const interstitialIos = overrides?.interstitialIosUnitId ?? (STATIC_INTERSTITIAL_IOS || null);
  const rewardedAndroid = overrides?.rewardedAndroidUnitId ?? (STATIC_REWARDED_ANDROID || null);
  const rewardedIos = overrides?.rewardedIosUnitId ?? (STATIC_REWARDED_IOS || null);

  const targetAppId = isIos ? iosAppId : androidAppId;
  const targetInterstitialId = isIos ? interstitialIos : interstitialAndroid;

  if (mode === 'real') {
    // Garanție producție: Verificare strictă non-test și format valid
    const appValid = validateAdMobAppId(targetAppId, false);
    const unitValid = validateAdMobUnitId(targetInterstitialId, false);

    if (!appValid.ok || !unitValid.ok) {
      // FAIL CLOSED: Nu se afișează reclame dacă configurația este incompletă sau invalidă
      return {
        mode: 'real',
        enabled: false,
        androidAppId: null,
        iosAppId: null,
        interstitialAndroidUnitId: null,
        interstitialIosUnitId: null,
        rewardedAndroidUnitId: null,
        rewardedIosUnitId: null,
        everyNAnalyses,
        everyNChatMessages,
        minAdIntervalSeconds,
      };
    }

    return {
      mode: 'real',
      enabled: true,
      androidAppId: androidAppId ?? GETFLOW_PRODUCTION_ADMOB.appIdAndroid,
      iosAppId: iosAppId ?? null,
      interstitialAndroidUnitId: interstitialAndroid ?? GETFLOW_PRODUCTION_ADMOB.interstitialAndroidUnitId,
      interstitialIosUnitId: interstitialIos ?? null,
      rewardedAndroidUnitId: validateAdMobUnitId(rewardedAndroid, false).ok
        ? rewardedAndroid
        : (STATIC_REWARDED_ANDROID ?? GETFLOW_PRODUCTION_ADMOB.rewardedAndroidUnitId),
      rewardedIosUnitId: validateAdMobUnitId(rewardedIos, false).ok ? rewardedIos : null,
      everyNAnalyses,
      everyNChatMessages,
      minAdIntervalSeconds,
    };
  }

  // mode === 'test'
  return {
    mode: 'test',
    enabled: true,
    androidAppId: androidAppId || null,
    iosAppId: iosAppId || null,
    interstitialAndroidUnitId: interstitialAndroid || null,
    interstitialIosUnitId: interstitialIos || null,
    rewardedAndroidUnitId: rewardedAndroid || null,
    rewardedIosUnitId: rewardedIos || null,
    everyNAnalyses,
    everyNChatMessages,
    minAdIntervalSeconds,
  };
}
