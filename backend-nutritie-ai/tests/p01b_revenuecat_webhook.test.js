'use strict';

/**
 * P-01b: Teste webhook RevenueCat — credite AI idempotente, dead-letter și consum de credite.
 */

const express = require('express');
const request = require('supertest');
const createWebhooksRevenueCatRouter = require('../routes/webhooksRevenueCat');
const { creeazaCheckAiUsageQuota } = require('../utils/aiUsageQuota');

const WEBHOOK_SECRET = 'Bearer test-revenuecat-webhook-secret';

function creeazaSupabaseFake({ soldNou = 50, idempotent = false, clerkMap = {}, mapError = false, rpcFail = false, sold = 0 } = {}) {
  const tranzactii = [];
  const esuate = [];
  return {
    tranzactii,
    esuate,
    from: (tabela) => ({
      select: () => ({
        eq: (col, val) => ({
          maybeSingle: async () => {
            if (mapError) return { data: null, error: new Error('DB connection failed') };
            if (tabela === 'clerk_user_map' && clerkMap[val]) {
              return { data: { supabase_user_id: clerkMap[val] }, error: null };
            }
            if (tabela === 'credite_ai') {
              return { data: { sold }, error: null };
            }
            return { data: null, error: null };
          },
        }),
      }),
      upsert: async (record) => {
        esuate.push(record);
        return { data: record, error: null };
      },
    }),
    rpc: jest.fn(async (functie, params) => {
      if (rpcFail) return { data: null, error: new Error('RPC failure') };
      if (functie === 'aplica_tranzactie_credite') {
        tranzactii.push(params);
        return { data: idempotent ? -1 : soldNou, error: null };
      }
      if (functie === 'consuma_credit') {
        return { data: soldNou, error: null };
      }
      return { data: null, error: null };
    }),
  };
}

function creeazaApp(supabaseAdmin) {
  const app = express();
  app.use('/api/v1/webhooks/revenuecat', createWebhooksRevenueCatRouter({
    supabaseAdmin,
    config: { revenuecat: { webhookSecret: WEBHOOK_SECRET } },
  }));
  return app;
}

