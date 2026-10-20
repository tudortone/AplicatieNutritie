'use strict';

const crypto = require('crypto');

class RewardedError extends Error {
  constructor(code, status = 400) {
    super('Rewarded credit operation could not be completed.');
    this.name = 'RewardedError';
    this.code = code;
    this.status = status;
  }
}

function required(value, code, max = 256) {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) throw new RewardedError(code);
  return value;
}

function digest(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function currentIntentStatus(intent, now) {
  if (!['PENDING', 'GRANTED', 'DENIED_LIMIT', 'EXPIRED'].includes(intent.status)) {
    throw new RewardedError('REWARDED_UNAVAILABLE', 503);
  }
  const expiry = new Date(intent.expiresAt).getTime();
  if (!Number.isFinite(expiry)) throw new RewardedError('REWARDED_UNAVAILABLE', 503);
  return intent.status === 'PENDING' && expiry <= now.getTime() ? 'EXPIRED' : intent.status;
}

function formatIntent(intent, owner, requestHash, replay, now) {
  if (intent.userId !== owner || intent.requestHash !== requestHash) {
    throw new RewardedError('REWARDED_TOKEN_REPLAY', 403);
  }
  return Object.freeze({
    intentId: required(intent.id || intent.intentId, 'REWARDED_UNAVAILABLE', 64),
    customData: required(intent.customData, 'REWARDED_UNAVAILABLE'),
    expiresAt: required(intent.expiresAt, 'REWARDED_UNAVAILABLE', 64),
    status: currentIntentStatus(intent, now),
    replay,
  });
}

async function createNewIntent({ owner, tokenHash, requestHash, repo, flowCredits, serverDate }) {
  const balance = await flowCredits.getBalance({ userId: owner });
  if (Number(balance?.rewardedGrantsRemaining) <= 0) throw new RewardedError('REWARDED_DAILY_LIMIT', 429);
  const id = crypto.randomUUID();
  const customData = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(serverDate().getTime() + 10 * 60 * 1000).toISOString();
  const created = await repo.createIntent({
    id, userId: owner, customData, customDataHash: digest(customData),
    tokenHash, requestHash, expiresAt,
  });
  if (!created?.ok) {
    const code = created?.code || 'REWARDED_UNAVAILABLE';
    throw new RewardedError(code, code === 'REWARDED_TOKEN_REPLAY' ? 403 : 503);
  }
  return formatIntent({
    id: created.intentId || created.id,
    userId: created.userId,
    requestHash: created.requestHash,
    customData: created.customData,
    expiresAt: created.expiresAt,
    status: created.status,
  }, owner, requestHash, created.replay === true, serverDate());
}

function createRewardedService({ repo, flowCredits, now = () => new Date() } = {}) {
  if (!repo || !flowCredits) throw new TypeError('Rewarded service dependencies are required.');
  const serverDate = () => {
    const date = new Date(now());
    if (!Number.isFinite(date.getTime())) throw new RewardedError('INVALID_SERVER_TIME', 503);
    return date;
  };
  return Object.freeze({
    async createIntent({ userId, tokenHash, requestHash } = {}) {
      const owner = required(userId, 'INVALID_USER', 128);
      const token = required(tokenHash, 'PLAY_INTEGRITY_REQUIRED', 64);
      const request = required(requestHash, 'PLAY_INTEGRITY_REQUIRED', 128);
      if (!/^[a-f0-9]{64}$/.test(token)) throw new RewardedError('PLAY_INTEGRITY_REQUIRED', 403);

      const existing = await repo.findByIntegrityTokenHash({ tokenHash: token });
      if (existing) return formatIntent(existing, owner, request, true, serverDate());
      return createNewIntent({
        owner,
        tokenHash: token,
        requestHash: request,
        repo,
        flowCredits,
        serverDate,
      });
    },
    async getIntentStatus({ intentId, userId } = {}) {
      const id = required(intentId, 'INVALID_INTENT', 64);
      const owner = required(userId, 'INVALID_USER', 128);
      const intent = await repo.getIntentStatus({ intentId: id, userId: owner });
      if (!intent) return null;
      return Object.freeze({ status: currentIntentStatus(intent, serverDate()) });
    },
    async applyVerified({ intentId, customData, transactionId } = {}) {
      const result = await repo.grantVerified({
        intentId: required(intentId, 'INVALID_INTENT', 64),
        customDataHash: digest(required(customData, 'INVALID_CUSTOM_DATA')),
        transactionId: required(transactionId, 'INVALID_TRANSACTION'),
        now: serverDate().toISOString(),
      });
      return result;
    },
  });
}

module.exports = { createRewardedService, RewardedError, digest };
