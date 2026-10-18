'use strict';

/**
 * P0 GDPR Regression Suite based on Independent GPT Codex Review
 *
 * Covers:
 * 1. P1 Finding 1: RPC claim fail-closed (missing RPC, throw, {error}, malformed -> 0 destructive ops)
 * 2. P1 Finding 2: Route and worker unified ownership & fencing protocol
 * 3. P1 Finding 3: Stale lease fencing (expired lease / superseded fencing token rejects status transition)
 * 4. P1 Finding 4: Retry exhaustion race (worker cannot mark 'failed' without acquiring valid claim)
 * 5. P2 Finding 1: ImageKit malformed 200 (missing filePath throws IMAGEKIT_MALFORMED_FILE_PATH)
 * 6. P2 Finding 2: GDPR export media scope metadata declaration
 */

const {
  revendicaRandOutbox,
  actualizeazaStatusOutbox,
  reinoiesteLeaseOutbox,
  reiaStergerileBlocate,
} = require('../utils/gdprWorker');
const { fileIdApartineUtilizatorului } = require('../utils/gdprServices');
const createGdprRouter = require('../routes/gdpr');
const express = require('express');
const request = require('supertest');

describe('P1 Finding 1: RPC Claim Fail-Closed (Zero Destructive Operations on Failure)', () => {
  let tableDeletes;
  let authDeletes;
  let mockRow;

  beforeEach(() => {
    tableDeletes = 0;
    authDeletes = 0;

    mockRow = {
      id: 'outbox-fail-closed-1',
      user_id: 'user-fc-1',
      clerk_user_id: 'clerk-fc-1',
      status: 'pending',
      retry_count: 0,
      initiated_at: new Date(Date.now() - 600000).toISOString(),
      file_ids: ['file-1'],
    };
  });

  function buildMockSupabaseAdmin(rpcBehavior) {
    return {
      from: (tabela) => {
        if (tabela === 'gdpr_deletions') {
          return {
            select: () => ({
              neq: () => ({
                neq: () => ({
                  lt: () => ({
                    limit: async () => ({ data: [mockRow], error: null }),
                  }),
                }),
              }),
            }),
            update: () => ({
              eq: () => ({
                eq: () => ({
                  select: () => ({
                    maybeSingle: async () => ({ data: { id: mockRow.id }, error: null }),
                  }),
                }),
                select: () => ({
                  maybeSingle: async () => ({ data: { id: mockRow.id }, error: null }),
                }),
              }),
            }),
          };
        }
        return {
          delete: () => {
            tableDeletes += 1;
            return {
              eq: async () => ({ error: null }),
              in: async () => ({ error: null }),
            };
          },
        };
      },
      rpc: rpcBehavior,
      auth: {
        admin: {
          deleteUser: async () => {
            authDeletes += 1;
            return { error: null };
          },
        },
      },
    };
  }

  it('fails closed when rpc function throws an exception', async () => {
    const admin = buildMockSupabaseAdmin(async () => {
      throw new Error('Database connection timeout during RPC');
    });

    const claim = await revendicaRandOutbox(admin, mockRow.id, {
      workerId: 'worker_test',
      expectedStatus: 'pending',
    });
    expect(claim.success).toBe(false);

    const result = await reiaStergerileBlocate({
      supabaseAdmin: admin,
      config: { imagekit: { privateKey: 'test_priv' } },
    });

    expect(result.reluate).toBe(0);
    expect(tableDeletes).toBe(0);
    expect(authDeletes).toBe(0);
  });

  it('fails closed when rpc returns an explicit error object', async () => {
    const admin = buildMockSupabaseAdmin(async () => ({
      data: null,
      error: { code: '42883', message: 'function claim_gdpr_deletion does not exist' },
    }));

    const claim = await revendicaRandOutbox(admin, mockRow.id, {
      workerId: 'worker_test',
      expectedStatus: 'pending',
    });
    expect(claim.success).toBe(false);

    const result = await reiaStergerileBlocate({
      supabaseAdmin: admin,
      config: { imagekit: { privateKey: 'test_priv' } },
    });

    expect(result.reluate).toBe(0);
    expect(tableDeletes).toBe(0);
    expect(authDeletes).toBe(0);
  });

  it('fails closed when rpc returns a malformed response (null or non-boolean data)', async () => {
    const admin = buildMockSupabaseAdmin(async () => ({
      data: null,
      error: null,
    }));

    const claim = await revendicaRandOutbox(admin, mockRow.id, {
      workerId: 'worker_test',
      expectedStatus: 'pending',
    });
    expect(claim.success).toBe(false);

    const result = await reiaStergerileBlocate({
      supabaseAdmin: admin,
      config: { imagekit: { privateKey: 'test_priv' } },
    });

    expect(result.reluate).toBe(0);
    expect(tableDeletes).toBe(0);
    expect(authDeletes).toBe(0);
  });

  it('fails closed when rpc method is completely missing on client', async () => {
    const admin = buildMockSupabaseAdmin(undefined);
    delete admin.rpc;

    const claim = await revendicaRandOutbox(admin, mockRow.id, {
      workerId: 'worker_test',
      expectedStatus: 'pending',
    });
    expect(claim.success).toBe(false);

    const result = await reiaStergerileBlocate({
      supabaseAdmin: admin,
      config: { imagekit: { privateKey: 'test_priv' } },
    });

    expect(result.reluate).toBe(0);
    expect(tableDeletes).toBe(0);
    expect(authDeletes).toBe(0);
  });
});

