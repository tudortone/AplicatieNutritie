'use strict';

const crypto = require('crypto');
const { inregistreazaOperational } = require('../../utils/metrics');

class PhotoJobError extends Error {
  constructor(code, status = 503) {
    super('Photo analysis job could not be completed.');
    this.name = 'PhotoJobError';
    this.code = code;
    this.status = status;
  }
}

function requireString(value, code, max = 4096) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) {
    throw new PhotoJobError(code, 400);
  }
  return value.trim();
}

function admissionStatus(code) {
  if (
    code === 'PHOTO_IN_PROGRESS'
    || code === 'PHOTO_RESERVATION_ALREADY_COMMITTED'
    || code === 'PHOTO_RESERVATION_RELEASED'
    || code === 'CREDIT_RESERVATION_EXPIRED'
    || code === 'LOGICAL_ID_IMAGE_MISMATCH'
  ) {
    return 409;
  }
  if (code === 'FLOW_CREDITS_EXHAUSTED') return 402;
  if (code === 'PREMIUM_FAIR_USE_REACHED') return 429;
  if (code === 'RESERVATION_OWNERSHIP_MISMATCH' || code === 'JOB_OWNERSHIP_MISMATCH') return 403;
  return 503;
}

function validateExistingJobForReplay(existing, { userId, imageUrl, imageFileId }) {
  if (existing.userId && existing.userId !== userId) {
    throw new PhotoJobError('JOB_OWNERSHIP_MISMATCH', 403);
  }
  if (existing.imageUrl && existing.imageUrl !== imageUrl) {
    throw new PhotoJobError('LOGICAL_ID_IMAGE_MISMATCH', 409);
  }
  if (imageFileId && existing.imageFileId && existing.imageFileId !== imageFileId) {
    throw new PhotoJobError('LOGICAL_ID_IMAGE_MISMATCH', 409);
  }
  if (existing.status === 'failed' || existing.status === 'cancelled') {
    throw new PhotoJobError('PHOTO_RESERVATION_RELEASED', 409);
  }
  return Object.freeze({ ...existing, replay: true });
}

function validateFreshPhotoReservation(reservation, userId) {
  if (!reservation || typeof reservation !== 'object') {
    throw new PhotoJobError('FLOW_CREDITS_UNAVAILABLE', 503);
  }
  if (!reservation.ok) {
    const rejectionCode = reservation.code || reservation.reason || 'FLOW_CREDITS_UNAVAILABLE';
    inregistreazaOperational(rejectionCode === 'PREMIUM_FAIR_USE_REACHED'
      ? 'photo.fair_use_rejected'
      : 'photo.admission_rejected');
    throw new PhotoJobError(rejectionCode, admissionStatus(rejectionCode));
  }
  if (reservation.userId && reservation.userId !== userId) {
    throw new PhotoJobError('RESERVATION_OWNERSHIP_MISMATCH', 403);
  }
  if (reservation.status === 'COMMITTED') {
    throw new PhotoJobError('PHOTO_RESERVATION_ALREADY_COMMITTED', 409);
  }
  if (reservation.status === 'RELEASED') {
    throw new PhotoJobError('PHOTO_RESERVATION_RELEASED', 409);
  }
  if (reservation.replay === true) {
    throw new PhotoJobError('PHOTO_IN_PROGRESS', 409);
  }
  if (
    reservation.status !== 'RESERVED'
    || typeof reservation.reservationId !== 'string'
    || reservation.reservationId.trim().length === 0
  ) {
    throw new PhotoJobError('INVALID_CREDIT_RESERVATION', 503);
  }
  if (reservation.expiresAt !== undefined && reservation.expiresAt !== null) {
    const expMs = Date.parse(String(reservation.expiresAt));
    if (!Number.isFinite(expMs) || expMs <= Date.now()) {
      throw new PhotoJobError('CREDIT_RESERVATION_EXPIRED', 409);
    }
  }
  return reservation.reservationId.trim();
}

