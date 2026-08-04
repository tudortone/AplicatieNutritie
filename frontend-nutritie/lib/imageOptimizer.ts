import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Redimensionează și comprimă imaginile pe client înainte de upload (P-9).
 * Reduce imaginile de 4000px/15MB la max 1024px și < 200KB.
 */
export async function optimizeImageBeforeUpload(uri: string): Promise<{ uri: string; base64?: string }> {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1024 } }],
      { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    return { uri: result.uri, base64: result.base64 };
  } catch (error) {
    console.warn('[imageOptimizer] Nu s-a putut optimiza imaginea pe client, se folosește originalul:', error);
    return { uri };
  }
}
