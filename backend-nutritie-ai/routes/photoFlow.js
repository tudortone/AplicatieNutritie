'use strict';

const crypto = require('crypto');
const express = require('express');
const { construiesteGazdePermise, creeazaValideazaUrlImagine } = require('../utils/valideazaUrlImagine');
const { PhotoJobError } = require('../services/ai/photoJobService');
const { FlowCreditsError } = require('../services/monetization/flowCreditsService');

function text(value, fallback, max) {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= max ? normalized : fallback;
}

function logicalId(body, userId) {
  const supplied = text(body.analysisId, null, 256);
  if (supplied) return supplied;
  return crypto.createHash('sha256')
    .update(`${userId}:${body.imageFileId || ''}:${body.imageUrl || ''}`)
    .digest('hex');
}

function sendError(res, error) {
  if (error instanceof PhotoJobError || error instanceof FlowCreditsError) {
    if (error.code === 'PHOTO_IN_PROGRESS') res.setHeader('Retry-After', '5');
    return res.status(error.status || 503).json({
      eroare: 'Operația foto nu a putut fi pornită.',
      cod: error.code,
    });
  }
  return res.status(503).json({
    eroare: 'Serviciul de analiză foto este temporar indisponibil.',
    cod: 'PHOTO_SERVICE_UNAVAILABLE',
  });
}

function createPhotoFlowRouter({
  requireAuth,
  aiLimiter,
  generalLimiter,
  photoJobs,
  flowCredits,
  contextDate,
  config,
  imagekit = null,
  integrityGuard,
} = {}) {
  if (!photoJobs || !flowCredits || typeof contextDate !== 'function' || typeof integrityGuard !== 'function') {
    throw new TypeError('Photo Flow router dependencies are required.');
  }
  const router = express.Router();
  const submitIntegrity = integrityGuard({ action: 'photo.submit', canonicalPath: '/photo-jobs' });
  const allowedHosts = construiesteGazdePermise({
    imagekitUrlEndpoint: config?.imagekit?.urlEndpoint,
    supabaseUrl: config?.supabase?.url,
  });

  router.get('/flow-credits', requireAuth, generalLimiter, async (req, res) => {
    try {
      return res.json(await flowCredits.getBalance({ userId: req.user.id }));
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post('/photo-jobs', requireAuth, aiLimiter, submitIntegrity, async (req, res) => {
    if (!config?.triggerSecretKey) {
      return res.status(503).json({
        eroare: 'Procesarea foto asincronă este temporar indisponibilă.',
        cod: 'PHOTO_QUEUE_DISABLED',
      });
    }
    const validateOwnedUrl = creeazaValideazaUrlImagine({
      gazdePermise: allowedHosts,
      folderPrefix: `/mancare/${req.user.id}/`,
    });
    const validation = validateOwnedUrl(req.body?.imageUrl);
    if (!validation.ok) {
      return res.status(400).json({ eroare: validation.eroare, cod: 'INVALID_IMAGE_URL' });
    }
    try {
      const job = await photoJobs.submit({
        userId: req.user.id,
        logicalAnalysisId: logicalId(req.body || {}, req.user.id),
        imageUrl: validation.url || req.body.imageUrl,
        imageFileId: text(req.body?.imageFileId, null, 512),
        mealType: text(req.body?.mealType, 'Pranz', 50),
        language: text(req.body?.language, 'ro', 10),
        fullAccess: req.user.esteTester === true,
        dataContext: contextDate(req, res),
      });
      return res.status(job.replay && job.status !== 'failed' ? 200 : 202).json(job);
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.get('/photo-jobs/active', requireAuth, generalLimiter, async (req, res) => {
    try {
      const job = await photoJobs.getActive({
        userId: req.user.id,
        dataContext: contextDate(req, res),
      });
      return res.json({ job: job || null });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.get('/photo-jobs/:jobId', requireAuth, generalLimiter, async (req, res) => {
    try {
      return res.json(await photoJobs.getJob({
        userId: req.user.id,
        jobId: req.params.jobId,
        dataContext: contextDate(req, res),
      }));
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post('/photo-assets/cleanup', requireAuth, generalLimiter, async (req, res) => {
    const fileId = text(req.body?.fileId, null, 256);
    if (!fileId || !/^[a-zA-Z0-9_-]+$/.test(fileId)) {
      return res.status(400).json({ eroare: 'Referință media invalidă.', cod: 'INVALID_FILE_ID' });
    }
    if (!imagekit?.getFileDetails || !imagekit?.deleteFile) {
      return res.status(503).json({ eroare: 'Curățarea media este indisponibilă.', cod: 'MEDIA_CLEANUP_DISABLED' });
    }
    try {
      const details = await imagekit.getFileDetails(fileId);
      const path = typeof details?.filePath === 'string' ? details.filePath : '';
      if (!path.startsWith(`/mancare/${req.user.id}/`)) {
        return res.status(403).json({ eroare: 'Assetul nu aparține contului curent.', cod: 'MEDIA_NOT_OWNED' });
      }
      await imagekit.deleteFile(fileId);
      return res.status(204).end();
    } catch {
      return res.status(503).json({ eroare: 'Assetul nu a putut fi curățat.', cod: 'MEDIA_CLEANUP_FAILED' });
    }
  });

  return router;
}

module.exports = createPhotoFlowRouter;
module.exports.logicalId = logicalId;
