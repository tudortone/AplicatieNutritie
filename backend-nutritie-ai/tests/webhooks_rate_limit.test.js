'use strict';

/**
 * P-012: webhook-urile (Clerk/Svix) trebuie sa fie limitate pe IP. In server.js
 * calea /api/v1/webhooks e montata INAINTE de preAuthLimiter, deci are nevoie de
 * un limitator dedicat. Acest test reproduce exact configurarea din server.js si
 * verifica ca peste prag (600 req/min/IP) cererile primesc 429, sub prag raman
 * pe statusul lor normal (400 — antete Svix lipsa, procesat inainte de verificare).
 */

const express = require('express');
const request = require('supertest');
const rateLimit = require('express-rate-limit');
const { ipFallbackKey } = require('../utils/rateLimit');
const createWebhooksRouter = require('../routes/webhooks');

function creeazaAppCuLimiter() {
  const webhooksLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 600,
    keyGenerator: ipFallbackKey,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === 'OPTIONS',
    message: { eroare: 'Prea multe cereri webhook. Incearca mai tarziu.' },
  });

  const app = express();
  app.use('/api/v1/webhooks', webhooksLimiter);
  app.use('/api/v1/webhooks', createWebhooksRouter({
    supabaseAdmin: {
      auth: {
        admin: {
          getUserById: async () => ({ data: { user: null }, error: null }),
          listUsers: async () => ({ data: { users: [] }, error: null }),
          createUser: async () => ({ data: { user: null }, error: null }),
        },
      },
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        upsert: async () => ({ error: null }),
        update: () => ({ eq: async () => ({ error: null }) }),
        delete: () => ({ eq: async () => ({ error: null }) }),
      }),
    },
    config: { clerkWebhookSecret: 'whsec_test', triggerSecretKey: null },
  }));
  return app;
}

describe('P-012: limite rate-limite webhooks', () => {
  test('sub prag: cererile fara antete Svix primesc normal 400', async () => {
    const app = creeazaAppCuLimiter();
    const res = await request(app).post('/api/v1/webhooks/clerk').send({ type: 'user.created' });
    expect(res.status).toBe(400);
    expect(res.body.eroare).toMatch(/antete svix lip/i);
  });

  test('peste prag (600+/min/IP) primeasa 429', async () => {
    const app = creeazaAppCuLimiter();
    const statusuri = [];
    for (let i = 0; i < 610; i++) {
      const res = await request(app).post('/api/v1/webhooks/clerk').send({ type: 'user.created' });
      statusuri.push(res.status);
    }

    // Primii apar sub prag → 400; cei folosind peste 600 → 429.
    expect(statusuri.filter((s) => s === 400).length).toBeGreaterThan(0);
    const count429 = statusuri.filter((s) => s === 429).length;
    expect(count429).toBeGreaterThan(0);
  });
});