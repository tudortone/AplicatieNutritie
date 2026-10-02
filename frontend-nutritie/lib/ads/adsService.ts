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

let sdkInitialized = false;
let interstitial: InterstitialAdInstance | null = null;

function attachInterstitialListeners(ad: InterstitialAdInstance): void {
  if (!AdsModule) return;
  const { AdEventType } = AdsModule;
  ad.addAdEventListener(AdEventType.ERROR, () => {
    // Nimic de făcut — reclama pur și simplu nu va fi disponibilă la `show()`.
  });
  ad.addAdEventListener(AdEventType.CLOSED, () => {
    // Preîncărcăm imediat următoarea reclamă, ca următoarea oportunitate
    // eligibilă să nu aștepte un load la cerere (care ar întârzia/eșua vizibil
    // exact în momentul tranziției utilizatorului).
    preloadInterstitial();
  });
}

/**
 * Pregătește din timp o reclamă interstițială, fără să afecteze UI-ul.
 * Sigur de apelat oricând (no-op dacă reclamele nu sunt disponibile sau dacă
 * o cerere e deja în curs / deja încărcată — `MobileAd.load()` e idempotent).
 */
export function preloadInterstitial(): void {
  if (!isAdsAvailable() || !AdsModule) return;
  try {
    const unitId = getInterstitialUnitId();
    if (!unitId) return;
    const ad = AdsModule.InterstitialAd.createForAdRequest(unitId, {
      requestNonPersonalizedAdsOnly: !getConsentPersonalizedAllowed(),
    });
    attachInterstitialListeners(ad);
    interstitial = ad;
    ad.load();
  } catch {
    // Fail silențios — vezi antetul fișierului.
  }
}

/**
 * Inițializează SDK-ul Google Mobile Ads (o singură dată) și pornește
 * preîncărcarea primei reclame. Trebuie apelat DUPĂ rezolvarea consimțământului
 * (`lib/ads/adsConsent.ts`), niciodată înainte — vezi master prompt secțiunea 18.
 */
export async function initializeAdsSdk(): Promise<void> {
  if (!isAdsAvailable() || !AdsModule || sdkInitialized) return;
  if (!getCanRequestAds()) return;
  try {
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
  if (!isAdsAvailable() || !getCanRequestAds()) return false;
  if (!interstitial || !interstitial.loaded) {
    preloadInterstitial();
    return false;
  }
  try {
    const showResult = interstitial.show();
    // `show()` întoarce o Promise; o eventuală respingere asincronă nu trebuie
    // să devină o excepție necapturată (unhandledRejection) în restul aplicației.
    if (showResult && typeof (showResult as Promise<void>).catch === 'function') {
      (showResult as Promise<void>).catch(() => {
        preloadInterstitial();
      });
    }
    return true;
  } catch {
    preloadInterstitial();
    return false;
  }
}

export type RewardedAdOutcome = 'earned-awaiting-server' | 'dismissed' | 'unavailable';

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
  return new Promise((resolve) => {
    let ad: RewardedAdInstance;
    let earned = false;
    let settled = false;
    const unsubscribers: Array<() => void> = [];
    const finish = (outcome: RewardedAdOutcome) => {
      if (settled) return;
      settled = true;
      for (const unsubscribe of unsubscribers) unsubscribe();
      clearTimeout(timeout);
      resolve(outcome);
    };
    const timeout = setTimeout(() => finish('unavailable'), 60_000);
    try {
      ad = AdsModule.RewardedAd.createForAdRequest(unitId, {
        requestNonPersonalizedAdsOnly: !getConsentPersonalizedAllowed(),
        serverSideVerificationOptions: { userId: intentId, customData },
      });
      unsubscribers.push(
        ad.addAdEventListener(AdsModule.RewardedAdEventType.LOADED, () => {
          void ad.show().catch(() => finish('unavailable'));
        }),
        ad.addAdEventListener(AdsModule.RewardedAdEventType.EARNED_REWARD, () => {
          earned = true;
        }),
        ad.addAdEventListener(AdsModule.AdEventType.ERROR, () => finish('unavailable')),
        ad.addAdEventListener(AdsModule.AdEventType.CLOSED, () =>
          finish(earned ? 'earned-awaiting-server' : 'dismissed')),
      );
      ad.load();
    } catch {
      finish('unavailable');
    }
  });
}

/** Doar pentru teste: resetează starea internă a modulului (interstițial + flag inițializare). */
export function __resetAdsServiceForTests(): void {
  sdkInitialized = false;
  interstitial = null;
}
