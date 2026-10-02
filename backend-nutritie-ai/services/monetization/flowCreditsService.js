'use strict';

class FlowCreditsError extends Error {
  constructor(code, status = 400) {
    super('Flow Credits operation could not be completed.');
    this.name = 'FlowCreditsError';
    this.code = code;
    this.status = status;
  }
}

function requiredString(value, code) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 256) throw new FlowCreditsError(code);
  return value.trim();
}

function createFlowCreditsService({ repo, now = () => new Date() } = {}) {
  if (!repo || typeof repo.getBalance !== 'function') throw new TypeError('Flow Credits repository is required.');
  const serverNow = () => {
    const date = new Date(now());
    if (!Number.isFinite(date.getTime())) throw new FlowCreditsError('INVALID_SERVER_TIME', 503);
    return date.toISOString();
  };
  return Object.freeze({
    getBalance({ userId } = {}) {
      return repo.getBalance({ userId: requiredString(userId, 'INVALID_USER'), now: serverNow() });
    },
    reservePhoto({ userId, logicalAnalysisId, entitlement } = {}) {
      if (typeof repo.reservePhoto !== 'function') throw new TypeError('reservePhoto is not supported by repo');
      return repo.reservePhoto({
        userId: requiredString(userId, 'INVALID_USER'),
        logicalAnalysisId: requiredString(logicalAnalysisId, 'INVALID_ANALYSIS_ID'),
        now: serverNow(),
        entitlement: entitlement || null,
      });
    },
    commitPhoto({ userId, reservationId } = {}) {
      if (typeof repo.settlePhoto !== 'function') throw new TypeError('settlePhoto is not supported by repo');
      return repo.settlePhoto({
        userId: requiredString(userId, 'INVALID_USER'),
        reservationId: requiredString(reservationId, 'INVALID_RESERVATION_ID'),
        action: 'commit',
      });
    },
    releasePhoto({ userId, reservationId } = {}) {
      if (typeof repo.settlePhoto !== 'function') throw new TypeError('settlePhoto is not supported by repo');
      return repo.settlePhoto({
        userId: requiredString(userId, 'INVALID_USER'),
        reservationId: requiredString(reservationId, 'INVALID_RESERVATION_ID'),
        action: 'release',
      });
    },
    grantRewardVerified({ userId, rewardEventId } = {}) {
      if (typeof repo.grantReward !== 'function') throw new TypeError('grantReward is not supported by repo');
      return repo.grantReward({
        userId: requiredString(userId, 'INVALID_USER'),
        eventId: requiredString(rewardEventId, 'INVALID_EVENT_ID'),
        now: serverNow(),
      });
    },
    grantPackVerified({ userId, purchaseEventId, productId } = {}) {
      if (typeof repo.grantPack !== 'function') throw new TypeError('grantPack is not supported by repo');
      return repo.grantPack({
        userId: requiredString(userId, 'INVALID_USER'),
        eventId: requiredString(purchaseEventId, 'INVALID_EVENT_ID'),
        productId: requiredString(productId, 'INVALID_PRODUCT_ID'),
      });
    },
  });
}

module.exports = { createFlowCreditsService, FlowCreditsError };
