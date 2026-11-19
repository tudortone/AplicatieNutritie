/**
 * adsService.ts — strat subțire peste `react-native-google-mobile-ads`.
 *
 * Urmează exact convenția din `context/PremiumContext.tsx` pentru module
 * native opționale: `require()` protejat de `try/catch`, pentru că SDK-ul
 * nativ NU există în Expo Go (doar în development/production build EAS).
 * Fără el, `adsAvailable=false` și toate funcțiile devin no-op sigure —
 * aplicația nu depinde niciodată de disponibilitatea reclamelor.
 *
 * Reguli non-negociabile (master prompt secțiunile 8-9):
 *  - reclama nu blochează NICIODATĂ fluxul: `showPreloadedInterstitial()` nu
 *    așteaptă un load nou, doar folosește ce e deja pregătit; dacă nu e gata,
 *    întoarce `false` imediat și pornește un preload pentru viitor;
 *  - orice eroare a SDK-ului e prinsă local — nu se propagă niciodată către
 *    ecranul de rezultat al analizei sau fluxul de salvare a mesei.
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { getAdsRuntimeConfig } from './adsConfig';
import { getCanRequestAds, getConsentPersonalizedAllowed } from './adsConsent';

type GoogleMobileAdsModule = typeof import('react-native-google-mobile-ads');
// `InterstitialAd` are constructor `protected` (se creează doar prin
// `createForAdRequest`) — folosim tipul de retur al fabricii, nu `InstanceType`.
type InterstitialAdInstance = ReturnType<GoogleMobileAdsModule['InterstitialAd']['createForAdRequest']>;
type RewardedAdInstance = ReturnType<GoogleMobileAdsModule['RewardedAd']['createForAdRequest']>;

let AdsModule: GoogleMobileAdsModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('react-native-google-mobile-ads') as GoogleMobileAdsModule;
  AdsModule = mod;
} catch {
  AdsModule = null;
}

function getRuntimeConfig() {
  return getAdsRuntimeConfig(Platform.OS === 'ios' ? 'ios' : 'android');
}

export function isAdsAvailable(): boolean {
  const isExpoGo = Constants.appOwnership === 'expo';
  return AdsModule != null && !isExpoGo && getRuntimeConfig().enabled;
}

export const adsAvailable = AdsModule != null && Constants.appOwnership !== 'expo' && getAdsRuntimeConfig(Platform.OS === 'ios' ? 'ios' : 'android').enabled;

function getInterstitialUnitId(): string | null {
  const runtimeConfig = getRuntimeConfig();
  if (!AdsModule || !runtimeConfig.enabled) return null;
  if (runtimeConfig.mode === 'real') {
    const id = Platform.OS === 'ios'
      ? runtimeConfig.interstitialIosUnitId
      : runtimeConfig.interstitialAndroidUnitId;
    return id ?? null;
  }
  if (runtimeConfig.mode === 'test') {
    const configuredId = Platform.OS === 'ios'
      ? runtimeConfig.interstitialIosUnitId
      : runtimeConfig.interstitialAndroidUnitId;
    return configuredId ?? AdsModule.TestIds?.INTERSTITIAL ?? null;
  }
  return null;
}

function getRewardedUnitId(): string | null {
  const runtimeConfig = getRuntimeConfig();
  if (!AdsModule || !runtimeConfig.enabled) return null;
  if (runtimeConfig.mode === 'real') {
    return Platform.OS === 'ios'
      ? runtimeConfig.rewardedIosUnitId
      : runtimeConfig.rewardedAndroidUnitId;
  }
  if (runtimeConfig.mode === 'test') {
    const configuredId = Platform.OS === 'ios'
      ? runtimeConfig.rewardedIosUnitId
      : runtimeConfig.rewardedAndroidUnitId;
    return configuredId ?? AdsModule.TestIds?.REWARDED ?? null;
  }
  return null;
}

export const INTERSTITIAL_RETRY_DELAYS_MS = [5_000, 15_000, 45_000] as const;
export const REWARDED_LOAD_TIMEOUT_MS = 15_000;
export const REWARDED_PRELOAD_TTL_MS = 4 * 60 * 1000;

let sdkInitialized = false;
let interstitial: InterstitialAdInstance | null = null;
let interstitialUnsubscribers: Array<() => void> = [];
let interstitialGeneration = 0;
let interstitialRetryCount = 0;
let interstitialRetryTimer: ReturnType<typeof setTimeout> | null = null;
let activeRewardedPromise: Promise<RewardedAdOutcome> | null = null;

function clearInterstitialRetryTimer(): void {
  if (interstitialRetryTimer !== null) {
    clearTimeout(interstitialRetryTimer);
    interstitialRetryTimer = null;
  }
}

function discardCurrentInterstitial(resetRetryCount: boolean): void {
  clearInterstitialRetryTimer();
  if (resetRetryCount) {
    interstitialRetryCount = 0;
  }
  interstitialGeneration += 1;
  interstitial = null;
  for (const unsubscribe of interstitialUnsubscribers.splice(0)) {
    try { unsubscribe(); } catch {}
  }
}

export function discardPreloadedInterstitial(): void {
  discardCurrentInterstitial(true);
}

function attachInterstitialListeners(ad: InterstitialAdInstance, generation: number): void {
  if (!AdsModule) return;
  const { AdEventType } = AdsModule;
  const isCurrentAd = () => interstitial === ad && interstitialGeneration === generation;
  interstitialUnsubscribers.push(ad.addAdEventListener(AdEventType.ERROR, () => {
    if (!isCurrentAd()) return;
    discardCurrentInterstitial(false);
    if (
      getCanRequestAds()
      && isAdsAvailable()
      && interstitialRetryCount < INTERSTITIAL_RETRY_DELAYS_MS.length
    ) {
      const delayMs = INTERSTITIAL_RETRY_DELAYS_MS[interstitialRetryCount];
      interstitialRetryCount += 1;
      interstitialRetryTimer = setTimeout(() => {
        interstitialRetryTimer = null;
        if (getCanRequestAds()) preloadInterstitial();
      }, delayMs);
      if (typeof (interstitialRetryTimer as { unref?: () => void })?.unref === 'function') {
        (interstitialRetryTimer as { unref?: () => void }).unref?.();
      }
    }
  }));
  interstitialUnsubscribers.push(ad.addAdEventListener(AdEventType.LOADED, () => {
    if (!isCurrentAd()) return;
    if (!getCanRequestAds()) {
      discardCurrentInterstitial(true);
      return;
    }
    interstitialRetryCount = 0;
    clearInterstitialRetryTimer();
  }));
  interstitialUnsubscribers.push(ad.addAdEventListener(AdEventType.CLOSED, () => {
    // Preîncărcăm imediat următoarea reclamă, ca următoarea oportunitate
    // eligibilă să nu aștepte un load la cerere (care ar întârzia/eșua vizibil
    // exact în momentul tranziției utilizatorului).
    if (!isCurrentAd()) return;
    discardCurrentInterstitial(true);
    if (getCanRequestAds()) preloadInterstitial();
  }));
}

/**
 * Pregătește din timp o reclamă interstițială, fără să afecteze UI-ul.
 * Sigur de apelat oricând (no-op dacă reclamele nu sunt disponibile sau dacă
 * o cerere e deja în curs / deja încărcată — `MobileAd.load()` e idempotent).
 */
