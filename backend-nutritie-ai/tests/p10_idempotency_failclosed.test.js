'use strict';

/**
 * P-10: Test idempotență fail-closed pe rute critice reale (AI/plăți).
 */

const request = require('supertest');
const { creeazaMiddlewareIdempotenta } = require('../utils/idempotency');

jest.mock('../utils/identitate', () => ({
  rezolvaIdentitate: jest.fn(async () => ({
    id: '11111111-1111-4111-8111-111111111111',
    provider: 'supabase',
    expiraLaMs: Date.now() + 60000,
  })),
  EroareIdentitate: class extends Error {
    constructor(mesaj, status = 401, cod = 'UNAUTHORIZED') {
      super(mesaj);
      this.status = status;
      this.cod = cod;
    }
  },
}));

jest.mock('../services/ai/chat', () => {
  const actual = jest.requireActual('../services/ai/chat');
  return {
    ...actual,
    serviciuChat: {
      ...actual.serviciuChat,
      ruleazaChat: jest.fn(() => new Promise((resolve) => setTimeout(() => resolve({ raspuns: 'ok' }), 200))),
    },
    creeazaServiciuChat: () => ({
      ruleazaChat: jest.fn(() => new Promise((resolve) => setTimeout(() => resolve({ raspuns: 'ok' }), 200))),
      logFoodDinChat: jest.fn(),
      estimeazaMancareText: jest.fn(),
    }),
  };
});

function fakeReq({ method = 'POST', headers = {}, body = {} } = {}) {
  return {
    method,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body,
    ip: '127.0.0.1',
    originalUrl: '/api/v1/chat',
    path: '/api/v1/chat',
    socket: { remoteAddress: '127.0.0.1' },
  };
}

function fakeRes() {
  const headers = {};
  const res = {
    _status: 200,
    _body: null,
    headers,
    status(code) { res._status = code; return res; },
    json(body) { res._body = body; return res; },
    setHeader(name, value) { headers[name] = value; },
    once() {},
    get statusCode() { return res._status; },
    set statusCode(v) { res._status = v; },
  };
  return res;
}

