'use strict';

const { EventEmitter } = require('events');
const { creeazaMiddlewareIdempotenta } = require('../utils/idempotency');

function registruMemorie() {
  const map = new Map();
  return {
    async get(key) { return map.get(key) || null; },
    async set(key, value) { map.set(key, value); },
    async setIfAbsent(key, value) {
      if (map.has(key)) return false;
      map.set(key, value);
      return true;
    },
    async del(key) { map.delete(key); },
  };
}

function raspunsFals() {
  const res = new EventEmitter();
  res.statusCode = 200;
  res.headers = {};
  res.setHeader = (key, value) => { res.headers[key] = value; };
  res.status = (status) => { res.statusCode = status; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

function cerere(body) {
  return {
    method: 'POST',
    originalUrl: '/api/v1/mese',
    body,
    headers: {
      authorization: 'Bearer token-test',
      'idempotency-key': 'cheie-atomica',
      'content-type': 'application/json',
    },
    socket: {},
  };
}

describe('Idempotenta atomica', () => {
  test('nu permite executia concurenta a aceleiasi mutatii', async () => {
    const middleware = creeazaMiddlewareIdempotenta({ registru: registruMemorie() });
    let elibereaza;
    const poarta = new Promise((resolve) => { elibereaza = resolve; });
    const prima = raspunsFals();
    const aDoua = raspunsFals();
    let executii = 0;

    const primaPromisiune = middleware(cerere({ calorii: 12.5 }), prima, async () => {
      executii += 1;
      await poarta;
      return prima.json({ succes: true });
    });
    await new Promise((resolve) => setImmediate(resolve));

    await middleware(cerere({ calorii: 12.5 }), aDoua, () => {
      executii += 1;
    });
    expect(aDoua.statusCode).toBe(409);
    expect(aDoua.body.cod).toBe('IDEMPOTENCY_IN_PROGRESS');
    expect(executii).toBe(1);

    elibereaza();
    await primaPromisiune;
  });

  test('respinge reutilizarea aceleiasi chei cu alt payload', async () => {
    const middleware = creeazaMiddlewareIdempotenta({ registru: registruMemorie() });
    const prima = raspunsFals();
    await middleware(cerere({ calorii: 100 }), prima, () => prima.json({ succes: true }));

    const conflict = raspunsFals();
    await middleware(cerere({ calorii: 200 }), conflict, () => conflict.json({ succes: true }));
    expect(conflict.statusCode).toBe(409);
    expect(conflict.body.cod).toBe('IDEMPOTENCY_KEY_REUSED');
  });
});
