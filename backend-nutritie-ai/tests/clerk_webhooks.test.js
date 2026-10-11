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
          apeluri.push({ tabela, tip: 'upsert', payload, onConflict: options?.onConflict, ignoreDuplicates: options?.ignoreDuplicates });
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

  test('eveniment semnat fara identificator Clerk esueaza inchis fara scrieri', async () => {
    const payload = JSON.stringify({ type: 'user.deleted', data: { external_id: 'victim-id' } });
    const res = await request(app)
      .post('/api/v1/webhooks/clerk')
      .set(semneaza(payload, 'msg_missing_identity'))
      .set('content-type', 'application/json')
      .send(payload);

    expect(res.status).toBe(400);
    expect(admin.apeluri).toEqual([]);
  });

  test('user.created nu stabileste asocierea nici cand external_id indica un user existent', async () => {
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
    expect(res.body.ok).toBe(false);
    expect(admin.apeluri.some((a) => a.tabela === 'clerk_user_map' || a.tabela === 'profil')).toBe(false);
    expect(admin.apeluri.some((a) => a.tip === 'createUser')).toBe(false);
  });

  test('user.created fara external_id nu revendica emailul si nu creeaza alt cont', async () => {
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
    expect(res.body.ok).toBe(false);
    expect(res.body.type).toBe('user.created');
    expect(admin.apeluri.some((a) => a.tip === 'createUser' || a.tip === 'rpc')).toBe(false);
    expect(admin.apeluri.some((a) => a.tabela === 'clerk_user_map' && a.tip === 'upsert')).toBe(false);
    expect(admin.apeluri.some((a) => a.tabela === 'profil' && a.tip === 'upsert')).toBe(false);
  });

  test('user.created nu modifica profilul unui utilizator cu mapare legacy', async () => {
    // Simulăm că maparea există deja în baza de date
    admin.apeluri.push({
      tabela: 'clerk_user_map',
      tip: 'upsert',
      payload: { clerk_user_id: 'user_idempotent', supabase_user_id: 'supabase-id-mapat' },
    });

    const payload = JSON.stringify({
      type: 'user.created',
      data: { id: 'user_idempotent', external_id: 'supabase-id-mapat', email_addresses: [{ email_address: 'idem@example.com' }] },
    });

    const res = await request(app)
      .post('/api/v1/webhooks/clerk')
      .set(semneaza(payload, 'msg_idem'))
      .set('content-type', 'application/json')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(admin.apeluri.some((a) => a.tip === 'createUser')).toBe(false);
    expect(admin.apeluri.some((a) => a.tabela === 'profil')).toBe(false);
  });

  test('user.updated nu modifica un profil mapat chiar daca external_id coincide', async () => {
    admin.apeluri.push({
      tabela: 'clerk_user_map',
      tip: 'upsert',
      payload: { clerk_user_id: 'user_update', supabase_user_id: 'supabase-id-update' },
    });

    const payload = JSON.stringify({
      type: 'user.updated',
      data: { id: 'user_update', external_id: 'supabase-id-update', first_name: 'Nou', last_name: 'Nume' },
    });

    const res = await request(app)
      .post('/api/v1/webhooks/clerk')
      .set(semneaza(payload, 'msg_update'))
      .set('content-type', 'application/json')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(admin.apeluri.some((a) => a.tabela === 'profil')).toBe(false);
  });

  test('user.updated replayed nu produc mutatii repetate', async () => {
    const payload = JSON.stringify({
      type: 'user.updated',
      data: { id: 'user_replay', external_id: 'victim-id', first_name: 'Spoofed' },
    });
    const send = () => request(app).post('/api/v1/webhooks/clerk')
      .set(semneaza(payload, 'msg_replay'))
      .set('content-type', 'application/json').send(payload);

    const first = await send();
    const replay = await send();
    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(admin.apeluri.some((a) => ['clerk_user_map', 'profil'].includes(a.tabela))).toBe(false);
    expect(admin.apeluri.some((a) => a.tip === 'delete')).toBe(false);
  });

  test('user.deleted nu poate sterge datele Supabase chiar daca external_id coincide', async () => {
    admin.apeluri.push({
      tabela: 'clerk_user_map',
      tip: 'upsert',
      payload: { clerk_user_id: 'user_del', supabase_user_id: 'supabase-id-del' },
    });

    const payload = JSON.stringify({ type: 'user.deleted', data: { id: 'user_del', external_id: 'supabase-id-del' } });

    const res = await request(app)
      .post('/api/v1/webhooks/clerk')
      .set(semneaza(payload, 'msg_del'))
      .set('content-type', 'application/json')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    const sterse = admin.apeluri.filter((a) => a.tip === 'delete');
    expect(sterse).toEqual([]);
    expect(admin.apeluri.some((a) => a.tabela === 'clerk_webhook_esuate' && a.payload.motiv === 'CLERK_DELETE_NOT_SUPABASE_AUTHORITY')).toBe(true);
  });

  test.each(['user.created', 'user.updated', 'user.deleted'])(
    '%s nu poate modifica sau sterge contul mapat cand external_id nu corespunde',
    async (type) => {
      admin.apeluri.push({
        tabela: 'clerk_user_map', tip: 'upsert',
        payload: { clerk_user_id: 'user_mismatch', supabase_user_id: 'victim-id' },
      });
      const payload = JSON.stringify({
        type,
        data: { id: 'user_mismatch', external_id: 'different-id', first_name: 'Wrong' },
      });
      const res = await request(app).post('/api/v1/webhooks/clerk')
        .set(semneaza(payload, `msg_mismatch_${type}`))
        .set('content-type', 'application/json').send(payload);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(false);
      expect(admin.apeluri.some((a) => a.tabela === 'profil' && ['upsert', 'update', 'delete'].includes(a.tip))).toBe(false);
      expect(admin.apeluri.some((a) => a.tip === 'delete')).toBe(false);
    },
  );
});
