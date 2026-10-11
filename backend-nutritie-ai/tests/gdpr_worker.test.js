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

function rezultatUpdateOutbox(payload, onWrite, rezultat = { data: { id: 'outbox-test-row' }, error: null }) {
  return {
    eq: () => ({
      select: () => ({
        maybeSingle: async () => {
          onWrite?.(payload);
          return typeof rezultat === 'function' ? rezultat(payload) : rezultat;
        },
      }),
    }),
  };
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
      initiated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    };

    const updateCalls = [];
    const deleteCalls = [];
    const imageKitRequests = [];
    let ltColumn = null;
    const fetchSalvat = global.fetch;
    const imageKitKeySalvata = process.env.IMAGEKIT_PRIVATE_KEY;
    const clerkKeySalvata = process.env.CLERK_SECRET_KEY;
    process.env.IMAGEKIT_PRIVATE_KEY = 'synthetic-imagekit-key';
    process.env.CLERK_SECRET_KEY = 'synthetic-clerk-key';
    global.fetch = jest.fn(async (url, options = {}) => {
      if (String(url).includes('api.clerk.com')) return { ok: true, status: 200 };
      imageKitRequests.push({ url: String(url), method: options.method });
      return { ok: true, status: 200 };
    });

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
                  lt: (col, _val) => {
                    ltColumn = col;
                    return {
                      limit: async () => ({ data: [randStocat], error: null }),
                    };
                  },
                }),
              }),
            }),
            update: (payload) => rezultatUpdateOutbox(payload, (value) => updateCalls.push(value)),
          };
        }
        if (tabela === 'google_play_subscriptions') {
          const q = {
            select: () => q,
            eq: () => q,
            order: () => q,
            range: async () => ({ data: [], error: null }),
            delete: () => ({
              eq: async (col, val) => {
                deleteCalls.push({ tabela, col, val });
                return { error: null };
              },
            }),
          };
          return q;
        }
        return {
          delete: () => ({
            eq: async (col, val) => {
              deleteCalls.push({ tabela, col, val });
              return { error: null };
            },
            // F-07: curatarea tabelelor dead-letter sterge dupa mai multe
            // identitati simultan (`app_user_id in (supabaseId, clerkId)`).
            in: async (col, val) => {
              deleteCalls.push({ tabela, col, val });
              return { error: null };
            },
          }),
        };
      },
    };

    let rez;
    try {
      rez = await reiaStergerileBlocate({ supabaseAdmin: adminFake, config: {} });
    } finally {
      global.fetch = fetchSalvat;
      if (imageKitKeySalvata === undefined) delete process.env.IMAGEKIT_PRIVATE_KEY;
      else process.env.IMAGEKIT_PRIVATE_KEY = imageKitKeySalvata;
      if (clerkKeySalvata === undefined) delete process.env.CLERK_SECRET_KEY;
      else process.env.CLERK_SECRET_KEY = clerkKeySalvata;
    }
    expect(rez.reluate).toBe(1);
    // S3-01: worker-ul filtrează pe coloana reală (initiated_at), nu created_at
    expect(ltColumn).toBe('initiated_at');
    // N-03: worker-ul șterge exact toate tabelele user-scoped din lista unică...
    // F-07: ...PLUS tabelele dead-letter, care nu au FK către auth.users și deci
    // nu erau atinse nici de cascadă, nici de listă (PII rămânea după ștergere).
    expect(deleteCalls.map((d) => d.tabela).sort()).toEqual(
      [
        ...TABELE_CU_RLS_UTILIZATOR,
        'google_play_subscriptions',
        'credite_esuate',
        'clerk_webhook_esuate',
      ].sort(),
    );
    const credite = deleteCalls.find((d) => d.tabela === 'credite_esuate');
    expect(credite.col).toBe('app_user_id');
    expect(credite.val).toEqual(['user-456', 'clerk-789']);
    const clerkDl = deleteCalls.find((d) => d.tabela === 'clerk_webhook_esuate');
    expect(clerkDl.col).toBe('clerk_user_id');
    expect(clerkDl.val).toBe('clerk-789');
    expect(imageKitRequests).toHaveLength(2);
    expect(imageKitRequests.every((request) => request.method === 'DELETE')).toBe(true);
    expect(imageKitRequests.map((request) => request.url)).toEqual(expect.arrayContaining([
      expect.stringContaining('/folder/'),
    ]));
    expect(adminFake.auth.admin.deleteUser).toHaveBeenCalledWith('user-456');
    // N-02: ordinea statusurilor = ordinea rutei (DB → Clerk → ImageKit → auth)
    const statusuri = updateCalls.map((u) => u.status);
    expect(statusuri).toEqual(['db_done', 'clerk_done', 'imagekit_done', 'auth_done', 'completed']);
    expect(updateCalls.at(-1)).toEqual(expect.objectContaining({
      user_id: randStocat.id,
      clerk_user_id: null,
      file_ids: [],
      last_error: null,
    }));
  });

  test('reluare de la clerk_done: ImageKit folosește fileIds persistate în outbox (N-04), apoi auth → completed', async () => {
    const randClerk = {
      id: 'outbox-clerk-404',
      user_id: 'user-img',
      clerk_user_id: 'clerk-404',
      status: 'clerk_done',
      file_ids: ['fk_alpha', 'fk_beta'],
      retry_count: 0,
      initiated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    };

    const updateCalls = [];
    const apeluriImageKit = [];
    const fetchSalvat = global.fetch;
    global.fetch = jest.fn(async (url, options = {}) => {
      const urlString = String(url);
      const method = options.method || 'GET';
      apeluriImageKit.push({ url: urlString, method });
      if (urlString.endsWith('/details')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ filePath: `/meals/${randClerk.user_id}/${urlString.includes('fk_alpha') ? 'alpha' : 'beta'}.jpg` }),
        };
      }
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
            update: (payload) => rezultatUpdateOutbox(payload, (value) => updateCalls.push(value)),
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
      expect(apeluriImageKit).toEqual(expect.arrayContaining([
        expect.objectContaining({ url: expect.stringMatching(/\/files\/fk_alpha$/), method: 'DELETE' }),
        expect.objectContaining({ url: expect.stringMatching(/\/files\/fk_beta$/), method: 'DELETE' }),
      ]));
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
      initiated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
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
            update: (payload) => rezultatUpdateOutbox(payload, (value) => updateCalls.push(value)),
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

  test('credencialele ImageKit lipsă opresc workerul înainte de ștergerea Auth', async () => {
    const randClerkDone = {
      id: 'outbox-no-imagekit-key',
      user_id: 'user-protected',
      status: 'clerk_done',
      retry_count: 0,
      initiated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    };
    const deleteUser = jest.fn(async () => ({ error: null }));
    const updates = [];
    const envImageKitSalvata = process.env.IMAGEKIT_PRIVATE_KEY;
    const envClerkSalvata = process.env.CLERK_SECRET_KEY;
    delete process.env.IMAGEKIT_PRIVATE_KEY;
    delete process.env.CLERK_SECRET_KEY;
    const adminFake = {
      auth: { admin: { deleteUser } },
      from: (tabela) => {
        if (tabela === 'gdpr_deletions') {
          return {
            select: () => ({
              neq: () => ({ neq: () => ({ lt: () => ({
                limit: async () => ({ data: [randClerkDone], error: null }),
              }) }) }),
            }),
            update: (payload) => rezultatUpdateOutbox(payload, (value) => updates.push(value)),
          };
        }
        return {};
      },
    };

    try {
      const rezultat = await reiaStergerileBlocate({ supabaseAdmin: adminFake, config: {} });
      expect(rezultat.reluate).toBe(0);
      expect(deleteUser).not.toHaveBeenCalled();
      expect(updates.some((update) => update.status === 'imagekit_done' || update.status === 'auth_done')).toBe(false);
      expect(updates).toContainEqual(expect.objectContaining({ last_error: 'IMAGEKIT_NOT_CONFIGURED' }));
    } finally {
      if (envImageKitSalvata === undefined) delete process.env.IMAGEKIT_PRIVATE_KEY;
      else process.env.IMAGEKIT_PRIVATE_KEY = envImageKitSalvata;
      if (envClerkSalvata === undefined) delete process.env.CLERK_SECRET_KEY;
      else process.env.CLERK_SECRET_KEY = envClerkSalvata;
    }
  });

  test('CLERK_SECRET_KEY lipsă pentru un outbox db_done oprește ștergerea Auth', async () => {
    const randDbDone = {
      id: 'outbox-no-clerk-key',
      user_id: 'user-with-legacy-clerk',
      clerk_user_id: 'clerk-legacy',
      status: 'db_done',
      retry_count: 0,
      initiated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    };
    const deleteUser = jest.fn(async () => ({ error: null }));
    const updates = [];
    const fetchSalvat = global.fetch;
    const envClerkSalvata = process.env.CLERK_SECRET_KEY;
    delete process.env.CLERK_SECRET_KEY;
    global.fetch = jest.fn();
    const adminFake = {
      auth: { admin: { deleteUser } },
      from: (tabela) => {
        if (tabela === 'gdpr_deletions') {
          return {
            select: () => ({
              neq: () => ({ neq: () => ({ lt: () => ({
                limit: async () => ({ data: [randDbDone], error: null }),
              }) }) }),
            }),
            update: (payload) => rezultatUpdateOutbox(payload, (value) => updates.push(value)),
          };
        }
        return {};
      },
    };

    try {
      const rezultat = await reiaStergerileBlocate({ supabaseAdmin: adminFake, config: {} });
      expect(rezultat.reluate).toBe(0);
      expect(global.fetch).not.toHaveBeenCalled();
      expect(deleteUser).not.toHaveBeenCalled();
      expect(updates.some((update) => update.status === 'clerk_done' || update.status === 'auth_done')).toBe(false);
      expect(updates).toContainEqual(expect.objectContaining({ last_error: 'CLERK_NOT_CONFIGURED' }));
    } finally {
      global.fetch = fetchSalvat;
      if (envClerkSalvata === undefined) delete process.env.CLERK_SECRET_KEY;
      else process.env.CLERK_SECRET_KEY = envClerkSalvata;
    }
  });

  test('eroarea la avansarea outbox după ImageKit blochează pasul Auth ireversibil', async () => {
    const randClerkDone = {
      id: 'outbox-status-error',
      user_id: 'user-protected',
      status: 'clerk_done',
      retry_count: 0,
      initiated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    };
    const deleteUser = jest.fn(async () => ({ error: null }));
    const updates = [];
    const fetchSalvat = global.fetch;
    const envImageKitSalvata = process.env.IMAGEKIT_PRIVATE_KEY;
    process.env.IMAGEKIT_PRIVATE_KEY = 'synthetic-imagekit-key';
    global.fetch = jest.fn(async () => ({ ok: true, status: 200 }));
    const adminFake = {
      auth: { admin: { deleteUser } },
      from: (tabela) => {
        if (tabela === 'gdpr_deletions') {
          return {
            select: () => ({
              neq: () => ({ neq: () => ({ lt: () => ({
                limit: async () => ({ data: [randClerkDone], error: null }),
              }) }) }),
            }),
            update: (payload) => rezultatUpdateOutbox(
              payload,
              (value) => updates.push(value),
              (value) => value.status === 'imagekit_done'
                ? { data: null, error: new Error('simulated outbox status write failure') }
                : { data: { id: 'outbox-status-error' }, error: null },
            ),
          };
        }
        return {};
      },
    };

    try {
      const rezultat = await reiaStergerileBlocate({ supabaseAdmin: adminFake, config: {} });
      expect(rezultat.reluate).toBe(0);
      expect(deleteUser).not.toHaveBeenCalled();
      expect(updates).toContainEqual(expect.objectContaining({ last_error: 'GDPR_OUTBOX_STATUS_UPDATE_FAILED' }));
    } finally {
      global.fetch = fetchSalvat;
      if (envImageKitSalvata === undefined) delete process.env.IMAGEKIT_PRIVATE_KEY;
      else process.env.IMAGEKIT_PRIVATE_KEY = envImageKitSalvata;
    }
  });

  test('zero rânduri actualizate în outbox după ImageKit blochează ștergerea Auth ireversibilă', async () => {
    const randClerkDone = {
      id: 'outbox-status-missing-row',
      user_id: 'user-protected',
      status: 'clerk_done',
      retry_count: 0,
      initiated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    };
    const deleteUser = jest.fn(async () => ({ error: null }));
    const updates = [];
    const fetchSalvat = global.fetch;
    const envImageKitSalvata = process.env.IMAGEKIT_PRIVATE_KEY;
    process.env.IMAGEKIT_PRIVATE_KEY = 'synthetic-imagekit-key';
    global.fetch = jest.fn(async () => ({ ok: true, status: 200 }));
    const adminFake = {
      auth: { admin: { deleteUser } },
      from: (tabela) => {
        if (tabela === 'gdpr_deletions') {
          return {
            select: () => ({
              neq: () => ({ neq: () => ({ lt: () => ({
                limit: async () => ({ data: [randClerkDone], error: null }),
              }) }) }),
            }),
            update: (payload) => rezultatUpdateOutbox(
              payload,
              (value) => updates.push(value),
              (value) => value.status === 'imagekit_done'
                ? { data: null, error: null }
                : { data: { id: randClerkDone.id }, error: null },
            ),
          };
        }
        return {};
      },
    };

    try {
      const rezultat = await reiaStergerileBlocate({ supabaseAdmin: adminFake, config: {} });
      expect(rezultat.reluate).toBe(0);
      expect(deleteUser).not.toHaveBeenCalled();
      expect(updates).toContainEqual(expect.objectContaining({ status: 'imagekit_done' }));
      expect(updates).toContainEqual(expect.objectContaining({ last_error: 'GDPR_OUTBOX_STATUS_UPDATE_FAILED' }));
    } finally {
      global.fetch = fetchSalvat;
      if (envImageKitSalvata === undefined) delete process.env.IMAGEKIT_PRIVATE_KEY;
      else process.env.IMAGEKIT_PRIVATE_KEY = envImageKitSalvata;
    }
  });

  test('al 5-lea eșec → status = failed cu retry_count actualizat pe coloana reală', async () => {
    const randEsuat = {
      id: 'outbox-failed-999',
      user_id: 'user-toxic',
      status: 'pending',
      retry_count: 4,
      initiated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
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
            update: (payload) => rezultatUpdateOutbox(payload, (value) => { updatePayload = value; }),
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
