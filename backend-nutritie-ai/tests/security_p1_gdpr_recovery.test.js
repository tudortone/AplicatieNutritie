'use strict';

const express = require('express');
const request = require('supertest');
const createGdprRouter = require('../routes/gdpr');
const { reiaStergerileBlocate } = require('../utils/gdprWorker');

function createStatefulGdprDb(initialRow = null) {
  const rows = new Map();
  if (initialRow) {
    rows.set(initialRow.id, { ...initialRow });
  }

  let tableDeleteCalls = 0;
  let authDeleteCalls = 0;

  const supabaseAdmin = {
    rows,
    getTableDeleteCalls: () => tableDeleteCalls,
    getAuthDeleteCalls: () => authDeleteCalls,
    from: (table) => {
      if (table === 'clerk_user_map') {
        return {
          select: () => ({
            eq: (_col, userId) => ({
              maybeSingle: async () => ({
                data: { clerk_user_id: `clerk_${userId}` },
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === 'mese') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                range: async (from) => ({
                  data: from === 0
                    ? [{ id: 'm1', alimente: [{ imagekit_file_id: 'file_persisted_1' }] }]
                    : [],
                  error: null,
                }),
              }),
            }),
          }),
          delete: () => ({
            eq: async () => {
              tableDeleteCalls += 1;
              return { error: null };
            },
          }),
        };
      }

      if (table === 'gdpr_deletions') {
        return {
          select: () => {
            const filters = { neq: [], eq: [], lt: [] };
            const builder = {
              neq: (col, val) => {
                filters.neq.push([col, val]);
                return builder;
              },
              eq: (col, val) => {
                filters.eq.push([col, val]);
                return builder;
              },
              lt: (col, val) => {
                filters.lt.push([col, val]);
                return builder;
              },
              limit: async () => {
                const matched = [...rows.values()].filter((r) =>
                  filters.neq.every(([c, v]) => r[c] !== v)
                  && filters.eq.every(([c, v]) => r[c] === v),
                );
                return { data: matched.map((r) => ({ ...r })), error: null };
              },
              maybeSingle: async () => {
                const matched = [...rows.values()].find((r) =>
                  filters.eq.every(([c, v]) => r[c] === v),
                );
                return { data: matched ? { ...matched } : null, error: null };
              },
            };
            return builder;
          },
          update: (patch) => {
            const conditions = { eq: [], gte: [] };
            const builder = {
              eq: (col, val) => {
                conditions.eq.push([col, val]);
                return builder;
              },
              gte: (col, val) => {
                conditions.gte.push([col, val]);
                return builder;
              },
              select: () => ({
                maybeSingle: async () => {
                  const target = [...rows.values()].find((r) => {
                    const eqOk = conditions.eq.every(([c, v]) => r[c] === v);
                    const gteOk = conditions.gte.every(([c, v]) =>
                      r[c] && new Date(r[c]).getTime() >= new Date(v).getTime(),
                    );
                    return eqOk && gteOk;
                  });
                  if (!target) {
                    return { data: null, error: null };
                  }
                  Object.assign(target, patch);
                  return { data: { id: target.id }, error: null };
                },
              }),
              then: (resolve, reject) => {
                try {
                  const target = [...rows.values()].find((r) =>
                    conditions.eq.every(([c, v]) => r[c] === v),
                  );
                  if (target) Object.assign(target, patch);
                  return Promise.resolve({ data: target ? { id: target.id } : null, error: null }).then(resolve, reject);
                } catch (e) {
                  return Promise.reject(e).then(resolve, reject);
                }
              },
            };
            return builder;
          },
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
          eq: async () => {
            tableDeleteCalls += 1;
            return { error: null };
          },
          in: async () => ({ error: null }),
        }),
      };
    },
    rpc: jest.fn(async (fnName, args) => {
      if (fnName === 'initiate_gdpr_deletion') {
        const existing = [...rows.values()].find((r) => r.user_id === args.p_user_id);
        if (existing) return { data: existing.id, error: null };
        const id = `outbox-${args.p_user_id}`;
        rows.set(id, {
          id,
          user_id: args.p_user_id,
          clerk_user_id: args.p_clerk_user_id,
          status: 'pending',
          retry_count: 0,
          file_ids: [],
          last_error: null,
          claimed_by: null,
          fencing_token: 0,
          lease_expires_at: null,
          initiated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        });
        return { data: id, error: null };
      }

      if (fnName === 'claim_gdpr_deletion') {
        const row = rows.get(args.p_id);
        if (!row) return { data: { success: false, error: 'NOT_FOUND' }, error: null };
        if (row.status !== args.p_expected_status) {
          return { data: { success: false, error: 'STATUS_MISMATCH' }, error: null };
        }
        const now = Date.now();
        if (
          row.claimed_by
          && row.claimed_by !== args.p_worker_id
          && row.lease_expires_at
          && new Date(row.lease_expires_at).getTime() > now
        ) {
          return { data: { success: false, error: 'ALREADY_CLAIMED' }, error: null };
        }
        row.claimed_by = args.p_worker_id;
        row.fencing_token = (row.fencing_token || 0) + 1;
        row.lease_expires_at = new Date(now + (args.p_lease_seconds || 300) * 1000).toISOString();
        return {
          data: {
            success: true,
            fencing_token: row.fencing_token,
            lease_expires_at: row.lease_expires_at,
          },
          error: null,
        };
      }

      if (fnName === 'renew_gdpr_lease') {
        const row = rows.get(args.p_id);
        const now = Date.now();
        if (
          !row
          || row.claimed_by !== args.p_worker_id
          || row.fencing_token !== args.p_fencing_token
          || !row.lease_expires_at
          || new Date(row.lease_expires_at).getTime() <= now
        ) {
          return { data: { success: false, error: 'LEASE_EXPIRED_OR_STALE' }, error: null };
        }
        row.lease_expires_at = new Date(now + (args.p_lease_seconds || 300) * 1000).toISOString();
        return {
          data: {
            success: true,
            fencing_token: row.fencing_token,
            lease_expires_at: row.lease_expires_at,
          },
          error: null,
        };
      }

      return { data: null, error: null };
    }),
    auth: {
      admin: {
        deleteUser: jest.fn(async () => {
          authDeleteCalls += 1;
          return { error: null };
        }),
      },
    },
  };

  return supabaseAdmin;
}

