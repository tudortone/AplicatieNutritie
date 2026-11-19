import { API_URL } from '../constants/config';

// B-18: prefixul API-ului versionat. Clientul migreaza treptat la /api/v1;
// aliasele legacy /api raman active in backend pana la EXPIRE 2026-09-30.
export const API_PREFIX = '/api/v1';

export function getCleanApiBaseUrl(): string {
  let base = (API_URL || '').trim();
  base = base.replace(/\/+$/, '');
  base = base.replace(/\/api\/v1$/i, '').replace(/\/api$/i, '');
  return base;
}

export function buildApiUrl(path: string): string {
  const base = getCleanApiBaseUrl();
  let cleanPath = (path || '').trim();
  if (!cleanPath.startsWith('/')) {
    cleanPath = `/${cleanPath}`;
  }
  if (/^\/api\//i.test(cleanPath)) {
    return `${base}${cleanPath}`;
  }
  return `${base}${API_PREFIX}${cleanPath}`;
}

export type AuthSessionLike = {
  access_token?: string | null;
  user?: { id?: string | null } | null;
};

export type AuthClientLike = {
  getSession?: () => Promise<{ data?: { session?: AuthSessionLike | null } | null; error?: unknown }>;
  refreshSession?: () => Promise<{ data?: { session?: AuthSessionLike | null } | null; error?: unknown }>;
};

export type AuthenticatedFetchOptions = {
  expectedUserId?: string;
  fallbackToken?: string;
  getToken?: () => Promise<string | null | undefined>;
  timeoutMs?: number;
  retryOn401?: boolean;
  buildHeaders?: (ctx: {
    token: string;
    userId?: string;
    attempt: number;
  }) => Promise<Record<string, string>> | Record<string, string>;
  authClient?: AuthClientLike;
};

let inFlightRefresh: Promise<{ accessToken: string | null; userId: string | null }> | null = null;
let cachedDefaultAuthClient: AuthClientLike | null | undefined = undefined;

function getDefaultAuthClient(): AuthClientLike | null {
  if (cachedDefaultAuthClient !== undefined) return cachedDefaultAuthClient;
  try {
    // Lazy require avoids pulling Expo SecureStore / env guards during unit tests
    // that only import buildApiUrl or pass an explicit token without mocking supabase.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../supabase') as { supabase?: { auth?: AuthClientLike } };
    cachedDefaultAuthClient = mod?.supabase?.auth ?? null;
    return cachedDefaultAuthClient;
  } catch {
    return null;
  }
}

function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) {
    const out: Record<string, string> = {};
    headers.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  if (Array.isArray(headers)) {
    const out: Record<string, string> = {};
    for (const [key, value] of headers) {
      out[key] = value;
    }
    return out;
  }
  return { ...headers };
}

export async function getFreshAccessToken(
  expectedUserId?: string,
  fallbackToken?: string,
  authClient?: AuthClientLike,
): Promise<{ token: string; userId?: string }> {
  const auth = authClient ?? getDefaultAuthClient();
  let sessionResolved = false;
  if (typeof auth?.getSession === 'function') {
    try {
      const { data } = await auth.getSession();
      const session = data?.session ?? null;
      if (session?.access_token) {
        sessionResolved = true;
        const sessionUserId = session.user?.id ?? undefined;
        if (expectedUserId && sessionUserId && sessionUserId !== expectedUserId) {
          throw new Error('AUTH_USER_CHANGED');
        }
        if (expectedUserId && !sessionUserId) {
          throw new Error('AUTH_USER_CHANGED');
        }
        return { token: session.access_token, userId: sessionUserId ?? expectedUserId };
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'AUTH_USER_CHANGED') {
        throw error;
      }
      // Fall through to fallbackToken when session lookup is unavailable in isolated test harnesses.
    }
  }

  if (!sessionResolved && typeof fallbackToken === 'string' && fallbackToken.trim().length > 0) {
    return { token: fallbackToken.trim(), userId: expectedUserId };
  }
  throw new Error('AUTH_REQUIRED');
}

