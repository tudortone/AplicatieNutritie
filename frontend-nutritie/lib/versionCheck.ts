import { Linking, Platform } from 'react-native';
import * as Application from 'expo-application';
import { buildApiUrl } from './api';

export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.totsrl.getflo';
export const PLAY_MARKET_URL = 'market://details?id=com.totsrl.getflo';
const MAX_VERSION_CODE = 2100000000;

export interface UpdateInfo {
  minVersionCode: number;
  latestVersionCode: number;
  latestVersionName: string;
  forceUpdate: boolean;
  isOutdated: boolean;
  storeUrl: string;
  marketUrl: string;
}
export interface VersionCheckResult {
  checked: boolean;
  needsForceUpdate: boolean;
  needsOptionalUpdate: boolean;
  requiresUpdate: boolean;
  currentVersionCode: number | null;
  currentVersionName: string;
  updateInfo: UpdateInfo | null;
}
function isVersionCode(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= MAX_VERSION_CODE;
}
export function getCurrentVersionCode(): number | null {
  const raw = Application.nativeBuildVersion;
  if (!raw || !/^\d+$/.test(raw)) return null;
  const code = Number(raw);
  return isVersionCode(code) ? code : null;
}
export function getCurrentVersionName(): string {
  return Application.nativeApplicationVersion || '';
}
function parsePolicy(value: unknown): UpdateInfo | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (!isVersionCode(data.minVersionCode) || !isVersionCode(data.latestVersionCode)
    || data.minVersionCode > data.latestVersionCode || typeof data.forceUpdate !== 'boolean'
    || typeof data.isOutdated !== 'boolean' || typeof data.latestVersionName !== 'string'
    || data.latestVersionName.length > 32 || !data.latestVersionName.trim()
    || data.storeUrl !== PLAY_STORE_URL || data.marketUrl !== PLAY_MARKET_URL) return null;
  return data as unknown as UpdateInfo;
}
export async function openAppStore(_customMarketUrl?: string, _customStoreUrl?: string): Promise<boolean> {
  try {
    if (await Linking.canOpenURL(PLAY_MARKET_URL)) {
      await Linking.openURL(PLAY_MARKET_URL);
      return true;
    }
  } catch { /* The canonical HTTPS destination is the only fallback. */ }
  try { await Linking.openURL(PLAY_STORE_URL); return true; } catch { return false; }
}
async function readPolicy(version: number, signal: AbortSignal): Promise<UpdateInfo | null> {
  const url = buildApiUrl('/version-check?versionCode=' + version + '&platform=android');
  const response = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' }, signal });
  return response.ok ? parsePolicy(await response.json()) : null;
}
export async function checkForAppUpdate(timeoutMs = 4000): Promise<VersionCheckResult> {
  const currentVersionCode = getCurrentVersionCode();
  const fallback: VersionCheckResult = { checked: false, needsForceUpdate: false, requiresUpdate: false,
    needsOptionalUpdate: false, currentVersionCode, currentVersionName: getCurrentVersionName(), updateInfo: null };
  if (Platform.OS !== 'android' || Application.applicationId !== 'com.totsrl.getflo'
    || currentVersionCode === null || process.env.EXPO_PUBLIC_APP_ENV === 'qa') return fallback;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => { controller.abort(); resolve(null); }, Math.min(Math.max(timeoutMs, 100), 10000));
    });
    const data = await Promise.race([readPolicy(currentVersionCode, controller.signal), timeout]);
    if (!data) return fallback;
    const outdated = currentVersionCode < data.latestVersionCode;
    // shortcut: no per-user Play availability API; retain dismissible advice until native availability is verified.
    return { ...fallback, checked: true, updateInfo: data, needsOptionalUpdate: outdated,
      requiresUpdate: outdated && (currentVersionCode < data.minVersionCode || data.forceUpdate) };
  } catch { return fallback; }
  finally { if (timer !== undefined) clearTimeout(timer); controller.abort(); }
}
