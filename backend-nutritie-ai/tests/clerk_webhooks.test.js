'use strict';

const express = require('express');
const request = require('supertest');
const { Webhook } = require('svix');
const createWebhooksRouter = require('../routes/webhooks');

const TEST_SECRET = 'whsec_' + Buffer.from('12345678901234567890123456789012').toString('base64');

/**
 * Client admin Supabase controlabil. Testele nu fac apeluri de rețea reale
 * (înainte, `require('../server')` + supabase real → timeout la localhost:54321).
 * Toate interacțiunile sunt înregistrate în `apeluri` pentru assert.
 */
function creeazaSupabaseAdminFake({ userCreat = { id: 'supabase-user-creat' } } = {}) {
  const apeluri = [];
  const admin = {
    apeluri,
    auth: {
      admin: {
        // external_id valid → același id
        getUserById: async (id) => ({ data: { user: { id } }, error: null }),
        // niciun user preexistent după email în default
        listUsers: async () => ({ data: { users: [] }, error: null }),
        createUser: async (params) => {
          apeluri.push({ tip: 'createUser', params });
          return { data: { user: { id: userCreat.id } }, error: null };
        },
      },
    },
    rpc: async (nume, params) => {
      apeluri.push({ tip: 'rpc', nume, params });
      return { data: [], error: null };
    },
    from(tabela) {
      return {
        select: () => ({
          eq: (col, val) => ({
            maybeSingle: async () => {
              const mapare = apeluri.find(
                (a) => a.tabela === 'clerk_user_map' && a.tip === 'upsert' && a.payload.clerk_user_id === val,
              );
              return { data: mapare ? { supabase_user_id: mapare.payload.supabase_user_id } : null, error: null };
            },
          }),
        }),
        upsert: async (payload, options) => {
          apeluri.push({ tabela, tip: 'upsert', payload, onConflict: options?.onConflict });
          return { error: null };
        },
        update: (payload) => ({
          eq: async (col, val) => {
            apeluri.push({ tabela, tip: 'update', payload, eq: [col, val] });
            return { error: null };
          },
        }),
        delete: () => ({
          eq: async (col, val) => {
            apeluri.push({ tabela, tip: 'delete', eq: [col, val] });
            return { error: null };
          },
        }),
      };
    },
  };
  return admin;
}

/** Generează antetele Svix valide pentru un payload (string JSON exact). */
function semneaza(payload, msgId = 'msg_test_001') {
  const wh = new Webhook(TEST_SECRET);
  const now = new Date();
  return {
    'svix-id': msgId,
    'svix-timestamp': Math.floor(now.getTime() / 1000).toString(),
    'svix-signature': wh.sign(msgId, now, payload),
  };
}

