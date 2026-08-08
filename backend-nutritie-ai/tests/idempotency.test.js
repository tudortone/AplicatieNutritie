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

  test('#M-04: store degradat (ruta critica) => 503 IDEMPOTENCY_STORE_UNAVAILABLE fara claim', async () => {
    const get = jest.fn(async () => null);
    const setIfAbsent = jest.fn(async () => true);
    const set = jest.fn(async () => {});
    const del = jest.fn(async () => {});
    const registru = { degradat: true, get, set, setIfAbsent, del };
    const middleware = creeazaMiddlewareIdempotenta({ registru, rutaCritica: true });
    const rez = raspunsFals();
    const next = jest.fn();
    await middleware(cerere({ body: { calorii: 100 } }), rez, next);
    expect(rez.statusCode).toBe(503);
    expect(rez.body.cod).toBe('IDEMPOTENCY_STORE_UNAVAILABLE');
    // fail-closed: niciun apel pe stoc nu a fost incercat
    expect(get).not.toHaveBeenCalled();
    expect(setIfAbsent).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test('#M-04: store degradat dar ruta NECRITICA => fail-open, claim inca are loc', async () => {
    const get = jest.fn(async () => null);
    const setIfAbsent = jest.fn(async () => true);
    const set = jest.fn(async () => {});
    const del = jest.fn(async () => {});
    const registru = { degradat: true, get, set, setIfAbsent, del };
    const middleware = creeazaMiddlewareIdempotenta({ registru, rutaCritica: false });
    const rez = raspunsFals();
    const next = jest.fn(() => rez.json({ ok: 1 }));
    await middleware(cerere({ body: { calorii: 100 } }), rez, next);
    expect(setIfAbsent).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('#R2: aceeasi cheie + acelasi user, chiar cu token rotit => replay fara re-executare', async () => {
    const middleware = creeazaMiddlewareIdempotenta({ registru: registruMemorie() });
    const cerereUser = (token) => {
      const c = cerere({ body: { calorii: 100 } });
      return { ...c, user: { id: 'user-1' }, headers: { ...c.headers, authorization: `Bearer ${token}` } };
    };

    const prima = raspunsFals();
    const primaNext = jest.fn(() => prima.json({ succes: true }));
    await middleware(cerereUser('token-vechi'), prima, primaNext);

    const aDoua = raspunsFals();
    const aDouaNext = jest.fn();
    await middleware(cerereUser('token-nou'), aDoua, aDouaNext);

    // Chiar dacă token-ul s-a rotit, cheia stă pe identitatea utilizatorului,
    // deci a doua cerere e un replay, nu o re-executare (altfel → dublu debit).
    expect(aDoua.statusCode).toBe(200);
    expect(aDoua.body).toEqual({ succes: true });
    expect(aDoua.headers['Idempotency-Status']).toBe('replayed');
    expect(aDouaNext).not.toHaveBeenCalled();
    expect(primaNext).toHaveBeenCalledTimes(1);
  });

  test('#R2: raspuns 5xx pastreaza claim-ul failed; retry cu aceeasi cheie => replay 5xx', async () => {
    const middleware = creeazaMiddlewareIdempotenta({ registru: registruMemorie() });

    const prima = raspunsFals();
    const primaNext = jest.fn(() => {
      prima.statusCode = 503;
      prima.json({ eroare: 'AI indisponibil' });
    });
    await middleware(cerere({ body: { calorii: 100 } }), prima, primaNext);

    const aDoua = raspunsFals();
    const aDouaNext = jest.fn();
    await middleware(cerere({ body: { calorii: 100 } }), aDoua, aDouaNext);

    // Eșecul de server se înregistrează ca 'failed' → retry-ul primește replay-ul
    // 5xx, nu o re-executare a handler-ului (care ar debita din nou consuma_credit).
    expect(aDoua.statusCode).toBe(503);
    expect(aDoua.body).toEqual({ eroare: 'AI indisponibil' });
    expect(aDoua.headers['Idempotency-Status']).toBe('replayed');
    expect(aDouaNext).not.toHaveBeenCalled();
    expect(primaNext).toHaveBeenCalledTimes(1);
  });

  test('#R2: global (pre-auth, token) + critic (post-auth, user) => re-cheiere pe user la retry cu token rotit', async () => {
    const registru = registruMemorie();
    const global = creeazaMiddlewareIdempotenta({ registru, rutaCritica: false });
    const critic = creeazaMiddlewareIdempotenta({ registru, rutaCritica: true, permiteMultipart: true });

    // Prima cerere: globalul revendică fără req.user (pre-auth), apoi "requireAuth"
    // populează req.user, iar criticul re-cheie pe identitatea utilizatorului.
    const prima = raspunsFals();
    const primaNext = jest.fn(() => prima.json({ succes: true }));
    const req1 = cerere({ body: { calorii: 100 } });
    await global(req1, prima, () => {
      req1.user = { id: 'user-1' };
      return critic(req1, prima, primaNext);
    });

    // Retry cu token rotit: globalul revendică un namespace nou, dar criticul
    // găsește claim-ul stabil pe user → replay, nu re-executare.
    const aDoua = raspunsFals();
    const aDouaNext = jest.fn();
    const req2 = cerere({ body: { calorii: 100 } });
    req2.headers.authorization = 'Bearer token-nou';
    await global(req2, aDoua, () => {
      req2.user = { id: 'user-1' };
      return critic(req2, aDoua, aDouaNext);
    });

    expect(aDoua.statusCode).toBe(200);
    expect(aDoua.body).toEqual({ succes: true });
    expect(aDoua.headers['Idempotency-Status']).toBe('replayed');
    expect(aDouaNext).not.toHaveBeenCalled();
    expect(primaNext).toHaveBeenCalledTimes(1);
  });
});