export function preloadInterstitial(): void {
  if (!getCanRequestAds()) {
    discardCurrentInterstitial(true);
    return;
  }
  if (!isAdsAvailable() || !AdsModule || interstitial) return;
  clearInterstitialRetryTimer();
  try {
    const unitId = getInterstitialUnitId();
    if (!unitId) return;
    const ad = AdsModule.InterstitialAd.createForAdRequest(unitId, {
      requestNonPersonalizedAdsOnly: !getConsentPersonalizedAllowed(),
    });
    interstitial = ad;
    const generation = interstitialGeneration;
    attachInterstitialListeners(ad, generation);
    ad.load();
  } catch {
    discardCurrentInterstitial(true);
    // Fail silențios — vezi antetul fișierului.
  }
}

/**
 * Inițializează SDK-ul Google Mobile Ads (o singură dată) și pornește
 * preîncărcarea primei reclame. Trebuie apelat DUPĂ rezolvarea consimțământului
 * (`lib/ads/adsConsent.ts`), niciodată înainte — vezi master prompt secțiunea 18.
 */
export async function initializeAdsSdk(): Promise<void> {
  if (!isAdsAvailable() || !AdsModule) return;
  if (!getCanRequestAds()) return;
  // P1-06: Dacă SDK-ul era deja inițializat (ex. abonamentul a expirat sau s-a schimbat
  // contul după discardPreloadedInterstitial), re-preîncărcăm interstițialul.
  if (sdkInitialized) {
    preloadInterstitial();
    return;
  }
  try {
    try {
      if (
        getRuntimeConfig().mode === 'test'
        && typeof AdsModule.default === 'function'
        && typeof AdsModule.default().setRequestConfiguration === 'function'
      ) {
        await AdsModule.default().setRequestConfiguration({
          testDeviceIdentifiers: ['182025E7F769CEBC220B2CA72371661A'],
        });
      }
    } catch {}
    await AdsModule.default().initialize();
    sdkInitialized = true;
    preloadInterstitial();
  } catch {
    // Fail-open pentru UX: fără reclame disponibile, aplicația continuă normal.
    sdkInitialized = false;
  }
}

