import {
  API_PREFIX,
  authenticatedFetch,
  buildApiUrl,
  getCleanApiBaseUrl,
  __resetAuthFetchForTests,
} from '../lib/api';

describe('lib/api — test de integrare client', () => {
  beforeEach(() => {
    __resetAuthFetchForTests();
    jest.restoreAllMocks();
  });

  it('API_PREFIX este strict /api/v1', () => {
    expect(API_PREFIX).toBe('/api/v1');
  });

  it('buildApiUrl construiește corect căile cu prefixul canonical /api/v1', () => {
    const url = buildApiUrl('/mese');
    expect(url).toContain('/api/v1/mese');
    expect(getCleanApiBaseUrl()).toBeTruthy();
  });

  it('buildApiUrl păstrează căile care încep deja cu /api/', () => {
    const url = buildApiUrl('/api/custom-endpoint');
    expect(url).toContain('/api/custom-endpoint');
  });

  it('authenticatedFetch face single-flight refreshSession la 401, regenereaza headerele Play Integrity si reincearca o singura data', async () => {
    let currentToken = 'expired-token';
    const getSession = jest.fn(async () => ({
      data: { session: { access_token: currentToken, user: { id: 'user-1' } } },
    }));
    const refreshSession = jest.fn(async () => {
      await Promise.resolve();
      currentToken = 'fresh-token';
      return { data: { session: { access_token: 'fresh-token', user: { id: 'user-1' } } } };
    });
    const authClient = { getSession, refreshSession };

    const buildHeaders = jest.fn(async ({ attempt }: { attempt: number }) => ({
      'X-Play-Integrity': `integrity-attempt-${attempt}`,
    }));

    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      if (headers.Authorization === 'Bearer expired-token') {
        return { ok: false, status: 401, json: async () => ({ cod: 'TOKEN_INVALID' }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
    });

    // Doua cereri 401 concurente partajeaza un singur apel refreshSession.
    const [res1, res2] = await Promise.all([
      authenticatedFetch('/photo-jobs', { method: 'POST', body: '{}' }, {
        expectedUserId: 'user-1',
        buildHeaders,
        authClient,
      }),
      authenticatedFetch('/chat', { method: 'POST', body: '{}' }, {
        expectedUserId: 'user-1',
        authClient,
      }),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(buildHeaders).toHaveBeenCalledTimes(2);
    expect(buildHeaders).toHaveBeenNthCalledWith(1, expect.objectContaining({ attempt: 0, token: 'expired-token' }));
    expect(buildHeaders).toHaveBeenNthCalledWith(2, expect.objectContaining({ attempt: 1, token: 'fresh-token' }));

    const retryHeaders = fetchMock.mock.calls.find(
      ([url, init]) => String(url).includes('/photo-jobs')
        && ((init?.headers as Record<string, string>)?.Authorization === 'Bearer fresh-token'),
    )?.[1]?.headers as Record<string, string>;
    expect(retryHeaders?.['X-Play-Integrity']).toBe('integrity-attempt-1');
  });

  it('authenticatedFetch nu intra in bucla infinita cand si retry-ul returneaza 401', async () => {
    let token = 'tok-1';
    const authClient = {
      getSession: jest.fn(async () => ({
        data: { session: { access_token: token, user: { id: 'user-1' } } },
      })),
      refreshSession: jest.fn(async () => {
        token = 'tok-2';
        return { data: { session: { access_token: 'tok-2', user: { id: 'user-1' } } } };
      }),
    };
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ cod: 'TOKEN_INVALID' }),
    } as Response);

    const res = await authenticatedFetch('/chat', { method: 'POST' }, { expectedUserId: 'user-1', authClient });
    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authClient.refreshSession).toHaveBeenCalledTimes(1);
  });

  it('authenticatedFetch respinge cu AUTH_USER_CHANGED daca sesiunea activa apartine altui cont', async () => {
    const authClient = {
      getSession: jest.fn(async () => ({
        data: { session: { access_token: 'tok-b', user: { id: 'user-b' } } },
      })),
    };
    await expect(
      authenticatedFetch('/chat', undefined, { expectedUserId: 'user-a', fallbackToken: 'tok-a', authClient }),
    ).rejects.toThrow('AUTH_USER_CHANGED');
  });
});
