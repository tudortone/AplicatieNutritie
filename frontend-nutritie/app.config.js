'use strict';

const {
  valideazaMediuProductie,
  valideazaConfigurareAdMob,
} = require('./scripts/preSubmissionConfig');

module.exports = ({ config }) => {
  const platforma = process.env.EAS_BUILD_PLATFORM === 'ios' ? 'ios' : 'android';

  if (process.env.EAS_BUILD_PROFILE === 'production') {
    const rezultat = valideazaMediuProductie(process.env, platforma);
    if (!rezultat.ok) {
      throw new Error(
        `Configuratia build-ului de productie este invalida:\n- ${rezultat.erori.join('\n- ')}`,
      );
    }
  }

  // P0-05: Validare canonică AdMob (fail closed)
  const admobRezultat = valideazaConfigurareAdMob(process.env, platforma);
  if (!admobRezultat.ok) {
    throw new Error(
      `Configuratia AdMob este invalida:\n- ${admobRezultat.erori.join('\n- ')}`,
    );
  }

  const plugins = [...(config.plugins || [])];

  // In modul 'disabled', plugin-ul react-native-google-mobile-ads NU este adăugat.
  // Astfel, build-urile fără reclame nu cer și nu injectează com.google.android.gms.ads.APPLICATION_ID în AndroidManifest.
  if (admobRezultat.mode !== 'disabled') {
    plugins.push([
      'react-native-google-mobile-ads',
      {
        androidAppId: admobRezultat.androidAppId,
        iosAppId: admobRezultat.iosAppId,
        // Amânăm măsurătorile SDK până la inițializare explicită (după
        // rezolvarea consimțământului UMP) — vezi lib/ads/adsConsent.ts.
        delayAppMeasurementInit: true,
        userTrackingUsageDescription:
          'Acest identificator este folosit pentru a afișa reclame relevante utilizatorilor cu cont gratuit GetFlow.',
      },
    ]);
  }

  return { ...config, plugins };
};
