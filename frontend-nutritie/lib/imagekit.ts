import { API_URL } from '../constants/config';
import { supabase } from '../supabase';

export interface ImageKitUploadResult {
  fileId: string;
  url: string;
  thumbnailUrl: string;
  name: string;
}

/**
 * Preia parametrii de autentificare temporari de la backend pentru upload securizat pe ImageKit.
 */
export async function getImageKitAuthParams(): Promise<{ token: string; expire: number; signature: string; urlEndpoint: string }> {
  const session = (await supabase.auth.getSession()).data.session;
  const token = session?.access_token || '';

  const res = await fetch(`${API_URL}/api/imagekit-auth`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!res.ok) {
    throw new Error(`Eroare la preluarea autentificării ImageKit: ${res.statusText}`);
  }

  return await res.json();
}

/**
 * Încarcă o imagine pe ImageKit CDN folosind multipart/form-data.
 *
 * `userId` este obligatoriu: imaginea se stochează sub /mancare/<userId>/, ca
 * proprietatea să fie evidentă din cale și ștergerea la delete-account să fie
 * posibilă (backend-ul validează folderul la analiza din fundal).
 */
export async function uploadImageToImageKit(
  fileUri: string,
  fileName: string = 'mancare.jpg',
  userId?: string
): Promise<ImageKitUploadResult> {
  const authParams = await getImageKitAuthParams();
  const urlEndpoint = authParams.urlEndpoint || 'https://ik.imagekit.io/nutriai';

  // Folderul devine cale URL: păstrăm doar caractere sigure, ca un userId
  // neașteptat să nu iasă din /mancare/ prin segment de cale.
  const folderSigur = String(userId || 'anon')
    .replace(/[^A-Za-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 64);
  const folder = `/mancare/${folderSigur}`;

  const formData = new FormData();
  formData.append('file', {
    uri: fileUri,
    type: 'image/jpeg',
    name: fileName
  } as any);
  formData.append('fileName', fileName);
  formData.append('token', authParams.token);
  formData.append('expire', authParams.expire.toString());
  formData.append('signature', authParams.signature);
  formData.append('publicKey', process.env.EXPO_PUBLIC_IMAGEKIT_PUBLIC_KEY || 'public_mock_key');
  formData.append('useUniqueFileName', 'true');
  formData.append('folder', folder);

  const uploadRes = await fetch(`https://upload.imagekit.io/api/v1/files/upload`, {
    method: 'POST',
    body: formData
  });

  if (!uploadRes.ok) {
    const errorText = await uploadRes.text();
    console.warn('ImageKit upload warning (fallback to local URI):', errorText);
    return {
      fileId: 'local-' + Date.now(),
      url: fileUri,
      thumbnailUrl: fileUri,
      name: fileName
    };
  }

  const result = await uploadRes.json();
  return {
    fileId: result.fileId,
    url: result.url,
    thumbnailUrl: result.thumbnailUrl || result.url,
    name: result.name
  };
}