function createPhotoJobService({ repo, flowCredits, tasks, billing } = {}) {
  if (!repo || !flowCredits || !tasks || !billing) {
    throw new TypeError('Photo job dependencies are required.');
  }

  return Object.freeze({
    async submit(input = {}) {
      const userId = requireString(input.userId, 'INVALID_USER', 128);
      const logicalAnalysisId = requireString(
        input.logicalAnalysisId,
        'INVALID_LOGICAL_ANALYSIS_ID',
        256,
      );
      const normalizedImageUrl = requireString(input.imageUrl, 'INVALID_IMAGE_URL');
      const normalizedImageFileId = typeof input.imageFileId === 'string' && input.imageFileId.trim()
        ? input.imageFileId.trim().slice(0, 512)
        : null;

      const existing = await repo.findByLogicalId({
        ctx: input.dataContext,
        userId,
        logicalAnalysisId,
      });
      if (existing) {
        return validateExistingJobForReplay(existing, {
          userId,
          imageUrl: normalizedImageUrl,
          imageFileId: normalizedImageFileId,
        });
      }

      let entitlement = 'free';
      if (input.fullAccess === true) entitlement = 'full_access';
      else {
        const paid = await billing.getPaidEntitlement({ userId });
        if (paid?.premium === true) entitlement = 'premium';
      }

      const reservation = await flowCredits.reservePhoto({
        userId,
        logicalAnalysisId,
        entitlement,
      });

      if (reservation?.ok && reservation.replay === true && reservation.status === 'RESERVED') {
        const concurrentExisting = await repo.findByLogicalId({
          ctx: input.dataContext,
          userId,
          logicalAnalysisId,
        });
        if (concurrentExisting) {
          return validateExistingJobForReplay(concurrentExisting, {
            userId,
            imageUrl: normalizedImageUrl,
            imageFileId: normalizedImageFileId,
          });
        }
      }

      const reservationId = validateFreshPhotoReservation(reservation, userId);

      inregistreazaOperational('credit.reserve');
      if (entitlement === 'premium' || entitlement === 'full_access') {
        inregistreazaOperational('photo.entitlement_bypass');
      }

      let job = null;
      try {
        job = await repo.create({
          userId,
          logicalAnalysisId,
          imageUrl: normalizedImageUrl,
          imageFileId: normalizedImageFileId,
          creditReservationId: reservationId,
          queueName: 'ai-photo',
        });
        if (!job?.id) throw new PhotoJobError('PHOTO_JOB_PERSISTENCE_FAILED');

        const idempotencyKey = crypto.createHash('sha256')
          .update(`getflow-photo:${userId}:${logicalAnalysisId}`)
          .digest('hex');
        const handle = await tasks.trigger('analiza-mancare-ai', {
          jobId: job.id,
          userId,
          imageUrl: normalizedImageUrl,
          imageFileId: normalizedImageFileId,
          tipMasa: input.mealType || 'Pranz',
          limba: input.language || 'ro',
          reservationId,
        }, {
          idempotencyKey,
          idempotencyKeyTTL: '24h',
        });
        await repo.attachTriggerRun({ jobId: job.id, triggerRunId: handle.id });
        inregistreazaOperational('photo.queued');
        return Object.freeze({ ...job, triggerRunId: handle.id, replay: false });
      } catch (error) {
        if (job?.id) {
          await repo.markFailed({ jobId: job.id, errorCode: 'TRIGGER_DISPATCH_FAILED' }).catch(() => {});
        }
        await flowCredits.releasePhoto({
          userId,
          reservationId,
          reason: 'TRIGGER_DISPATCH_FAILED',
        }).catch(() => {});
        inregistreazaOperational('credit.release');
        inregistreazaOperational('photo.dispatch_failed');
        if (error instanceof PhotoJobError) throw error;
        throw new PhotoJobError('TRIGGER_DISPATCH_FAILED');
      }
    },

    async getJob({ userId, jobId, dataContext } = {}) {
      const owned = await repo.getOwned({
        ctx: dataContext,
        userId: requireString(userId, 'INVALID_USER', 128),
        jobId: requireString(jobId, 'INVALID_JOB_ID', 128),
      });
      if (!owned) throw new PhotoJobError('PHOTO_JOB_NOT_FOUND', 404);
      return owned;
    },

    getActive({ userId, dataContext } = {}) {
      return repo.getActiveOwned({
        ctx: dataContext,
        userId: requireString(userId, 'INVALID_USER', 128),
      });
    },
  });
}

module.exports = { createPhotoJobService, PhotoJobError };
