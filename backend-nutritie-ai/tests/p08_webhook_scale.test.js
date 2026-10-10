'use strict';

/**
 * P-08: Teste webhook Clerk — scalabilitate, erori permanente/tranzitorii și dead-lettering.
 */

const express = require('express');
const request = require('supertest');
const { Webhook } = require('svix');
const createWebhooksRouter = require('../routes/webhooks');

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
  test('user.created livrat de 3 ori → doar dead-letter idempotent, nicio mutație canonicală', async () => {
    let deadLetterUpsertCount = 0;
    const canonicalWrites = [];
    const admin = {
      from(tabela) {
        return {
          upsert: async (row) => {
            if (tabela === 'clerk_webhook_esuate') deadLetterUpsertCount++;
            else canonicalWrites.push({ tabela, row });
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

    expect(deadLetterUpsertCount).toBe(3);
    expect(canonicalWrites).toEqual([]);
  });

  test('external_id nu permite accesarea sau mutarea unei identități Supabase', async () => {
    const authCalls = [];
    const canonicalWrites = [];
    const admin = {
      auth: {
        admin: {
          getUserById: async (...args) => { authCalls.push(args); return { data: { user: { id: args[0] } }, error: null }; },
        },
      },
      from(tabela) {
        return {
          upsert: async (row) => {
            if (tabela !== 'clerk_webhook_esuate') canonicalWrites.push({ tabela, row });
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
      type: 'user.updated',
      data: { id: 'clerk_spoof', external_id: 'victim-supabase-id', first_name: 'Spoof' },
    });

    const res = await request(app)
      .post('/api/v1/webhooks/clerk')
      .set(semneaza(payload, 'msg_external_id_only'))
      .set('content-type', 'application/json')
      .send(payload);

    expect(res.status).toBe(200);
    expect(authCalls).toEqual([]);
    expect(canonicalWrites).toEqual([]);
  });

  test('dead-letter indisponibil → 500 fără mutații, astfel livrarea poate fi reîncercată', async () => {
    const admin = {
      from(tabela) {
        return {
          upsert: async () => tabela === 'clerk_webhook_esuate'
            ? { error: new Error('Connection lost') }
            : { error: null },
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
    expect(res.body.cod).toBe('DEAD_LETTER_WRITE_FAILED');
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
    expect(res.body.avertisment).toContain('reconciliere');
    expect(dlTabela).toBe('clerk_webhook_esuate');
    expect(dlPayload).toHaveProperty('clerk_user_id', 'user_no_id_determined');
    expect(dlPayload).toHaveProperty('event_type', 'user.created');
    expect(dlPayload).toHaveProperty('motiv', 'CLERK_SYNC_REQUIRES_VERIFIED_ACCOUNT_LINK');
    expect(dlPayload.payload).toEqual({ external_id_present: false });
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

  test('webhooks.js nu creeaza un cont Supabase cu parola aleatoare', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../routes/webhooks.js'),
      'utf8',
    );
    expect(src).not.toContain('auth.admin.createUser');
  });
});
