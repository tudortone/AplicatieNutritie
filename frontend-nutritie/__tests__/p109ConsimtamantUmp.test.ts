/**
 * P1-09A — starea canonică de consimțământ UMP (Google User Messaging Platform).
 *
 * ==========================================================================
 * DEFECTELE (Faza A, prezente în arbore înainte de P1-09)
 * ==========================================================================
 * `lib/ads/adsConsent.ts` apela `gatherConsent()` și păstra DOAR două câmpuri:
 *
 *   canRequestAdsCache     = info.canRequestAds === true;
 *   personalizedAllowedCache = info.status === AdsConsentStatus.OBTAINED;
 *
 * De aici trei probleme reale:
 *
 *  A1. `privacyOptionsRequirementStatus` era ARUNCAT. Google cere ca, atunci când
 *      statusul este REQUIRED, aplicația să expună un punct de intrare vizibil și
 *      interactiv către formularul de opțiuni de confidențialitate. Fără a citi
 *      câmpul, aplicația nu poate ști nici măcar dacă îi este cerut.
 *
 *  A2. `status === OBTAINED` NU înseamnă „utilizatorul a acceptat reclame
 *      personalizate". OBTAINED înseamnă doar „utilizatorul a luat o decizie".
 *      Un utilizator din SEE care a REFUZAT personalizarea primea totuși
 *      `requestNonPersonalizedAdsOnly: false`, adică exact opusul alegerii lui.
 *      Sursa corectă este `getUserChoices().selectPersonalisedAds`.
 *
 *  A3. La orice eroare (rețea, formular), totul devenea `false` pe loc, fără să
 *      se consulte decizia deja persistată de SDK din sesiunile anterioare
 *      (`getConsentInfo()`). Un singur hop de rețea la pornire anula reclamele
 *      pentru toată sesiunea, deși consimțământul era demult obținut.
 *
 * Testele rulează pe modulul REAL, cu SDK-ul mockat la granița lui exactă.
 */

jest.mock('react-native-google-mobile-ads', () => ({
  AdsConsent: {
    gatherConsent: jest.fn(),
    getConsentInfo: jest.fn(),
    getUserChoices: jest.fn(),
    showPrivacyOptionsForm: jest.fn(),
  },
  AdsConsentStatus: {
    UNKNOWN: 'UNKNOWN',
    REQUIRED: 'REQUIRED',
    NOT_REQUIRED: 'NOT_REQUIRED',
    OBTAINED: 'OBTAINED',
  },
  AdsConsentPrivacyOptionsRequirementStatus: {
    UNKNOWN: 'UNKNOWN',
    REQUIRED: 'REQUIRED',
    NOT_REQUIRED: 'NOT_REQUIRED',
  },
}));

import {
  resolveAdsConsent,
  getCanRequestAds,
  getConsentPersonalizedAllowed,
  getPrivacyOptionsRequired,
  showAdsPrivacyOptionsForm,
  __resetAdsConsentForTests,
} from '../lib/ads/adsConsent';

const { AdsConsent } = jest.requireMock('react-native-google-mobile-ads');

/** Formă exactă a `AdsConsentInfo` din SDK-ul instalat (16.3.4). */
function infoConsimtamant(over: Record<string, unknown> = {}) {
  return {
    status: 'OBTAINED',
    canRequestAds: true,
    privacyOptionsRequirementStatus: 'NOT_REQUIRED',
    isConsentFormAvailable: true,
    ...over,
  };
}

beforeEach(() => {
  __resetAdsConsentForTests();
  AdsConsent.gatherConsent.mockReset();
  AdsConsent.getConsentInfo.mockReset();
  AdsConsent.getUserChoices.mockReset();
  AdsConsent.showPrivacyOptionsForm.mockReset();
  // Implicit: utilizator care a acceptat tot.
  AdsConsent.gatherConsent.mockResolvedValue(infoConsimtamant());
  AdsConsent.getUserChoices.mockResolvedValue({ selectPersonalisedAds: true });
});

