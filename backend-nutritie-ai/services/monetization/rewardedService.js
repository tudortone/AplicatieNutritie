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

function createRewardedService({ repo, flowCredits, now = () => new Date() } = {}) {
  if (!repo || !flowCredits) throw new TypeError('Rewarded service dependencies are required.');
  const serverDate = () => {
    const date = new Date(now());
    if (!Number.isFinite(date.getTime())) throw new RewardedError('INVALID_SERVER_TIME', 503);
    return date;
  };
  return Object.freeze({
    async createIntent({ userId } = {}) {
      const owner = required(userId, 'INVALID_USER', 128);
      const balance = await flowCredits.getBalance({ userId: owner });
      if (Number(balance?.rewardedGrantsRemaining) <= 0) throw new RewardedError('REWARDED_DAILY_LIMIT', 429);
      const id = crypto.randomUUID();
      const customData = crypto.randomBytes(32).toString('base64url');
      const expiresAt = new Date(serverDate().getTime() + 10 * 60 * 1000).toISOString();
      await repo.createIntent({ id, userId: owner, customDataHash: digest(customData), expiresAt });
      return Object.freeze({ intentId: id, customData, expiresAt });
    },
    async getIntentStatus({ intentId, userId } = {}) {
      const id = required(intentId, 'INVALID_INTENT', 64);
      const owner = required(userId, 'INVALID_USER', 128);
      const intent = await repo.getIntentStatus({ intentId: id, userId: owner });
      if (!intent) return null;
      if (intent.status === 'PENDING') {
        const expiresAt = new Date(intent.expiresAt).getTime();
        if (!Number.isFinite(expiresAt)) throw new RewardedError('REWARDED_UNAVAILABLE', 503);
        if (expiresAt <= serverDate().getTime()) return Object.freeze({ status: 'EXPIRED' });
      }
      if (!['PENDING', 'GRANTED', 'DENIED_LIMIT', 'EXPIRED'].includes(intent.status)) {
        throw new RewardedError('REWARDED_UNAVAILABLE', 503);
      }
      return Object.freeze({ status: intent.status });
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
