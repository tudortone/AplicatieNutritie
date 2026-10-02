'use strict';

/**
 * admobTestIds.js — Identificatori AdMob oficiali Google de test pentru Node.js / CommonJS.
 *
 * Utilizat exclusiv de scripturi Node de build și testare (scripts/preSubmissionConfig.js, app.config.js, admobCore.js).
 */

const GOOGLE_TEST_PUBLISHER_ID = 'ca-app-pub-3940256099942544';
const GOOGLE_TEST_APP_ID_ANDROID = 'ca-app-pub-3940256099942544~3347511713';
const GOOGLE_TEST_APP_ID_IOS = 'ca-app-pub-3940256099942544~1458002511';
const GOOGLE_TEST_INTERSTITIAL_ANDROID = 'ca-app-pub-3940256099942544/1033173712';
const GOOGLE_TEST_INTERSTITIAL_IOS = 'ca-app-pub-3940256099942544/4411468910';
const GOOGLE_TEST_REWARDED_ANDROID = 'ca-app-pub-3940256099942544/5224354917';
const GOOGLE_TEST_REWARDED_IOS = 'ca-app-pub-3940256099942544/1712485313';

function isGoogleTestId(id) {
  if (!id) return false;
  return String(id).includes(GOOGLE_TEST_PUBLISHER_ID);
}

module.exports = {
  GOOGLE_TEST_PUBLISHER_ID,
  GOOGLE_TEST_APP_ID_ANDROID,
  GOOGLE_TEST_APP_ID_IOS,
  GOOGLE_TEST_INTERSTITIAL_ANDROID,
  GOOGLE_TEST_INTERSTITIAL_IOS,
  GOOGLE_TEST_REWARDED_ANDROID,
  GOOGLE_TEST_REWARDED_IOS,
  isGoogleTestId,
};
