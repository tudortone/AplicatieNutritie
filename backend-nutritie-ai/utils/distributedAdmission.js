'use strict';

const crypto = require('crypto');
const { creeazaClientRedis } = require('./storePartajat');

const ACQUIRE_SCRIPT = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
if redis.call('EXISTS', KEYS[2]) == 1 then return 1 end
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[2]) then return 2 end
local claimed = redis.call('SET', KEYS[2], ARGV[3], 'PX', ARGV[4], 'NX')
if not claimed then return 1 end
redis.call('ZADD', KEYS[1], ARGV[5], ARGV[3])
redis.call('PEXPIRE', KEYS[1], ARGV[4])
return 0
`;

const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[2]) ~= ARGV[1] then return 0 end
redis.call('DEL', KEYS[2])
redis.call('ZREM', KEYS[1], ARGV[1])
return 1
`;

function hashUserId(userId) {
  return crypto.createHash('sha256').update(String(userId)).digest('hex').slice(0, 32);
}

/**
 * Distributed, lease-based admission gate used for paid AI chat traffic.
 * Redis mode is deliberately fail-closed: a Redis outage must not multiply the
 * provider concurrency budget across application instances. Without a Redis
 * URL (tests/local single-process development), the same contract is enforced
 * by the in-memory implementation.
 */
function createDistributedAdmission({
  url,
  redisClient,
  prefix = 'nutri:chat-admission',
  globalLimit = 12,
  ttlMs = 60_000,
  now = Date.now,
} = {}) {
  const limit = Math.max(1, Number(globalLimit) || 1);
  const leaseTtl = Math.max(1_000, Number(ttlMs) || 60_000);
  const client = redisClient || (url ? creeazaClientRedis({ url }) : null);
  const globalKey = `${prefix}:active`;
  const localUsers = new Map();
  const localLeases = new Map();

  function cleanLocal(timestamp) {
    for (const [token, expiry] of localLeases) {
      if (expiry <= timestamp) localLeases.delete(token);
    }
    for (const [userKey, lease] of localUsers) {
      if (lease.expiry <= timestamp || !localLeases.has(lease.token)) localUsers.delete(userKey);
    }
  }

  function denied(reason) {
    return { ok: false, reason, retryAfterSeconds: Math.max(1, Math.ceil(leaseTtl / 1000)) };
  }

  async function acquireLocal(userKey, token, timestamp) {
    cleanLocal(timestamp);
    if (localUsers.has(userKey)) return denied('user');
    if (localLeases.size >= limit) return denied('global');
    const expiry = timestamp + leaseTtl;
    localUsers.set(userKey, { token, expiry });
    localLeases.set(token, expiry);
    return {
      ok: true,
      async release() {
        const current = localUsers.get(userKey);
        if (!current || current.token !== token) return false;
        localUsers.delete(userKey);
        localLeases.delete(token);
        return true;
      },
    };
  }

  return {
    async acquire(userId) {
      const timestamp = Number(now());
      const token = crypto.randomUUID();
      const userKey = `${prefix}:user:${hashUserId(userId)}`;
      if (!client) return acquireLocal(userKey, token, timestamp);
      if (!client.isReady) return denied('unavailable');

      try {
        const result = Number(await client.eval(ACQUIRE_SCRIPT, {
          keys: [globalKey, userKey],
          arguments: [
            String(timestamp),
            String(limit),
            token,
            String(leaseTtl),
            String(timestamp + leaseTtl),
          ],
        }));
        if (result === 1) return denied('user');
        if (result === 2) return denied('global');
        if (result !== 0) return denied('unavailable');
        return {
          ok: true,
          async release() {
            if (!client.isReady) return false;
            try {
              return Number(await client.eval(RELEASE_SCRIPT, {
                keys: [globalKey, userKey],
                arguments: [token],
              })) === 1;
            } catch {
              return false;
            }
          },
        };
      } catch {
        return denied('unavailable');
      }
    },
  };
}

module.exports = { createDistributedAdmission, hashUserId };
