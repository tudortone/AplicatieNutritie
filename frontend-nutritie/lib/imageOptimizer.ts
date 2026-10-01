import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { Image } from 'react-native';

export interface OptimizedImage {
  uri: string;
  width: number;
  height: number;
  mimeType: string;
}

/** Dimensiunea maximă a laturii lungi a imaginii optimizate (bounding box 800×800). */
const MAX_DIMENSION = 800;

export const DRAFT_DIR = `${FileSystem.documentDirectory ?? ''}drafts/`;

/**
 * Validare LAZY, intenționat NU la nivel de modul.
 *
 * Un `throw` executat la import ar doborî tot fișierul pentru orice consumator,
 * inclusiv `optimizeImageBeforeUpload` și, prin el, întregul flux de analiză
 * foto din `camera.tsx`. Salvarea draft-ului e o funcție secundară: dacă
 * platforma nu oferă `documentDirectory`, trebuie să pice doar ea, nu tot.
 */
function verificaDraftDir(): void {
  if (!DRAFT_DIR.startsWith('file:')) {
    throw new Error(
      `Stocarea locală a draft-urilor nu este disponibilă pe această platformă (DRAFT_DIR="${DRAFT_DIR}").`,
    );
  }
}

const INDEX_KEY = 'nutriai:image-drafts';

function ownerSegment(userId: string): string {
  const normalized = typeof userId === 'string' ? userId.trim() : '';
  if (!normalized) throw new TypeError('Draftul foto necesită utilizatorul autentificat.');
  return encodeURIComponent(normalized);
}

export function draftDirectoryForUser(userId: string): string {
  return `${DRAFT_DIR}${ownerSegment(userId)}/`;
}

function isOwnedDraft(path: string, userId: string): boolean {
  return typeof path === 'string' && path.startsWith(draftDirectoryForUser(userId));
}

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (error) => reject(error),
    );
  });
}

export async function optimizeImageBeforeUpload(uri: string): Promise<OptimizedImage> {
  if (typeof uri !== 'string' || !uri.trim()) {
    throw new TypeError('URI-ul imaginii este invalid.');
  }

  const original = await getImageSize(uri);
  const largest = Math.max(original.width, original.height);
  const resize = largest <= MAX_DIMENSION
    ? []
    : [{
        resize: original.width >= original.height
          ? { width: MAX_DIMENSION }
          : { height: MAX_DIMENSION },
      }];

  const result = await ImageManipulator.manipulateAsync(
    uri,
    resize,
    {
      compress: 0.75,
      format: ImageManipulator.SaveFormat.JPEG,
    },
  );

  if (!result.uri) throw new Error('Optimizarea imaginii nu a produs un fișier valid.');

  return {
    uri: result.uri,
    width: result.width,
    height: result.height,
    mimeType: 'image/jpeg',
  };
}

/**
 * P1-12: amprenta OPERAȚIEI LOGICE de analiză foto.
 *
 * Problema pe care o rezolvă: identitatea de transport (request id, socket,
 * token) NU identifică operația. Un timeout urmat de retry produce două cereri
 * HTTP diferite pentru o singură acțiune a utilizatorului; fără o amprentă
 * stabilă, serverul le tratează ca două analize și debitează de două ori.
 *
 * Amprenta derivă din conținutul imaginii (md5 + dimensiune, citite fără a
 * încărca fișierul în memorie) plus parametrii care schimbă efectiv rezultatul
 * (furnizorul AI ales, limba). Deci:
 *   - retry pe aceeași poză           → aceeași amprentă → replay, fără dublă debitare;
 *   - altă poză / alt model / altă limbă → amprentă diferită → analiză nouă, corect.
 *
 * Rezultatul se trimite în `X-Payload-Fingerprint` (SHA-256 hex, 64 caractere —
 * formatul validat de backend în utils/idempotency.js).
 */
