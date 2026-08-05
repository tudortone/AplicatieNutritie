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

/**
 * Middleware-ul ruleaza inainte de autentificare, deci nu foloseste un `sub`
 * JWT nevalidat. Namespace-ul este hash-ul tokenului complet: un atacator nu
 * poate fabrica namespace-ul altei sesiuni doar cunoscand ID-ul utilizatorului,
 * iar tokenul brut nu este stocat niciodata.
 */
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

function creeazaMiddlewareIdempotenta({ registru = registruImplicit, ttlMs = TTL_MS } = {}) {
  return async function idempotencyMiddleware(req, res, next) {
    if (req.method !== 'POST') return next();

    const idempotencyKey = req.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) return next();
    if (idempotencyKey.length > 200) {
      return res.status(400).json({ eroare: 'Idempotency-Key este prea lung.' });
    }

    const cacheKey = construiesteCheie(req, idempotencyKey.trim());
    let existent = null;
    try {
      existent = await registru.get(cacheKey);
    } catch {
      // Idempotenta este protectie contra duplicatelor, nu motiv sa oprim API-ul.
    }

    if (
      existent &&
      Number.isInteger(existent.status) &&
      existent.status >= 200 &&
      existent.status < 300
    ) {
      return res.status(existent.status).json(existent.body);
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        Promise.resolve(
          registru.set(cacheKey, { status: res.statusCode, body }, ttlMs),
        ).catch(() => {});
      }
      return originalJson(body);
    };

    return next();
  };
}

const idempotencyMiddleware = creeazaMiddlewareIdempotenta();

module.exports = {
  idempotencyMiddleware,
  creeazaMiddlewareIdempotenta,
  namespaceCerere,
  construiesteCheie,
  TTL_MS,
};