describe('P-10 — Idempotență fail-closed pe rute critice', () => {
  test('Redis indisponibil pe rută critică → 503 IDEMPOTENCY_STORE_UNAVAILABLE', async () => {
    const registruEsuat = {
      async get() { throw new Error('Redis down'); },
      async set() { throw new Error('Redis down'); },
      async setIfAbsent() { throw new Error('Redis down'); },
      async del() {},
    };

    const middleware = creeazaMiddlewareIdempotenta({
      registru: registruEsuat,
      rutaCritica: true,
    });

    const req = fakeReq({ headers: { 'idempotency-key': 'cheie-test-critica' } });
    const res = fakeRes();
    let nextApelat = false;
    const next = () => { nextApelat = true; };

    await middleware(req, res, next);

    expect(nextApelat).toBe(false);
    expect(res._status).toBe(503);
    expect(res._body?.cod).toBe('IDEMPOTENCY_STORE_UNAVAILABLE');
  });

  test('Redis indisponibil pe rută non-critică → next() (fail-open)', async () => {
    const registruEsuat = {
      async get() { throw new Error('Redis down'); },
      async set() { throw new Error('Redis down'); },
      async setIfAbsent() { throw new Error('Redis down'); },
      async del() {},
    };

    const middleware = creeazaMiddlewareIdempotenta({
      registru: registruEsuat,
      rutaCritica: false,
    });

    const req = fakeReq({ headers: { 'idempotency-key': 'cheie-test-necritica' } });
    const res = fakeRes();
    let nextApelat = false;
    const next = () => { nextApelat = true; };

    await middleware(req, res, next);

    expect(nextApelat).toBe(true);
  });

  test('Idempotency-Key refolosit cu payload diferit → 409 IDEMPOTENCY_KEY_REUSED', async () => {
    const stocat = {};
    const registruFake = {
      async get(key) { return stocat[key] ?? null; },
      async set(key, value) { stocat[key] = value; },
      async setIfAbsent(key, value) {
        if (stocat[key]) return false;
        stocat[key] = value;
        return true;
      },
      async del(key) { delete stocat[key]; },
    };

    const middleware = creeazaMiddlewareIdempotenta({ registru: registruFake });

    const req1 = fakeReq({
      headers: { 'idempotency-key': 'cheie-refolosita' },
      body: { aliment: 'pizza' },
    });
    const res1 = fakeRes();
    let next1 = false;
    await middleware(req1, res1, () => { next1 = true; });
    expect(next1).toBe(true);

    Object.keys(stocat).forEach(k => {
      if (stocat[k] && stocat[k].stare === 'procesare') {
        stocat[k] = { ...stocat[k], stare: 'finalizat', status: 200, body: { succes: true } };
      }
    });

    const req2 = fakeReq({
      headers: { 'idempotency-key': 'cheie-refolosita' },
      body: { aliment: 'burger' },
    });
    const res2 = fakeRes();
    let next2 = false;
    await middleware(req2, res2, () => { next2 = true; });

    expect(next2).toBe(false);
    expect(res2._status).toBe(409);
    expect(res2._body?.cod).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  test('GET trece direct prin middleware (nu aplică idempotency)', async () => {
    const middleware = creeazaMiddlewareIdempotenta({ rutaCritica: true });

    const req = fakeReq({
      method: 'GET',
      headers: { 'idempotency-key': 'orice-cheie' },
    });
    const res = fakeRes();
    let nextApelat = false;
    await middleware(req, res, () => { nextApelat = true; });

    expect(nextApelat).toBe(true);
  });

  test('HTTP Supertest: POST /api/v1/chat cu Idempotency-Key duplicat în procesare → 409 IDEMPOTENCY_IN_PROGRESS', async () => {
    const app = require('../server');
    const cheieUnica = `idem-chat-${Date.now()}-${Math.random()}`;

    // Trimitem 2 cereri concurente identice cu aceeași cheie
    const [res1, res2] = await Promise.all([
      request(app)
        .post('/api/v1/chat')
        .set('Authorization', 'Bearer token_valid_mocked')
        .set('Idempotency-Key', cheieUnica)
        .send({ prompt: 'Salut' }),
      request(app)
        .post('/api/v1/chat')
        .set('Authorization', 'Bearer token_valid_mocked')
        .set('Idempotency-Key', cheieUnica)
        .send({ prompt: 'Salut' }),
    ]);

    const res409 = res1.statusCode === 409 ? res1 : res2;
    expect(res409.statusCode).toBe(409);
    expect(res409.body.cod).toBe('IDEMPOTENCY_IN_PROGRESS');
  });

  test('HTTP Supertest: POST /api/v1/chat (multipart) este protejată de idempotență', async () => {
    const app = require('../server');
    const cheieUnica = `idem-foto-${Date.now()}-${Math.random()}`;

    const [res1, res2] = await Promise.all([
      request(app)
        .post('/api/v1/analiza-foto')
        .set('Authorization', 'Bearer token_valid_mocked')
        .set('Idempotency-Key', cheieUnica)
        .attach('imagine', Buffer.from('fake image content'), 'test.jpg'),
      request(app)
        .post('/api/v1/analiza-foto')
        .set('Authorization', 'Bearer token_valid_mocked')
        .set('Idempotency-Key', cheieUnica)
        .attach('imagine', Buffer.from('fake image content'), 'test.jpg'),
    ]);

    const res409 = res1.statusCode === 409 ? res1 : res2;
    expect(res409.statusCode).toBe(409);
    expect(res409.body.cod).toBe('IDEMPOTENCY_IN_PROGRESS');
  });

  test('HTTP Supertest: POST /api/v1/chat FĂRĂ Idempotency-Key trece normal', async () => {
    const app = require('../server');
    const res = await request(app)
      .post('/api/v1/chat')
      .set('Authorization', 'Bearer token_valid_mocked')
      .send({ prompt: 'Salut' });

    expect(res.statusCode).toBe(200);
    expect(res.body.raspuns).toBe('ok');
  });
});