describe('P1-09A — rezolvarea consimțământului', () => {
  test('1. consimțământ NU este necesar (în afara SEE) → reclame permise, fără punct de confidențialitate', async () => {
    AdsConsent.gatherConsent.mockResolvedValue(
      infoConsimtamant({ status: 'NOT_REQUIRED', canRequestAds: true, privacyOptionsRequirementStatus: 'NOT_REQUIRED' }),
    );

    const rezultat = await resolveAdsConsent();

    expect(rezultat.canRequestAds).toBe(true);
    expect(getCanRequestAds()).toBe(true);
    expect(getPrivacyOptionsRequired()).toBe(false);
  });

  test('2. consimțământ obținut ȘI personalizare ACCEPTATĂ → reclame personalizate permise', async () => {
    AdsConsent.getUserChoices.mockResolvedValue({ selectPersonalisedAds: true });

    await resolveAdsConsent();

    expect(getCanRequestAds()).toBe(true);
    expect(getConsentPersonalizedAllowed()).toBe(true);
  });

  test('3. A2 — consimțământ OBTAINED dar personalizare REFUZATĂ → personalizarea NU e permisă', async () => {
    // Utilizator din SEE care a deschis formularul și a refuzat personalizarea:
    // statusul rămâne OBTAINED (a luat o decizie), dar alegerea este „nu".
    AdsConsent.gatherConsent.mockResolvedValue(
      infoConsimtamant({ status: 'OBTAINED', canRequestAds: true, privacyOptionsRequirementStatus: 'REQUIRED' }),
    );
    AdsConsent.getUserChoices.mockResolvedValue({ selectPersonalisedAds: false });

    await resolveAdsConsent();

    // Reclamele sunt permise (a consimțit la reclame), dar NEpersonalizate.
    expect(getCanRequestAds()).toBe(true);
    expect(getConsentPersonalizedAllowed()).toBe(false);
  });

  test('4. consimțământ NECESAR și NEobținut → nicio reclamă', async () => {
    AdsConsent.gatherConsent.mockResolvedValue(
      infoConsimtamant({ status: 'REQUIRED', canRequestAds: false }),
    );

    const rezultat = await resolveAdsConsent();

    expect(rezultat.canRequestAds).toBe(false);
    expect(getCanRequestAds()).toBe(false);
    expect(getConsentPersonalizedAllowed()).toBe(false);
  });

  test('5. A1 — privacyOptionsRequirementStatus REQUIRED este citit și expus', async () => {
    AdsConsent.gatherConsent.mockResolvedValue(
      infoConsimtamant({ privacyOptionsRequirementStatus: 'REQUIRED' }),
    );

    const rezultat = await resolveAdsConsent();

    expect(getPrivacyOptionsRequired()).toBe(true);
    expect(rezultat.privacyOptionsRequired).toBe(true);
  });

  test('6. A3 — eroare la gatherConsent → se folosește decizia deja persistată de SDK', async () => {
    AdsConsent.gatherConsent.mockRejectedValue(new Error('network'));
    // SDK-ul are deja consimțământul din sesiunea precedentă.
    AdsConsent.getConsentInfo.mockResolvedValue(
      infoConsimtamant({ status: 'OBTAINED', canRequestAds: true, privacyOptionsRequirementStatus: 'REQUIRED' }),
    );

    const rezultat = await resolveAdsConsent();

    expect(AdsConsent.getConsentInfo).toHaveBeenCalled();
    expect(rezultat.canRequestAds).toBe(true);
    expect(getCanRequestAds()).toBe(true);
    // Punctul de confidențialitate rămâne cerut și pe calea degradată.
    expect(getPrivacyOptionsRequired()).toBe(true);
  });

  test('7. eroare la gatherConsent ȘI la getConsentInfo → fail-closed, fără excepție', async () => {
    AdsConsent.gatherConsent.mockRejectedValue(new Error('network'));
    AdsConsent.getConsentInfo.mockRejectedValue(new Error('still down'));

    const rezultat = await resolveAdsConsent();

    expect(rezultat.canRequestAds).toBe(false);
    expect(getCanRequestAds()).toBe(false);
    expect(getConsentPersonalizedAllowed()).toBe(false);
  });

  test('8. getUserChoices care aruncă NU anulează consimțământul de bază', async () => {
    AdsConsent.getUserChoices.mockRejectedValue(new Error('tcf indisponibil'));

    const rezultat = await resolveAdsConsent();

    expect(rezultat.canRequestAds).toBe(true);
    // Necunoscut → conservator: fără personalizare.
    expect(getConsentPersonalizedAllowed()).toBe(false);
  });

  test('9. apeluri concurente → UN SINGUR flux UMP (fără formulare duplicate)', async () => {
    let elibereaza: (v: unknown) => void = () => {};
    AdsConsent.gatherConsent.mockReturnValue(
      new Promise((res) => { elibereaza = res; }),
    );

    const a = resolveAdsConsent();
    const b = resolveAdsConsent();
    elibereaza(infoConsimtamant());
    await Promise.all([a, b]);

    expect(AdsConsent.gatherConsent).toHaveBeenCalledTimes(1);
  });

  test('10. repornire aplicație → starea se re-derivă din SDK, nu dintr-un cache propriu', async () => {
    await resolveAdsConsent();
    expect(getCanRequestAds()).toBe(true);

    // Repornire: cache-urile modulului dispar.
    __resetAdsConsentForTests();
    expect(getCanRequestAds()).toBe(false);

    AdsConsent.gatherConsent.mockResolvedValue(
      infoConsimtamant({ status: 'REQUIRED', canRequestAds: false }),
    );
    await resolveAdsConsent();
    expect(getCanRequestAds()).toBe(false);
  });
});

describe('P1-09A — formularul de opțiuni de confidențialitate', () => {
  test('11. A1 — punctul de intrare deschide formularul canonic al SDK-ului', async () => {
    AdsConsent.gatherConsent.mockResolvedValue(
      infoConsimtamant({ privacyOptionsRequirementStatus: 'REQUIRED' }),
    );
    AdsConsent.showPrivacyOptionsForm.mockResolvedValue(
      infoConsimtamant({ status: 'REQUIRED', canRequestAds: false, privacyOptionsRequirementStatus: 'REQUIRED' }),
    );
    await resolveAdsConsent();

    const ok = await showAdsPrivacyOptionsForm();

    expect(AdsConsent.showPrivacyOptionsForm).toHaveBeenCalledTimes(1);
    expect(ok).toBe(true);
    // Retragerea consimțământului se reflectă IMEDIAT în starea canonică.
    expect(getCanRequestAds()).toBe(false);
  });

  test('12. eșecul formularului este raportat, nu mimat ca succes', async () => {
    AdsConsent.showPrivacyOptionsForm.mockRejectedValue(new Error('form failed'));
    await resolveAdsConsent();

    const ok = await showAdsPrivacyOptionsForm();

    expect(ok).toBe(false);
    // Starea anterioară rămâne neschimbată — nu inventăm o retragere.
    expect(getCanRequestAds()).toBe(true);
  });
});
