/**
 * adsConsent.ts — consimțământ EEA/GDPR pentru reclame, prin fluxul UMP
 * (User Messaging Platform) al Google, expus de `react-native-google-mobile-ads`
 * (nu e nevoie de o dependență separată).
 *
 * Flux (cf. documentației oficiale Google UMP și master prompt secțiunea 18):
 *   pornire app → `resolveAdsConsent()` → SDK decide dacă geografia
 *   utilizatorului cere consimțământ (EEA/UK) → dacă da, arată formularul
 *   nativ o singură dată → abia după aceea reclamele pot fi cerute.
 *
 * Fail-open pentru UX, fail-closed pentru conformitate:
 *   - orice eroare de rețea/SDK în timpul rezolvării consimțământului lasă
 *     `canRequestAds=false` (nu servim reclame până nu știm sigur starea) —
 *     aplicația continuă normal, doar utilizatorul respectiv nu vede reclame
 *     în acea sesiune (retry automat la următoarea pornire);
 *   - dacă SDK-ul de reclame lipsește (Expo Go / build fără plugin), tratăm
 *     la fel: fără reclame, fără blocaje.
 */

type GoogleMobileAdsModule = typeof import('react-native-google-mobile-ads');

let AdsModule: GoogleMobileAdsModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  AdsModule = require('react-native-google-mobile-ads');
} catch {
  AdsModule = null;
}

let canRequestAdsCache = false;
let personalizedAllowedCache = false;
let privacyOptionsRequiredCache = false;
let resolvedCache = false;
let inFlightResolution: Promise<AdsConsentResolution> | null = null;

/** Rezultatul ultimei rezolvări de consimțământ — `false` implicit (fail-closed) până se apelează `resolveAdsConsent()`. */
export function getCanRequestAds(): boolean {
  return canRequestAdsCache;
}

export function getConsentPersonalizedAllowed(): boolean {
  return personalizedAllowedCache;
}

export function getPrivacyOptionsRequired(): boolean {
  return privacyOptionsRequiredCache;
}

export function isConsentResolved(): boolean {
  return resolvedCache;
}

export interface AdsConsentResolution {
  canRequestAds: boolean;
  personalized: boolean;
  privacyOptionsRequired: boolean;
}

/**
 * Rulează fluxul UMP complet (echivalentul `AdsConsent.gatherConsent()`:
 * `requestInfoUpdate` + afișare formular DOAR dacă e necesar). Idempotent și
 * concurențial sigur — apelurile paralele partajează aceeași promisiune.
 */
export async function resolveAdsConsent(): Promise<AdsConsentResolution> {
  if (inFlightResolution) {
    return inFlightResolution;
  }

  inFlightResolution = (async (): Promise<AdsConsentResolution> => {
    if (!AdsModule?.AdsConsent) {
      resolvedCache = true;
      canRequestAdsCache = false;
      personalizedAllowedCache = false;
      privacyOptionsRequiredCache = false;
      return { canRequestAds: false, personalized: false, privacyOptionsRequired: false };
    }

    try {
      let info: any;
      try {
        info = await AdsModule.AdsConsent.gatherConsent();
      } catch {
        // A3: dacă gatherConsent a eșuat (ex. eroare de rețea), consultăm decizia
        // deja persistată în SDK din sesiunile anterioare
        info = await AdsModule.AdsConsent.getConsentInfo();
      }

      const { AdsConsentStatus, AdsConsentPrivacyOptionsRequirementStatus } = AdsModule;
      canRequestAdsCache = info?.canRequestAds === true;

      const reqStatus = String(info?.privacyOptionsRequirementStatus || '');
      privacyOptionsRequiredCache =
        reqStatus === AdsConsentPrivacyOptionsRequirementStatus?.REQUIRED ||
        reqStatus === 'REQUIRED';

      if (canRequestAdsCache) {
        try {
          const choices = await AdsModule.AdsConsent.getUserChoices();
          personalizedAllowedCache = choices?.selectPersonalisedAds === true;
        } catch {
          // A2/A3: dacă getUserChoices aruncă, tratăm conservator (fără personalizare),
          // dar menținem dreptul de bază de a cere reclame dacă canRequestAds e true.
          personalizedAllowedCache = false;
        }
      } else {
        personalizedAllowedCache = false;
      }

      resolvedCache = true;
      return {
        canRequestAds: canRequestAdsCache,
        personalized: personalizedAllowedCache,
        privacyOptionsRequired: privacyOptionsRequiredCache,
      };
    } catch {
      // Ambele (gatherConsent și getConsentInfo) au eșuat -> fail-closed sigur
      resolvedCache = true;
      canRequestAdsCache = false;
      personalizedAllowedCache = false;
      privacyOptionsRequiredCache = false;
      return { canRequestAds: false, personalized: false, privacyOptionsRequired: false };
    } finally {
      inFlightResolution = null;
    }
  })();

  return inFlightResolution;
}

/**
 * Deschide formularul canonic de opțiuni de confidențialitate al Google UMP.
 * Actualizează imediat cache-urile interne cu noua stare a utilizatorului.
 * Returnează true la succes, false dacă formularul a eșuat.
 */
export async function showAdsPrivacyOptionsForm(): Promise<boolean> {
  if (!AdsModule?.AdsConsent?.showPrivacyOptionsForm) return false;
  try {
    const info = await AdsModule.AdsConsent.showPrivacyOptionsForm();
    if (info) {
      const { AdsConsentPrivacyOptionsRequirementStatus } = AdsModule;
      canRequestAdsCache = info.canRequestAds === true;
      const reqStatus = String(info.privacyOptionsRequirementStatus || '');
      privacyOptionsRequiredCache =
        reqStatus === AdsConsentPrivacyOptionsRequirementStatus?.REQUIRED ||
        reqStatus === 'REQUIRED';

      if (canRequestAdsCache) {
        try {
          const choices = await AdsModule.AdsConsent.getUserChoices();
          personalizedAllowedCache = choices?.selectPersonalisedAds === true;
        } catch {
          personalizedAllowedCache = false;
        }
      } else {
        personalizedAllowedCache = false;
      }
    }
    return true;
  } catch {
    // Eșecul formularului este raportat (false), iar starea anterioară rămâne neschimbată
    return false;
  }
}

/** Doar pentru teste: readuce modulul la starea inițială nerezolvată. */
export function __resetAdsConsentForTests(): void {
  canRequestAdsCache = false;
  personalizedAllowedCache = false;
  privacyOptionsRequiredCache = false;
  resolvedCache = false;
  inFlightResolution = null;
}
