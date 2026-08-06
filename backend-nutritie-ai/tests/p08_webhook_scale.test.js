'use strict';

/**
 * P-08: Teste webhook Clerk — scalabilitate, erori permanente/tranzitorii și dead-lettering.
 */

const express = require('express');
const request = require('supertest');
const { Webhook } = require('svix');
const createWebhooksRouter = require('../routes/webhooks');
const { determinareSauCreareSupabaseUser, EroareTranzitorie } = require('../routes/webhooks');

const TEST_SECRET = 'whsec_' + Buffer.from('12345678901234567890123456789012').toString('base64');

function semneaza(payload, msgId = 'msg_test_p08') {
  const wh = new Webhook(TEST_SECRET);
  const now = new Date();
  return {
    'svix-id': msgId,
    'svix-timestamp': Math.floor(now.getTime() / 1000).toString(),
    'svix-signature': wh.sign(msgId, now, payload),
  };
}

describe('P-08 — Webhook Clerk rezistent la >1000 utilizatori', () => {
  test('determinareSauCreareSupabaseUser apelează RPC, nu listUsers paginat', async () => {
    const rpcApeluri = [];
    const listUsersApeluri = [];

    const supabaseAdminFake = {
      auth: {
        admin: {
          getUserById: async () => ({ data: null, error: new Error('not found') }),
          listUsers: async () => {
            listUsersApeluri.push('listUsers');
            return { data: { users: [] }, error: null };
          },
          createUser: async () => ({
            data: { user: { id: 'nou-id-creat' } },
            error: null,
          }),
        },
      },
      rpc: async (nume, params) => {
        if (nume === 'get_auth_user_by_email') {
          rpcApeluri.push(params);
          return { data: [{ id: 'gasit-prin-rpc', email: params.p_email }], error: null };
        }
        return { data: null, error: null };
      },
    };

    const rezultat = await determinareSauCreareSupabaseUser({
      supabaseAdmin: supabaseAdminFake,
      externalId: null,
      email: 'test@example.com',
    });

    expect(rezultat).toBe('gasit-prin-rpc');
    expect(rpcApeluri.length).toBe(1);
    expect(rpcApeluri[0].p_email).toBe('test@example.com');
    expect(listUsersApeluri.length).toBe(0);
  });

  test('user.created livrat de 3 ori → idempotent (3× 200, o singură mapare)', async () => {
    let upsertCount = 0;
    const admin = {
      auth: {
        admin: {
          getUserById: async (id) => ({ data: { user: { id } }, error: null }),
          listUsers: async () => ({ data: { users: [] }, error: null }),
          createUser: async () => ({ data: { user: { id: 'creat-id' } }, error: null }),
        },
      },
      rpc: async () => ({ data: [], error: null }),
      from(tabela) {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => {
                if (tabela === 'clerk_user_map' && upsertCount > 0) {
                  return { data: { supabase_user_id: 'id-mapat' }, error: null };
                }
                return { data: null, error: null };
              },
            }),
          }),
          upsert: async () => {
            if (tabela === 'clerk_user_map') upsertCount++;
            return { error: null };
          },
        };
      },
    };

    const app = express();
    app.use('/api/v1/webhooks', createWebhooksRouter({
      supabaseAdmin: admin,
      config: { clerkWebhookSecret: TEST_SECRET, triggerSecretKey: null },
    }));

    const payload = JSON.stringify({
      type: 'user.created',
      data: {
        id: 'user_idempotent_p08',
        external_id: 'supabase-extern-id',
        email_addresses: [{ email_address: 'idem@example.com' }],
      },
    });

    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post('/api/v1/webhooks/clerk')
        .set(semneaza(payload, `msg_idem_p08_${i}`))
        .set('content-type', 'application/json')
        .send(payload);
      expect(res.status).toBe(200);
    }

    expect(upsertCount).toBe(1);
  });

  test('Eroare permanentă 23503 → 200 cu avertisment', async () => {
    const admin = {
      auth: {
        admin: {
          getUserById: async (id) => ({ data: { user: { id } }, error: null }),
          listUsers: async () => ({ data: { users: [] }, error: null }),
          createUser: async () => ({ data: { user: { id: 'creat' } }, error: null }),
        },
      },
      rpc: async () => ({ data: [{ id: 'user_id_valid' }], error: null }),
      from(tabela) {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
          upsert: async (payload) => {
            if (tabela === 'profil') {
              const err = new Error('foreign key constraint violation');
              err.code = '23503';
              throw err;
            }
            return { error: null };
          },
        };
      },
    };

    const app = express();
    app.use('/api/v1/webhooks', createWebhooksRouter({
      supabaseAdmin: admin,
      config: { clerkWebhookSecret: TEST_SECRET, triggerSecretKey: null },
    }));

    const payload = JSON.stringify({
      type: 'user.created',
      data: {
        id: 'user_fk_err',
        external_id: 'sub_123',
        email_addresses: [{ email_address: 'fk@example.com' }],
      },
    });

    const res = await request(app)
      .post('/api/v1/webhooks/clerk')
      .set(semneaza(payload, 'msg_fk_err'))
      .set('content-type', 'application/json')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.avertisment).toContain('Eroare permanentă');
  });

  test('Eroare tranzitorie de rețea/DB → 500 pentru retry Clerk', async () => {
    const admin = {
      auth: {
        admin: {
          getUserById: async () => ({ data: null, error: new Error('not found') }),
          listUsers: async () => ({ data: { users: [] }, error: null }),
          createUser: async () => ({ data: null, error: null }),
        },
      },
      rpc: async () => ({ data: [], error: null }),
      from() {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => {
                throw new Error('Connection lost');
              },
            }),
          }),
          upsert: async () => ({ error: null }),
        };
      },
    };

    const app = express();
    app.use('/api/v1/webhooks', createWebhooksRouter({
      supabaseAdmin: admin,
      config: { clerkWebhookSecret: TEST_SECRET, triggerSecretKey: null },
    }));

    const payload = JSON.stringify({
      type: 'user.created',
      data: {
        id: 'user_net_err',
        email_addresses: [{ email_address: 'net@example.com' }],
      },
    });

    const res = await request(app)
      .post('/api/v1/webhooks/clerk')
      .set(semneaza(payload, 'msg_net_err'))
      .set('content-type', 'application/json')
      .send(payload);

    expect(res.status).toBe(500);
    expect(res.body.eroare).toContain('Eroare tranzitorie');
  });

  test('Supabase căzut în determinareSauCreareSupabaseUser → aruncă EroareTranzitorie → 500', async () => {
    const adminFake = {
      auth: {
        admin: {
          getUserById: async () => { throw new Error('Timeout 504'); },
          listUsers: async () => { throw new Error('Timeout 504'); },
          createUser: async () => { throw new Error('Timeout 504'); },
        },
      },
      rpc: async () => { throw new Error('Timeout 504'); },
    };

    await expect(determinareSauCreareSupabaseUser({
      supabaseAdmin: adminFake,
      externalId: 'ext_1',
      email: 't@example.com',
    })).rejects.toThrow(EroareTranzitorie);
  });

  test('Scriere rând în clerk_webhook_esuate (dead-letter) când userId este nedeterminat', async () => {
    let dlTabela = null;
    let dlPayload = null;
    const admin = {
      auth: {
        admin: {
          getUserById: async () => ({ data: null, error: null }),
          listUsers: async () => ({ data: { users: [] }, error: null }),
          createUser: async () => ({ data: null, error: null }),
        },
      },
      rpc: async () => ({ data: [], error: null }),
      from(tabela) {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
          upsert: async (record) => {
            if (tabela === 'clerk_webhook_esuate') {
              dlTabela = tabela;
              dlPayload = record;
            }
            return { error: null };
          },
        };
      },
    };

    const app = express();
    app.use('/api/v1/webhooks', createWebhooksRouter({
      supabaseAdmin: admin,
      config: { clerkWebhookSecret: TEST_SECRET, triggerSecretKey: null },
    }));

    const payload = JSON.stringify({
      type: 'user.created',
      data: {
        id: 'user_no_id_determined',
      },
    });

    const res = await request(app)
      .post('/api/v1/webhooks/clerk')
      .set(semneaza(payload, 'msg_noid'))
      .set('content-type', 'application/json')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.avertisment).toContain('intervenție manuală');
    expect(dlTabela).toBe('clerk_webhook_esuate');
    expect(dlPayload).toHaveProperty('clerk_user_id', 'user_no_id_determined');
    expect(dlPayload).toHaveProperty('event_type', 'user.created');
    expect(dlPayload).toHaveProperty('motiv', 'USER_ID_NEDETERMINAT');
    expect(dlPayload).toHaveProperty('created_at');
    expect(dlPayload).toHaveProperty('updated_at');
  });

  test('Când scrierea în clerk_webhook_esuate eșuează → 500 cu cod DEAD_LETTER_WRITE_FAILED', async () => {
    const admin = {
      auth: {
        admin: {
          getUserById: async () => ({ data: null, error: null }),
          listUsers: async () => ({ data: { users: [] }, error: null }),
          createUser: async () => ({ data: null, error: null }),
        },
      },
      rpc: async () => ({ data: [], error: null }),
      from(tabela) {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
          upsert: async () => {
            if (tabela === 'clerk_webhook_esuate') {
              return { error: new Error('DB write failed') };
            }
            return { error: null };
          },
        };
      },
    };

    const app = express();
    app.use('/api/v1/webhooks', createWebhooksRouter({
      supabaseAdmin: admin,
      config: { clerkWebhookSecret: TEST_SECRET, triggerSecretKey: null },
    }));

    const payload = JSON.stringify({
      type: 'user.created',
      data: {
        id: 'user_no_id_determined_fail',
      },
    });

    const res = await request(app)
      .post('/api/v1/webhooks/clerk')
      .set(semneaza(payload, 'msg_noid_fail'))
      .set('content-type', 'application/json')
      .send(payload);

    expect(res.status).toBe(500);
    expect(res.body.cod).toBe('DEAD_LETTER_WRITE_FAILED');
  });

  test('P-21 — webhooks.js importă crypto explicit', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../routes/webhooks.js'),
      'utf8',
    );
    expect(src).toContain("require('crypto')");
  });
});