export async function refreshSessionSingleFlight(
  failedAccessToken?: string,
  expectedUserId?: string,
  authClient?: AuthClientLike,
): Promise<string | null> {
  const auth = authClient ?? getDefaultAuthClient();
  if (!auth) return null;

  // If another concurrent call already rotated the token in storage, use it immediately.
  if (typeof auth.getSession === 'function') {
    try {
      const { data } = await auth.getSession();
      const current = data?.session ?? null;
      if (
        current?.access_token
        && failedAccessToken
        && current.access_token !== failedAccessToken
      ) {
        if (expectedUserId && current.user?.id !== expectedUserId) {
          return null;
        }
        return current.access_token;
      }
    } catch {
      // Proceed to refreshSession.
    }
  }

  if (typeof auth.refreshSession !== 'function') return null;

  if (!inFlightRefresh) {
    inFlightRefresh = (async () => {
      try {
        const result = await auth.refreshSession!();
        if (result?.error) return { accessToken: null, userId: null };
        const refreshed = result?.data?.session ?? null;
        return {
          accessToken: refreshed?.access_token ?? null,
          userId: refreshed?.user?.id ?? null,
        };
      } catch {
        return { accessToken: null, userId: null };
      } finally {
        inFlightRefresh = null;
      }
    })();
  }

  const outcome = await inFlightRefresh;
  if (!outcome.accessToken) return null;
  if (expectedUserId && outcome.userId !== expectedUserId) return null;
  return outcome.accessToken;
}

export async function authenticatedFetch(
  path: string,
  init?: RequestInit,
  options: AuthenticatedFetchOptions = {},
): Promise<Response> {
  const {
    expectedUserId,
    fallbackToken,
    getToken,
    timeoutMs,
    retryOn401 = true,
    buildHeaders,
    authClient,
  } = options;

  let resolvedToken: string;
  let resolvedUserId: string | undefined = expectedUserId;

  if (typeof getToken === 'function') {
    const customToken = await getToken();
    if (!customToken) throw new Error('AUTH_REQUIRED');
    resolvedToken = customToken;
  } else {
    const fresh = await getFreshAccessToken(expectedUserId, fallbackToken, authClient);
    resolvedToken = fresh.token;
    resolvedUserId = fresh.userId;
  }

  const baseHeaders = normalizeHeaders(init?.headers);
  const externalSignal = init?.signal ?? undefined;
  const url = /^https?:\/\//i.test(path) ? path : buildApiUrl(path);

  const executeAttempt = async (token: string, attempt: number): Promise<Response> => {
    const controller = timeoutMs && timeoutMs > 0 ? new AbortController() : null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let onExternalAbort: (() => void) | null = null;

    if (controller) {
      if (externalSignal?.aborted) {
        controller.abort();
      } else if (externalSignal) {
        onExternalAbort = () => controller.abort();
        externalSignal.addEventListener('abort', onExternalAbort, { once: true });
      }
      timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    }

    try {
      const dynamicHeaders = buildHeaders
        ? await buildHeaders({ token, userId: resolvedUserId, attempt })
        : {};
      return await fetch(url, {
        ...init,
        headers: {
          ...baseHeaders,
          ...dynamicHeaders,
          Authorization: `Bearer ${token}`,
        },
        signal: controller ? controller.signal : externalSignal,
      });
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId);
      if (externalSignal && onExternalAbort) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }
  };

  const firstResponse = await executeAttempt(resolvedToken, 0);
  if (firstResponse.status !== 401 || !retryOn401 || externalSignal?.aborted) {
    return firstResponse;
  }

  let refreshedToken: string | null = null;
  if (typeof getToken === 'function') {
    const viaRefresh = await refreshSessionSingleFlight(resolvedToken, expectedUserId, authClient);
    if (viaRefresh && viaRefresh !== resolvedToken) {
      refreshedToken = viaRefresh;
    } else {
      const nextCustom = await getToken().catch(() => null);
      if (nextCustom && nextCustom !== resolvedToken) {
        refreshedToken = nextCustom;
      }
    }
  } else {
    refreshedToken = await refreshSessionSingleFlight(resolvedToken, expectedUserId, authClient);
  }

  if (!refreshedToken || externalSignal?.aborted) {
    return firstResponse;
  }

  return executeAttempt(refreshedToken, 1);
}

/** Doar pentru teste: resetează promisiunea single-flight de refresh. */
export function __resetAuthFetchForTests(): void {
  inFlightRefresh = null;
  cachedDefaultAuthClient = undefined;
}
