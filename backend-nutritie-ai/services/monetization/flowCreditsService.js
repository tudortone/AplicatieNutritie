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

function requiredFingerprint(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new FlowCreditsError('INVALID_REQUEST_FINGERPRINT', 400);
  }
  return value;
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
    reservePhoto({ userId, logicalAnalysisId, requestFingerprint, entitlement } = {}) {
      if (typeof repo.reservePhoto !== 'function') throw new TypeError('reservePhoto is not supported by repo');
      return repo.reservePhoto({
        userId: requiredString(userId, 'INVALID_USER'),
        logicalAnalysisId: requiredString(logicalAnalysisId, 'INVALID_ANALYSIS_ID'),
        requestFingerprint: requiredFingerprint(requestFingerprint),
        now: serverNow(),
        entitlement: entitlement || null,
      });
    },
    claimPhotoInference(input = {}) {
      if (typeof repo.claimPhotoInference !== 'function') throw new TypeError('claimPhotoInference is not supported by repo');
      return repo.claimPhotoInference({
        ...input,
        userId: requiredString(input.userId, 'INVALID_USER'),
        reservationId: requiredString(input.reservationId, 'INVALID_RESERVATION_ID'),
        requestFingerprint: requiredFingerprint(input.requestFingerprint),
        now: serverNow(),
      });
    },
    recordPhotoResult(input = {}) {
      if (typeof repo.recordPhotoResult !== 'function') throw new TypeError('recordPhotoResult is not supported by repo');
      return repo.recordPhotoResult({
        userId: requiredString(input.userId, 'INVALID_USER'),
        reservationId: requiredString(input.reservationId, 'INVALID_RESERVATION_ID'),
        requestFingerprint: requiredFingerprint(input.requestFingerprint),
        result: input.result,
      });
    },
    reconcilePhotoResult(input = {}) {
      if (typeof repo.reconcilePhotoResult !== 'function') throw new TypeError('reconcilePhotoResult is not supported by repo');
      return repo.reconcilePhotoResult({
        userId: requiredString(input.userId, 'INVALID_USER'),
        reservationId: requiredString(input.reservationId, 'INVALID_RESERVATION_ID'),
        jobId: requiredString(input.jobId, 'INVALID_JOB_ID'),
        now: serverNow(),
      });
    },
    listPhotoOutcomeReconciliationQueue({ limit = 50 } = {}) {
      if (typeof repo.listPhotoOutcomeReconciliationQueue !== 'function') {
        throw new TypeError('Photo reconciliation queue is not supported by repo');
      }
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new FlowCreditsError('INVALID_RECONCILIATION_LIMIT', 400);
      }
      return repo.listPhotoOutcomeReconciliationQueue({ limit, now: serverNow() });
    },
    async resolvePhotoOutcomeUnknown({ userId, reservationId, evidenceReference, operatorId } = {}) {
      if (typeof repo.resolvePhotoOutcomeUnknown !== 'function') {
        throw new TypeError('Photo outcome resolution is not supported by repo');
      }
      if (typeof evidenceReference !== 'string' || !/^[A-Za-z0-9._:-]{1,256}$/.test(evidenceReference)) {
        throw new FlowCreditsError('CONFIRMED_FAILURE_EVIDENCE_REQUIRED', 400);
      }
      const result = await repo.resolvePhotoOutcomeUnknown({
        userId: requiredString(userId, 'INVALID_USER'),
        reservationId: requiredString(reservationId, 'INVALID_RESERVATION_ID'),
        evidenceReference,
        operatorId: requiredString(operatorId, 'ADMIN_REQUIRED'),
        now: serverNow(),
      });
      if (result?.ok !== true) {
        const code = typeof result?.code === 'string' ? result.code : 'PHOTO_RECONCILIATION_UNAVAILABLE';
        const status = {
          CONFIRMED_FAILURE_EVIDENCE_REQUIRED: 400,
          ADMIN_REQUIRED: 403,
          RESERVATION_NOT_FOUND: 404,
          PHOTO_OUTCOME_NOT_RESOLVABLE: 409,
        }[code] || 503;
        throw new FlowCreditsError(code, status);
      }
      return result;
    },
    commitPhoto({ userId, reservationId } = {}) {
      if (typeof repo.settlePhoto !== 'function') throw new TypeError('settlePhoto is not supported by repo');
      return repo.settlePhoto({
        userId: requiredString(userId, 'INVALID_USER'),
        reservationId: requiredString(reservationId, 'INVALID_RESERVATION_ID'),
        action: 'commit',
      });
    },
    releasePhoto({ userId, reservationId, reason } = {}) {
      if (typeof repo.settlePhoto !== 'function') throw new TypeError('settlePhoto is not supported by repo');
      return repo.settlePhoto({
        userId: requiredString(userId, 'INVALID_USER'),
        reservationId: requiredString(reservationId, 'INVALID_RESERVATION_ID'),
        action: 'release',
        ...(typeof reason === 'string' && reason.trim() ? { reason: reason.trim() } : {}),
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
