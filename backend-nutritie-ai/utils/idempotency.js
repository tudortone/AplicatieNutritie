'use strict';

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

function creeazaMiddlewareIdempotenta({ registru = registruImplicit, ttlMs = TTL_MS } = {}) {
  return async function idempotencyMiddleware(req, res, next) {
    if (req.method !== 'POST') return next();
    const contentType = String(req.headers['content-type'] || '').toLowerCase();
    if (contentType.startsWith('multipart/form-data')) return next();

    const idempotencyKey = req.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) return next();
    const keyCurata = idempotencyKey.trim();
    if (keyCurata.length > 200 || !/^[\x21-\x7e]+$/.test(keyCurata)) {
      return res.status(400).json({ eroare: 'Idempotency-Key este invalid sau prea lung.' });
    }

    let amprenta;
    try {
      amprenta = amprentaCerere(req);
    } catch {
      return res.status(400).json({ eroare: 'Corpul cererii nu poate fi serializat.' });
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
    } catch {
      // Cand store-ul nu poate raspunde nici prin rezerva locala, cererea continua.
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

module.exports = {
  idempotencyMiddleware,
  creeazaMiddlewareIdempotenta,
  namespaceCerere,
  construiesteCheie,
  amprentaCerere,
  serializeazaStabil,
  TTL_MS,
};
