'use strict';

/**
 * P-05: Teste unitare pentru GDPR worker și fail-closed outbox initiation.
 */

const express = require('express');
const request = require('supertest');
const createGdprRouter = require('../routes/gdpr');
const { reiaStergerileBlocate } = require('../utils/gdprWorker');
const { TABELE_CU_RLS_UTILIZATOR } = require('../utils/clientUtilizator');

function creeazaApp(supabaseAdmin, profilRepoFake) {
  const app = express();
  const contextDateMock = (_req) => ({
    userId: '11111111-1111-4111-8111-111111111111',
    modAdmin: false,
  });
  app.use((req, res, next) => {
    req.user = { id: '11111111-1111-4111-8111-111111111111' };
    next();
  });
  app.use('/api/v1/user', createGdprRouter({
    requireAuth: (_req, _res, next) => next(),
    generalLimiter: (_req, _res, next) => next(),
    supabaseAdmin,
    contextDate: contextDateMock,
    profilRepo: profilRepoFake || { getProfil: async () => ({}) },
  }));
  return app;
}

describe('P-05 — GDPR Worker și Outbox Fail-Closed', () => {
  test('outbox RPC initiate_gdpr_deletion indisponibil → 503 fail-closed', async () => {
    const adminFake = {
      auth: {
        admin: {
          deleteUser: jest.fn(async () => ({ error: null })),
        },
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
      rpc: async (nume) => {
        if (nume === 'initiate_gdpr_deletion') {
          return { data: null, error: new Error('RPC initiate_gdpr_deletion missing') };
        }
        return { data: null, error: null };
      },
    };

    const app = creeazaApp(adminFake);

    const res = await request(app).delete('/api/v1/user/delete-account');
    expect(res.status).toBe(503);
    expect(res.body.eroare).toContain('Ștergerea nu poate fi inițiată în siguranță');
  });

  test('reiaStergerileBlocate reia un rând din starea pending până la completed', async () => {
    const randStocat = {
      id: 'outbox-pending-123',
      user_id: 'user-456',
      clerk_user_id: 'clerk-789',
      status: 'pending',
      retry_count: 0,
      created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    };

    const updateCalls = [];
    const deleteCalls = [];

    const adminFake = {
      auth: {
        admin: {
          deleteUser: jest.fn(async () => ({ error: null })),
        },
      },
      from: (tabela) => {
        if (tabela === 'gdpr_deletions') {
          return {
            select: () => ({
              neq: () => ({
                neq: () => ({
                  lt: () => ({
                    limit: async () => ({ data: [randStocat], error: null }),
                  }),
                }),
              }),
            }),
            update: (payload) => ({
              eq: async (_col, _val) => {
                updateCalls.push(payload);
                return { error: null };
              },
            }),
          };
        }
        return {
          delete: () => ({
            eq: async (col, val) => {
              deleteCalls.push({ tabela, col, val });
              return { error: null };
            },
          }),
        };
      },
    };

    const rez = await reiaStergerileBlocate({ supabaseAdmin: adminFake, config: {} });
    expect(rez.reluate).toBe(1);
    // N-03: worker-ul șterge EXACT toate tabelele user-scoped din lista unică
    expect(deleteCalls.map((d) => d.tabela).sort()).toEqual([...TABELE_CU_RLS_UTILIZATOR].sort());
    expect(adminFake.auth.admin.deleteUser).toHaveBeenCalledWith('user-456');
    // N-02: ordinea statusurilor = ordinea rutei (DB → Clerk → ImageKit → auth)
    const statusuri = updateCalls.map((u) => u.status);
    expect(statusuri).toEqual(['db_done', 'clerk_done', 'imagekit_done', 'auth_done', 'completed']);
  });

  test('reluare de la clerk_done: ImageKit folosește fileIds persistate în outbox (N-04), apoi auth → completed', async () => {
    const randClerk = {
      id: 'outbox-clerk-404',
      user_id: 'user-img',
      clerk_user_id: 'clerk-404',
      status: 'clerk_done',
      file_ids: ['fk_alpha', 'fk_beta'],
      retry_count: 0,
      created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    };

    const updateCalls = [];
    const apeluriImageKit = [];
    const fetchSalvat = global.fetch;
    global.fetch = jest.fn(async (url) => {
      apeluriImageKit.push(String(url));
      return { ok: true, status: 200 };
    });

    const envSalvat = {
      IMAGEKIT_PRIVATE_KEY: process.env.IMAGEKIT_PRIVATE_KEY,
      CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    };
    process.env.IMAGEKIT_PRIVATE_KEY = 'key-test';
    process.env.CLERK_SECRET_KEY = 'sk_test';

    const adminFake = {
      auth: {
        admin: { deleteUser: jest.fn(async () => ({ error: null })) },
      },
      from: (tabela) => {
        if (tabela === 'gdpr_deletions') {
          return {
            select: () => ({
              neq: () => ({
                neq: () => ({
                  lt: () => ({
                    limit: async () => ({ data: [randClerk], error: null }),
                  }),
                }),
              }),
            }),
            update: (payload) => ({
              eq: async () => {
                updateCalls.push(payload);
                return { error: null };
              },
            }),
          };
        }
        return {
          delete: () => ({
            eq: async () => ({ error: null }),
          }),
        };
      },
    };

    try {
      const rez = await reiaStergerileBlocate({ supabaseAdmin: adminFake, config: {} });
      expect(rez.reluate).toBe(1);
      // fileIds din outbox ajung la ImageKit (N-04), NU o listă goală
      expect(apeluriImageKit.some((u) => u.includes('/files/fk_alpha'))).toBe(true);
      expect(apeluriImageKit.some((u) => u.includes('/files/fk_beta'))).toBe(true);
      expect(updateCalls.map((u) => u.status)).toEqual(['imagekit_done', 'auth_done', 'completed']);
      expect(adminFake.auth.admin.deleteUser).toHaveBeenCalledWith('user-img');
    } finally {
      global.fetch = fetchSalvat;
      process.env.IMAGEKIT_PRIVATE_KEY = envSalvat.IMAGEKIT_PRIVATE_KEY;
      process.env.CLERK_SECRET_KEY = envSalvat.CLERK_SECRET_KEY;
    }
  });

  test('reluare de la imagekit_done: se reia doar auth.deleteUser (IREVERSIBIL) → auth_done → completed', async () => {
    const randImgDone = {
      id: 'outbox-img-7',
      user_id: 'user-auth',
      status: 'imagekit_done',
      file_ids: ['fk_gamma'],
      retry_count: 0,
      created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    };
    const updateCalls = [];
    const adminFake = {
      auth: {
        admin: { deleteUser: jest.fn(async () => ({ error: null })) },
      },
      from: (tabela) => {
        if (tabela === 'gdpr_deletions') {
          return {
            select: () => ({
              neq: () => ({
                neq: () => ({
                  lt: () => ({
                    limit: async () => ({ data: [randImgDone], error: null }),
                  }),
                }),
              }),
            }),
            update: (payload) => ({
              eq: async () => {
                updateCalls.push(payload);
                return { error: null };
              },
            }),
          };
        }
        return { delete: () => ({ eq: async () => ({ error: null }) }) };
      },
    };
    const rez = await reiaStergerileBlocate({ supabaseAdmin: adminFake, config: {} });
    expect(rez.reluate).toBe(1);
    expect(updateCalls.map((u) => u.status)).toEqual(['auth_done', 'completed']);
    expect(adminFake.auth.admin.deleteUser).toHaveBeenCalledWith('user-auth');
  });

  test('al 5-lea eșec → status = failed cu retry_count actualizat pe coloana reală', async () => {
    const randEsuat = {
      id: 'outbox-failed-999',
      user_id: 'user-toxic',
      status: 'pending',
      retry_count: 4,
      created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    };

    let updatePayload = null;

    const adminFake = {
      from: (tabela) => {
        if (tabela === 'gdpr_deletions') {
          return {
            select: () => ({
              neq: () => ({
                neq: () => ({
                  lt: () => ({
                    limit: async () => ({ data: [randEsuat], error: null }),
                  }),
                }),
              }),
            }),
            update: (payload) => ({
              eq: async () => {
                updatePayload = payload;
                return { error: null };
              },
            }),
          };
        }
        return {};
      },
    };

    const rez = await reiaStergerileBlocate({ supabaseAdmin: adminFake, config: {} });
    expect(rez.reluate).toBe(0);
    expect(updatePayload).toEqual({
      status: 'failed',
      last_error: 'Număr maxim de încercări atins (5).',
      retry_count: 5,
    });
    expect(updatePayload).not.toHaveProperty('incercari');
  });
});
