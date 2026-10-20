'use strict';

/**
 * Regression tests for GPT independent audit findings:
 * GDPR-01: Atomic claim / CAS lease preventing concurrent route-worker and worker-worker races.
 * GDPR-02: citesteTotPaginat must fail-closed on later-page 42P01/PGRST205 errors (no silent truncation/empty array).
 * GDPR-03: ImageKit detail lookup errors (500, timeout, 429) must throw/fail-closed, not be treated as unowned.
 * GDPR-04: extrageFileIdsUtilizator must paginate across >1000 meals and throw on DB query failure (not return empty Set).
 */

const {
  citesteTotPaginat,
  fileIdApartineUtilizatorului,
  filtreazaFileIdsProprii,
  extrageFileIdsUtilizator,
} = require('../utils/gdprServices');

describe('GDPR-02: citesteTotPaginat fail-closed on later-page errors', () => {
  const USER_ID = 'test-user-uuid-123';

  it('fails the entire export if 42P01 or PGRST205 occurs on page > 0', async () => {
    let callCount = 0;
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              range: async (_from, _to) => {
                callCount += 1;
                if (callCount === 1) {
                  // Page 0: 1000 items returned successfully
                  return {
                    data: Array.from({ length: 1000 }, (_, i) => ({ id: i + 1, user_id: USER_ID })),
                    error: null,
                  };
                }
                // Page 1: transient 42P01 (relation does not exist) or PGRST205
                return {
                  data: null,
                  error: { code: '42P01', message: 'relation does not exist' },
                };
              },
            }),
          }),
        }),
      }),
    };

    await expect(
      citesteTotPaginat({ client, tabela: 'mese', userId: USER_ID, dimensiunePagina: 1000 }),
    ).rejects.toMatchObject({ code: '42P01' });
  });

  it('returns empty array only if 42P01 or PGRST205 occurs on page 0 (table genuinely does not exist)', async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              range: async () => ({
                data: null,
                error: { code: 'PGRST205', message: 'table not in schema cache' },
              }),
            }),
          }),
        }),
      }),
    };

    const result = await citesteTotPaginat({ client, tabela: 'nonexistent_table', userId: USER_ID });
    expect(result).toEqual([]);
  });
});

describe('GDPR-03: ImageKit lookup errors must fail-closed and throw, not treat as unowned', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('throws on ImageKit 500 error instead of returning false (which would skip deletion and leave files behind)', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).includes('/details')) {
        return {
          ok: false,
          status: 500,
          json: async () => ({ message: 'Internal Server Error' }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    await expect(
      fileIdApartineUtilizatorului({
        fileId: 'file_123456',
        userId: 'user_target',
        privateKey: 'test_priv_key',
      }),
    ).rejects.toThrow();
  });

  it('throws on network timeout instead of treating file as unowned', async () => {
    global.fetch = jest.fn(async () => {
      const err = new Error('The operation was aborted');
      err.name = 'TimeoutError';
      throw err;
    });

    await expect(
      fileIdApartineUtilizatorului({
        fileId: 'file_123456',
        userId: 'user_target',
        privateKey: 'test_priv_key',
      }),
    ).rejects.toThrow();
  });

  it('filtreazaFileIdsProprii propagates detail lookup error to fail the step', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({ message: 'Service Unavailable' }),
    }));

    await expect(
      filtreazaFileIdsProprii({
        userId: 'user_target',
        fileIds: new Set(['file_abc123']),
        privateKey: 'test_priv_key',
      }),
    ).rejects.toThrow();
  });

  it('returns false safely without throwing when ImageKit returns 404 (file already gone)', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({ message: 'Not found' }),
    }));

    const belongs = await fileIdApartineUtilizatorului({
      fileId: 'file_deleted_already',
      userId: 'user_target',
      privateKey: 'test_priv_key',
    });
    expect(belongs).toBe(false);
  });
});

