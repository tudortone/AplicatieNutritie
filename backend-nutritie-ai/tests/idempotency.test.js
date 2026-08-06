'use strict';

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
  const res = { statusCode: 200, headers: {} };
  res.setHeader = (key, value) => { res.headers[key] = value; };
  res.status = (status) => { res.statusCode = status; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.once = () => {};
  return res;
}

function cerere({ method = 'POST', key = 'cheie-test', body = {}, contentType = 'application/json' } = {}) {
  return {
    method,
    originalUrl: '/api/v1/mese',
    path: '/api/v1/mese',
    body,
    socket: { remoteAddress: '127.0.0.1' },
    headers: {
      authorization: 'Bearer token-test',
      'idempotency-key': key,
      'content-type': contentType,
    },
  };
}

describe('Idempotenta (C-01)', () => {
  test('#13: aceeasi cheie + acelasi payload => replay fara re-executarea handler-ului', async () => {
    const middleware = creeazaMiddlewareIdempotenta({ registru: registruMemorie() });
    const prima = raspunsFals();
    const primaNext = jest.fn(() => prima.json({ succes: true }));
    await middleware(cerere({ body: { calorii: 100 } }), prima, primaNext);

    const aDoua = raspunsFals();
    const aDouaNext = jest.fn();
    await middleware(cerere({ body: { calorii: 100 } }), aDoua, aDouaNext);

    // A doua cerere identica intoarce exact raspunsul inregistrat (replay),
    // fara sa ruleze handler-ul rutei a doua oara.
    expect(aDoua.statusCode).toBe(200);
    expect(aDoua.body).toEqual({ succes: true });
    expect(aDoua.headers['Idempotency-Status']).toBe('replayed');
    expect(aDouaNext).not.toHaveBeenCalled();
    expect(primaNext).toHaveBeenCalledTimes(1);
  });

  test('#chei diferite => fiecare cerere ruleaza independent', async () => {
    const middleware = creeazaMiddlewareIdempotenta({ registru: registruMemorie() });
    const res1 = raspunsFals();
    const res2 = raspunsFals();
    await middleware(cerere({ key: 'cheie-A', body: { calorii: 100 } }), res1, () => res1.json({ id: 1 }));
    await middleware(cerere({ key: 'cheie-B', body: { calorii: 200 } }), res2, () => res2.json({ id: 2 }));
    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
    expect(res1.body).toEqual({ id: 1 });
    expect(res2.body).toEqual({ id: 2 });
  });

  test('#cheie invalida (contine spatiu) => 400', async () => {
    const middleware = creeazaMiddlewareIdempotenta({ registru: registruMemorie() });
    const rez = raspunsFals();
    const next = jest.fn();
    await middleware(cerere({ key: 'cheie cu spatiu' }), rez, next);
    expect(rez.statusCode).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });

  test('#GET trece direct catre handler (idempotenta doar pe POST)', async () => {
    const middleware = creeazaMiddlewareIdempotenta({ registru: registruMemorie() });
    const rez = raspunsFals();
    const next = jest.fn();
    await middleware(cerere({ method: 'GET' }), rez, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('#multipart trece direct catre handler (upload-urile nu sunt idempotente)', async () => {
    const middleware = creeazaMiddlewareIdempotenta({ registru: registruMemorie() });
    const rez = raspunsFals();
    const next = jest.fn();
    await middleware(cerere({ contentType: 'multipart/form-data' }), rez, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});