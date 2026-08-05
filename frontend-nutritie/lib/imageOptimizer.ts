import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Redimensionează și comprimă imaginile pe client înainte de upload.
 * Base64 nu este cerut aici: upload-ul folosește URI-ul, iar păstrarea ambelor
 * copii creștea inutil vârful de memorie pe dispozitivele mobile.
 */
export async function optimizeImageBeforeUpload(uri: string): Promise<{ uri: string }> {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1024 } }],
      { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG }
    );
    return { uri: result.uri };
  } catch (error) {
    console.warn('[imageOptimizer] Nu s-a putut optimiza imaginea pe client, se folosește originalul:', error);
    return { uri };
  }
}
