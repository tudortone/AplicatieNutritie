import { API_URL } from '../constants/config';
import { supabase } from '../supabase';
import log from './logger';

/**
 * Client HTTP unic pentru backend.
 *
 * MUST-FIX #7 din auditul de productie: apelurile `fetch` nu aveau timeout,
 * retry sau mesaje clare. Pe Render backend-ul intra in sleep, iar primul
 * request al zilei poate dura 30-50s -> UI blocat la infinit in loading.
 *
 * Comportament:
 * - timeout configurabil (implicit 20s, 45s pentru primul retry - cold start);
 * - retry automat cu backoff pentru erori de retea si 5xx / 429;
 * - NU face retry pentru 4xx (in afara de 429) - sunt erori de client;
 * - ataseaza automat token-ul Supabase;
 * - arunca `ApiError` cu mesaj prietenos in romana, gata de afisat in UI.
 */

export class ApiError extends Error {
  status: number;
  isNetwork: boolean;
  isTimeout: boolean;

  constructor(
    message: string,
    opts: { status?: number; isNetwork?: boolean; isTimeout?: boolean } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = opts.status ?? 0;
    this.isNetwork = opts.isNetwork ?? false;
    this.isTimeout = opts.isTimeout ?? false;
  }
}

export type ApiFetchOptions = Omit<RequestInit, 'signal'> & {
  /** Timeout per incercare, in ms. Implicit 20000. */
  timeoutMs?: number;
  /** Numar de reincercari dupa prima cerere. Implicit 2. */
  retries?: number;
  /** Trimite header-ul Authorization cu sesiunea curenta. Implicit true. */
  auth?: boolean;
};

const DEFAULT_TIMEOUT = 20_000;
/** Cold start Render: a doua incercare primeste mai mult timp. */
const COLD_START_TIMEOUT = 45_000;
const DEFAULT_RETRIES = 2;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function buildUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

async function authHeader(): Promise<Record<string, string>> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

function friendlyMessage(status: number, serverMessage?: string): string {
  if (serverMessage) return serverMessage;
  if (status === 401) return 'Sesiunea a expirat. Te rugăm să te autentifici din nou.';
  if (status === 403) return 'Nu ai permisiunea pentru această acțiune.';
  if (status === 404) return 'Resursa cerută nu a fost găsită.';
  if (status === 413) return 'Fișierul trimis este prea mare.';
  if (status === 429) return 'Prea multe cereri. Încearcă din nou în câteva momente.';
  if (status >= 500) return 'Serverul nu răspunde momentan. Încearcă din nou în câteva momente.';
  return 'A apărut o eroare. Încearcă din nou.';
}

/**
 * Executa o cerere catre backend cu timeout + retry.
 * Arunca `ApiError` in caz de esec.
 */
export async function apiFetch(
  path: string,
  options: ApiFetchOptions = {},
): Promise<Response> {
  const {
    timeoutMs = DEFAULT_TIMEOUT,
    retries = DEFAULT_RETRIES,
    auth = true,
    headers,
    ...rest
  } = options;

  const url = buildUrl(path);
  const baseHeaders: Record<string, string> = {
    ...(auth ? await authHeader() : {}),
    ...((headers as Record<string, string>) ?? {}),
  };

  let lastError: ApiError | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const attemptTimeout = attempt === 0 ? timeoutMs : Math.max(timeoutMs, COLD_START_TIMEOUT);
    const timer = setTimeout(() => controller.abort(), attemptTimeout);

    try {
      const response = await fetch(url, {
        ...rest,
        headers: baseHeaders,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (response.ok) return response;

      // 4xx (fara 429) = eroare de client, nu are rost retry.
      if (response.status < 500 && response.status !== 429) {
        let serverMessage: string | undefined;
        try {
          const body = await response.clone().json();
          serverMessage = body?.eroare || body?.error || body?.message;
        } catch {
          /* raspuns non-JSON */
        }
        throw new ApiError(friendlyMessage(response.status, serverMessage), {
          status: response.status,
        });
      }

      lastError = new ApiError(friendlyMessage(response.status), { status: response.status });
    } catch (err) {
      clearTimeout(timer);

      if (err instanceof ApiError) throw err;

      const aborted = (err as Error)?.name === 'AbortError';
      lastError = aborted
        ? new ApiError(
            'Serverul răspunde greu în acest moment. Verifică conexiunea și încearcă din nou.',
            { isTimeout: true },
          )
        : new ApiError(
            'Nu ne putem conecta la server. Verifică conexiunea la internet.',
            { isNetwork: true },
          );
    }

    if (attempt < retries) {
      const backoff = 800 * Math.pow(2, attempt); // 800ms, 1600ms
      log.warn(`[apiFetch] Reincercare ${attempt + 1}/${retries} pentru ${path}`);
      await sleep(backoff);
    }
  }

  log.error('[apiFetch] Cerere esuata definitiv:', path, lastError?.message);
  throw lastError ?? new ApiError('A apărut o eroare necunoscută.');
}

/** Varianta care returneaza direct JSON-ul parsat. */
export async function apiFetchJson<T = unknown>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const response = await apiFetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) ?? {}),
    },
  });

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError('Răspuns invalid de la server.');
  }
}

export default apiFetch;