describe('Clerk Webhooks & User Sync Audit', () => {
  let app;
  let admin;

  beforeEach(() => {
    admin = creeazaSupabaseAdminFake();
    app = express();
    app.use('/api/v1/webhooks', createWebhooksRouter({
      supabaseAdmin: admin,
      config: { clerkWebhookSecret: TEST_SECRET, triggerSecretKey: null },
    }));
  });

  test('POST /api/v1/webhooks/clerk fara antete Svix returneaza 400 Bad Request', async () => {
    const res = await request(app)
      .post('/api/v1/webhooks/clerk')
      .send({ type: 'user.created', data: { id: 'user_123' } });

    expect(res.status).toBe(400);
    expect(res.body.eroare).toMatch(/Antete Svix lipsă/i);
  });

  test('POST /api/v1/webhooks/clerk cu semnatura invalida returneaza 401 Unauthorized', async () => {
    const res = await request(app)
      .post('/api/v1/webhooks/clerk')
      .set('svix-id', 'msg_123')
      .set('svix-timestamp', '123456789')
      .set('svix-signature', 'v1,invalid_signature')
      .send({ type: 'user.created', data: { id: 'user_123' } });

    expect(res.status).toBe(401);
    expect(res.body.eroare).toMatch(/Semnătură webhook invalidă/i);
  });

  test('user.created cu external_id valid foloseste acel id', async () => {
    const payload = JSON.stringify({
      type: 'user.created',
      data: {
        id: 'user_clerk_ext',
        external_id: 'auth-user-extern',
        email_addresses: [{ email_address: 'ext@example.com' }],
      },
    });

    const res = await request(app)
      .post('/api/v1/webhooks/clerk')
      .set(semneaza(payload, 'msg_ext'))
      .set('content-type', 'application/json')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const upsertMap = admin.apeluri.find((a) => a.tabela === 'clerk_user_map' && a.tip === 'upsert');
    expect(upsertMap.payload.supabase_user_id).toBe('auth-user-extern');

    const upsertProfil = admin.apeluri.find((a) => a.tabela === 'profil' && a.tip === 'upsert');
    expect(upsertProfil.payload.user_id).toBe('auth-user-extern');
    // Nu se creează un auth user suplimentar
    expect(admin.apeluri.some((a) => a.tip === 'createUser')).toBe(false);
  });

  test('user.created fara external_id creeaza un auth user real (FK satisfacut)', async () => {
    const payload = JSON.stringify({
      type: 'user.created',
      data: {
        id: 'user_clerk_test_123',
        first_name: 'Test',
        last_name: 'User',
        email_addresses: [{ email_address: 'test@example.com' }],
        unsafe_metadata: { calorii_tinta: 2200, proteine_tinta: 160 },
      },
    });

    const res = await request(app)
      .post('/api/v1/webhooks/clerk')
      .set(semneaza(payload, 'msg_created'))
      .set('content-type', 'application/json')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.type).toBe('user.created');

    // A creat auth user-ul real, cu email-ul din Clerk și email_confirm
    const creare = admin.apeluri.find((a) => a.tip === 'createUser');
    expect(creare.params.email).toBe('test@example.com');
    expect(creare.params.email_confirm).toBe(true);

    const upsertMap = admin.apeluri.find((a) => a.tabela === 'clerk_user_map' && a.tip === 'upsert');
    expect(upsertMap.payload.supabase_user_id).toBe('supabase-user-creat');
  });

  test('user.created reutilizeaza maparea existenta (idempotent)', async () => {
    // Simulăm că maparea există deja în baza de date
    admin.apeluri.push({
      tabela: 'clerk_user_map',
      tip: 'upsert',
      payload: { clerk_user_id: 'user_idempotent', supabase_user_id: 'supabase-id-mapat' },
    });

    const payload = JSON.stringify({
      type: 'user.created',
      data: { id: 'user_idempotent', email_addresses: [{ email_address: 'idem@example.com' }] },
    });

    const res = await request(app)
      .post('/api/v1/webhooks/clerk')
      .set(semneaza(payload, 'msg_idem'))
      .set('content-type', 'application/json')
      .send(payload);

    expect(res.status).toBe(200);
    // Nu creează auth user și nu rescrie maparea
    expect(admin.apeluri.some((a) => a.tip === 'createUser')).toBe(false);

    const upsertProfil = admin.apeluri.filter((a) => a.tabela === 'profil' && a.tip === 'upsert');
    expect(upsertProfil[upsertProfil.length - 1].payload.user_id).toBe('supabase-id-mapat');
  });

  test('user.updated actualizeaza profilul utilizatorului mapat', async () => {
    admin.apeluri.push({
      tabela: 'clerk_user_map',
      tip: 'upsert',
      payload: { clerk_user_id: 'user_update', supabase_user_id: 'supabase-id-update' },
    });

    const payload = JSON.stringify({
      type: 'user.updated',
      data: { id: 'user_update', first_name: 'Nou', last_name: 'Nume' },
    });

    const res = await request(app)
      .post('/api/v1/webhooks/clerk')
      .set(semneaza(payload, 'msg_update'))
      .set('content-type', 'application/json')
      .send(payload);

    expect(res.status).toBe(200);
    const update = admin.apeluri.find((a) => a.tabela === 'profil' && a.tip === 'update');
    expect(update.eq).toEqual(['user_id', 'supabase-id-update']);
    expect(update.payload.nume).toBe('Nou Nume');
  });

  test('user.deleted sterge datele utilizatorului mapat', async () => {
    admin.apeluri.push({
      tabela: 'clerk_user_map',
      tip: 'upsert',
      payload: { clerk_user_id: 'user_del', supabase_user_id: 'supabase-id-del' },
    });

    const payload = JSON.stringify({ type: 'user.deleted', data: { id: 'user_del' } });

    const res = await request(app)
      .post('/api/v1/webhooks/clerk')
      .set(semneaza(payload, 'msg_del'))
      .set('content-type', 'application/json')
      .send(payload);

    expect(res.status).toBe(200);
    const sterse = admin.apeluri.filter((a) => a.tip === 'delete');
    expect(sterse.some((a) => a.tabela === 'mese' && a.eq[1] === 'supabase-id-del')).toBe(true);
    expect(sterse.some((a) => a.tabela === 'profil' && a.eq[1] === 'supabase-id-del')).toBe(true);
    expect(sterse.some((a) => a.tabela === 'clerk_user_map' && a.eq[1] === 'user_del')).toBe(true);
  });
});