describe('P1 Finding 2 & 3: Route and Worker Ownership & Stale Lease Fencing', () => {
  it('rejects status update if fencing token is stale or lease has expired', async () => {
    // Simulate DB where outbox has fencing_token: 2, but worker has fencing_token: 1
    const admin = {
      from: (tabela) => {
        if (tabela === 'gdpr_deletions') {
          return {
            update: () => ({
              eq: (_col1, _val1) => ({
                eq: (_col2, _val2) => ({
                  eq: (_col3, _val3) => ({
                    eq: (_col4, val4) => ({
                      gte: (_col5, _val5) => ({
                        select: () => ({
                          maybeSingle: async () => {
                            // Fencing check: val3 is workerId, val4 is fencingToken
                            if (val4 === 1) {
                              // Stale token! Return null (0 rows updated)
                              return { data: null, error: null };
                            }
                            return { data: { id: 'outbox-fencing-1' }, error: null };
                          },
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      },
    };

    await expect(
      actualizeazaStatusOutbox(admin, 'outbox-fencing-1', { status: 'db_done' }, {
        workerId: 'worker_stale',
        fencingToken: 1, // Stale!
        expectedStatus: 'pending',
      }),
    ).rejects.toThrow('GDPR_OUTBOX_STATUS_UPDATE_FAILED');
  });

  it('rejects lease renewal when lease has already expired', async () => {
    const admin = {
      rpc: jest.fn(async (nume, _args) => {
        if (nume === 'renew_gdpr_lease') {
          return {
            data: { success: false, error: 'LEASE_EXPIRED_OR_STALE' },
            error: null,
          };
        }
        return { data: null, error: null };
      }),
    };

    await expect(
      reinoiesteLeaseOutbox(admin, 'outbox-expired-1', {
        workerId: 'worker_late',
        fencingToken: 1,
        leaseSeconds: 300,
      }),
    ).rejects.toThrow('GDPR_LEASE_RENEWAL_FAILED');
  });

  it('route and worker cannot run concurrently on the same deletion request', async () => {
    let activeClaim = null;
    let generation = 0;

    const rpcHandler = jest.fn(async (nume, args) => {
      if (nume === 'initiate_gdpr_deletion') {
        return { data: 'outbox-shared-1', error: null };
      }
      if (nume === 'claim_gdpr_deletion') {
        const { p_worker_id } = args;
        if (activeClaim !== null && activeClaim !== p_worker_id) {
          return { data: { success: false, error: 'ALREADY_CLAIMED' }, error: null };
        }
        activeClaim = p_worker_id;
        generation += 1;
        return {
          data: {
            success: true,
            fencing_token: generation,
            lease_expires_at: new Date(Date.now() + 300000).toISOString(),
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });

    const admin = {
      from: (_tabela) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { file_ids: [] }, error: null }),
            order: () => ({
              range: async () => ({ data: [], error: null }),
            }),
          }),
        }),
        update: () => {
          const u = {
            eq: () => u,
            gte: () => u,
            select: () => ({
              maybeSingle: async () => ({ data: { id: 'outbox-shared-1' }, error: null }),
            }),
          };
          return u;
        },
        delete: () => ({
          eq: async () => ({ error: null }),
          in: async () => ({ error: null }),
        }),
      }),
      rpc: rpcHandler,
      auth: { admin: { deleteUser: async () => ({ error: null }) } },
    };

    // 1. Route claims row first
    const app = express();
    app.use(express.json());
    app.use('/api/user', createGdprRouter({
      requireAuth: (req, _res, next) => { req.user = { id: 'user-shared-1' }; next(); },
      generalLimiter: (_req, _res, next) => next(),
      supabaseAdmin: admin,
      contextDate: () => ({ db: admin, userId: 'user-shared-1' }),
      profilRepo: { getProfil: async () => ({}) },
    }));

    const oldKey = process.env.IMAGEKIT_PRIVATE_KEY;
    const oldFetch = global.fetch;
    process.env.IMAGEKIT_PRIVATE_KEY = 'test_priv_key';
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ([]),
    }));

    try {
      // Start route deletion
      const res = await request(app).delete('/api/user/delete-account');
      expect(res.status).toBe(200);
      expect(res.body.succes).toBe(true);

      // 2. While route has claimed it, worker tries to claim it
      activeClaim = 'route_active'; // simulate route currently processing
      const workerClaim = await revendicaRandOutbox(admin, 'outbox-shared-1', {
        workerId: 'worker_parallel',
        expectedStatus: 'pending',
      });

      expect(workerClaim.success).toBe(false);
    } finally {
      process.env.IMAGEKIT_PRIVATE_KEY = oldKey;
      global.fetch = oldFetch;
    }
  });
});

describe('P1 Finding 4: Retry Exhaustion Race (Worker Cannot Mark Failed Without Claim)', () => {
  it('does NOT mark outbox row as failed if it cannot acquire the claim', async () => {
    let statusUpdateAttempted = false;

    const row = {
      id: 'outbox-retry-race-1',
      user_id: 'user-retry-1',
      clerk_user_id: null,
      status: 'pending',
      retry_count: 5, // retry count exhausted!
      initiated_at: new Date(Date.now() - 600000).toISOString(),
    };

    const admin = {
      from: (tabela) => {
        if (tabela === 'gdpr_deletions') {
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
            update: () => {
              statusUpdateAttempted = true;
              return {
                eq: () => ({
                  eq: () => ({
                    select: () => ({
                      maybeSingle: async () => ({ data: { id: row.id }, error: null }),
                    }),
                  }),
                }),
              };
            },
          };
        }
        return {};
      },
      rpc: jest.fn(async (nume) => {
        if (nume === 'claim_gdpr_deletion') {
          // Another worker is actively processing it! Claim fails!
          return { data: { success: false, error: 'ACTIVE_CLAIM_EXISTS' }, error: null };
        }
        return { data: null, error: null };
      }),
    };

    const result = await reiaStergerileBlocate({
      supabaseAdmin: admin,
      config: { imagekit: { privateKey: 'test_key' } },
    });

    expect(result.reluate).toBe(0);
    expect(statusUpdateAttempted).toBe(false);
  });
});

describe('P2 Finding 1: ImageKit Malformed 200 Handling', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('throws IMAGEKIT_MALFORMED_FILE_PATH when ImageKit returns 200 without a valid filePath', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).includes('/details')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ fileId: 'test_file', noFilePathHere: true }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    await expect(
      fileIdApartineUtilizatorului({
        fileId: 'file_malformed_200',
        userId: 'user_target',
        privateKey: 'priv_key_123',
      }),
    ).rejects.toThrow('IMAGEKIT_MALFORMED_FILE_PATH');
  });

  it('throws IMAGEKIT_MALFORMED_FILE_PATH when filePath is an empty string', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).includes('/details')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ fileId: 'test_file', filePath: '   ' }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    await expect(
      fileIdApartineUtilizatorului({
        fileId: 'file_empty_path',
        userId: 'user_target',
        privateKey: 'priv_key_123',
      }),
    ).rejects.toThrow('IMAGEKIT_MALFORMED_FILE_PATH');
  });
});

describe('P2 Finding 2: GDPR Export Media Scope Metadata Declaration', () => {
  it('declares media_export_scope clearly indicating URLs/metadata rather than raw image binaries', async () => {
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              range: async () => ({ data: [], error: null }),
            }),
          }),
        }),
      }),
    };

    const app = express();
    app.use('/api/user', createGdprRouter({
      requireAuth: (req, _res, next) => { req.user = { id: 'user-scope-test' }; next(); },
      generalLimiter: (_req, _res, next) => next(),
      supabaseAdmin: {
        from: () => ({
          select: () => ({ eq: () => ({ order: () => ({ range: async () => ({ data: [], error: null }) }) }) }),
        }),
      },
      contextDate: () => ({ db, userId: 'user-scope-test' }),
      profilRepo: { getProfil: async () => ({ user_id: 'user-scope-test' }) },
    }));

    const res = await request(app).get('/api/user/export-data');
    expect(res.status).toBe(200);
    expect(res.body.media_export_scope).toBeDefined();
    expect(res.body.media_export_scope.type).toBe('metadata_and_urls');
    expect(res.body.media_export_scope.description).toContain('Fișierele binare brute nu sunt înglobate direct în formatul JSON');
  });
});
