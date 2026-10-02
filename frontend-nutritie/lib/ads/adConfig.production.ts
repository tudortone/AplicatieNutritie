/**
 * adConfig.production.ts — Autoritatea de producție AdMob pentru GetFlow.
 *
 * Garanții stricte de securitate și integritate:
 * 1. Conține EXCLUSIV identificatorii de producție autorizați ai GetFlow (Publisher ID 5202280855139508).
 * 2. NICIUN identificator Google sample/test (ca-app-pub-3940256099942544) nu este prezent în acest fișier.
 * 3. Validează formatele canonice AdMob și fail-closed dacă un ID nu aparține GetFlow în modul real.
 */

export const GETFLOW_PRODUCTION_ADMOB = Object.freeze({
  publisherId: 'ca-app-pub-5202280855139508',
  appIdAndroid: 'ca-app-pub-5202280855139508~6141533757',
  interstitialAndroidUnitId: 'ca-app-pub-5202280855139508/1542500110',
  rewardedAndroidUnitId: 'ca-app-pub-5202280855139508/3566028223',
});

// Format canonic AdMob App ID: ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY (cu tildă ~)
export const ADMOB_APP_ID_REGEX = /^ca-app-pub-\d{16}~\d{10}$/;

// Format canonic AdMob Ad Unit ID: ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY (cu slash /)
export const ADMOB_UNIT_ID_REGEX = /^ca-app-pub-\d{16}\/\d{10}$/;

export function isGetFlowProductionAppId(id: string | null | undefined): boolean {
  if (!id || typeof id !== 'string') return false;
  const trimmed = id.trim();
  return ADMOB_APP_ID_REGEX.test(trimmed) && trimmed.startsWith(GETFLOW_PRODUCTION_ADMOB.publisherId);
}

export function isGetFlowProductionUnitId(id: string | null | undefined): boolean {
  if (!id || typeof id !== 'string') return false;
  const trimmed = id.trim();
  return ADMOB_UNIT_ID_REGEX.test(trimmed) && trimmed.startsWith(GETFLOW_PRODUCTION_ADMOB.publisherId);
}
