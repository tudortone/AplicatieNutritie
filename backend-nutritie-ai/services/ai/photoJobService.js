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
  if (code === 'PHOTO_IN_PROGRESS') return 409;
  if (code === 'FLOW_CREDITS_EXHAUSTED') return 402;
  if (code === 'PREMIUM_FAIR_USE_REACHED') return 429;
  return 503;
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
      const existing = await repo.findByLogicalId({
        ctx: input.dataContext,
        userId,
        logicalAnalysisId,
      });
      if (existing) return Object.freeze({ ...existing, replay: true });

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
      if (!reservation?.ok) {
        inregistreazaOperational(reservation?.code === 'PREMIUM_FAIR_USE_REACHED'
          ? 'photo.fair_use_rejected'
          : 'photo.admission_rejected');
        throw new PhotoJobError(
          reservation?.code || 'FLOW_CREDITS_UNAVAILABLE',
          admissionStatus(reservation?.code),
        );
      }
      inregistreazaOperational('credit.reserve');
      if (entitlement === 'premium' || entitlement === 'full_access') {
        inregistreazaOperational('photo.entitlement_bypass');
      }

      let job = null;
      try {
        job = await repo.create({
          userId,
          logicalAnalysisId,
          imageUrl: requireString(input.imageUrl, 'INVALID_IMAGE_URL'),
          imageFileId: typeof input.imageFileId === 'string' ? input.imageFileId.slice(0, 512) : null,
          creditReservationId: reservation.reservationId,
          queueName: 'ai-photo',
        });
        if (!job?.id) throw new PhotoJobError('PHOTO_JOB_PERSISTENCE_FAILED');

        const idempotencyKey = crypto.createHash('sha256')
          .update(`getflow-photo:${userId}:${logicalAnalysisId}`)
          .digest('hex');
        const handle = await tasks.trigger('analiza-mancare-ai', {
          jobId: job.id,
          userId,
          imageUrl: input.imageUrl,
          imageFileId: input.imageFileId || null,
          tipMasa: input.mealType || 'Pranz',
          limba: input.language || 'ro',
          reservationId: reservation.reservationId,
        }, {
          idempotencyKey,
          idempotencyKeyTTL: '24h',
        });
        await repo.attachTriggerRun({ jobId: job.id, triggerRunId: handle.id });
        inregistreazaOperational('photo.queued');
        return Object.freeze({ ...job, triggerRunId: handle.id, replay: reservation.replay === true });
      } catch (error) {
        if (job?.id) {
          await repo.markFailed({ jobId: job.id, errorCode: 'TRIGGER_DISPATCH_FAILED' }).catch(() => {});
        }
        await flowCredits.releasePhoto({
          userId,
          reservationId: reservation.reservationId,
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
