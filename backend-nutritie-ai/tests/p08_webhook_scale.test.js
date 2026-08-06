'use strict';

/**
 * P-08: Test webhook Clerk rezistent la >1000 utilizatori.
 *
 * Verifică că:
 * 1. La >1000 utilizatori, RPC get_auth_user_by_email e apelat (nu listUsers)
 * 2. Același eveniment livrat de 3 ori → o singură înregistrare, 3× răspuns 200
 * 3. La eroarea "email already exists", returnăm 200 (nu 500) → Clerk nu reîncearcă infinit
 * 4. require('crypto') explicit (P-21) — nu globalul Node
 */

const express = require('express');
const request = require('supertest');
const { Webhook } = require('svix');
const createWebhooksRouter = require('../routes/webhooks');
const { determinareSauCreareSupabaseUser } = require('../routes/webhooks');

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
  // -----------------------------------------------------------------------
  // Test 1: RPC get_auth_user_by_email e apelat în loc de listUsers(1000)
  // -----------------------------------------------------------------------
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
          createUser: async (params) => ({
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
    // listUsers NU trebuie apelat (P-08 fix)
    expect(listUsersApeluri.length).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Test 2: Același eveniment livrat de 3 ori → o singură înregistrare, 3× 200
  // -----------------------------------------------------------------------
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
            eq: (col, val) => ({
              maybeSingle: async () => {
                // Simulăm că prima dată nu există mapare, apoi există
                if (tabela === 'clerk_user_map' && upsertCount > 0) {
                  return { data: { supabase_user_id: 'id-mapat' }, error: null };
                }
                return { data: null, error: null };
              },
            }),
          }),
          upsert: async (payload) => {
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

    // Livrăm de 3 ori (Clerk retry behavior)
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post('/api/v1/webhooks/clerk')
        .set(semneaza(payload, `msg_idem_p08_${i}`))
        .set('content-type', 'application/json')
        .send(payload);
      // P-08: întotdeauna 200
      expect(res.status).toBe(200);
    }

    // Maparea a fost creată o singură dată (prima livrare)
    expect(upsertCount).toBe(1);
  });

  // -----------------------------------------------------------------------
  // Test 3: "Email already exists" → 200 (nu 500), Clerk nu reîncearcă infinit
  // -----------------------------------------------------------------------
  test('user.created cu email deja existent returnează 200, nu 500', async () => {
    const admin = {
      auth: {
        admin: {
          getUserById: async () => ({ data: null, error: new Error('not found') }),
          listUsers: async () => ({ data: { users: [] }, error: null }),
          createUser: async () => ({
            data: null,
            error: { code: '23505', message: 'User already exists' },
          }),
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
        id: 'user_email_existent',
        email_addresses: [{ email_address: 'existent@example.com' }],
      },
    });

    const res = await request(app)
      .post('/api/v1/webhooks/clerk')
      .set(semneaza(payload, 'msg_existent'))
      .set('content-type', 'application/json')
      .send(payload);

    // P-08: 200 (nu 500) — Clerk nu reîncearcă infinit
    expect(res.status).toBe(200);
  });

  // -----------------------------------------------------------------------
  // Test 4: P-21 — require('crypto') explicit
  // -----------------------------------------------------------------------
  test('P-21 — webhooks.js importă crypto explicit (nu global)', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../routes/webhooks.js'),
      'utf8',
    );
    expect(src).toContain("require('crypto')");
    // Nu se folosește crypto.randomUUID() fără import
    const liniiRandomUUID = src.split('\n')
      .filter(l => l.includes('crypto.randomUUID') && !l.startsWith('//') && !l.startsWith(' *'));
    // Toate apelurile la crypto.randomUUID presupun importul explicit
    const areImport = src.includes("const crypto = require('crypto')");
    if (liniiRandomUUID.length > 0) {
      expect(areImport).toBe(true);
    }
  });
});