describe('P1 Security Remediation — GDPR Partial-Failure Recovery & Route Retry/Ownership', () => {
  const originalFetch = global.fetch;
  const originalClerkSecret = process.env.CLERK_SECRET_KEY;
  const originalImageKitKey = process.env.IMAGEKIT_PRIVATE_KEY;

  beforeEach(() => {
    process.env.CLERK_SECRET_KEY = 'sk_test_clerk';
    process.env.IMAGEKIT_PRIVATE_KEY = 'private_test_ik';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.CLERK_SECRET_KEY = originalClerkSecret;
    process.env.IMAGEKIT_PRIVATE_KEY = originalImageKitKey;
  });

  test('1. Worker failure after advancing pending -> db_done preserves db_done and records retry_count + last_error', async () => {
    const db = createStatefulGdprDb({
      id: 'outbox-worker-partial-1',
      user_id: 'user-worker-1',
      clerk_user_id: 'clerk_user-worker-1',
      status: 'pending',
      retry_count: 0,
      file_ids: [],
      last_error: null,
      claimed_by: null,
      fencing_token: 0,
      lease_expires_at: null,
      initiated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    });

    // Clerk fails with 500 on first worker attempt
    global.fetch = jest.fn(async (url) => {
      if (String(url).includes('api.clerk.com')) {
        return { ok: false, status: 500, text: async () => 'Clerk Outage' };
      }
      return { ok: true, status: 200, json: async () => [] };
    });

    const firstRun = await reiaStergerileBlocate({
      supabaseAdmin: db,
      config: { imagekit: { privateKey: 'private_test_ik' } },
    });

    expect(firstRun.reluate).toBe(0);
    const afterFirst = db.rows.get('outbox-worker-partial-1');
    expect(afterFirst.status).toBe('db_done');
    expect(afterFirst.retry_count).toBe(1);
    expect(afterFirst.last_error).toBeTruthy();

    const deletesAfterFirst = db.getTableDeleteCalls();
    expect(deletesAfterFirst).toBeGreaterThan(0);

    // Expire lease so next worker cycle can claim it, and Clerk now succeeds
    afterFirst.lease_expires_at = new Date(Date.now() - 1000).toISOString();
    global.fetch = jest.fn(async (url) => ({
      ok: true,
      status: 200,
      json: async () => (String(url).includes('/details')
        ? { filePath: '/meals/user-worker-1/file_persisted_1.jpg' }
        : []),
    }));

    const secondRun = await reiaStergerileBlocate({
      supabaseAdmin: db,
      config: { imagekit: { privateKey: 'private_test_ik' } },
    });

    expect(secondRun.reluate).toBe(1);
    const afterSecond = db.rows.get('outbox-worker-partial-1');
    expect(afterSecond.status).toBe('completed');
    // DB deletes were NOT repeated on the second run because status was already db_done
    expect(db.getTableDeleteCalls()).toBe(deletesAfterFirst);
    expect(db.getAuthDeleteCalls()).toBe(1);
  });

  test('2. Synchronous DELETE /delete-account retry after partial failure at db_done resumes and completes without 409', async () => {
    const db = createStatefulGdprDb();
    const app = express();
    app.use(express.json());
    app.use('/api/user', createGdprRouter({
      requireAuth: (req, _res, next) => { req.user = { id: 'user-route-retry-1' }; next(); },
      generalLimiter: (_req, _res, next) => next(),
      supabaseAdmin: db,
      contextDate: () => ({ db, userId: 'user-route-retry-1' }),
      profilRepo: { getProfil: async () => ({}) },
    }));

    // Attempt 1: Clerk fails after DB tables are deleted and status reached db_done
    global.fetch = jest.fn(async (url) => {
      if (String(url).includes('api.clerk.com')) {
        return { ok: false, status: 502, text: async () => 'Clerk Bad Gateway' };
      }
      return { ok: true, status: 200, json: async () => [] };
    });

    const res1 = await request(app).delete('/api/user/delete-account');
    expect(res1.status).toBe(500);

    const rowAfterAttempt1 = db.rows.get('outbox-user-route-retry-1');
    expect(rowAfterAttempt1.status).toBe('db_done');
    expect(rowAfterAttempt1.retry_count).toBe(1);
    expect(rowAfterAttempt1.last_error).toBeTruthy();
    expect(rowAfterAttempt1.file_ids).toEqual(['file_persisted_1']);
    const tableDeletesAttempt1 = db.getTableDeleteCalls();
    expect(tableDeletesAttempt1).toBeGreaterThan(0);

    // Simulate lease released / expired before user retries
    rowAfterAttempt1.lease_expires_at = new Date(Date.now() - 1000).toISOString();

    // Attempt 2: Clerk and ImageKit succeed
    global.fetch = jest.fn(async (url) => {
      if (String(url).includes('/details')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            fileId: 'file_persisted_1',
            filePath: '/mancare/user-route-retry-1/meal.jpg',
          }),
        };
      }
      return { ok: true, status: 200, json: async () => [] };
    });

    const res2 = await request(app).delete('/api/user/delete-account');
    expect(res2.status).toBe(200);
    expect(res2.body.succes).toBe(true);

    const rowAfterAttempt2 = db.rows.get('outbox-user-route-retry-1');
    expect(rowAfterAttempt2.status).toBe('completed');
    // Step 1 DB deletes were NOT repeated on retry
    expect(db.getTableDeleteCalls()).toBe(tableDeletesAttempt1);
    expect(db.getAuthDeleteCalls()).toBe(1);
  });

  test('3. Stale route catch block cannot overwrite outbox state when superseded by another owner', async () => {
    const db = createStatefulGdprDb();
    const app = express();
    app.use(express.json());
    app.use('/api/user', createGdprRouter({
      requireAuth: (req, _res, next) => { req.user = { id: 'user-stale-route' }; next(); },
      generalLimiter: (_req, _res, next) => next(),
      supabaseAdmin: db,
      contextDate: () => ({ db, userId: 'user-stale-route' }),
      profilRepo: { getProfil: async () => ({}) },
    }));

    // During Clerk call, another worker supersedes the lease and completes the row!
    global.fetch = jest.fn(async (url) => {
      if (String(url).includes('api.clerk.com')) {
        const row = db.rows.get('outbox-user-stale-route');
        row.claimed_by = 'worker_superseding';
        row.fencing_token += 1;
        row.status = 'completed';
        row.last_error = null;
        return { ok: false, status: 500, text: async () => 'Clerk fail in stale route' };
      }
      return { ok: true, status: 200, json: async () => [] };
    });

    const res = await request(app).delete('/api/user/delete-account');
    expect(res.status).toBe(500);

    // The superseding worker's completed state and null last_error must NOT be overwritten!
    const finalRow = db.rows.get('outbox-user-stale-route');
    expect(finalRow.status).toBe('completed');
    expect(finalRow.claimed_by).toBe('worker_superseding');
    expect(finalRow.last_error).toBeNull();
  });

  test('4. Synchronous route refuses retry when retry_count is exhausted and returns 200 idempotently when already completed', async () => {
    const dbFailed = createStatefulGdprDb({
      id: 'outbox-user-exhausted',
      user_id: 'user-exhausted',
      clerk_user_id: 'clerk_user-exhausted',
      status: 'failed',
      retry_count: 5,
      file_ids: [],
      last_error: 'Număr maxim de încercări atins (5).',
      claimed_by: null,
      fencing_token: 5,
      lease_expires_at: null,
      initiated_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    });

    const appFailed = express();
    appFailed.use(express.json());
    appFailed.use('/api/user', createGdprRouter({
      requireAuth: (req, _res, next) => { req.user = { id: 'user-exhausted' }; next(); },
      generalLimiter: (_req, _res, next) => next(),
      supabaseAdmin: dbFailed,
      contextDate: () => ({ db: dbFailed, userId: 'user-exhausted' }),
      profilRepo: { getProfil: async () => ({}) },
    }));

    const resFailed = await request(appFailed).delete('/api/user/delete-account');
    expect(resFailed.status).toBe(409);
    expect(dbFailed.getTableDeleteCalls()).toBe(0);
    expect(dbFailed.getAuthDeleteCalls()).toBe(0);

    const dbCompleted = createStatefulGdprDb({
      id: 'outbox-user-done',
      user_id: 'user-done',
      clerk_user_id: null,
      status: 'completed',
      retry_count: 1,
      file_ids: [],
      last_error: null,
      claimed_by: null,
      fencing_token: 2,
      lease_expires_at: null,
      initiated_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    });

    const appCompleted = express();
    appCompleted.use(express.json());
    appCompleted.use('/api/user', createGdprRouter({
      requireAuth: (req, _res, next) => { req.user = { id: 'user-done' }; next(); },
      generalLimiter: (_req, _res, next) => next(),
      supabaseAdmin: dbCompleted,
      contextDate: () => ({ db: dbCompleted, userId: 'user-done' }),
      profilRepo: { getProfil: async () => ({}) },
    }));

    const resCompleted = await request(appCompleted).delete('/api/user/delete-account');
    expect(resCompleted.status).toBe(200);
    expect(resCompleted.body.succes).toBe(true);
    expect(dbCompleted.getTableDeleteCalls()).toBe(0);
    expect(dbCompleted.getAuthDeleteCalls()).toBe(0);
  });

  test('5. Priority 2: Boolean true/false, malformed, missing/non-positive fencing_token, missing/expired lease, RPC error/unavailable, stale owner or reclaim fail closed with ZERO destructive side effects', async () => {
    const { revendicaRandOutbox, asiguraLeaseActiv } = require('../utils/gdprWorker');
    const futureIso = new Date(Date.now() + 300_000).toISOString();
    const pastIso = new Date(Date.now() - 10_000).toISOString();

    const invalidClaimCases = [
      { name: 'boolean true', rpcImpl: async () => ({ data: true, error: null }) },
      { name: 'boolean false', rpcImpl: async () => ({ data: false, error: null }) },
      { name: 'null data', rpcImpl: async () => ({ data: null, error: null }) },
      { name: 'empty object', rpcImpl: async () => ({ data: {}, error: null }) },
      { name: 'array data', rpcImpl: async () => ({ data: [{ success: true }], error: null }) },
      { name: 'missing fencing_token', rpcImpl: async () => ({ data: { success: true, lease_expires_at: futureIso }, error: null }) },
      { name: 'zero fencing_token', rpcImpl: async () => ({ data: { success: true, fencing_token: 0, lease_expires_at: futureIso }, error: null }) },
      { name: 'negative fencing_token', rpcImpl: async () => ({ data: { success: true, fencing_token: -5, lease_expires_at: futureIso }, error: null }) },
      { name: 'missing lease_expires_at', rpcImpl: async () => ({ data: { success: true, fencing_token: 1 }, error: null }) },
      { name: 'expired lease_expires_at', rpcImpl: async () => ({ data: { success: true, fencing_token: 1, lease_expires_at: pastIso }, error: null }) },
      { name: 'RPC error object', rpcImpl: async () => ({ data: null, error: { code: '57P01', message: 'db error' } }) },
      { name: 'RPC exception', rpcImpl: async () => { throw new Error('RPC_CRASH'); } },
      { name: 'RPC unavailable', rpcUnavailable: true },
      { name: 'stale owner in response', rpcImpl: async () => ({ data: { success: true, fencing_token: 1, lease_expires_at: futureIso, claimed_by: 'other_worker' }, error: null }) },
      { name: 'mismatched job id in response', rpcImpl: async () => ({ data: { success: true, fencing_token: 1, lease_expires_at: futureIso, id: 'wrong_job_id' }, error: null }) },
      { name: 'reclaimed by another worker', rpcImpl: async () => ({ data: { success: false, error: 'ALREADY_CLAIMED' }, error: null }) },
    ];

    global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));

    for (const testCase of invalidClaimCases) {
      const db = createStatefulGdprDb({
        id: 'outbox-claim-guard-1',
        user_id: 'user-claim-guard-1',
        clerk_user_id: 'clerk-claim-guard-1',
        status: 'pending',
        retry_count: 0,
        file_ids: ['file_should_not_touch'],
        last_error: null,
        claimed_by: null,
        fencing_token: 0,
        lease_expires_at: null,
        initiated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      });

      if (testCase.rpcUnavailable) {
        delete db.rpc;
      } else {
        db.rpc = jest.fn(async (fnName, args) => {
          if (fnName === 'initiate_gdpr_deletion') return { data: 'outbox-claim-guard-1', error: null };
          if (fnName === 'claim_gdpr_deletion') return testCase.rpcImpl(args);
          return { data: null, error: null };
        });
      }

      const directClaim = await revendicaRandOutbox(db, 'outbox-claim-guard-1', {
        workerId: 'worker_expected',
        expectedStatus: 'pending',
      });
      expect(directClaim.success).toBe(false);

      const workerResult = await reiaStergerileBlocate({
        supabaseAdmin: db,
        config: { imagekit: { privateKey: 'private_test_ik' } },
      });
      expect(workerResult.reluate).toBe(0);
      expect(db.getTableDeleteCalls()).toBe(0);
      expect(db.getAuthDeleteCalls()).toBe(0);
      expect(global.fetch).not.toHaveBeenCalled();
    }

    const dbForLease = createStatefulGdprDb();
    await expect(
      asiguraLeaseActiv(dbForLease, 'outbox-1', {
        workerId: 'w1',
        fencingToken: 1,
        leaseExpiresAt: null,
      }),
    ).rejects.toThrow();
    await expect(
      asiguraLeaseActiv(dbForLease, 'outbox-1', {
        workerId: 'w1',
        fencingToken: null,
        leaseExpiresAt: futureIso,
      }),
    ).rejects.toThrow();
    await expect(
      asiguraLeaseActiv(dbForLease, 'outbox-1', {
        workerId: 'w1',
        fencingToken: 1,
        leaseExpiresAt: pastIso,
      }),
    ).rejects.toThrow();
  });

  test('6. Priority 3: Worker durably persists paginated ImageKit file_ids before deleting mese and recovers them after mid-DB-delete crash', async () => {
    let meseDeleted = false;
    let crashOnProfilDelete = true;
    let failFileIdsPersistOnce = false;
    const deletedImageKitFiles = [];

    const db = createStatefulGdprDb({
      id: 'outbox-p3-crash-1',
      user_id: 'user-p3-1',
      clerk_user_id: 'clerk_user-p3-1',
      status: 'pending',
      retry_count: 0,
      file_ids: [],
      last_error: null,
      claimed_by: null,
      fencing_token: 0,
      lease_expires_at: null,
      initiated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    });

    const baseFrom = db.from.bind(db);
    db.from = (table) => {
      if (table === 'mese') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                range: async (from) => {
                  if (meseDeleted) return { data: [], error: null };
                  if (from === 0) {
                    return {
                      data: Array.from({ length: 1000 }, (_, i) => ({
                        id: `m_${i}`,
                        alimente: i === 0 ? [{ imagekit_file_id: 'ik_nonstd_page1' }] : [],
                      })),
                      error: null,
                    };
                  }
                  return {
                    data: [{ id: 'm_1001', alimente: [{ fileId: 'ik_nonstd_page2' }] }],
                    error: null,
                  };
                },
              }),
            }),
          }),
          delete: () => ({
            eq: async () => {
              meseDeleted = true;
              return { error: null };
            },
          }),
        };
      }
      if (table === 'profil') {
        return {
          delete: () => ({
            eq: async () => {
              if (crashOnProfilDelete) {
                throw new Error('WORKER_CRASH_AFTER_MESE_DELETED');
              }
              return { error: null };
            },
          }),
        };
      }
      if (table === 'gdpr_deletions') {
        const gdprTable = baseFrom('gdpr_deletions');
        const origUpdate = gdprTable.update.bind(gdprTable);
        return {
          ...gdprTable,
          update: (patch) => {
            if (failFileIdsPersistOnce && Array.isArray(patch.file_ids) && !patch.status) {
              failFileIdsPersistOnce = false;
              throw new Error('CRASH_BETWEEN_ENUMERATION_AND_PERSISTENCE');
            }
            return origUpdate(patch);
          },
        };
      }
      return baseFrom(table);
    };

    global.fetch = jest.fn(async (url, options = {}) => {
      const urlStr = String(url);
      if (urlStr.includes('/details')) {
        const match = urlStr.match(/\/files\/([^/]+)\/details$/);
        const fid = match ? decodeURIComponent(match[1]) : 'unknown';
        return {
          ok: true,
          status: 200,
          json: async () => ({
            fileId: fid,
            filePath: `/custom-legacy/${fid}/user-p3-1/photo.jpg`,
            customMetadata: { userId: 'user-p3-1' },
          }),
        };
      }
      if (urlStr.includes('api.imagekit.io/v1/files/') && (options.method || 'DELETE') === 'DELETE') {
        deletedImageKitFiles.push(urlStr.split('/files/')[1]);
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    // Run 0: Crash between enumeration and persistence -> mese must NOT be deleted!
    failFileIdsPersistOnce = true;
    const run0 = await reiaStergerileBlocate({
      supabaseAdmin: db,
      config: { imagekit: { privateKey: 'private_test_ik' } },
    });
    expect(run0.reluate).toBe(0);
    expect(meseDeleted).toBe(false);
    expect(db.rows.get('outbox-p3-crash-1').status).toBe('pending');

    // Expire lease for Run 1: Enumeration + persistence succeed, mese is deleted, then worker crashes mid-DB delete
    db.rows.get('outbox-p3-crash-1').lease_expires_at = new Date(Date.now() - 1000).toISOString();
    const run1 = await reiaStergerileBlocate({
      supabaseAdmin: db,
      config: { imagekit: { privateKey: 'private_test_ik' } },
    });
    expect(run1.reluate).toBe(0);
    expect(meseDeleted).toBe(true);
    // Even though worker crashed before db_done, file_ids WERE durably persisted before mese was deleted!
    expect(db.rows.get('outbox-p3-crash-1').file_ids.slice().sort()).toEqual([
      'ik_nonstd_page1',
      'ik_nonstd_page2',
    ]);
    expect(db.rows.get('outbox-p3-crash-1').status).toBe('pending');

    // Run 2: New worker resumes after lease expiry. mese is now empty, but persisted file_ids survive and are deleted!
    crashOnProfilDelete = false;
    db.rows.get('outbox-p3-crash-1').lease_expires_at = new Date(Date.now() - 1000).toISOString();
    const run2 = await reiaStergerileBlocate({
      supabaseAdmin: db,
      config: { imagekit: { privateKey: 'private_test_ik' } },
    });
    expect(run2.reluate).toBe(1);
    expect(db.rows.get('outbox-p3-crash-1').status).toBe('completed');
    expect(deletedImageKitFiles.sort()).toEqual(['ik_nonstd_page1', 'ik_nonstd_page2']);
  });

  test('7. Priority 4: Stale worker losing lease mid-execution aborts before irreversible stages and cannot overwrite reclaiming worker', async () => {
    const db = createStatefulGdprDb({
      id: 'outbox-p4-lease-1',
      user_id: 'user-p4-1',
      clerk_user_id: 'clerk_user-p4-1',
      status: 'db_done',
      retry_count: 0,
      file_ids: ['file_p4_1'],
      last_error: null,
      claimed_by: null,
      fencing_token: 0,
      lease_expires_at: null,
      initiated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    });

    // Simulate slow Clerk call during which Worker 1's lease expires and Worker 2 reclaims the job
    global.fetch = jest.fn(async (url) => {
      if (String(url).includes('api.clerk.com')) {
        const row = db.rows.get('outbox-p4-lease-1');
        row.claimed_by = 'worker_reclaimer_2';
        row.fencing_token += 1;
        row.lease_expires_at = new Date(Date.now() + 300_000).toISOString();
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    const staleRun = await reiaStergerileBlocate({
      supabaseAdmin: db,
      config: { imagekit: { privateKey: 'private_test_ik' } },
    });

    expect(staleRun.reluate).toBe(0);
    // Stale worker MUST NOT reach auth.admin.deleteUser after losing fencing ownership!
    expect(db.getAuthDeleteCalls()).toBe(0);
    expect(db.rows.get('outbox-p4-lease-1').claimed_by).toBe('worker_reclaimer_2');

    // Also test: if lease expires DURING Stage 1 (pending) before DB deletion finishes,
    // worker aborts remaining table deletions and never reaches Clerk/ImageKit/Auth
    const dbStage1LeaseLost = createStatefulGdprDb({
      id: 'outbox-p4-lease-stage1',
      user_id: 'user-p4-stage1',
      clerk_user_id: 'clerk_user-p4-stage1',
      status: 'pending',
      retry_count: 0,
      file_ids: ['file_stage1'],
      last_error: null,
      claimed_by: null,
      fencing_token: 0,
      lease_expires_at: null,
      initiated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    });
    // Claim returns a short lease (60s) which triggers renewal check via asiguraLeaseActiv,
    // and renew_gdpr_lease rejects because another worker reclaimed it!
    const origRpc = dbStage1LeaseLost.rpc;
    dbStage1LeaseLost.rpc = jest.fn(async (fnName, args) => {
      if (fnName === 'claim_gdpr_deletion') {
        const res = await origRpc(fnName, { ...args, p_lease_seconds: 60 });
        return res;
      }
      if (fnName === 'renew_gdpr_lease') {
        return { data: { success: false, error: 'LEASE_EXPIRED_OR_STALE' }, error: null };
      }
      return origRpc(fnName, args);
    });

    const stage1LostRun = await reiaStergerileBlocate({
      supabaseAdmin: dbStage1LeaseLost,
      config: { imagekit: { privateKey: 'private_test_ik' } },
    });
    expect(stage1LostRun.reluate).toBe(0);
    expect(dbStage1LeaseLost.getTableDeleteCalls()).toBe(0);
    expect(dbStage1LeaseLost.getAuthDeleteCalls()).toBe(0);
  });
});