describe('P-01b — Webhook RevenueCat credite AI', () => {
  test('INITIAL_PURCHASE → credite acordate corect', async () => {
    const admin = creeazaSupabaseFake({ soldNou: 50 });
    const app = creeazaApp(admin);

    const res = await request(app)
      .post('/api/v1/webhooks/revenuecat')
      .set('Authorization', WEBHOOK_SECRET)
      .send({
        event: {
          id: 'evt_test_001',
          type: 'INITIAL_PURCHASE',
          app_user_id: '11111111-1111-4111-8111-111111111111',
          product_id: 'nutri_credits_50',
          price_in_purchased_currency: 4.99,
          currency: 'USD',
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.crediteDelta).toBe(50);
    expect(res.body.soldNou).toBe(50);

    expect(admin.rpc).toHaveBeenCalledWith('aplica_tranzactie_credite', expect.objectContaining({
      p_user_id: '11111111-1111-4111-8111-111111111111',
      p_event_id: 'evt_test_001',
      p_event_type: 'INITIAL_PURCHASE',
      p_delta: 50,
      p_produs_id: 'nutri_credits_50',
    }));
  });

  test('Același event_id livrat de 2 ori → idempotent (sold creditat o singură dată)', async () => {
    const admin = creeazaSupabaseFake({ idempotent: true });
    const app = creeazaApp(admin);

    const payload = {
      event: {
        id: 'evt_idempotent_001',
        type: 'INITIAL_PURCHASE',
        app_user_id: '22222222-2222-4222-8222-222222222222',
        product_id: 'nutri_credits_150',
      },
    };

    const res1 = await request(app)
      .post('/api/v1/webhooks/revenuecat')
      .set('Authorization', WEBHOOK_SECRET)
      .send(payload);

    const res2 = await request(app)
      .post('/api/v1/webhooks/revenuecat')
      .set('Authorization', WEBHOOK_SECRET)
      .send(payload);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res2.body.idempotent).toBe(true);
  });

  test('Authorization invalidă → 401', async () => {
    const admin = creeazaSupabaseFake();
    const app = creeazaApp(admin);

    const res = await request(app)
      .post('/api/v1/webhooks/revenuecat')
      .set('Authorization', 'Bearer wrong-secret')
      .send({ event: { id: 'x', type: 'INITIAL_PURCHASE', app_user_id: '11111111-1111-4111-8111-111111111111' } });

    expect(res.status).toBe(401);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  test('CANCELLATION → nu modifică creditele', async () => {
    const admin = creeazaSupabaseFake();
    const app = creeazaApp(admin);

    const res = await request(app)
      .post('/api/v1/webhooks/revenuecat')
      .set('Authorization', WEBHOOK_SECRET)
      .send({
        event: {
          id: 'evt_cancel_001',
          type: 'CANCELLATION',
          app_user_id: '33333333-3333-4333-8333-333333333333',
          product_id: 'nutri_credits_50',
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.ignorat).toBe(true);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  test('Produs nerecunoscut → 200 cu avertisment', async () => {
    const admin = creeazaSupabaseFake();
    const app = creeazaApp(admin);

    const res = await request(app)
      .post('/api/v1/webhooks/revenuecat')
      .set('Authorization', WEBHOOK_SECRET)
      .send({
        event: {
          id: 'evt_necunoscut_001',
          type: 'INITIAL_PURCHASE',
          app_user_id: '44444444-4444-4444-8444-444444444444',
          product_id: 'produs_inexistent',
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.avertisment).toContain('neconfigurat');
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(admin.esuate.length).toBe(1);
    expect(admin.esuate[0].motiv).toBe('PRODUCT_NOT_IN_CREDIT_AMOUNTS');
  });

  test('nutri_credits_150_ios acordă exact 150 credite', async () => {
    const admin = creeazaSupabaseFake({ soldNou: 150 });
    const app = creeazaApp(admin);

    const res = await request(app)
      .post('/api/v1/webhooks/revenuecat')
      .set('Authorization', WEBHOOK_SECRET)
      .send({
        event: {
          id: 'evt_ios_150_001',
          type: 'INITIAL_PURCHASE',
          app_user_id: '11111111-1111-4111-8111-111111111111',
          product_id: 'nutri_credits_150_ios',
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.crediteDelta).toBe(150);
    expect(res.body.soldNou).toBe(150);
  });

  test('app_user_id Clerk nemapat încă → 503 USER_NOT_MAPPED_YET + dead-letter', async () => {
    const admin = creeazaSupabaseFake({ clerkMap: {} });
    const app = creeazaApp(admin);

    const res = await request(app)
      .post('/api/v1/webhooks/revenuecat')
      .set('Authorization', WEBHOOK_SECRET)
      .send({
        event: {
          id: 'evt_unmapped_001',
          type: 'INITIAL_PURCHASE',
          app_user_id: 'user_2unmapped',
          product_id: 'nutri_credits_50',
        },
      });

    expect(res.status).toBe(503);
    expect(res.body.cod).toBe('USER_NOT_MAPPED_YET');
    expect(admin.esuate.length).toBe(1);
    expect(admin.esuate[0].motiv).toBe('USER_NOT_MAPPED_YET');
  });

  test('Eroare DB la citire clerk_user_map → 503 USER_MAP_UNAVAILABLE', async () => {
    const admin = creeazaSupabaseFake({ mapError: true });
    const app = creeazaApp(admin);

    const res = await request(app)
      .post('/api/v1/webhooks/revenuecat')
      .set('Authorization', WEBHOOK_SECRET)
      .send({
        event: {
          id: 'evt_dberr_001',
          type: 'INITIAL_PURCHASE',
          app_user_id: 'user_2dberr',
          product_id: 'nutri_credits_50',
        },
      });

    expect(res.status).toBe(503);
    expect(res.body.cod).toBe('USER_MAP_UNAVAILABLE');
  });

  test('Consum de credite înaintea cotei zilnice în checkAiUsageQuota', async () => {
    const admin = creeazaSupabaseFake({ soldNou: 4 });
    // Clientul admin se injectează prin constructor (ca în server.js:158) — `req.supabaseAdmin`
    // a fost o ramură moartă, eliminată (L2). Testul verifică aceeași comportare: creditul
    // plătit se consumă înaintea cotei zilnice gratuite.
    const checkQuota = creeazaCheckAiUsageQuota({ supabaseAdmin: admin });

    const req = {
      user: { id: '11111111-1111-4111-8111-111111111111' },
    };
    const res = {
      headers: {},
      setHeader(k, v) { this.headers[k] = v; },
    };
    let nextCalled = false;
    await checkQuota(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
    expect(res.headers['X-Credite-Ramase']).toBe('4');
    expect(admin.rpc).toHaveBeenCalledWith('consuma_credit', expect.objectContaining({
      p_user_id: '11111111-1111-4111-8111-111111111111',
      p_cost: 1,
    }));
  });

  test('#H2: REFUND → revoca creditele pachetului (delta negativ)', async () => {
    const admin = creeazaSupabaseFake({ sold: 50 });
    const app = creeazaApp(admin);

    const res = await request(app)
      .post('/api/v1/webhooks/revenuecat')
      .set('Authorization', WEBHOOK_SECRET)
      .send({
        event: {
          id: 'evt_refund_001',
          type: 'REFUND',
          app_user_id: '55555555-5555-4555-8555-555555555555',
          product_id: 'nutri_credits_50',
          price_in_purchased_currency: 4.99,
          currency: 'USD',
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.crediteDelta).toBe(-50);
    expect(admin.rpc).toHaveBeenCalledWith('aplica_tranzactie_credite', expect.objectContaining({
      p_user_id: '55555555-5555-4555-8555-555555555555',
      p_event_type: 'REFUND',
      p_delta: -50,
      p_produs_id: 'nutri_credits_50',
    }));
  });

  test('#H2: REFUND cu pachet partial consumat → revoca doar restul', async () => {
    const admin = creeazaSupabaseFake({ sold: 20 });
    const app = creeazaApp(admin);

    const res = await request(app)
      .post('/api/v1/webhooks/revenuecat')
      .set('Authorization', WEBHOOK_SECRET)
      .send({
        event: {
          id: 'evt_refund_partial_001',
          type: 'REFUND',
          app_user_id: '55555555-5555-4555-8555-555555555555',
          product_id: 'nutri_credits_150',
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.crediteDelta).toBe(-20);
    expect(admin.rpc).toHaveBeenCalledWith('aplica_tranzactie_credite', expect.objectContaining({
      p_event_type: 'REFUND',
      p_delta: -20,
    }));
  });

  test('#H2: REFUND cu sold 0 → nimic de revocat, fara RPC', async () => {
    const admin = creeazaSupabaseFake({ sold: 0 });
    const app = creeazaApp(admin);

    const res = await request(app)
      .post('/api/v1/webhooks/revenuecat')
      .set('Authorization', WEBHOOK_SECRET)
      .send({
        event: {
          id: 'evt_refund_zero_001',
          type: 'REFUND',
          app_user_id: '55555555-5555-4555-8555-555555555555',
          product_id: 'nutri_credits_50',
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.crediteDelta).toBe(0);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  test('#M7: event SANDBOX → ignorat, fara creditare', async () => {
    const admin = creeazaSupabaseFake();
    const app = creeazaApp(admin);

    const res = await request(app)
      .post('/api/v1/webhooks/revenuecat')
      .set('Authorization', WEBHOOK_SECRET)
      .send({
        event: {
          id: 'evt_sandbox_001',
          type: 'INITIAL_PURCHASE',
          environment: 'SANDBOX',
          app_user_id: '55555555-5555-4555-8555-555555555555',
          product_id: 'nutri_credits_50',
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.ignorat).toBe(true);
    expect(res.body.motiv).toBe('ENVIRONMENT_SANDBOX');
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  test('#M6: INITIAL + NON_RENEWING cu acelasi transaction_id → cheie derivata comuna', async () => {
    const admin = creeazaSupabaseFake({ idempotent: true });
    const app = creeazaApp(admin);

    const payloadInit = {
      event: {
        id: 'evt_init_tx',
        type: 'INITIAL_PURCHASE',
        transaction_id: 'txn_abc123',
        app_user_id: '66666666-6666-4666-8666-666666666666',
        product_id: 'nutri_credits_50',
      },
    };
    const payloadNrr = {
      event: {
        id: 'evt_nrr_tx',
        type: 'NON_RENEWING_PURCHASE',
        transaction_id: 'txn_abc123',
        app_user_id: '66666666-6666-4666-8666-666666666666',
        product_id: 'nutri_credits_50',
      },
    };

    const res1 = await request(app)
      .post('/api/v1/webhooks/revenuecat')
      .set('Authorization', WEBHOOK_SECRET)
      .send(payloadInit);
    const res2 = await request(app)
      .post('/api/v1/webhooks/revenuecat')
      .set('Authorization', WEBHOOK_SECRET)
      .send(payloadNrr);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res2.body.idempotent).toBe(true);

    // Ambele event-uri mapează pe aceeași cheie derivată din tranzacție, deci
    // UNIQUE-ul din DB (soldNou === -1) anulează dubla creditare.
    const apeluri = admin.rpc.mock.calls.filter(([functie]) => functie === 'aplica_tranzactie_credite');
    expect(apeluri).toHaveLength(2);
    expect(apeluri[0][1].p_event_id).toBe('grant:txn_abc123');
    expect(apeluri[1][1].p_event_id).toBe('grant:txn_abc123');
  });

  test('#L5: secret fara prefix Bearer in config, header cu prefix → acceptat', async () => {
    const admin = creeazaSupabaseFake({ soldNou: 50 });
    const app = express();
    app.use('/api/v1/webhooks/revenuecat', createWebhooksRevenueCatRouter({
      supabaseAdmin: admin,
      config: { revenuecat: { webhookSecret: 'test-revenuecat-webhook-secret' } },
    }));

    const res = await request(app)
      .post('/api/v1/webhooks/revenuecat')
      .set('Authorization', 'Bearer test-revenuecat-webhook-secret')
      .send({
        event: {
          id: 'evt_bearer_001',
          type: 'INITIAL_PURCHASE',
          app_user_id: '11111111-1111-4111-8111-111111111111',
          product_id: 'nutri_credits_50',
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
