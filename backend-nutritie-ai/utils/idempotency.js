'use strict';

/**
 * P-10: Idempotență fail-closed pe rutele critice.
 *
 * PROBLEMA (P-10): `catch { return next(); }` — când Redis pică, protecția
 * dispare complet și tăcut. Pe o rută de plată sau de scanare AI, asta înseamnă
 * dublă execuție.
 *
 * FIX: Fail-closed pe rutele critice (AI, plăți) — 503.
 * Fail-open rămâne acceptabil doar pe rute idempotente prin natura lor (GET).
 *
 * API: `creeazaMiddlewareIdempotenta({ rutaCritica: true })` pentru rutele
 * unde o dublă execuție are consecințe reale (AI, plăți).
 */

const crypto = require('crypto');
const { creeazaRegistruCheiValori } = require('./storePartajat');

const TTL_MS = 15 * 60 * 1000;
const registruImplicit = creeazaRegistruCheiValori({
  url: process.env.REDIS_URL,
  prefix: 'nutri:idem',
});

const hash = (valoare) => crypto
  .createHash('sha256')
  .update(String(valoare))
  .digest('hex');

function namespaceCerere(req) {
  const autorizare = req.headers.authorization;
  if (typeof autorizare === 'string' && autorizare.startsWith('Bearer ')) {
    return `token:${hash(autorizare.slice(7))}`;
  }
  const ip = req.ip || req.socket?.remoteAddress || 'necunoscut';
  return `anon:${hash(`${ip}:${req.headers['user-agent'] || ''}`)}`;
}

function construiesteCheie(req, idempotencyKey) {
  const cale = String(req.originalUrl || req.path || '').split('?')[0];
  return `${namespaceCerere(req)}:${req.method}:${hash(cale)}:${hash(idempotencyKey)}`;
}

function serializeazaStabil(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (seen.has(value)) throw new TypeError('Corpul cererii contine o referinta circulara.');
  seen.add(value);
  let rezultat;
  if (Array.isArray(value)) {
    rezultat = `[${value.map((item) => serializeazaStabil(item, seen)).join(',')}]`;
  } else {
    const chei = Object.keys(value).sort();
    rezultat = `{${chei.map((cheie) => `${JSON.stringify(cheie)}:${serializeazaStabil(value[cheie], seen)}`).join(',')}}`;
  }
  seen.delete(value);
  return rezultat;
}

function amprentaCerere(req) {
  const cale = String(req.originalUrl || req.path || '');
  return hash(serializeazaStabil({ method: req.method, cale, body: req.body ?? null }));
}

function raspundeDinRegistru(res, existent, amprenta) {
  if (!existent) return false;

  if (existent.amprenta && existent.amprenta !== amprenta) {
    res.status(409).json({
      eroare: 'Idempotency-Key a fost reutilizat cu un payload diferit.',
      cod: 'IDEMPOTENCY_KEY_REUSED',
    });
    return true;
  }

  if (existent.stare === 'procesare') {
    res.setHeader?.('Retry-After', '1');
    res.status(409).json({
      eroare: 'O cerere cu acest Idempotency-Key este deja in curs.',
      cod: 'IDEMPOTENCY_IN_PROGRESS',
    });
    return true;
  }

  if (
    (existent.stare === 'finalizat' || existent.stare === undefined) &&
    Number.isInteger(existent.status) &&
    existent.status >= 200 &&
    existent.status < 300
  ) {
    res.setHeader?.('Idempotency-Status', 'replayed');
    res.status(existent.status).json(existent.body);
    return true;
  }

  return false;
}

async function revendicaAtomic(registru, key, valoare, ttlMs) {
  if (typeof registru.setIfAbsent === 'function') {
    return registru.setIfAbsent(key, valoare, ttlMs);
  }
  const existent = await registru.get(key);
  if (existent) return false;
  await registru.set(key, valoare, ttlMs);
  return true;
}

/**
 * @param {object} [optiuni]
 * @param {object} [optiuni.registru] Store Redis/MapCuExpirare
 * @param {number} [optiuni.ttlMs] TTL al cheii de idempotență
 * @param {boolean} [optiuni.rutaCritica] Dacă true, store indisponibil → 503.
 *   Pe GET-uri sau rute idempotente prin natura lor, lasă false (comportament original).
 */
