import * as ImageManipulator from 'expo-image-manipulator';

export interface OptimizedImage {
  uri: string;
}

/**
 * Redimensionează și comprimă obligatoriu imaginile înainte de upload.
 * Eșuează închis dacă transformarea nu reușește: încărcarea originalului mare ar
 * consuma trafic și memorie și ar încălca limita de payload a backendului.
 */
export async function optimizeImageBeforeUpload(uri: string): Promise<OptimizedImage> {
  if (typeof uri !== 'string' || !uri.trim()) {
    throw new TypeError('URI-ul imaginii este invalid.');
  }

  const context = ImageManipulator.manipulate(uri);
  context.resize({ width: 1024, height: null });
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({
    compress: 0.75,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  if (!result.uri) throw new Error('Optimizarea imaginii nu a produs un fișier valid.');
  return { uri: result.uri };
}