export async function amprentaOperatieFoto(
  uri: string,
  furnizorAi: string,
  limba: string,
): Promise<string> {
  let identitateContinut = '';
  try {
    // `size` vine oricum în răspuns când fișierul există; singura opțiune necesară
    // (și singura acceptată de tipurile expo-file-system/legacy) este `md5`.
    const info = (await FileSystem.getInfoAsync(uri, { md5: true })) as
      | { md5?: string; size?: number }
      | undefined;
    // md5 identifică conținutul. Dacă platforma nu îl oferă, cădem pe uri+size:
    // mai slab, dar tot STABIL între retry-uri — ceea ce contează aici.
    identitateContinut = info?.md5
      ? `md5:${info.md5}:${info.size ?? 0}`
      : `uri:${uri}:${info?.size ?? 0}`;
  } catch {
    identitateContinut = `uri:${uri}`;
  }

  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `analiza-foto|${identitateContinut}|${furnizorAi}|${limba}`,
  );
}

/**
 * U-03: Salvează o copie a imaginii în documentDirectory/drafts/ persistentă
 * care supraviețuiește curățării de cache de către sistemul de operare.
 */
export async function saveLocalImageDraft(uri: string, userId: string): Promise<string> {
  verificaDraftDir();

  const ownerDir = draftDirectoryForUser(userId);
  const dir = await FileSystem.getInfoAsync(ownerDir);
  if (!dir.exists) {
    await FileSystem.makeDirectoryAsync(ownerDir, { intermediates: true });
  }
  const dest = `${ownerDir}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  await FileSystem.copyAsync({ from: uri, to: dest });

  const raw = await AsyncStorage.getItem(INDEX_KEY);
  const index: string[] = raw ? JSON.parse(raw) : [];
  index.push(dest);
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index));
  return dest;
}

export async function discardLocalImageDraft(path: string, userId: string): Promise<void> {
  // A forged/stale index must never let B delete or open A's file.
  if (isOwnedDraft(path, userId)) {
    await FileSystem.deleteAsync(path, { idempotent: true });
  }
  const raw = await AsyncStorage.getItem(INDEX_KEY);
  const index: string[] = raw ? JSON.parse(raw) : [];
  await AsyncStorage.setItem(
    INDEX_KEY,
    JSON.stringify(index.filter((p) => p !== path)),
  );
}

export async function listPendingDrafts(userId: string): Promise<string[]> {
  const raw = await AsyncStorage.getItem(INDEX_KEY);
  let parsed: unknown = [];
  try {
    parsed = raw ? JSON.parse(raw) : [];
  } catch {
    parsed = [];
  }
  const rawPaths = Array.isArray(parsed)
    ? parsed.filter((path): path is string => typeof path === 'string')
    : [];
  const index = Array.isArray(parsed)
    ? parsed.filter((path): path is string => typeof path === 'string' && isOwnedDraft(path, userId))
    : [];

  // Pre-P0-02 drafts lived directly in /drafts with no owner metadata. They
  // cannot be attributed safely, so delete those files instead of assigning
  // them to whichever account happens to sign in next.
  const ambiguousLegacy = rawPaths.filter((path) => {
    if (!path.startsWith(DRAFT_DIR)) return false;
    const relative = path.slice(DRAFT_DIR.length);
    return relative.length > 0 && !relative.includes('/');
  });
  for (const path of ambiguousLegacy) {
    await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {});
  }

  // Remove ambiguous/foreign metadata from this active workspace. Foreign
  // files are not deleted: they may still belong to another user's namespace.
  if (!Array.isArray(parsed) || parsed.length !== index.length) {
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index));
  }

  if (index.length > 10) {
    const deSters = index.slice(0, index.length - 10);
    for (const p of deSters) {
      await FileSystem.deleteAsync(p, { idempotent: true }).catch(() => {});
    }
    const ramas = index.slice(-10);
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(ramas));
    return ramas;
  }
  return index;
}

/** Remove every photo owned by an account after confirmed remote deletion. */
export async function purgeLocalImageDrafts(userId: string): Promise<void> {
  const owned = await listPendingDrafts(userId);
  for (const path of owned) {
    // Spre deosebire de pruning-ul cache-ului, ștergerea GDPR trebuie să fie
    // fail-loud: indexul rămâne intact și jurnalul de purjare poate relua.
    await FileSystem.deleteAsync(path, { idempotent: true });
  }
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify([]));
}
