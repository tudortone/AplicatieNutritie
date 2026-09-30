'use strict';

const fs = require('fs');
const path = require('path');
const {
  GOOGLE_TEST_PUBLISHER_ID,
  GOOGLE_TEST_APP_ID_ANDROID,
  GOOGLE_TEST_APP_ID_IOS,
  GOOGLE_TEST_INTERSTITIAL_ANDROID,
  GOOGLE_TEST_INTERSTITIAL_IOS,
  ADMOB_APP_ID_REGEX,
  ADMOB_UNIT_ID_REGEX,
  isProductionContext,
  isGoogleTestId,
  validateAdMobAppId: validateAppIdCore,
  validateAdMobUnitId: validateUnitIdCore,
  resolveAdsMode,
  validateAdsConfiguration,
} = require('../lib/ads/admobCore');

const VARIABILE_BAZA = Object.freeze([
  'EXPO_PUBLIC_APP_ENV',
  'EXPO_PUBLIC_API_URL',
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_IMAGEKIT_PUBLIC_KEY',
  'EXPO_PUBLIC_SENTRY_DSN',
  'EXPO_PUBLIC_PRIVACY_POLICY_URL',
  'EXPO_PUBLIC_TERMS_OF_SERVICE_URL',
  'EXPO_PUBLIC_ADS_MODE',
]);

const VARIABILE_OBLIGATORII = VARIABILE_BAZA;

