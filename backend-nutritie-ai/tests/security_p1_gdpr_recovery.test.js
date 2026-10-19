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
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [],
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
});
