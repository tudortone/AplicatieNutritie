'use strict';

const crypto = require('crypto');

/**
 * Cache in-memory / persistent pentru analizele de imagini pe bază de hash (SHA-256).
 * Previne re-apelarea modelelor AI scumpe pentru imagini identice (P-3).
 */

const hashCache = new Map();
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 zile TTL pentru rezultatele de imagine

// Curățare periodică o dată la 12 ore
setInterval(() => {
  const now = Date.now();
  for (const [hash, entry] of hashCache.entries()) {
    if (now > entry.expiresAt) {
      hashCache.delete(hash);
    }
  }
}, 12 * 60 * 60 * 1000).unref();

const computeImageHash = (bufferOrBase64) => {
  let buf;
  if (Buffer.isBuffer(bufferOrBase64)) {
    buf = bufferOrBase64;
  } else if (typeof bufferOrBase64 === 'string') {
    const cleanBase64 = bufferOrBase64.replace(/^data:image\/\w+;base64,/, '');
    buf = Buffer.from(cleanBase64, 'base64');
  } else {
    return null;
  }
  return crypto.createHash('sha256').update(buf).digest('hex');
};

const getCachedImageAnalysis = (hash) => {
  if (!hash) return null;
  const entry = hashCache.get(hash);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    hashCache.delete(hash);
    return null;
  }
  return entry.result;
};

const setCachedImageAnalysis = (hash, result) => {
  if (!hash || !result) return;
  hashCache.set(hash, {
    result,
    expiresAt: Date.now() + TTL_MS
  });
};

module.exports = {
  computeImageHash,
  getCachedImageAnalysis,
  setCachedImageAnalysis
};
