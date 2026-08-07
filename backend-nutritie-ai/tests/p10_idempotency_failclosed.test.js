'use strict';

/**
 * P-10: Teste idempotență reală pe rutele AI (supertest pe rute reale).
 */

const express = require('express');
const request = require('supertest');
const { creeazaMiddlewareIdempotenta } = require('../utils/idempotency');

jest.mock('../utils/identitate', () => ({
  rezolvaIdentitate: jest.fn(async () => ({
    id: '11111111-1111-4111-8111-111111111111',
    provider: 'supabase',
    expiraLaMs: Date.now() + 60000,
  })),
  EroareIdentitate: class extends Error {},
}));

jest.mock('../services/ai/chat', () => {
  const actual = jest.requireActual('../services/ai/chat');
  return {
    ...actual,
    creeazaServiciuChat: () => ({
      ruleazaChat: jest.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { raspuns: 'OK Chat' };
      }),
    }),
  };
});

describe('P-10 — Idempotență Critică reală pe rute AI', () => {
  let app;
  let registruFake;
  let middlewareCritic;

  beforeEach(() => {
    jest.clearAllMocks();
    const stocare = new Map();
    registruFake = {
      stocare,
      get: jest.fn(async (k) => stocare.get(k) || null),
      set: jest.fn(async (k, v) => stocare.set(k, v)),
      setIfAbsent: jest.fn(async (k, v) => {
        if (stocare.has(k)) return false;
        stocare.set(k, v);
        return true;
      }),
      del: jest.fn(async (k) => stocare.delete(k)),
    };

    middlewareCritic = creeazaMiddlewareIdempotenta({
      registru: registruFake,
      rutaCritica: true,
      permiteMultipart: true,
    });

    const createAiRouter = require('../routes/ai');
    app = express();
    app.use(express.json());
    // P-10: globalul (fail-open) trebuie sa impartaseasca ACELASI registru ca ruta
    // critica. Altfel, atunci cand REDIS_URL e absent, globalul foloseste
    // `registruImplicit` (fallback local că funcționează) și revendica cheia inaintea
    // rutei critice — cazul "registru căzut" (test 3) nu mai ajunge la ruta critica si
    // testul trece ca 200 in loc de 503. Cu un singur registru injectabil, unicul
    // semnal (erupe/store invert cutiar) afecteaza si globalul, ca in productie.
    const middlewareGlobal = creeazaMiddlewareIdempotenta({
      registru: registruFake,
      rutaCritica: false,
      permiteMultipart: false,
    });
    app.use(middlewareGlobal);

    const aiRouter = createAiRouter({
      requireAuth: (req, res, next) => {
        req.user = { id: '11111111-1111-4111-8111-111111111111' };
        next();
      },
      aiLimiter: (req, res, next) => next(),
      generalLimiter: (req, res, next) => next(),
      upload: {
        single: () => (req, res, next) => {
          req.file = { path: 'dummy.jpg', mimetype: 'image/jpeg' };
          next();
        },
      },
      checkAiUsageQuota: (req, res, next) => next(),
      imagekit: null,
      tasks: null,
      config: {
        imagekit: { urlEndpoint: 'https://ik.imagekit.io/test' },
        supabase: { url: 'https://test.supabase.co' },
        ai: { geminiApiKey: 'test' },
      },
      serviciuVision: { detectImageMime: () => 'image/jpeg' },
      serviciuCascada: {},
      serviciuChat: {
        ruleazaChat: async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return { raspuns: 'OK Chat' };
        },
      },
      semaforAi: { ruleaza: async (fn) => fn() },
      idempotencyCritic: middlewareCritic,
    });

    app.use('/api/v1', aiRouter);
  });

  test('1. Două POST-uri concurente pe /api/v1/chat cu aceeași cheie → unul 200, unul 409', async () => {
    const key = 'idem_key_concurent_001';

    const p1 = request(app)
      .post('/api/v1/chat')
      .set('Idempotency-Key', key)
      .send({ mesaj: 'Salut' });

    const p2 = request(app)
      .post('/api/v1/chat')
      .set('Idempotency-Key', key)
      .send({ mesaj: 'Salut' });

    const [res1, res2] = await Promise.all([p1, p2]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([200, 409]);

    const res409 = res1.status === 409 ? res1 : res2;
    expect(res409.body.cod).toBe('IDEMPOTENCY_IN_PROGRESS');
  });

  test('2. /api/v1/analiza-foto (multipart) cu cheie → protejat', async () => {
    const key = 'idem_key_multipart_001';

    const res1 = await request(app)
      .post('/api/v1/analiza-foto')
      .set('Idempotency-Key', key)
      .set('Content-Type', 'multipart/form-data; boundary=----WebKitFormBoundary')
      .send();

    expect(res1.status).not.toBe(404);
    expect(registruFake.setIfAbsent).toHaveBeenCalled();
  });

  test('3. Registru căzut pe /api/v1/chat → 503 IDEMPOTENCY_STORE_UNAVAILABLE', async () => {
    registruFake.get.mockRejectedValue(new Error('Redis connection down'));
    registruFake.setIfAbsent.mockRejectedValue(new Error('Redis connection down'));

    const res = await request(app)
      .post('/api/v1/chat')
      .set('Idempotency-Key', 'key_redis_down')
      .send({ mesaj: 'Test' });

    expect(res.status).toBe(503);
    expect(res.body.cod).toBe('IDEMPOTENCY_STORE_UNAVAILABLE');
  });

  test('4. /api/v1/chat fără Idempotency-Key → trece normal', async () => {
    const res = await request(app)
      .post('/api/v1/chat')
      .send({ mesaj: 'Test fara cheie' });

    expect(res.status).toBe(200);
    expect(res.body.raspuns).toBe('OK Chat');
  });

  test('5. Registru căzut pe /api/v1/chat cu globalul montat → tot 503', async () => {
    registruFake.get.mockRejectedValue(new Error('Redis connection down'));
    registruFake.setIfAbsent.mockRejectedValue(new Error('Redis connection down'));

    const res = await request(app)
      .post('/api/v1/chat')
      .set('Idempotency-Key', 'key_redis_down_global')
      .send({ mesaj: 'Test global down' });

    expect(res.status).toBe(503);
    expect(res.body.cod).toBe('IDEMPOTENCY_STORE_UNAVAILABLE');
  });
});

