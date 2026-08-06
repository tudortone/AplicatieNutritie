'use strict';

/**
 * P-01b: Teste webhook RevenueCat — credite AI idempotente.
 */

const express = require('express');
const request = require('supertest');
const createWebhooksRevenueCatRouter = require('../routes/webhooksRevenueCat');
const { CREDIT_AMOUNTS } = require('../routes/webhooksRevenueCat');

const WEBHOOK_SECRET = 'Bearer test-revenuecat-webhook-secret';

function creeazaSupabaseFake({ soldNou = 50, idempotent = false } = {}) {
  const tranzactii = [];
  return {
    tranzactii,
    rpc: jest.fn(async (functie, params) => {
      if (functie === 'aplica_tranzactie_credite') {
        tranzactii.push(params);
        return { data: idempotent ? -1 : soldNou, error: null };
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
          app_user_id: 'user-uuid-123',
          product_id: 'nutri_credits_50',
          price_in_purchased_currency: 4.99,
          currency: 'USD',
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.crediteDelta).toBe(50);
    expect(res.body.soldNou).toBe(50);

    // Verificăm că RPC a fost apelat corect
    expect(admin.rpc).toHaveBeenCalledWith('aplica_tranzactie_credite', expect.objectContaining({
      p_user_id: 'user-uuid-123',
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
        app_user_id: 'user-uuid-456',
        product_id: 'nutri_credits_150',
      },
    };

    // Prima livrare
    const res1 = await request(app)
      .post('/api/v1/webhooks/revenuecat')
      .set('Authorization', WEBHOOK_SECRET)
      .send(payload);

    // A doua livrare (idempotent)
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
      .send({ event: { id: 'x', type: 'INITIAL_PURCHASE', app_user_id: 'u' } });

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
          app_user_id: 'user-uuid-789',
          product_id: 'nutri_credits_50',
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.ignorat).toBe(true);
    // RPC NU a fost apelat (creditele nu se modifică la anulare)
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  test('Produs nerecunoscut → 200 cu avertisment (Clerk nu reîncearcă)', async () => {
    const admin = creeazaSupabaseFake();
    const app = creeazaApp(admin);

    const res = await request(app)
      .post('/api/v1/webhooks/revenuecat')
      .set('Authorization', WEBHOOK_SECRET)
      .send({
        event: {
          id: 'evt_necunoscut_001',
          type: 'INITIAL_PURCHASE',
          app_user_id: 'user-uuid-101',
          product_id: 'produs_inexistent',
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.avertisment).toContain('neconfigurat');
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  test('NON_RENEWING_PURCHASE cu 150 credite', async () => {
    const admin = creeazaSupabaseFake({ soldNou: 150 });
    const app = creeazaApp(admin);

    const res = await request(app)
      .post('/api/v1/webhooks/revenuecat')
      .set('Authorization', WEBHOOK_SECRET)
      .send({
        event: {
          id: 'evt_nonrenew_001',
          type: 'NON_RENEWING_PURCHASE',
          app_user_id: 'user-uuid-202',
          product_id: 'nutri_credits_150',
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.crediteDelta).toBe(150);
    expect(res.body.soldNou).toBe(150);
  });

  test('nutri_credits_150_ios acordă exact 150 credite (nu 50)', async () => {
    const admin = creeazaSupabaseFake({ soldNou: 150 });
    const app = creeazaApp(admin);

    const res = await request(app)
      .post('/api/v1/webhooks/revenuecat')
      .set('Authorization', WEBHOOK_SECRET)
      .send({
        event: {
          id: 'evt_ios_150_001',
          type: 'INITIAL_PURCHASE',
          app_user_id: 'user-uuid-ios-150',
          product_id: 'nutri_credits_150_ios',
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.crediteDelta).toBe(150);
    expect(res.body.soldNou).toBe(150);
  });
});
