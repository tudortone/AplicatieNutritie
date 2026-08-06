'use strict';

/**
 * P-05: Teste unitare pentru GDPR worker și fail-closed outbox initiation.
 */

const express = require('express');
const request = require('supertest');
const createGdprRouter = require('../routes/gdpr');
const { reiaStergerileBlocate } = require('../utils/gdprWorker');

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
    expect(deleteCalls.length).toBeGreaterThan(0);
    expect(adminFake.auth.admin.deleteUser).toHaveBeenCalledWith('user-456');
    expect(updateCalls.some((u) => u.status === 'db_done')).toBe(true);
    expect(updateCalls.some((u) => u.status === 'completed')).toBe(true);
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
