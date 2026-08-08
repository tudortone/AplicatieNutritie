'use strict';

/**
 * M-03: Test degradare Redis — când StoreCuRezerva cade pe rezerva locală
 * (MemoryStore, per-proces), totalHits-ul se înmulțește cu INSTANTE_ASTEPTATE,
 * echivalent cu împărțirea bugetului global la numărul de instanțe. Degradarea
 * rămâne grațioasă (nu aruncă), doar pragul efectiv se strânge.
 * L-03: Test throttling unificat — contorPartajat reutilizează logWarnThrottled
 * din storePartajat (o singură implementare, fără duplicat).
 */

const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = rateLimit;
const {
  StoreCuRezerva,
  numarInstanteAsteptate,
  logWarnThrottled,
} = require('../utils/storePartajat');
const { creeazaContorPartajat } = require('../utils/contorPartajat');

const ENV_INSTANTE = 'INSTANTE_ASTEPTATE';
const clientNeconectat = () => ({ isReady: false, on: jest.fn() });

describe('M-03 — degradare Redis: buget împărțit la INSTANTE_ASTEPTATE', () => {
  afterEach(() => {
    delete process.env[ENV_INSTANTE];
  });

  test('numarInstanteAsteptate: lipsă/zero/ne-numeric -> 1 (fără împărțire la 0)', () => {
    delete process.env[ENV_INSTANTE];
    expect(numarInstanteAsteptate()).toBe(1);

    process.env[ENV_INSTANTE] = '0';
    expect(numarInstanteAsteptate()).toBe(1);

    process.env[ENV_INSTANTE] = '-3';
    expect(numarInstanteAsteptate()).toBe(1);

    process.env[ENV_INSTANTE] = 'abc';
    expect(numarInstanteAsteptate()).toBe(1);

    process.env[ENV_INSTANTE] = '4';
    expect(numarInstanteAsteptate()).toBe(4);
  });

  test('increment pe rezervă înmulțește totalHits local cu INSTANTE_ASTEPTATE', async () => {
    process.env[ENV_INSTANTE] = '4';
    const store = new StoreCuRezerva({ client: clientNeconectat(), storeRedis: {} });
    store.storeRezerva.init?.({ windowMs: 60 * 1000 });

    const primul = await store.increment('m3-key');
    expect(primul.totalHits).toBe(4); // 1 local * 4 instanțe
    expect(primul.resetTime).toBeInstanceOf(Date);

    const alDoilea = await store.increment('m3-key');
    expect(alDoilea.totalHits).toBe(8); // 2 local * 4 instanțe

    const alTreilea = await store.increment('m3-key');
    expect(alTreilea.totalHits).toBe(12); // 3 local * 4 instanțe
  });

  test('fără env, degradarea rămâne 1× (default sigur)', async () => {
    delete process.env[ENV_INSTANTE];
    const store = new StoreCuRezerva({ client: clientNeconectat(), storeRedis: {} });
    store.storeRezerva.init?.({ windowMs: 60 * 1000 });

    const rezultat = await store.increment('m3-default');
    expect(rezultat.totalHits).toBe(1);
  });

  test('end-to-end: cu N=4 și max=40, bugetul per instanță devine 10 (al 11-lea e 429)', async () => {
    process.env[ENV_INSTANTE] = '4';
    const store = new StoreCuRezerva({ client: clientNeconectat(), storeRedis: {} });
    const limiter = rateLimit({
      store,
      windowMs: 60 * 1000,
      max: 40,
      keyGenerator: (req) => ipKeyGenerator(req.ip, 64),
      standardHeaders: false,
      legacyHeaders: false,
      handler: (req, res, next) => {
        res.statusCode = 429;
        next();
      },
    });

    const reqPe = (i) => ({ ip: '203.0.113.1', method: 'GET', originalUrl: `/m3-${i}`, headers: {} });
    let blocatLa = 0;
    for (let i = 1; i <= 11; i++) {
      const res = { statusCode: 0, headersSent: false, writableEnded: false };
      let pasat = false;
      const next = () => { pasat = true; };
      await limiter(reqPe(i), res, next);
      if (res.statusCode === 429) blocatLa = i;
      else expect(pasat).toBe(true);
    }
    expect(blocatLa).toBe(11); // 40/4=10 trec; al 11-lea local e blocat
  });

  test('end-to-end: cu N=1 (default), bugetul rămâne 40 (11 cereri trec)', async () => {
    delete process.env[ENV_INSTANTE];
    const store = new StoreCuRezerva({ client: clientNeconectat(), storeRedis: {} });
    const limiter = rateLimit({
      store,
      windowMs: 60 * 1000,
      max: 40,
      keyGenerator: (req) => ipKeyGenerator(req.ip, 64),
      standardHeaders: false,
      legacyHeaders: false,
      handler: (req, res, next) => {
        res.statusCode = 429;
        next();
      },
    });

    const reqPe = (i) => ({ ip: '203.0.113.2', method: 'GET', originalUrl: `/m3-n-${i}`, headers: {} });
    let blocatLa = 0;
    for (let i = 1; i <= 11; i++) {
      const res = { statusCode: 0, headersSent: false, writableEnded: false };
      const next = () => {};
      await limiter(reqPe(i), res, next);
      if (res.statusCode === 429) blocatLa = i;
    }
    expect(blocatLa).toBe(0); // 11 < 40 -> nimic blocat
  });
});

describe('L-03 — throttling de loguri unificat (contorPartajat reutilizează logWarnThrottled)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('logWarnThrottled este throttled per-mesaj (2 apeluri -> 1 console.warn)', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const mesaj = `[test L-03] mesaj unic ${Date.now()}`;
    logWarnThrottled(mesaj);
    logWarnThrottled(mesaj);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(mesaj);
  });

  test('creeazaContorPartajat fără Redis rămâne funcțional (fără avertizare, fără throw)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const contor = creeazaContorPartajat({});
    const valoare = await contor.increment('cheie-l3', 60000);
    expect(valoare).toBe(1);
    expect(warn).not.toHaveBeenCalled();
  });

  test('helperul partajat e expus de storePartajat (unică implementare L-03)', () => {
    expect(typeof logWarnThrottled).toBe('function');
    expect(creeazaContorPartajat({})).toBeDefined();
  });
});
