import { API_URL } from '../constants/config';
import { API_PREFIX } from './api';
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

  const res = await fetch(`${API_URL}${API_PREFIX}/imagekit-auth`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!res.ok) {
    throw new Error(`Eroare la preluarea autentificării ImageKit: ${res.statusText}`);
  }

  return await res.json();
}

interface FormDataFile {
  uri: string;
  type: string;
  name: string;
}

/**
 * Încarcă o imagine pe ImageKit CDN folosind multipart/form-data.
 */
export async function uploadImageToImageKit(
  fileUri: string,
  fileName: string = 'mancare.jpg',
  userId?: string
): Promise<ImageKitUploadResult> {
  const authParams = await getImageKitAuthParams();
  const urlEndpoint = authParams.urlEndpoint || 'https://ik.imagekit.io/nutriai';

  let currentUserId = userId;
  if (!currentUserId) {
    try {
      const { data } = await supabase.auth.getSession();
      currentUserId = data.session?.user?.id;
    } catch {}
  }

  const folderPath = currentUserId ? `/meals/${currentUserId}` : '/mancare';

  const formDataFile: FormDataFile = {
    uri: fileUri,
    type: 'image/jpeg',
    name: fileName,
  };

  const formData = new FormData();
  formData.append('file', formDataFile as unknown as Blob);
  formData.append('fileName', fileName);
  formData.append('token', authParams.token);
  formData.append('expire', authParams.expire.toString());
  formData.append('signature', authParams.signature);
  formData.append('publicKey', process.env.EXPO_PUBLIC_IMAGEKIT_PUBLIC_KEY || 'public_mock_key');
  formData.append('useUniqueFileName', 'true');
  formData.append('folder', folderPath);

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
  const finalUrl = String(result.url || '');
  const secureUrl = finalUrl.startsWith('http://') ? finalUrl.replace('http://', 'https://') : finalUrl;

  return {
    fileId: String(result.fileId || `ik-${Date.now()}`),
    url: secureUrl || fileUri,
    thumbnailUrl: String(result.thumbnailUrl || secureUrl || fileUri),
    name: String(result.name || fileName)
  };
}
