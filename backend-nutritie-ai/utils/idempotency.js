'use strict';

/**
 * Middleware pentru idempotența scrierilor (A-9).
 * Previne duplicarea meselor/înregistrărilor la deconectări temporare ale rețelei mobile.
 */

const idempotencyCache = new Map();
const TTL_MS = 15 * 60 * 1000; // 15 minute fereastră de idempotență

// Curățare periodică o dată la 5 minute
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of idempotencyCache.entries()) {
    if (now > entry.expiresAt) {
      idempotencyCache.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

const idempotencyMiddleware = (req, res, next) => {
  if (req.method !== 'POST') return next();

  const idempotencyKey = req.headers['idempotency-key'];
  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    return next();
  }

  const cacheKey = `${req.user?.id || 'anon'}:${req.path}:${idempotencyKey}`;
  const existing = idempotencyCache.get(cacheKey);

  if (existing) {
    if (Date.now() <= existing.expiresAt) {
      return res.status(existing.status).json(existing.body);
    } else {
      idempotencyCache.delete(cacheKey);
    }
  }

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      idempotencyCache.set(cacheKey, {
        status: res.statusCode,
        body,
        expiresAt: Date.now() + TTL_MS
      });
    }
    return originalJson(body);
  };

  next();
};

module.exports = {
  idempotencyMiddleware,
  idempotencyCache
};
