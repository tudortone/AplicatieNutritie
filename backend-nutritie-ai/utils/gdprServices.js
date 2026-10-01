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

/**
 * F-03: verificarea proprietatii unui fisier ImageKit, server-side.
 *
 * `fileId`-urile sunt extrase din JSONB-ul `alimente`, care este scris de client.
 * Un id trimis de client NU este o dovada de proprietate: pana la aceasta
 * verificare, oricine isi putea pune in propria masa id-ul unui fisier al altui
 * utilizator, iar stergerea contului il distrugea pe al victimei (stergerea se
 * face cu cheia privata ImageKit, care ocoleste orice separare).
 *
 * Singura sursa de adevar este calea REALA a fisierului, citita de la ImageKit.
 * Cerem ca ea sa contina segmentul `/<userId>/` (acopera atat `/mancare/<uid>/`
 * si `/meals/<uid>/`, cat si caile mostenite care includ uid-ul).
 *
 * Fail-closed: daca detaliile nu pot fi citite, NU stergem. Un fisier orfan e
 * infinit preferabil stergerii fisierului altcuiva.
 */
async function imageKitGetJson(cale, { privateKey }) {
  const authorization = Buffer.from(`${privateKey}:`, 'utf8').toString('base64');
  const response = await fetch(`${IMAGEKIT_API}${cale}`, {
    method: 'GET',
    headers: { Authorization: `Basic ${authorization}` },
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const error = new Error('IMAGEKIT_DETAILS_FAILED');
    error.code = `IMAGEKIT_${response.status}`;
    throw error;
  }
  return response.json();
}

async function fileIdApartineUtilizatorului({ fileId, userId, privateKey }) {
  if (!userId) return false;
  let detalii;
  try {
    detalii = await imageKitGetJson(`/files/${encodeURIComponent(fileId)}/details`, { privateKey });
  } catch {
    return false; // fail-closed
  }
  // 404 => fisierul nu mai exista; nu e nimic de sters si nici de raportat.
  if (!detalii) return false;
  const caleBruta = typeof detalii.filePath === 'string' ? detalii.filePath : '';
  if (!caleBruta) return false;
  const cale = caleBruta.startsWith('/') ? caleBruta : `/${caleBruta}`;

  // Aparare in adancime: ImageKit intoarce cai canonice, dar nu ne bazam pe asta.
  // Un segment `..` ar putea face ca un prefix „propriu" sa fie anulat mai
  // tarziu in cale (`/mancare/<eu>/../<victima>/x.jpg`), deci refuzam din start.
  const segmente = cale.split('/');
  if (segmente.includes('..') || segmente.includes('.')) return false;

  // Potrivire pe SEGMENT complet, nu pe subsir: `/mancare/<eu>extra/` nu trebuie
  // sa treaca drept folderul lui `<eu>`.
  const idNormalizat = String(userId).toLowerCase();
  return segmente.some((segment) => segment.toLowerCase() === idNormalizat);
}

/**
 * Pastreaza doar fileId-urile pe care ImageKit le confirma ca apartinand
 * utilizatorului care isi sterge contul.
 */
async function filtreazaFileIdsProprii({ userId, fileIds, privateKey }) {
  const ids = [...fileIds];
  const proprii = [];
  const respinse = [];
  for (let index = 0; index < ids.length; index += 5) {
    const lot = ids.slice(index, index + 5);
    const verdicte = await Promise.all(
      lot.map((fileId) => fileIdApartineUtilizatorului({ fileId, userId, privateKey })),
    );
    lot.forEach((fileId, i) => (verdicte[i] ? proprii : respinse).push(fileId));
  }
  if (respinse.length > 0) {
    console.warn(
      `[GDPR] ${respinse.length} fileId(uri) ignorate la stergere: proprietate neconfirmata pentru utilizatorul curent.`,
    );
  }
  return proprii;
}

/**
 * F-07: tabelele "dead-letter" care retin PII dupa stergerea contului.
 *
 * `clerk_webhook_esuate` si `credite_esuate` nu au cheie straina catre
 * `auth.users`, deci `auth.admin.deleteUser` NU le atinge, iar lista
 * `TABELE_CU_RLS_UTILIZATOR` (folosita de ruta si de worker) nu le include.
 * Amandoua pastreaza `payload jsonb` — payload-ul brut Clerk (nume, email) si
 * cel de plata istoric (identificatori de achizitie). Rezultat: dupa o stergere GDPR
 * "completa", datele personale supravietuiau la nesfarsit.
 *
 * Randurile sunt evenimente esuate ale unui cont care nu mai exista: nu mai pot
 * fi reluate, deci stergerea lor nu pierde nimic operational.
 *
 * `credite_esuate.app_user_id` poate contine fie UUID-ul Supabase, fie id-ul
 * Clerk (vechiul `app_user_id` de plata poate fi oricare dintre ele), deci stergem dupa
 * ambele identitati.
 */
async function stergeDeadLetterUtilizator({ supabaseAdmin, userId, clerkUserId }) {
  const identitati = [userId, clerkUserId].filter(
    (v) => typeof v === 'string' && v.trim().length > 0,
  );
  if (identitati.length === 0) return;

  const incearca = async (executa) => {
    const rezultat = await executa();
    const eroare = rezultat?.error;
    if (eroare && !CODURI_TABELA_INEXISTENTA.has(eroare.code)) throw eroare;
  };

  await incearca(() =>
    supabaseAdmin.from('credite_esuate').delete().in('app_user_id', identitati),
  );

  if (clerkUserId) {
    await incearca(() =>
      supabaseAdmin.from('clerk_webhook_esuate').delete().eq('clerk_user_id', clerkUserId),
    );
  }
}

/**
 * F-06: citeste TOATE randurile unui utilizator dintr-o tabela, paginat.
 *
 * `.select('*').eq('user_id', ...)` fara `.range()` se opreste tacut la
 * `max-rows` din PostgREST (implicit 1000 pe Supabase). Un utilizator vechi, cu
 * mii de mese, primea un export GDPR TRUNCAT, prezentat ca fiind complet —
 * adica un raspuns incomplet la o cerere legala de portabilitate.
 */
const DIMENSIUNE_PAGINA_EXPORT = 1000;

async function citesteTotPaginat({
  client,
  tabela,
  userId,
  dimensiunePagina = DIMENSIUNE_PAGINA_EXPORT,
  coloane = '*',
  coloanaOrdine = 'id',
}) {
  const toate = [];
  for (let pagina = 0; ; pagina += 1) {
    const de_la = pagina * dimensiunePagina;
    const pana_la = de_la + dimensiunePagina - 1;
    const { data, error } = await client
      .from(tabela)
      .select(coloane)
      .eq('user_id', userId)
      .order(coloanaOrdine, { ascending: true })
      .range(de_la, pana_la);
    if (error) throw error;
    const lot = data ?? [];
    toate.push(...lot);
    // Ultima pagina: mai putine randuri decat am cerut.
    if (lot.length < dimensiunePagina) break;
    // Plasa de siguranta impotriva unei bucle infinite daca `range` e ignorat.
    if (pagina > 10000) break;
  }
  return toate;
}

// Tokenul de achiziție este o credențială backend pentru Google Play Developer
// API, nu o valoare portabilă pentru client. Exportăm numai metadatele de
// abonament necesare utilizatorului și hash-ul de corelare ireversibil.
const COLOANE_EXPORT_ABONAMENTE_GOOGLE = [
  'purchase_token_hash',
  'product_id',
  'base_plan_id',
  'offer_id',
  'subscription_state',
  'expiry_time',
  'acknowledgement_state',
  'is_entitled',
  'is_test_purchase',
  'verification_started_at',
  'verified_at',
  'created_at',
  'updated_at',
].join(',');

async function exportaAbonamenteGooglePlay({ supabaseAdmin, userId }) {
  return citesteTotPaginat({
    client: supabaseAdmin,
    tabela: 'google_play_subscriptions',
    userId,
    coloane: COLOANE_EXPORT_ABONAMENTE_GOOGLE,
    coloanaOrdine: 'purchase_token_hash',
  });
}

/**
 * Evenimentele RTDN nu au user_id, dar hash-ul tokenului le leagă de un cont.
 * Le ștergem înaintea abonamentelor, cât relația încă poate fi rezolvată.
 */
async function stergeEvenimenteRtdnUtilizator({ supabaseAdmin, userId }) {
  const abonamente = await citesteTotPaginat({
    client: supabaseAdmin,
    tabela: 'google_play_subscriptions',
    userId,
    coloane: 'purchase_token_hash',
    coloanaOrdine: 'purchase_token_hash',
  });
  const hashuri = [...new Set(abonamente
    .map((rand) => rand?.purchase_token_hash)
    .filter((hash) => typeof hash === 'string' && hash.length > 0))];
  if (hashuri.length === 0) return;

  const rezultat = await supabaseAdmin
    .from('google_play_rtdn_events')
    .delete()
    .in('purchase_token_hash', hashuri);
  const eroare = rezultat?.error;
  if (eroare && !CODURI_TABELA_INEXISTENTA.has(eroare.code)) throw eroare;
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

  // P-06: ștergere fișiere individuale pe fileId (căi non-standard).
  // F-03: DOAR după ce ImageKit confirmă că fiecare fișier chiar aparține
  // acestui utilizator — id-urile vin din JSONB scris de client.
  const ids = await filtreazaFileIdsProprii({ userId, fileIds, privateKey });
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
  fileIdApartineUtilizatorului,
  filtreazaFileIdsProprii,
  stergeDeadLetterUtilizator,
  citesteTotPaginat,
  DIMENSIUNE_PAGINA_EXPORT,
  COLOANE_EXPORT_ABONAMENTE_GOOGLE,
  exportaAbonamenteGooglePlay,
  stergeEvenimenteRtdnUtilizator,
  stergeActiveImageKit,
  stergeFoldereImageKit,
  stergeIdentitateClerk,
  extrageFileIdsUtilizator,
};