export function isInterstitialReady(): boolean {
  return isAdsAvailable() && interstitial != null && interstitial.loaded === true;
}

/**
 * Încearcă să afișeze reclama deja preîncărcată. NU așteaptă niciodată un
 * load nou — dacă nu e gata, se comportă ca un eșec silențios (întoarce
 * `false`) și pornește un preload pentru următoarea oportunitate eligibilă.
 * Apelantul NU trebuie să condiționeze nimic funcțional de rezultat.
 */
export function showPreloadedInterstitial(): boolean {
  if (!getCanRequestAds()) {
    discardPreloadedInterstitial();
    return false;
  }
  if (!isAdsAvailable()) return false;
  if (!interstitial || !interstitial.loaded) {
    preloadInterstitial();
    return false;
  }
  const activeInterstitial = interstitial;
  try {
    const showResult = activeInterstitial.show();
    // `show()` întoarce o Promise; o eventuală respingere asincronă nu trebuie
    // să devină o excepție necapturată (unhandledRejection) în restul aplicației.
    if (showResult && typeof (showResult as Promise<void>).catch === 'function') {
      (showResult as Promise<void>).catch(() => {
        if (interstitial === activeInterstitial) discardPreloadedInterstitial();
        preloadInterstitial();
      });
    }
    return true;
  } catch {
    if (interstitial === activeInterstitial) discardPreloadedInterstitial();
    preloadInterstitial();
    return false;
  }
}

export type RewardedAdOutcome = 'earned-awaiting-server' | 'dismissed' | 'unavailable';

type PreloadedRewardedEntry = {
  ad: RewardedAdInstance;
  intentId: string;
  customData: string;
  createdAtMs: number;
  status: 'loading' | 'loaded' | 'failed';
  unsubscribers: Array<() => void>;
  ttlTimer: ReturnType<typeof setTimeout> | null;
};

let preloadedRewarded: PreloadedRewardedEntry | null = null;

function detachPreloadedRewardedEntry(entry: PreloadedRewardedEntry): void {
  if (entry.ttlTimer !== null) {
    clearTimeout(entry.ttlTimer);
    entry.ttlTimer = null;
  }
  for (const unsubscribe of entry.unsubscribers.splice(0)) {
    try { unsubscribe(); } catch {}
  }
}

export function discardPreloadedRewardedAd(): void {
  const entry = preloadedRewarded;
  if (!entry) return;
  preloadedRewarded = null;
  detachPreloadedRewardedEntry(entry);
}

/**
 * Pre-încarcă o reclamă Rewarded legată de un intent SSV (`intentId` + `customData`),
 * cu TTL de 4 minute. Este sigură pentru apeluri repetate pe același intent.
 */
export function preloadRewardedAdWithSsv({
  intentId,
  customData,
}: { intentId: string; customData: string }): boolean {
  if (!isAdsAvailable() || !getCanRequestAds() || !AdsModule || !intentId || !customData) {
    return false;
  }
  if (
    preloadedRewarded
    && preloadedRewarded.intentId === intentId
    && preloadedRewarded.customData === customData
    && preloadedRewarded.status !== 'failed'
    && Date.now() - preloadedRewarded.createdAtMs < REWARDED_PRELOAD_TTL_MS
  ) {
    return true;
  }
  const unitId = getRewardedUnitId();
  if (!unitId) return false;
  discardPreloadedRewardedAd();
  try {
    const ad = AdsModule.RewardedAd.createForAdRequest(unitId, {
      requestNonPersonalizedAdsOnly: !getConsentPersonalizedAllowed(),
      serverSideVerificationOptions: { userId: intentId, customData },
    });
    const entry: PreloadedRewardedEntry = {
      ad,
      intentId,
      customData,
      createdAtMs: Date.now(),
      status: 'loading',
      unsubscribers: [],
      ttlTimer: null,
    };
    preloadedRewarded = entry;
    entry.unsubscribers.push(
      ad.addAdEventListener(AdsModule.RewardedAdEventType.LOADED, () => {
        if (preloadedRewarded !== entry) return;
        if (!getCanRequestAds()) {
          discardPreloadedRewardedAd();
          return;
        }
        entry.status = 'loaded';
      }),
      ad.addAdEventListener(AdsModule.AdEventType.ERROR, () => {
        if (preloadedRewarded !== entry) return;
        entry.status = 'failed';
        discardPreloadedRewardedAd();
      }),
    );
    entry.ttlTimer = setTimeout(() => {
      if (preloadedRewarded === entry) discardPreloadedRewardedAd();
    }, REWARDED_PRELOAD_TTL_MS);
    if (typeof (entry.ttlTimer as { unref?: () => void })?.unref === 'function') {
      (entry.ttlTimer as { unref?: () => void }).unref?.();
    }
    ad.load();
    return true;
  } catch {
    discardPreloadedRewardedAd();
    return false;
  }
}

