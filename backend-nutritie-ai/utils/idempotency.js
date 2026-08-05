'use strict';

/**
 * Middleware pentru idempotența scrierilor (A-9).
 * Previne duplicarea meselor/înregistrărilor la deconectări temporare ale rețelei mobile.
 *
 * Refactor audit 2026-08 (P2.7): cache-ul a fost mutat din Map per-proces intr-un
 * registru cheie-valoare partajat (Redis, daca e configurat). Pe mai multe
 * instante, inainte un retry putea ateriza pe alta instanta si sa creeze o masa
 * duplicata, chiar daca prima instanta avea cheia memorata.
 *
 * Anti-DoS (audit): capacitatea este marginita de registru (Redis PRUNE / Map cu
 * TTL + plafon LRU in storePartajat), iar cheile expira automat dupa 15 minute.
 */

const { creazaRegistruCheiValori } = require('./storePartajat');

const TTL_MS = 15 * 60 * 1000; // 15 minute fereastră de idempotență
const PREFIX_CHEIE = 'nutri:idem';

/**
 * Cheia de cache se leaga de identitatea REALA a utilizatorului. Middleware-ul
 * ruleaza global, inainte de requireAuth, deci la citire `req.user` poate fi inca
 * undefined. Decodam `sub`-ul JWT fara verificare — doar ca namespace: nu se ia
 * nicio decizie de securitate pe baza lui. Fara asta, inainte toate cererile
 * imparteau cheia `anon`, deci doua conturi cu acelasi Idempotency-Key se puteau
 * vedea reciproc raspunsurile in cache.
 */
function cheieIdentitate(req) {
  if (req.user?.id) return req.user.id;
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      const parte = header.slice(7).split('.')[1];
      const payload = JSON.parse(Buffer.from(parte || '', 'base64url').toString('utf8'));
      if (payload?.sub) return `jwt:${payload.sub}`;
    } catch {
      // token nevalid: cade pe 'anon' — nu e o decizie de securitate, doar namespace
    }
  }
  return 'anon';
}

/**
 * Fabrica de middleware. `registru` trebuie sa fie un store din
 * creazaRegistruCheiValori(). Fara registru explicit, se foloseste un Map
 * in-memory — cazul testelor si al unei instante unice fara Redis.
 */
function creeazaMiddlewareIdempotenta({ registru } = {}) {
  const sursa = registru || creazaRegistruCheiValori({ prefix: PREFIX_CHEIE });

  return async function idempotencyMiddleware(req, res, next) {
    if (req.method !== 'POST') return next();

    const idempotencyKey = req.headers['idempotency-key'];
    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      return next();
    }

    // Cheia e calculata o singura data pe cerere si refolosita la scriere, ca
    // citirea (inainte de auth) si scrierea (dupa auth) sa coincida intotdeauna.
    const cacheKey = `${cheieIdentitate(req)}:${req.path}:${idempotencyKey}`;
    req._cheieIdempotenta = cacheKey;

    const existing = await sursa.get(cacheKey);
    if (existing) {
      return res.status(existing.status).json(existing.body);
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        // Fire-and-forget: raspunsul s-a trimis deja, memoria se scrie in fundal.
        sursa
          .set(req._cheieIdempotenta || cacheKey, { status: res.statusCode, body }, TTL_MS)
          .catch((err) => console.warn('[Idempotenta] Scriere cache esuata:', err.message));
      }
      return originalJson(body);
    };

    next();
  };
}

// Instanta implicita (Map in-memory) pentru server.js si teste.
const idempotencyMiddleware = creeazaMiddlewareIdempotenta({});

module.exports = {
  idempotencyMiddleware,
  creeazaMiddlewareIdempotenta,
  TTL_MS,
};
