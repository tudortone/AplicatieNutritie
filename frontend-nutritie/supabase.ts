import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';
import log from './lib/logger';

// Cheile trebuie furnizate prin .env (EXPO_PUBLIC_*). NU mai folosim fallback
// hardcodat cu valori reale — un APK decompilat ar expune proiectul Supabase.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '[NutriAI] Lipsesc EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
    'Creează frontend-nutritie/.env (vezi .env.example).'
  );
}

// ==========================================
// FIX AUDIT P5: Adaptor securizat cu fallback
// Pe dispozitive unde Android Keystore / iOS Keychain nu e disponibil
// (ex. criptare dezactivată, device foarte vechi), folosim AsyncStorage
// ca fallback și logăm un avertisment.
//
// MUST-FIX #6 (audit productie): verificarea disponibilitatii era async dar
// NU era asteptata -> primele citiri de sesiune la cold start puteau rula
// inainte de setarea flag-ului (race condition, sesiune "pierduta" aleator).
// Acum toate operatiile asteapta `secureStoreReady`.
//
// MUST-FIX #9 (audit productie): cand cade pe AsyncStorage, sesiunea este
// stocata in plain text. Expunem `isSecureStorageAvailable()` si
// `onInsecureStorageFallback()` ca UI-ul sa poata avertiza utilizatorul.
// ==========================================
const CHUNK_SIZE = 1800;
const CHUNK_MARKER = '__supabase_secure_chunks__';

let secureStoreAvailable = true;
let insecureFallbackListener: ((reason: string) => void) | null = null;

function reportInsecureFallback(reason: string) {
  secureStoreAvailable = false;
  log.warn(
    '[NutriAI] SecureStore indisponibil. Sesiunea va fi stocată în AsyncStorage (plain text). ' +
    'Motiv: ' + reason,
  );
  insecureFallbackListener?.(reason);
}

/**
 * Permite UI-ului sa afiseze o avertizare cand sesiunea nu poate fi criptata.
 * Se apeleaza cel mult o data pe sesiune de aplicatie.
 */
export function onInsecureStorageFallback(listener: (reason: string) => void) {
  insecureFallbackListener = listener;
}

/** `true` daca sesiunea este stocata criptat (Keychain / Keystore). */
export async function isSecureStorageAvailable(): Promise<boolean> {
  await secureStoreReady;
  return secureStoreAvailable;
}

// Test inițial: dacă SecureStore nu merge deloc (ex. emulator fără hardware crypto),
// folosim AsyncStorage direct. Promisiunea este asteptata de fiecare operatie.
const secureStoreReady: Promise<void> = (async () => {
  try {
    await SecureStore.setItemAsync('__nutriai_availability_test__', '1');
    await SecureStore.deleteItemAsync('__nutriai_availability_test__');
    secureStoreAvailable = true;
  } catch (err) {
    reportInsecureFallback((err as Error)?.message ?? 'necunoscut');
  }
})();

async function secureGetItem(key: string): Promise<string | null> {
  await secureStoreReady;
  if (!secureStoreAvailable) return AsyncStorage.getItem(key);

  try {
    const chunkCountRaw = await SecureStore.getItemAsync(`${key}${CHUNK_MARKER}`);
    if (chunkCountRaw) {
      const chunkCount = Number(chunkCountRaw);
      const chunks: string[] = [];
      for (let i = 0; i < chunkCount; i++) {
        const chunk = await SecureStore.getItemAsync(`${key}__chunk_${i}`);
        if (chunk === null) return null;
        chunks.push(chunk);
      }
      return chunks.join('');
    }
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function secureSetItem(key: string, value: string): Promise<void> {
  await secureStoreReady;
  if (!secureStoreAvailable) {
    await AsyncStorage.setItem(key, value);
    return;
  }

  await secureRemoveItem(key);

  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    // Valoarea depășește limita Android — împărțim în chunk-uri.
    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }
    try {
      await SecureStore.setItemAsync(`${key}${CHUNK_MARKER}`, String(chunks.length));
      for (let i = 0; i < chunks.length; i++) {
        await SecureStore.setItemAsync(`${key}__chunk_${i}`, chunks[i]);
      }
    } catch (err) {
      // Chunking-ul a eșuat și el — fallback la AsyncStorage (plain text).
      reportInsecureFallback('chunking esuat pentru cheia ' + key);
      await AsyncStorage.setItem(key, value);
    }
  }
}

async function secureRemoveItem(key: string): Promise<void> {
  await secureStoreReady;
  if (!secureStoreAvailable) {
    await AsyncStorage.removeItem(key);
    return;
  }

  try {
    const chunkCountRaw = await SecureStore.getItemAsync(`${key}${CHUNK_MARKER}`);
    if (chunkCountRaw) {
      const chunkCount = Number(chunkCountRaw);
      for (let i = 0; i < chunkCount; i++) {
        await SecureStore.deleteItemAsync(`${key}__chunk_${i}`);
      }
    }
    await SecureStore.deleteItemAsync(`${key}${CHUNK_MARKER}`);
  } catch { /* ignorăm */ }
  try {
    await SecureStore.deleteItemAsync(key);
  } catch { /* ignorăm */ }
}

const secureStorageAdapter = {
  getItem: secureGetItem,
  setItem: secureSetItem,
  removeItem: secureRemoveItem,
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: secureStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
