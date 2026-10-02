const {
  valideazaMediuProductie,
  valideazaVariabileProductie,
  valideazaConfigurareAdMob,
  parseazaEnv,
  GOOGLE_TEST_APP_ID_ANDROID,
  GOOGLE_TEST_APP_ID_IOS,
  GOOGLE_TEST_INTERSTITIAL_ANDROID,
  GOOGLE_TEST_INTERSTITIAL_IOS,
} = require('../scripts/preSubmissionConfig');

describe('poarta de configurare pentru release', () => {
  const REAL_APP_ID_FIXTURE = 'ca-app-pub-1234567890123456~1234567890';
  const REAL_UNIT_ID_FIXTURE = 'ca-app-pub-1234567890123456/1234567890';
  const REAL_REWARDED_ID_FIXTURE = 'ca-app-pub-1234567890123456/2345678901';

  const complet = [
    'EXPO_PUBLIC_APP_ENV=production',
    'EXPO_PUBLIC_API_URL=https://api.nutriai.ro',
    'EXPO_PUBLIC_SUPABASE_URL=https://nutriai.supabase.co',
    'EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_live_key',
    'EXPO_PUBLIC_IMAGEKIT_PUBLIC_KEY=public_live_key',
    'EXPO_PUBLIC_SENTRY_DSN=https://public@sentry.io/123',
    'EXPO_PUBLIC_PRIVACY_POLICY_URL=https://legal.nutriai.ro/confidentialitate',
    'EXPO_PUBLIC_TERMS_OF_SERVICE_URL=https://legal.nutriai.ro/termeni',
    'EXPO_PUBLIC_ADS_MODE=real',
    `EXPO_PUBLIC_ADMOB_ANDROID_APP_ID=${REAL_APP_ID_FIXTURE}`,
    `EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID_ID=${REAL_UNIT_ID_FIXTURE}`,
    `EXPO_PUBLIC_ADMOB_REWARDED_ANDROID_ID=${REAL_REWARDED_ID_FIXTURE}`,
    'EXPO_PUBLIC_ADMOB_IOS_APP_ID=ca-app-pub-1234567890123456~0987654321',
    'EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS_ID=ca-app-pub-1234567890123456/0987654321',
    'EXPO_PUBLIC_ADMOB_REWARDED_IOS_ID=ca-app-pub-1234567890123456/2345678901',
  ].join('\n');

  it('blocheaza release-ul cand lipseste orice variabila obligatorie', () => {
    const rezultat = valideazaVariabileProductie(
      complet.replace('EXPO_PUBLIC_PRIVACY_POLICY_URL=https://legal.nutriai.ro/confidentialitate\n', ''),
    );

    expect(rezultat.ok).toBe(false);
    expect(rezultat.erori).toContain(
      'EXPO_PUBLIC_PRIVACY_POLICY_URL nu este configurat pentru producție',
    );
  });

  it('blocheaza URL-urile locale, HTTP si placeholder-ele publice', () => {
    const rezultat = valideazaVariabileProductie(complet
      .replace('https://api.nutriai.ro', 'http://localhost:3000')
      .replace('https://legal.nutriai.ro/termeni', 'https://legal.example.com/terms'));

    expect(rezultat.ok).toBe(false);
    expect(rezultat.erori.some((eroare: string) => eroare.includes('EXPO_PUBLIC_API_URL'))).toBe(true);
    expect(rezultat.erori.some((eroare: string) => eroare.includes('EXPO_PUBLIC_TERMS_OF_SERVICE_URL'))).toBe(true);
  });

  it('nu cere configurare comerciala publicabila in client pe nicio platforma', () => {
    const android = valideazaMediuProductie(Object.fromEntries(
      complet.split('\n').map((linie) => {
        const idx = linie.indexOf('=');
        return [linie.slice(0, idx), linie.slice(idx + 1)];
      }),
    ), 'android');
    const ios = valideazaMediuProductie(Object.fromEntries(
      complet.split('\n').map((linie) => {
        const idx = linie.indexOf('=');
        return [linie.slice(0, idx), linie.slice(idx + 1)];
      }),
    ), 'ios');

    expect(android).toEqual({ ok: true, erori: [] });
    expect(ios).toEqual({ ok: true, erori: [] });
  });

  it('blochează o cheie Clerk test rămasă în configurația production', () => {
    const rezultat = valideazaVariabileProductie(
      `${complet}\nEXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_legacy`,
    );

    expect(rezultat.ok).toBe(false);
    expect(rezultat.erori).toContain(
      'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY este legacy/nefolosită; elimin-o sau folosește numai pk_live_ în producție',
    );
  });

  it('blocheaza release-ul de productie cand lipseste EXPO_PUBLIC_ADS_MODE', () => {
    const faraAdsMode = complet.replace('EXPO_PUBLIC_ADS_MODE=real\n', '');
    const rezultat = valideazaVariabileProductie(faraAdsMode);

    expect(rezultat.ok).toBe(false);
    expect(rezultat.erori.some((e: string) => e.includes('EXPO_PUBLIC_ADS_MODE'))).toBe(true);
  });

  it('blocheaza EXPO_PUBLIC_ADS_MODE=disabled in context de productie (Blocker 1)', () => {
    const disabledMode = complet.replace('EXPO_PUBLIC_ADS_MODE=real', 'EXPO_PUBLIC_ADS_MODE=disabled');
    const rezultat = valideazaVariabileProductie(disabledMode);

    expect(rezultat.ok).toBe(false);
    expect(rezultat.erori.some((e: string) => e.includes('disabled') && e.includes('interzis'))).toBe(true);
  });

  it('blocheaza EXPO_PUBLIC_ADS_MODE=test in context de productie', () => {
    const testMode = complet.replace('EXPO_PUBLIC_ADS_MODE=real', 'EXPO_PUBLIC_ADS_MODE=test');
    const rezultat = valideazaVariabileProductie(testMode);
    const explicitProduction = valideazaMediuProductie({
      ...parseazaEnv(testMode),
      EAS_BUILD_PROFILE: 'production',
    });

    expect(rezultat.ok).toBe(false);
    expect(rezultat.erori.some((e: string) => e.includes('strict interzis'))).toBe(true);
    expect(explicitProduction.ok).toBe(false);
    expect(explicitProduction.erori.some((e: string) => e.includes('strict interzis'))).toBe(true);
  });

  it('blocheaza EXPO_PUBLIC_ADS_MODE=real daca lipsesc ID-urile AdMob', () => {
    const realModeFaraIds = complet
      .replace(`EXPO_PUBLIC_ADMOB_ANDROID_APP_ID=${REAL_APP_ID_FIXTURE}\n`, '')
      .replace(`EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID_ID=${REAL_UNIT_ID_FIXTURE}`, '');
    const rezultat = valideazaVariabileProductie(realModeFaraIds);

    expect(rezultat.ok).toBe(false);
    expect(rezultat.erori.some((e: string) => e.includes('App ID') && e.includes('lipseste'))).toBe(true);
  });

  it('blocheaza EXPO_PUBLIC_ADS_MODE=real daca se folosesc ID-uri Google de test', () => {
    const realCuTestIds = complet
      .replace(REAL_APP_ID_FIXTURE, GOOGLE_TEST_APP_ID_ANDROID)
      .replace(REAL_UNIT_ID_FIXTURE, GOOGLE_TEST_INTERSTITIAL_ANDROID);

    const rezultat = valideazaVariabileProductie(realCuTestIds);
    expect(rezultat.ok).toBe(false);
    expect(rezultat.erori.some((e: string) => e.includes('Google de test'))).toBe(true);
  });

  it('blocheaza productia cand lipseste ID-ul rewarded pentru platforma selectata', () => {
    const android = valideazaVariabileProductie(
      complet.replace(`EXPO_PUBLIC_ADMOB_REWARDED_ANDROID_ID=${REAL_REWARDED_ID_FIXTURE}\n`, ''),
    );
    const ios = valideazaVariabileProductie(
      complet.replace(`EXPO_PUBLIC_ADMOB_REWARDED_IOS_ID=${REAL_REWARDED_ID_FIXTURE}`, ''),
      'ios',
    );

    expect(android.ok).toBe(false);
    expect(android.erori.some((e: string) => e.includes('EXPO_PUBLIC_ADMOB_REWARDED_ANDROID_ID'))).toBe(true);
    expect(ios.ok).toBe(false);
    expect(ios.erori.some((e: string) => e.includes('EXPO_PUBLIC_ADMOB_REWARDED_IOS_ID'))).toBe(true);
  });

  it('blocheaza productia cu ID rewarded Google de test sau cu format invalid', () => {
    const googleTest = valideazaVariabileProductie(complet.replace(
      `EXPO_PUBLIC_ADMOB_REWARDED_ANDROID_ID=${REAL_REWARDED_ID_FIXTURE}`,
      'EXPO_PUBLIC_ADMOB_REWARDED_ANDROID_ID=ca-app-pub-3940256099942544/5224354917',
    ));
    const malformed = valideazaVariabileProductie(complet.replace(
      `EXPO_PUBLIC_ADMOB_REWARDED_ANDROID_ID=${REAL_REWARDED_ID_FIXTURE}`,
      'EXPO_PUBLIC_ADMOB_REWARDED_ANDROID_ID=invalid',
    ));

    expect(googleTest.ok).toBe(false);
    expect(googleTest.erori.some((e: string) => e.includes('EXPO_PUBLIC_ADMOB_REWARDED_ANDROID_ID'))).toBe(true);
    expect(malformed.ok).toBe(false);
    expect(malformed.erori.some((e: string) => e.includes('EXPO_PUBLIC_ADMOB_REWARDED_ANDROID_ID'))).toBe(true);
  });

  it('injecteaza exact configuratia AdMob confirmata in build-ul EAS production', () => {
    const eas = require('../eas.json');
    expect(eas.build.production.env).toEqual(expect.objectContaining({
      EXPO_PUBLIC_ADS_MODE: 'real',
      EXPO_PUBLIC_ADMOB_ANDROID_APP_ID: 'ca-app-pub-5202280855139508~6141533757',
      EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID_ID: 'ca-app-pub-5202280855139508/1542500110',
      EXPO_PUBLIC_ADMOB_REWARDED_ANDROID_ID: 'ca-app-pub-5202280855139508/3566028223',
    }));
  });

  it('pastreaza ID-urile Google de test in profilul internal care extinde production', () => {
    const eas = require('../eas.json');
    expect(eas.build.internal.extends).toBe('production');
    const effectiveEnv = {
      ...eas.build.production.env,
      ...eas.build.internal.env,
      EAS_BUILD_PROFILE: 'internal',
    };

    expect(effectiveEnv).toEqual(expect.objectContaining({
      EXPO_PUBLIC_ADS_MODE: 'test',
      EXPO_PUBLIC_ADMOB_ANDROID_APP_ID: GOOGLE_TEST_APP_ID_ANDROID,
      EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID_ID: GOOGLE_TEST_INTERSTITIAL_ANDROID,
      EXPO_PUBLIC_ADMOB_REWARDED_ANDROID_ID: 'ca-app-pub-3940256099942544/5224354917',
    }));
    expect(valideazaConfigurareAdMob(effectiveEnv, 'android').ok).toBe(true);
    expect(valideazaMediuProductie({
      ...parseazaEnv(complet),
      ...effectiveEnv,
    }, 'android')).toEqual({ ok: true, erori: [] });
  });

  it('suprascrie ID-urile iOS reale mostenite cu ID-uri Google de test in profilul internal', () => {
    const eas = require('../eas.json');
    const effectiveEnv = {
      ...parseazaEnv(complet), // simuleaza ID-uri iOS reale adaugate ulterior in production
      ...eas.build.production.env,
      ...eas.build.internal.env,
      EAS_BUILD_PROFILE: 'internal',
    };

    expect(effectiveEnv).toEqual(expect.objectContaining({
      EXPO_PUBLIC_ADMOB_IOS_APP_ID: GOOGLE_TEST_APP_ID_IOS,
      EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS_ID: GOOGLE_TEST_INTERSTITIAL_IOS,
      EXPO_PUBLIC_ADMOB_REWARDED_IOS_ID: 'ca-app-pub-3940256099942544/1712485313',
    }));
    expect(valideazaConfigurareAdMob(effectiveEnv, 'ios').ok).toBe(true);
    expect(valideazaMediuProductie(effectiveEnv, 'ios')).toEqual({ ok: true, erori: [] });
  });

  it('izoleaza update-urile OTA pentru profilul internal', () => {
    const eas = require('../eas.json');
    expect(eas.build.internal.channel).toBe('internal');
    expect(eas.build.internal.channel).not.toBe(eas.build.production.channel);
  });

  it('accepta configuratia completa de productie cu EXPO_PUBLIC_ADS_MODE=real si ID-uri reale valide', () => {
    const rezultat = valideazaVariabileProductie(complet);
    expect(rezultat).toEqual({ ok: true, erori: [] });
  });
});
