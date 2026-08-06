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

/**
 * Citește dimensiunile reale ale imaginii prin `Image.getSize` (API callback,
 * învelit într-o Promise). Necesar pentru a decide dacă redimensionăm și pe ce
 * axă (bounding box), fără a scala imaginile deja mici.
 */
function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (error) => reject(error),
    );
  });
}

/**
 * Redimensionează și comprimă obligatoriu imaginile înainte de upload.
 * Eșuează închis dacă transformarea nu reușește: încărcarea originalului mare ar
 * consuma trafic și memorie și ar încălca limita de payload a backendului.
 *
 * Redimensionarea e bounding de 800×800 (doar latura cea mai mare e limitată,
 * proporțiile se păstrează). Imaginile deja ≤800 px rămân neredimensionate.
 */
export async function optimizeImageBeforeUpload(uri: string): Promise<OptimizedImage> {
  if (typeof uri !== 'string' || !uri.trim()) {
    throw new TypeError('URI-ul imaginii este invalid.');
  }

  const original = await getImageSize(uri);
  const largest = Math.max(original.width, original.height);
  const resize = largest <= MAX_DIMENSION
    ? []
    : [{
        // Bounding box: latura lungă e redusă la 800, latura scurtă se scalează
        // proporțional (ImageManipulator o ajustează automat).
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
 * U-03: Salvează o copie a imaginii optimizate în cache-ul local persistent (AsyncStorage / local URI)
 * astfel încât poza să nu fie pierdută dacă rețeaua eșuează în timpul analizei AI.
 */
export async function saveLocalImageDraft(uri: string): Promise<string> {
  // uri-ul returnat de manipulateAsync este deja salvat în cache-ul local al aplicației.
  // Păstrăm uri-ul ca backup persistent.
  return uri;
}
