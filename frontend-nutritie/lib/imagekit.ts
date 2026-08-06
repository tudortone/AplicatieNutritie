import { API_URL } from '../constants/config';
import { API_PREFIX } from './api';
import { supabase } from '../supabase';
import { optimizeImageBeforeUpload } from './imageOptimizer';

export interface ImageKitUploadResult {
  fileId: string;
  url: string;
  thumbnailUrl: string;
  name: string;
}

interface ImageKitAuthParams {
  token: string;
  expire: number;
  signature: string;
  urlEndpoint: string;
  userId: string;
}

type UnknownRecord = Record<string, unknown>;

function esteObiect(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function textNenul(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Preia parametrii temporari de upload și îi validează înainte de utilizare. */
export async function getImageKitAuthParams(signal?: AbortSignal): Promise<ImageKitAuthParams> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token || !data.session.user?.id) {
    throw new Error('Sesiunea a expirat. Autentifică-te din nou.');
  }

  const res = await fetch(`${API_URL}${API_PREFIX}/imagekit-auth`, {
    headers: { Authorization: `Bearer ${data.session.access_token}` },
    signal,
  });
  if (!res.ok) {
    throw new Error(`Autentificarea ImageKit a eșuat (${res.status}).`);
  }

  const payload: unknown = await res.json();
  if (
    !esteObiect(payload) ||
    !textNenul(payload.token) ||
    !textNenul(payload.signature) ||
    !textNenul(payload.urlEndpoint) ||
    !Number.isFinite(Number(payload.expire))
  ) {
    throw new Error('Backendul a returnat parametri ImageKit invalizi.');
  }

  const expire = Number(payload.expire);
  if (expire <= Math.floor(Date.now() / 1000) + 15) {
    throw new Error('Parametrii ImageKit au expirat.');
  }

  return {
    token: payload.token,
    signature: payload.signature,
    urlEndpoint: payload.urlEndpoint,
    expire,
    userId: data.session.user.id,
  };
}

/** Încarcă exclusiv varianta redimensionată într-un folder izolat per utilizator. */
export async function uploadImageToImageKit(
  fileUri: string,
  fileName = 'mancare.jpg',
  signal?: AbortSignal,
): Promise<ImageKitUploadResult> {
  const publicKey = process.env.EXPO_PUBLIC_IMAGEKIT_PUBLIC_KEY?.trim();
  if (!publicKey) throw new Error('ImageKit nu este configurat în această versiune a aplicației.');

  const [authParams, optimized] = await Promise.all([
    getImageKitAuthParams(signal),
    optimizeImageBeforeUpload(fileUri),
  ]);
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 120) || 'mancare.jpg';

  const formData = new FormData();
  formData.append('file', {
    uri: optimized.uri,
    type: 'image/jpeg',
    name: safeFileName,
  } as unknown as Blob);
  formData.append('fileName', safeFileName);
  formData.append('token', authParams.token);
  formData.append('expire', String(authParams.expire));
  formData.append('signature', authParams.signature);
  formData.append('publicKey', publicKey);
  formData.append('useUniqueFileName', 'true');
  formData.append('folder', `/mancare/${authParams.userId}`);

  const uploadRes = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
    method: 'POST',
    body: formData,
    signal,
  });
  if (!uploadRes.ok) {
    throw new Error(`Încărcarea imaginii a eșuat (${uploadRes.status}).`);
  }

  const payload: unknown = await uploadRes.json();
  if (
    !esteObiect(payload) ||
    !textNenul(payload.fileId) ||
    !textNenul(payload.url) ||
    !textNenul(payload.name)
  ) {
    throw new Error('ImageKit a returnat un răspuns invalid.');
  }

  const parsedUrl = new URL(payload.url);
  if (parsedUrl.protocol !== 'https:') throw new Error('ImageKit a returnat un URL nesigur.');
  const thumbnailUrl = textNenul(payload.thumbnailUrl) ? payload.thumbnailUrl : payload.url;

  return {
    fileId: payload.fileId,
    url: payload.url,
    thumbnailUrl,
    name: payload.name,
  };
}
