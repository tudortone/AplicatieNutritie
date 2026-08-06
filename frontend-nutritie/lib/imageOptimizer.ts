import AsyncStorage from '@react-native-async-storage/async-storage';
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

const DRAFT_DIR = `${FileSystem.documentDirectory || ''}drafts/`;
const INDEX_KEY = 'nutriai:image-drafts';

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
 * U-03: Salvează o copie a imaginii în documentDirectory/drafts/ persistentă
 * care supraviețuiește curățării de cache de către sistemul de operare.
 */
export async function saveLocalImageDraft(uri: string): Promise<string> {
  const dir = await FileSystem.getInfoAsync(DRAFT_DIR);
  if (!dir.exists) {
    await FileSystem.makeDirectoryAsync(DRAFT_DIR, { intermediates: true });
  }
  const dest = `${DRAFT_DIR}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  await FileSystem.copyAsync({ from: uri, to: dest });

  const raw = await AsyncStorage.getItem(INDEX_KEY);
  const index: string[] = raw ? JSON.parse(raw) : [];
  index.push(dest);
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index));
  return dest;
}

export async function discardLocalImageDraft(path: string): Promise<void> {
  await FileSystem.deleteAsync(path, { idempotent: true });
  const raw = await AsyncStorage.getItem(INDEX_KEY);
  const index: string[] = raw ? JSON.parse(raw) : [];
  await AsyncStorage.setItem(
    INDEX_KEY,
    JSON.stringify(index.filter((p) => p !== path)),
  );
}

export async function listPendingDrafts(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(INDEX_KEY);
  const index: string[] = raw ? JSON.parse(raw) : [];
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