function citesteValoare(envContent, nume) {
  const linii = String(envContent || '').split(/\r?\n/);
  const prefix = `${nume}=`;
  const linie = linii.find((element) => element.trimStart().startsWith(prefix));
  if (!linie) return '';
  return linie.trimStart().slice(prefix.length).trim().replace(/^(['"])(.*)\1$/, '$2').trim();
}

function parseazaEnv(envContent) {
  const env = {};
  for (const linie of String(envContent || '').split(/\r?\n/)) {
    const normalizata = linie.trim();
    if (!normalizata || normalizata.startsWith('#')) continue;
    const separator = normalizata.indexOf('=');
    if (separator < 1) continue;
    const nume = normalizata.slice(0, separator).trim();
    env[nume] = citesteValoare(envContent, nume);
  }
  return env;
}

function esteUrlHttpsPublic(valoare, necesitaCale = false) {
  try {
    const url = new URL(valoare);
    const host = url.hostname.toLowerCase();
    const hostPlaceholder = host === 'localhost'
      || host === '127.0.0.1'
      || host === '0.0.0.0'
      || host.endsWith('.localhost')
      || host === 'example.com'
      || host.endsWith('.example.com')
      || host.endsWith('.example')
      || host.endsWith('.invalid')
      || host.endsWith('.test');
    return url.protocol === 'https:'
      && !url.username.includes('placeholder')
      && !hostPlaceholder
      && (!necesitaCale || (url.pathname !== '/' && url.pathname.length > 1));
  } catch {
    return false;
  }
}

function estePlaceholder(valoare) {
  return /(?:change[-_ ]?me|placeholder|proiectul[-_ ]tau|your[-_ ]project|de[-_ ]completat|domeniul[-_ ]tau|cheia[-_ ]ta|cheie[-_ ]publica|organizatie|id[-_ ]proiect|(?:^|[_-])dummy(?:$|[_-])|(?:^|[_-])test(?:$|[_-]))/i.test(valoare);
}

function valideazaAdMobAppId(id, allowTest = false) {
  const res = validateAppIdCore(id, allowTest);
  return { ok: res.ok, eroare: res.error };
}

function valideazaAdMobUnitId(id, allowTest = false) {
  const res = validateUnitIdCore(id, allowTest);
  return { ok: res.ok, eroare: res.error };
}

function rezolvaModReclame(env) {
  return resolveAdsMode(env);
}

function valideazaConfigurareAdMob(env, platforma = 'android') {
  const res = validateAdsConfiguration(env, platforma);
  return {
    ok: res.ok,
    mode: res.mode,
    androidAppId: res.androidAppId || null,
    iosAppId: res.iosAppId || null,
    interstitialAndroidUnitId: res.interstitialAndroidUnitId || null,
    interstitialIosUnitId: res.interstitialIosUnitId || null,
    erori: res.errors,
  };
}

function valideazaMediuProductie(env, platforma = 'android') {
  const platformaNormalizata = platforma === 'ios' ? 'ios' : 'android';
  const erori = [];

  for (const nume of VARIABILE_BAZA) {
    const valoare = String(env[nume] || '').trim();
    if (!valoare) erori.push(`${nume} nu este configurat pentru producție`);
  }

  if (env.EXPO_PUBLIC_APP_ENV && env.EXPO_PUBLIC_APP_ENV !== 'production') {
    erori.push('EXPO_PUBLIC_APP_ENV trebuie să fie exact "production"');
  }

  for (const nume of ['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_SUPABASE_URL']) {
    const valoare = String(env[nume] || '').trim();
    if (valoare && (!esteUrlHttpsPublic(valoare) || estePlaceholder(valoare))) {
      erori.push(`${nume} trebuie să fie un URL HTTPS public real`);
    }
  }

  for (const nume of ['EXPO_PUBLIC_PRIVACY_POLICY_URL', 'EXPO_PUBLIC_TERMS_OF_SERVICE_URL']) {
    const valoare = String(env[nume] || '').trim();
    if (valoare && (!esteUrlHttpsPublic(valoare, true) || estePlaceholder(valoare))) {
      erori.push(`${nume} trebuie să fie un URL HTTPS public real, cu o pagină explicită`);
    }
  }

  const sentry = String(env.EXPO_PUBLIC_SENTRY_DSN || '').trim();
  if (sentry && (!esteUrlHttpsPublic(sentry, true) || !/^https:\/\/[^@\s/]+@[^/\s]+\/.+/.test(sentry))) {
    erori.push('EXPO_PUBLIC_SENTRY_DSN trebuie să fie DSN-ul HTTPS complet din Sentry');
  }

  const clerkLegacy = String(env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || '').trim();
  if (clerkLegacy && !clerkLegacy.startsWith('pk_live_')) {
    erori.push(
      'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY este legacy/nefolosită; elimin-o sau folosește numai pk_live_ în producție',
    );
  }

  for (const nume of ['EXPO_PUBLIC_SUPABASE_ANON_KEY', 'EXPO_PUBLIC_IMAGEKIT_PUBLIC_KEY']) {
    const valoare = String(env[nume] || '').trim();
    if (valoare && estePlaceholder(valoare)) {
      erori.push(`${nume} conține un placeholder, nu o valoare de producție`);
    }
  }

  // Profilul internal testează cu ID-uri Google, chiar dacă moștenește APP_ENV=production.
  // Orice alt profil păstrează interdicția pentru modul test.
  const adsMode = String(env.EXPO_PUBLIC_ADS_MODE || '').trim().toLowerCase();
  if (adsMode === 'test' && env.EAS_BUILD_PROFILE !== 'internal') {
    erori.push(
      'EXPO_PUBLIC_ADS_MODE="test" este strict interzis în build-uri și medii de producție (production context). Build-ul de producție acceptă exclusiv "real" cu ID-uri AdMob reale valide.',
    );
  }

  // Validează configurarea AdMob pentru producție (delegat la admobCore)
  const admobRezultat = valideazaConfigurareAdMob(env, platformaNormalizata);
  if (!admobRezultat.ok) {
    for (const eroare of admobRezultat.erori) {
      if (!erori.includes(eroare)) {
        erori.push(eroare);
      }
    }
  }

  if (adsMode === 'real') {
    const rewardedKey = platformaNormalizata === 'ios'
      ? 'EXPO_PUBLIC_ADMOB_REWARDED_IOS_ID'
      : 'EXPO_PUBLIC_ADMOB_REWARDED_ANDROID_ID';
    const rewardedResult = validateUnitIdCore(env[rewardedKey], false);
    if (!rewardedResult.ok) {
      erori.push(`${rewardedKey}: ${rewardedResult.error}`);
    }
  }

  return { ok: erori.length === 0, erori };
}

function valideazaVariabileProductie(envContent, platforma = 'android') {
  return valideazaMediuProductie(parseazaEnv(envContent), platforma);
}

function obtineMediuPreSubmission(sourceEnv = process.env, optiuni = {}) {
  const currentEnv = sourceEnv || {};
  const isProduction = optiuni.isProduction !== undefined
    ? Boolean(optiuni.isProduction)
    : isProductionContext(currentEnv);

  const envPathDefault = path.join(__dirname, '..', '.env');
  const targetEnvPath = optiuni.envPath !== undefined ? optiuni.envPath : envPathDefault;

  if (isProduction) {
    // Production validation context:
    // process.env (sau mediul injectat de proces/EAS) este autoritatea unică.
    // .env local este ignorat în producție și NU constituie dovadă de release.
    return {
      env: { ...currentEnv },
      sursa: 'process.env',
      esteProductie: true,
      aFolositLocalEnv: false,
    };
  }

  // Fallback de conveniență în dezvoltare locală:
  let localEnv = {};
  let aFolositLocalEnv = false;
  if (targetEnvPath && fs.existsSync(targetEnvPath)) {
    try {
      localEnv = parseazaEnv(fs.readFileSync(targetEnvPath, 'utf8'));
      aFolositLocalEnv = true;
    } catch {
      localEnv = {};
    }
  }

  // Precedență: sourceEnv are prioritate peste .env local
  const mediu = { ...localEnv };
  for (const [k, v] of Object.entries(currentEnv)) {
    if (v !== undefined) {
      mediu[k] = v;
    }
  }

  return {
    env: mediu,
    sursa: aFolositLocalEnv ? 'process.env + .env (dev convenience)' : 'process.env',
    esteProductie: false,
    aFolositLocalEnv,
  };
}

function executaVerificareMediu(sourceEnv = process.env, platforma = 'android', optiuni = {}) {
  const rezolutie = obtineMediuPreSubmission(sourceEnv, optiuni);
  const rezultatValidare = valideazaMediuProductie(rezolutie.env, platforma);

  return {
    ok: rezultatValidare.ok,
    erori: rezultatValidare.erori,
    sursa: rezolutie.sursa,
    esteProductie: rezolutie.esteProductie,
    aFolositLocalEnv: rezolutie.aFolositLocalEnv,
    env: rezolutie.env,
  };
}

module.exports = {
  VARIABILE_BAZA,
  VARIABILE_OBLIGATORII,
  GOOGLE_TEST_PUBLISHER_ID,
  GOOGLE_TEST_APP_ID_ANDROID,
  GOOGLE_TEST_APP_ID_IOS,
  GOOGLE_TEST_INTERSTITIAL_ANDROID,
  GOOGLE_TEST_INTERSTITIAL_IOS,
  ADMOB_APP_ID_REGEX,
  ADMOB_UNIT_ID_REGEX,
  parseazaEnv,
  citesteValoare,
  esteUrlHttpsPublic,
  estePlaceholder,
  isGoogleTestId,
  valideazaAdMobAppId,
  valideazaAdMobUnitId,
  rezolvaModReclame,
  valideazaConfigurareAdMob,
  valideazaMediuProductie,
  valideazaVariabileProductie,
  obtineMediuPreSubmission,
  executaVerificareMediu,
};
