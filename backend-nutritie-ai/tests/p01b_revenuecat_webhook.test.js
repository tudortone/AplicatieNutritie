'use strict';

/**
 * P-01b: Teste webhook RevenueCat — credite AI idempotente, dead-letter și consum de credite.
 */

const express = require('express');
const request = require('supertest');
const createWebhooksRevenueCatRouter = require('../routes/webhooksRevenueCat');
const { creeazaCheckAiUsageQuota } = require('../utils/aiUsageQuota');

const WEBHOOK_SECRET = 'Bearer test-revenuecat-webhook-secret';

function creeazaSupabaseFake({ soldNou = 50, idempotent = false, clerkMap = {}, mapError = false, rpcFail = false } = {}) {
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
    const checkQuota = creeazaCheckAiUsageQuota();

    const req = {
      user: { id: '11111111-1111-4111-8111-111111111111' },
      supabaseAdmin: admin,
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
});