/**
 * Afișează o reclamă rewarded cu date SSV opace. Evenimentul local EARNED_REWARD
 * nu creditează nimic; el permite doar UI-ului să aștepte callback-ul Google
 * verificat de backend și să reîncarce soldul server-side.
 */
export function showRewardedAdWithSsv({
  intentId,
  customData,
}: { intentId: string; customData: string }): Promise<RewardedAdOutcome> {
  if (!isAdsAvailable() || !getCanRequestAds() || !AdsModule) {
    return Promise.resolve('unavailable');
  }
  const unitId = getRewardedUnitId();
  if (!unitId) return Promise.resolve('unavailable');

  // P1-04: Single-flight nativ — nu deschide două reclame rewarded simultan.
  if (activeRewardedPromise) {
    return activeRewardedPromise;
  }

  const preloaded = preloadedRewarded;
  const canUsePreloaded = Boolean(
    preloaded
    && preloaded.intentId === intentId
    && preloaded.customData === customData
    && preloaded.status !== 'failed'
    && Date.now() - preloaded.createdAtMs < REWARDED_PRELOAD_TTL_MS,
  );
  if (canUsePreloaded && preloaded) {
    preloadedRewarded = null;
    detachPreloadedRewardedEntry(preloaded);
  } else if (preloaded) {
    discardPreloadedRewardedAd();
  }

  const promise = new Promise<RewardedAdOutcome>((resolve) => {
    let ad: RewardedAdInstance;
    let earned = false;
    let settled = false;
    const unsubscribers: Array<() => void> = [];
    const finish = (outcome: RewardedAdOutcome) => {
      if (settled) return;
      settled = true;
      for (const unsubscribe of unsubscribers) {
        try { unsubscribe(); } catch {}
      }
      clearTimeout(timeout);
      if (activeRewardedPromise === promise) {
        activeRewardedPromise = null;
      }
      resolve(outcome);
    };
    const timeout = setTimeout(() => finish('unavailable'), REWARDED_LOAD_TIMEOUT_MS);
    try {
      ad = canUsePreloaded && preloaded
        ? preloaded.ad
        : AdsModule.RewardedAd.createForAdRequest(unitId, {
            requestNonPersonalizedAdsOnly: !getConsentPersonalizedAllowed(),
            serverSideVerificationOptions: { userId: intentId, customData },
          });
      unsubscribers.push(
        ad.addAdEventListener(AdsModule.RewardedAdEventType.EARNED_REWARD, () => {
          earned = true;
        }),
        ad.addAdEventListener(AdsModule.AdEventType.ERROR, () => finish('unavailable')),
        ad.addAdEventListener(AdsModule.AdEventType.CLOSED, () =>
          finish(earned ? 'earned-awaiting-server' : 'dismissed')),
      );
      if (canUsePreloaded && preloaded && (preloaded.status === 'loaded' || ad.loaded === true)) {
        clearTimeout(timeout);
        void Promise.resolve(ad.show()).catch(() => finish('unavailable'));
      } else {
        unsubscribers.push(
          ad.addAdEventListener(AdsModule.RewardedAdEventType.LOADED, () => {
            clearTimeout(timeout);
            void Promise.resolve(ad.show()).catch(() => finish('unavailable'));
          }),
        );
        if (!canUsePreloaded) {
          ad.load();
        }
      }
    } catch {
      finish('unavailable');
    }
  });
  activeRewardedPromise = promise;
  return promise;
}

/** Doar pentru teste: resetează starea internă a modulului (interstițial + rewarded + flag inițializare). */
export function __resetAdsServiceForTests(): void {
  sdkInitialized = false;
  activeRewardedPromise = null;
  discardCurrentInterstitial(true);
  discardPreloadedRewardedAd();
}

/** Reconcile any already-loaded ad with the user's latest UMP choice. */
export async function refreshAdsAfterConsentChange(): Promise<void> {
  discardCurrentInterstitial(true);
  discardPreloadedRewardedAd();
  if (!getCanRequestAds()) return;
  if (sdkInitialized) preloadInterstitial();
  else await initializeAdsSdk();
}
