'use strict';

/**
 * N-03 / P-06: codurile care înseamnă „tabela nu există pe schema curentă" și pe
 * care avem voie să le ignorăm la ștergerea GDPR (try-per-table). Aceleași coduri
 * folosite de rută (routes/gdpr.js) și de worker (utils/gdprWorker.js) — definite
 * o singură dată aici, în utils, ca ruta și workerul să nu mai depindă unul de
 * celălalt (workerul nu mai importă din routes/gdpr). Orice altă eroare oprește
 * ștergerea — altfel am marca `completed` o ștergere care nu s-a întâmplat (P-05b).
 */
const CODURI_TABELA_INEXISTENTA = new Set(['42P01', 'PGRST205', 'PGRST106']);

const IMAGEKIT_API = ['https:', '', 'api.imagekit.io', 'v1'].join('/');
const CLERK_USERS_API = ['https:', '', 'api.clerk.com', 'v1', 'users'].join('/');
const MAX_ADANCIME_JSON = 8;

/**
 * P-06: Extrage toate fileId-urile din JSONB-ul `alimente` al meselor.
 * Acceptă structuri arbitrar imbricate (array, object, string).
 */
function extrageFileIds(value, rezultat = new Set(), adancime = 0) {
  if (adancime > MAX_ADANCIME_JSON || value === null || value === undefined) return rezultat;
  if (Array.isArray(value)) {
    for (const element of value) extrageFileIds(element, rezultat, adancime + 1);
    return rezultat;
  }
  if (typeof value !== 'object') return rezultat;

  for (const [key, element] of Object.entries(value)) {
    if (
      (key === 'fileId' || key === 'imageKitFileId' || key === 'imagekit_file_id') &&
      typeof element === 'string' &&
      /^[A-Za-z0-9_-]{6,200}$/.test(element)
    ) {
      rezultat.add(element);
    } else {
      extrageFileIds(element, rezultat, adancime + 1);
    }
  }
  return rezultat;
}

async function imageKitRequest(cale, { privateKey, method = 'DELETE', body } = {}) {
  const authorization = Buffer.from(`${privateKey}:`, 'utf8').toString('base64');
  const response = await fetch(`${IMAGEKIT_API}${cale}`, {
    method,
    headers: {
      Authorization: `Basic ${authorization}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
  });
  if (!response.ok && response.status !== 404) {
    const error = new Error('IMAGEKIT_DELETE_FAILED');
    error.code = `IMAGEKIT_${response.status}`;
    throw error;
  }
}

/**
 * P-06: Șterge fișierele individuale pe fileId + folderele userId.
 * Cele două strategii sunt complementare, nu alternative.
 */
async function stergeActiveImageKit({ userId, fileIds, privateKey }) {
  if (!privateKey) {
    const error = new Error('IMAGEKIT_NOT_CONFIGURED');
    error.code = 'IMAGEKIT_NOT_CONFIGURED';
    throw error;
  }

  // Ștergere foldere (idempotent: 404 = deja șters)
  await Promise.all([
    '/mancare/' + userId + '/',
    '/meals/' + userId + '/',
  ].map((folderPath) => imageKitRequest('/folder/', { privateKey, body: { folderPath } })));

  // P-06: ștergere fișiere individuale pe fileId (căi non-standard)
  const ids = [...fileIds];
  for (let index = 0; index < ids.length; index += 5) {
    const lot = ids.slice(index, index + 5);
    await Promise.all(lot.map((fileId) => imageKitRequest(
      `/files/${encodeURIComponent(fileId)}`,
      { privateKey },
    )));
  }
}

async function stergeFoldereImageKit({ userId, privateKey }) {
  if (!privateKey) {
    const error = new Error('IMAGEKIT_NOT_CONFIGURED');
    error.code = 'IMAGEKIT_NOT_CONFIGURED';
    throw error;
  }

  await Promise.all([
    '/mancare/' + userId + '/',
    '/meals/' + userId + '/',
  ].map((folderPath) => imageKitRequest('/folder/', { privateKey, body: { folderPath } })));
}

async function stergeIdentitateClerk({ clerkUserId, secretKey }) {
  if (!clerkUserId) return;
  if (!secretKey) {
    const error = new Error('CLERK_NOT_CONFIGURED');
    error.code = 'CLERK_NOT_CONFIGURED';
    throw error;
  }

  const response = await fetch(
    `${CLERK_USERS_API}/${encodeURIComponent(clerkUserId)}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    },
  );

  if (response.status === 404) return;
  if (!response.ok) {
    const error = new Error('CLERK_DELETE_FAILED');
    error.code = `CLERK_${response.status}`;
    throw error;
  }
}

/**
 * P-06: Extrage fileId-urile din toate mesele unui utilizator.
 * Citim direct din supabaseAdmin (tabel cu RLS — service_role ocolește, OK
 * pentru GDPR care deja s-a autentificat și verificat userId).
 */
async function extrageFileIdsUtilizator({ supabaseAdmin, userId }) {
  try {
    const { data, error } = await supabaseAdmin
      .from('mese')
      .select('alimente')
      .eq('user_id', userId);
    if (error || !data) return new Set();
    const rezultat = new Set();
    for (const masa of data) {
      if (masa.alimente) extrageFileIds(masa.alimente, rezultat);
    }
    return rezultat;
  } catch {
    return new Set();
  }
}

module.exports = {
  IMAGEKIT_API,
  CLERK_USERS_API,
  MAX_ADANCIME_JSON,
  CODURI_TABELA_INEXISTENTA,
  extrageFileIds,
  imageKitRequest,
  stergeActiveImageKit,
  stergeFoldereImageKit,
  stergeIdentitateClerk,
  extrageFileIdsUtilizator,
};