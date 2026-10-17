'use strict';

/**
 * Test de regresie și asigurare: GDPR Backend Unblock pentru Training 2.0 (Task 7).
 *
 * Verifică:
 * 1. User A export returnează template-urile proprii.
 * 2. User A export nu include NICIODATĂ template-urile lui User B.
 * 3. User B export nu include NICIODATĂ înregistrările lui User A.
 * 4. Paginarea completă funcționează pentru seturi mari (>1000 template-uri) fără trunchiere.
 * 5. Seturile goale exportă corect (`workout_templates: []`).
 * 6. Cererile cu identitate malformată sunt respinse.
 * 7. Ștergerea contului elimină template-urile utilizatorului corect.
 * 8. Ștergerea contului nu atinge template-urile altui utilizator.
 * 9. Exportul existent (V1 antrenamente, mese, profil) rămâne neschimbat.
 * 10. Toleranță la migrare în etape (tabel inexistent returnează [] în loc de crash).
 * 11. Erorile reale de export sunt raportate (500) fără ignorare silențioasă.
 * 12. Ștergerea repetată (idempotență) rămâne sigură.
 */

const express = require('express');
const request = require('supertest');
const {
  TABELE_CU_RLS_UTILIZATOR,
  TABELE_STERGERE_GDPR_UTILIZATOR,
} = require('../utils/clientUtilizator');
const {
  citesteTotPaginat,
  DIMENSIUNE_PAGINA_EXPORT,
} = require('../utils/gdprServices');
const createGdprRouter = require('../routes/gdpr');

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('Training 2.0 GDPR Backend Support — workout_templates', () => {
  describe('Registru tabele utilizator', () => {
    test('workout_templates este înregistrat în TABELE_CU_RLS_UTILIZATOR', () => {
      expect(TABELE_CU_RLS_UTILIZATOR).toContain('workout_templates');
    });

    test('workout_templates este inclus în TABELE_STERGERE_GDPR_UTILIZATOR', () => {
      expect(TABELE_STERGERE_GDPR_UTILIZATOR).toContain('workout_templates');
    });
  });

  describe('Izolare A/B și integritate export', () => {
    function creeazaAppMock({ userCurent, templateData, dbError = null }) {
      const db = {
        from: (tabela) => {
          const q = {
            select: () => q,
            eq: (_col, val) => {
              q._val = val;
              return q;
            },
            order: () => q,
            range: async (deLa, panaLa) => {
              if (dbError) throw dbError;
              if (tabela === 'workout_templates') {
                const toate = (templateData || []).filter((r) => r.user_id === q._val);
                return { data: toate.slice(deLa, panaLa + 1), error: null };
              }
              if (tabela === 'antrenamente') {
                return { data: [{ id: 'w1', user_id: q._val, nume: 'V1 Workout' }], error: null };
              }
              if (tabela === 'mese') {
                return { data: [{ id: 'm1', user_id: q._val, tip_masa: 'dejun' }], error: null };
              }
              return { data: [], error: null };
            },
          };
          return q;
        },
      };

      const supabaseAdmin = {
        from: (tabela) => {
          const q = {
            select: () => q,
            eq: () => q,
            order: () => q,
            range: async () => ({ data: [], error: null }),
          };
          return q;
        },
      };

      const app = express();
      app.use(express.json());
      app.use('/api/user', createGdprRouter({
        requireAuth: (req, _res, next) => {
          req.user = { id: userCurent, email: `${userCurent}@example.test` };
          next();
        },
        generalLimiter: (_req, _res, next) => next(),
        supabaseAdmin,
        contextDate: () => ({ db, userId: userCurent }),
        profilRepo: { getProfil: async () => ({ user_id: userCurent, nume: 'Tester' }) },
      }));

      return app;
    }

    test('1. User A export returnează template-urile lui User A', async () => {
      const templateData = [
        { id: 'tpl-a1', user_id: USER_A, name: 'Upper Body A', blocks: [{ kind: 'strength' }] },
        { id: 'tpl-a2', user_id: USER_A, name: 'Lower Body A', blocks: [{ kind: 'strength' }] },
        { id: 'tpl-b1', user_id: USER_B, name: 'B Exclusive', blocks: [{ kind: 'cardio' }] },
      ];

      const app = creeazaAppMock({ userCurent: USER_A, templateData });
      const res = await request(app).get('/api/user/export-data');

      expect(res.status).toBe(200);
      expect(res.body.workout_templates).toBeDefined();
      expect(res.body.workout_templates).toHaveLength(2);
      expect(res.body.workout_templates.map((t) => t.id)).toEqual(['tpl-a1', 'tpl-a2']);
    });

    test('2 & 3. User A export nu include niciodată datele lui B, iar User B nu include datele lui A', async () => {
      const templateData = [
        { id: 'tpl-a1', user_id: USER_A, name: 'Upper Body A', blocks: [] },
        { id: 'tpl-b1', user_id: USER_B, name: 'Upper Body B', blocks: [] },
      ];

      // Export A
      const appA = creeazaAppMock({ userCurent: USER_A, templateData });
      const resA = await request(appA).get('/api/user/export-data');
      expect(resA.status).toBe(200);
      expect(resA.body.workout_templates.some((t) => t.user_id === USER_B)).toBe(false);
      expect(resA.body.workout_templates.some((t) => t.id === 'tpl-b1')).toBe(false);

      // Export B
      const appB = creeazaAppMock({ userCurent: USER_B, templateData });
      const resB = await request(appB).get('/api/user/export-data');
      expect(resB.status).toBe(200);
      expect(resB.body.workout_templates.some((t) => t.user_id === USER_A)).toBe(false);
      expect(resB.body.workout_templates.some((t) => t.id === 'tpl-a1')).toBe(false);
    });

    test('4. Paginarea completă exportă peste 1000 template-uri fără trunchiere', async () => {
      const total = 2200;
      const templateData = Array.from({ length: total }, (_, i) => ({
        id: `tpl-${i + 1}`,
        user_id: USER_A,
        name: `Template ${i + 1}`,
        blocks: [],
      }));

      const app = creeazaAppMock({ userCurent: USER_A, templateData });
      const res = await request(app).get('/api/user/export-data');

      expect(res.status).toBe(200);
      expect(res.body.workout_templates).toHaveLength(total);
      expect(res.body.workout_templates[0].id).toBe('tpl-1');
      expect(res.body.workout_templates[total - 1].id).toBe(`tpl-${total}`);
    });

    test('5. Seturile goale exportă corect workout_templates: []', async () => {
      const app = creeazaAppMock({ userCurent: USER_A, templateData: [] });
      const res = await request(app).get('/api/user/export-data');

      expect(res.status).toBe(200);
      expect(res.body.workout_templates).toEqual([]);
    });

    test('6. Cererile malformate fără contextDate/userId eșuează protejat', async () => {
      const app = express();
      app.use('/api/user', createGdprRouter({
        requireAuth: (_req, _res, next) => next(),
        generalLimiter: (_req, _res, next) => next(),
        supabaseAdmin: {},
        contextDate: () => ({ db: null, userId: null }),
        profilRepo: { getProfil: async () => null },
      }));

      const res = await request(app).get('/api/user/export-data');
      expect(res.status).toBe(500);
      expect(res.body.eroare).toContain('Nu s-au putut pregăti datele');
    });

    test('9. Exportul existent (antrenamente V1, mese, profil) rămâne intact', async () => {
      const app = creeazaAppMock({
        userCurent: USER_A,
        templateData: [{ id: 'tpl-1', user_id: USER_A, name: 'V2 Template' }],
      });
      const res = await request(app).get('/api/user/export-data');

      expect(res.status).toBe(200);
      expect(res.body.profil).toEqual({ user_id: USER_A, nume: 'Tester' });
      expect(res.body.antrenamente).toEqual([{ id: 'w1', user_id: USER_A, nume: 'V1 Workout' }]);
      expect(res.body.mese).toEqual([{ id: 'm1', user_id: USER_A, tip_masa: 'dejun' }]);
      expect(res.body.workout_templates).toEqual([{ id: 'tpl-1', user_id: USER_A, name: 'V2 Template' }]);
    });

    test('10. Toleranță la migrare în etape (tabel inexistent nu blochează exportul)', async () => {
      const client = {
        from: (tabela) => ({
          select: () => ({
            eq: () => ({
              order: () => ({
                range: async () => {
                  if (tabela === 'workout_templates') {
                    return { data: null, error: { code: '42P01', message: 'relation "workout_templates" does not exist' } };
                  }
                  return { data: [], error: null };
                },
              }),
            }),
          }),
        }),
      };

      const rezultat = await citesteTotPaginat({ client, tabela: 'workout_templates', userId: USER_A });
      expect(rezultat).toEqual([]);
    });

    test('11. Erorile reale de bază de date pe export sunt raportate (500)', async () => {
      const app = creeazaAppMock({
        userCurent: USER_A,
        templateData: [],
        dbError: { code: '50000', message: 'FATAL: database connection lost' },
      });
      const res = await request(app).get('/api/user/export-data');

      expect(res.status).toBe(500);
      expect(res.body.eroare).toBe('Nu s-au putut pregăti datele pentru export.');
    });
  });

  describe('Ștergere cont și izolare A/B', () => {
    const originalEnv = { ...process.env };
    const originalFetch = global.fetch;

    beforeAll(() => {
      process.env.IMAGEKIT_PRIVATE_KEY = 'test_imagekit_key';
      process.env.CLERK_SECRET_KEY = 'test_clerk_key';
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      });
    });

    afterAll(() => {
      process.env = originalEnv;
      global.fetch = originalFetch;
    });

    test('7 & 8. Ștergerea contului elimină template-urile lui A și nu atinge pe cele ale lui B', async () => {
      const tabeleSterse = [];
      const stergeriPerUser = { [USER_A]: [], [USER_B]: [] };

      const supabaseAdmin = {
        auth: {
          admin: {
            deleteUser: jest.fn().mockResolvedValue({ error: null }),
          },
        },
        from: (tabela) => {
          if (tabela === 'clerk_user_map') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            };
          }
          if (tabela === 'gdpr_deletions') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { file_ids: [] }, error: null }),
                }),
              }),
              update: () => ({
                eq: () => ({
                  select: () => ({
                    maybeSingle: async () => ({ data: { id: 'outbox-1' }, error: null }),
                  }),
                }),
              }),
            };
          }
          if (tabela === 'google_play_subscriptions') {
            const billingMock = {
              select: () => billingMock,
              eq: () => billingMock,
              order: () => billingMock,
              range: async () => ({ data: [], error: null }),
              delete: () => ({
                eq: async () => ({ error: null }),
                in: async () => ({ error: null }),
              }),
            };
            return billingMock;
          }
          return {
            select: () => ({
              eq: () => Promise.resolve({ data: [], error: null }),
            }),
            delete: () => ({
              eq: (_col, val) => {
                tabeleSterse.push(tabela);
                if (stergeriPerUser[val]) {
                  stergeriPerUser[val].push(tabela);
                }
                return Promise.resolve({ error: null });
              },
              in: () => Promise.resolve({ error: null }),
            }),
          };
        },
        rpc: jest.fn().mockResolvedValue({ data: 'outbox-1', error: null }),
      };

      const app = express();
      app.use('/api/user', createGdprRouter({
        requireAuth: (req, _res, next) => {
          req.user = { id: USER_A };
          next();
        },
        generalLimiter: (_req, _res, next) => next(),
        supabaseAdmin,
        contextDate: () => ({ db: {}, userId: USER_A }),
        profilRepo: {},
      }));

      const res = await request(app).delete('/api/user/delete-account');

      expect(res.status).toBe(200);
      expect(res.body.succes).toBe(true);

      // Verificăm că workout_templates a fost șters explicit pentru USER_A
      expect(stergeriPerUser[USER_A]).toContain('workout_templates');
      // Verificăm că USER_B nu a fost atins
      expect(stergeriPerUser[USER_B]).toHaveLength(0);
    });

    test('12. Ștergerea repetată/idempotentă rămâne sigură', async () => {
      const supabaseAdmin = {
        auth: {
          admin: {
            deleteUser: jest.fn().mockResolvedValue({ error: { message: 'User not found' } }),
          },
        },
        from: (tabela) => {
          if (tabela === 'clerk_user_map') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            };
          }
          if (tabela === 'gdpr_deletions') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { file_ids: [] }, error: null }),
                }),
              }),
              update: () => ({
                eq: () => ({
                  select: () => ({
                    maybeSingle: async () => ({ data: { id: 'outbox-2' }, error: null }),
                  }),
                }),
              }),
            };
          }
          if (tabela === 'google_play_subscriptions') {
            const billingMock = {
              select: () => billingMock,
              eq: () => billingMock,
              order: () => billingMock,
              range: async () => ({ data: [], error: null }),
              delete: () => ({
                eq: async () => ({ error: null }),
                in: async () => ({ error: null }),
              }),
            };
            return billingMock;
          }
          return {
            select: () => ({
              eq: () => Promise.resolve({ data: [], error: null }),
            }),
            delete: () => ({
              eq: () => Promise.resolve({ error: null }),
              in: () => Promise.resolve({ error: null }),
            }),
          };
        },
        rpc: jest.fn().mockResolvedValue({ data: 'outbox-2', error: null }),
      };

      const app = express();
      app.use('/api/user', createGdprRouter({
        requireAuth: (req, _res, next) => {
          req.user = { id: USER_A };
          next();
        },
        generalLimiter: (_req, _res, next) => next(),
        supabaseAdmin,
        contextDate: () => ({ db: {}, userId: USER_A }),
        profilRepo: {},
      }));

      const res = await request(app).delete('/api/user/delete-account');
      expect(res.status).toBe(200);
      expect(res.body.succes).toBe(true);
    });
  });
});