describe('GDPR-04: extrageFileIdsUtilizator pagination and error propagation', () => {
  it('throws error when database query fails instead of returning empty Set', async () => {
    const supabaseAdmin = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              range: async () => ({
                data: null,
                error: { code: '57P01', message: 'terminating connection due to administrator command' },
              }),
            }),
          }),
        }),
      }),
    };

    await expect(
      extrageFileIdsUtilizator({ supabaseAdmin, userId: 'user-err' }),
    ).rejects.toMatchObject({ code: '57P01' });
  });

  it('paginates over >1000 meals to extract all fileIds', async () => {
    let callCount = 0;
    const supabaseAdmin = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              range: async (from, to) => {
                callCount += 1;
                if (callCount === 1) {
                  // Page 0: 1000 meals with fileIds
                  return {
                    data: Array.from({ length: 1000 }, (_, i) => ({
                      id: i + 1,
                      alimente: [{ fileId: `file_p0_${i + 1}_xxxx` }],
                    })),
                    error: null,
                  };
                }
                // Page 1: 500 meals with fileIds
                return {
                  data: Array.from({ length: 500 }, (_, i) => ({
                    id: 1000 + i + 1,
                    alimente: [{ fileId: `file_p1_${i + 1}_xxxx` }],
                  })),
                  error: null,
                };
              },
            }),
          }),
        }),
      }),
    };

    const fileIds = await extrageFileIdsUtilizator({ supabaseAdmin, userId: 'user-many-meals' });
    expect(callCount).toBe(2);
    expect(fileIds.size).toBe(1500);
    expect(fileIds.has('file_p0_1_xxxx')).toBe(true);
    expect(fileIds.has('file_p1_500_xxxx')).toBe(true);
  });
});

const { reiaStergerileBlocate } = require('../utils/gdprWorker');

describe('GDPR-01: Atomic claim & CAS status transitions', () => {
  it('prevents two concurrent workers from processing the same outbox row', async () => {
    let activeClaim = null;
    const originalFetch = global.fetch;
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
    }));

    const row = {
      id: 'outbox-race-1',
      user_id: 'user-race-1',
      clerk_user_id: null,
      status: 'pending',
      retry_count: 0,
      initiated_at: new Date(Date.now() - 600000).toISOString(),
    };

    const admin = {
      from: (tabela) => {
        if (tabela === 'gdpr_deletions') {
          const updateChain = {
            eq: () => updateChain,
            gte: () => updateChain,
            select: () => ({
              maybeSingle: async () => ({ data: { id: row.id }, error: null }),
            }),
          };
          return {
            select: () => ({
              neq: () => ({
                neq: () => ({
                  lt: () => ({
                    limit: async () => ({ data: [row], error: null }),
                  }),
                }),
              }),
            }),
            update: (_payload) => updateChain,
          };
        }
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                range: async () => ({ data: [], error: null }),
              }),
            }),
          }),
          delete: () => ({
            eq: async () => ({ error: null }),
            in: async () => ({ error: null }),
          }),
        };
      },
      rpc: jest.fn(async (nume, args) => {
        if (nume === 'claim_gdpr_deletion') {
          if (activeClaim !== null) return { data: { success: false, error: 'ALREADY_CLAIMED' }, error: null };
          activeClaim = args?.p_worker_id || 'worker-claimed';
          return {
            data: {
              success: true,
              fencing_token: 1,
              lease_expires_at: new Date(Date.now() + 300000).toISOString(),
            },
            error: null,
          };
        }
        return { data: null, error: null };
      }),
      auth: {
        admin: {
          deleteUser: async () => ({ error: null }),
        },
      },
    };

    try {
      const [res1, res2] = await Promise.all([
        reiaStergerileBlocate({ supabaseAdmin: admin, config: { imagekit: { privateKey: 'test_key' } } }),
        reiaStergerileBlocate({ supabaseAdmin: admin, config: { imagekit: { privateKey: 'test_key' } } }),
      ]);

      expect(res1.reluate + res2.reluate).toBe(1);
      expect(activeClaim).not.toBeNull();
    } finally {
      global.fetch = originalFetch;
    }
  });
});
