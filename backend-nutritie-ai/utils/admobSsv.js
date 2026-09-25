'use strict';

const crypto = require('crypto');

const DEFAULT_KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';
const SECURITY_PARAMS = [
  'signature', 'key_id', 'transaction_id', 'user_id', 'custom_data',
  'ad_unit', 'reward_amount', 'reward_item',
];

class AdmobSsvError extends Error {
  constructor(code, status = 403) {
    super('AdMob server-side reward verification failed.');
    this.name = 'AdmobSsvError';
    this.code = code;
    this.status = status;
  }
}

function bounded(value, max, pattern, code) {
  if (typeof value !== 'string' || value.length === 0 || value.length > max || !pattern.test(value)) {
    throw new AdmobSsvError(code, 400);
  }
  return value;
}

function createAdmobSsvVerifier({
  fetchImpl = global.fetch,
  keysUrl = DEFAULT_KEYS_URL,
  now = () => Date.now(),
  cacheTtlMs = 24 * 60 * 60 * 1000,
  expectedAdUnit,
  expectedRewardAmount,
  expectedRewardItem,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required.');
  if (!/^\d{1,32}$/.test(String(expectedAdUnit || ''))) throw new TypeError('expected AdMob rewarded ad unit is required.');
  if (!/^[1-9]\d{0,8}$/.test(String(expectedRewardAmount || ''))) throw new TypeError('expected AdMob reward amount is required.');
  if (!/^[\x20-\x7e]{1,64}$/.test(String(expectedRewardItem || ''))) throw new TypeError('expected AdMob reward item is required.');
  let cache = null;
  let cacheExpiresAt = 0;

  async function getKeys() {
    const current = Number(now());
    if (cache && current < cacheExpiresAt) return cache;
    let response;
    try {
      response = await fetchImpl(keysUrl, { signal: AbortSignal.timeout(5000) });
    } catch (cause) {
      throw Object.assign(new AdmobSsvError('SSV_KEYS_UNAVAILABLE', 503), { cause });
    }
    if (!response?.ok) throw new AdmobSsvError('SSV_KEYS_UNAVAILABLE', 503);
    const payload = await response.json();
    const next = new Map();
    for (const entry of Array.isArray(payload?.keys) ? payload.keys : []) {
      if (Number.isInteger(Number(entry?.keyId)) && typeof entry?.pem === 'string') next.set(String(entry.keyId), entry.pem);
    }
    if (next.size === 0) throw new AdmobSsvError('SSV_KEYS_INVALID', 503);
    cache = next;
    cacheExpiresAt = current + cacheTtlMs;
    return next;
  }

  return Object.freeze({
    async verify(rawUrl) {
      const raw = bounded(rawUrl, 8192, /^\/[\x21-\x7e]+$/, 'SSV_URL_INVALID');
      const queryStart = raw.indexOf('?');
      const signatureMarker = raw.indexOf('&signature=', queryStart + 1);
      if (queryStart < 0 || signatureMarker < 0) throw new AdmobSsvError('SSV_FORMAT_INVALID', 400);
      const params = new URLSearchParams(raw.slice(queryStart + 1));
      for (const name of SECURITY_PARAMS) {
        if (params.getAll(name).length !== 1) throw new AdmobSsvError('SSV_DUPLICATE_PARAMETER', 400);
      }
      const signature = bounded(params.get('signature'), 1024, /^[A-Za-z0-9_-]+={0,2}$/, 'SSV_SIGNATURE_ENCODING_INVALID');
      const keyId = bounded(params.get('key_id'), 32, /^\d+$/, 'SSV_KEY_INVALID');
      const intentId = bounded(params.get('user_id'), 64, /^[a-zA-Z0-9_-]+$/, 'SSV_INTENT_INVALID');
      const customData = bounded(params.get('custom_data'), 256, /^[a-zA-Z0-9_-]+$/, 'SSV_CUSTOM_DATA_INVALID');
      const transactionId = bounded(params.get('transaction_id'), 256, /^[a-zA-Z0-9._:-]+$/, 'SSV_TRANSACTION_INVALID');
      const adUnit = bounded(params.get('ad_unit'), 32, /^\d+$/, 'SSV_AD_UNIT_INVALID');
      const rewardAmount = bounded(params.get('reward_amount'), 9, /^[1-9]\d*$/, 'SSV_REWARD_AMOUNT_INVALID');
      const rewardItem = bounded(params.get('reward_item'), 64, /^[\x20-\x7e]+$/, 'SSV_REWARD_ITEM_INVALID');
      const keys = await getKeys();
      const pem = keys.get(keyId);
      if (!pem) throw new AdmobSsvError('SSV_KEY_UNKNOWN');
      const signedData = raw.slice(queryStart + 1, signatureMarker);
      let valid = false;
      try {
        const signatureBytes = Buffer.from(signature, 'base64url');
        valid = crypto.verify('sha256', Buffer.from(signedData, 'utf8'), pem, signatureBytes);
        // Google's reference verifier uses java.net.URI#getQuery(), which
        // percent-decodes the query before ECDSA verification. Keep the raw
        // form first, then accept that official representation without ever
        // reordering parameters or trusting unverified decoded values.
        if (!valid) {
          const decodedSignedData = decodeURIComponent(signedData);
          if (decodedSignedData !== signedData) {
            valid = crypto.verify('sha256', Buffer.from(decodedSignedData, 'utf8'), pem, signatureBytes);
          }
        }
      } catch {
        valid = false;
      }
      if (!valid) throw new AdmobSsvError('SSV_SIGNATURE_INVALID');
      if (adUnit !== expectedAdUnit) {
        throw new AdmobSsvError('SSV_AD_UNIT_MISMATCH');
      }
      if (rewardAmount !== expectedRewardAmount) throw new AdmobSsvError('SSV_REWARD_AMOUNT_MISMATCH');
      if (rewardItem !== expectedRewardItem) throw new AdmobSsvError('SSV_REWARD_ITEM_MISMATCH');
      return Object.freeze({ intentId, customData, transactionId });
    },
  });
}

module.exports = { AdmobSsvError, DEFAULT_KEYS_URL, createAdmobSsvVerifier };