function creeazaMiddlewareIdempotenta({
  registru = registruImplicit,
  ttlMs = TTL_MS,
  rutaCritica = false,
  permiteMultipart = false,
} = {}) {
  return async function idempotencyMiddleware(req, res, next) {
    if (req.method !== 'POST') return next();

    // P-10: o singură aplicare per cerere. Middleware-ul global e montat în
    // server.js înaintea routerelor, deci rulează PRIMUL; cel critic, montat
    // per-rută, rulează după. Fără gardă, cel critic ar revendica a doua oară
    // aceeași cheie deja revendicată de cel global și ar returna un 409 fals.
    if (req._idempotentaAplicata) return next();

    const contentType = String(req.headers['content-type'] || '').toLowerCase();
    const esteMultipart = contentType.startsWith('multipart/form-data');
    if (esteMultipart && !permiteMultipart) return next();

    const idempotencyKey = req.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) return next();
    const keyCurata = idempotencyKey.trim();
    if (keyCurata.length > 200 || !/^[\x21-\x7e]+$/.test(keyCurata)) {
      return res.status(400).json({ eroare: 'Idempotency-Key este invalid sau prea lung.' });
    }

    let amprenta;
    if (esteMultipart) {
      // Corpul nu e parsat încă (multer rulează după). Amprenta pe rută + cheie.
      amprenta = hash(`multipart:${req.method}:${String(req.originalUrl || req.path || '').split('?')[0]}`);
    } else {
      try {
        amprenta = amprentaCerere(req);
      } catch {
        return res.status(400).json({ eroare: 'Corpul cererii nu poate fi serializat.' });
      }
    }

    const cacheKey = construiesteCheie(req, keyCurata);
    try {
      const existent = await registru.get(cacheKey);
      if (raspundeDinRegistru(res, existent, amprenta)) return undefined;

      const revendicat = await revendicaAtomic(registru, cacheKey, {
        stare: 'procesare',
        amprenta,
        inceputLa: Date.now(),
      }, ttlMs);
      if (!revendicat) {
        const castigatoare = await registru.get(cacheKey);
        if (raspundeDinRegistru(res, castigatoare, amprenta)) return undefined;
        return res.status(409).json({
          eroare: 'O cerere cu acest Idempotency-Key este deja in curs.',
          cod: 'IDEMPOTENCY_IN_PROGRESS',
        });
      }
      // P-10: flagul se marchează DOAR după o revendicare atomică reușită.
      // Marcat mai devreme, middleware-ul global (fail-open) l-ar seta, ar
      // înghiți eroarea de store și ar scurtcircuita middleware-ul critic
      // montat mai jos pe rută — iar 503-ul fail-closed nu s-ar mai produce.
      req._idempotentaAplicata = true;
    } catch {
      // P-10: fail-closed pe rute critice (AI, plăți)
      if (rutaCritica) {
        return res.status(503).json({
          eroare: 'Serviciul de verificare a idempotenței este temporar indisponibil.',
          cod: 'IDEMPOTENCY_STORE_UNAVAILABLE',
        });
      }
      // Fail-open pe rute idempotente prin natura lor. Flagul rămâne nesetat
      // intenționat, ca middleware-ul critic montat mai jos pe aceeași cerere
      // să își poată aplica propriul fail-closed (503).
      return next();
    }

    let finalizat = false;
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      const status = res.statusCode;
      if (status >= 200 && status < 300) {
        finalizat = true;
        Promise.resolve(registru.set(cacheKey, {
          stare: 'finalizat',
          amprenta,
          status,
          body,
          finalizatLa: Date.now(),
        }, ttlMs)).catch(() => {});
      } else {
        Promise.resolve(registru.del?.(cacheKey)).catch(() => {});
      }
      return originalJson(body);
    };

    res.once?.('close', () => {
      if (!finalizat) Promise.resolve(registru.del?.(cacheKey)).catch(() => {});
    });

    return next();
  };
}

const idempotencyMiddleware = creeazaMiddlewareIdempotenta();
const idempotencyMiddlewareCritic = creeazaMiddlewareIdempotenta({
  rutaCritica: true,
  permiteMultipart: true,
});

module.exports = {
  idempotencyMiddleware,
  idempotencyMiddlewareCritic,
  creeazaMiddlewareIdempotenta,
  namespaceCerere,
  construiesteCheie,
  amprentaCerere,
  serializeazaStabil,
  TTL_MS,
};
