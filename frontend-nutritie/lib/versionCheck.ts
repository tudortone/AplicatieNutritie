import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import { buildApiUrl } from './api';

export interface VersionCheckResult {
  checked: boolean;
  needsForceUpdate: boolean;
  needsOptionalUpdate: boolean;
  currentVersionCode: number;
  currentVersionName: string;
  updateInfo: {
    minVersionCode: number;
    latestVersionCode: number;
    latestVersionName: string;
    forceUpdate: boolean;
    isOutdated: boolean;
    storeUrl: string;
    marketUrl: string;
    title?: Record<string, string>;
    message?: Record<string, string>;
    releaseNotes?: Record<string, string>;
  } | null;
}

const DEFAULT_STORE_URL = 'https://play.google.com/store/apps/details?id=com.totsrl.getflo';
const DEFAULT_MARKET_URL = 'market://details?id=com.totsrl.getflo';

/**
 * Returnează codul numeric de versiune instalat pe dispozitiv.
 * Fallback la 31 (versiunea build-ului curent conform app.json).
 */
export function getCurrentVersionCode(): number {
  const code = Constants.expoConfig?.android?.versionCode;
  if (typeof code === 'number' && Number.isFinite(code) && code > 0) {
    return code;
  }
  return 31;
}

/**
 * Returnează numele versiunii semantice instalate (ex: "1.0.0").
 */
export function getCurrentVersionName(): string {
  return Constants.expoConfig?.version || '1.0.0';
}

/**
 * Deschide pagina aplicației GetFlow din magazinul oficial.
 * Încearcă protocolul nativ market:// (Google Play Store app),
 * cu fallback automat la URL-ul web HTTPS dacă aplicația Store nu e instalată.
 */
export async function openAppStore(customMarketUrl?: string, customStoreUrl?: string): Promise<boolean> {
  const market = customMarketUrl || DEFAULT_MARKET_URL;
  const web = customStoreUrl || DEFAULT_STORE_URL;

  try {
    const canOpenMarket = await Linking.canOpenURL(market);
    if (canOpenMarket) {
      await Linking.openURL(market);
      return true;
    }
  } catch {
    // Fallback la browser / web URL
  }

  try {
    await Linking.openURL(web);
    return true;
  } catch (err) {
    console.warn('[VersionCheck] Nu s-a putut deschide pagina din magazin:', err);
    return false;
  }
}

/**
 * Verifică pe server dacă versiunea curentă necesită actualizare obligatorie sau opțională.
 * Are un timeout strict de 4 secunde și tratează căderile de rețea în mod grațios
 * (un utilizator offline nu este niciodată blocat).
 */
export async function checkForAppUpdate(timeoutMs = 4000): Promise<VersionCheckResult> {
  const currentVersionCode = getCurrentVersionCode();
  const currentVersionName = getCurrentVersionName();

  const fallback: VersionCheckResult = {
    checked: false,
    needsForceUpdate: false,
    needsOptionalUpdate: false,
    currentVersionCode,
    currentVersionName,
    updateInfo: null,
  };

  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    const url = buildApiUrl(`/version-check?versionCode=${currentVersionCode}&platform=${platform}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return fallback;
    }

    const data = await response.json();
    const minCode = Number(data.minVersionCode || 0);
    const latestCode = Number(data.latestVersionCode || 0);
    const serverForce = Boolean(data.forceUpdate);

    // Condiție de forțare: versiune sub minimul acceptat sau flag forceUpdate activat
    const needsForceUpdate = currentVersionCode < minCode || (serverForce && currentVersionCode < latestCode);
    const needsOptionalUpdate = !needsForceUpdate && currentVersionCode < latestCode;

    return {
      checked: true,
      needsForceUpdate,
      needsOptionalUpdate,
      currentVersionCode,
      currentVersionName,
      updateInfo: {
        minVersionCode: minCode,
        latestVersionCode: latestCode,
        latestVersionName: String(data.latestVersionName || currentVersionName),
        forceUpdate: serverForce,
        isOutdated: Boolean(data.isOutdated),
        storeUrl: String(data.storeUrl || DEFAULT_STORE_URL),
        marketUrl: String(data.marketUrl || DEFAULT_MARKET_URL),
        title: data.title,
        message: data.message,
        releaseNotes: data.releaseNotes,
      },
    };
  } catch (err) {
    if (__DEV__) {
      console.log('[VersionCheck] Verificarea versiunii nu a putut fi finalizată (offline/timeout):', err);
    }
    return fallback;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
