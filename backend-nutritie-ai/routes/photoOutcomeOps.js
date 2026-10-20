'use strict';

const express = require('express');
const { esteUuid } = require('../utils/identitate');

function createPhotoOutcomeOpsRouter({ requireAuth, generalLimiter, flowCredits } = {}) {
  if (typeof requireAuth !== 'function' || typeof generalLimiter !== 'function'
    || typeof flowCredits?.listPhotoOutcomeReconciliationQueue !== 'function'
    || typeof flowCredits?.resolvePhotoOutcomeUnknown !== 'function') {
    throw new TypeError('Photo outcome operations dependencies are required.');
  }

  const router = express.Router();
  const requireAdmin = (req, res, next) => {
    if (req.user?.esteAdmin !== true) {
      return res.status(403).json({ eroare: 'Acces neautorizat.', cod: 'ADMIN_REQUIRED' });
    }
    return next();
  };

  router.get('/admin/photo-outcomes/unknown', requireAuth, generalLimiter, requireAdmin, async (_req, res) => {
    try {
      const outcomes = await flowCredits.listPhotoOutcomeReconciliationQueue({ limit: 50 });
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ outcomes });
    } catch {
      return res.status(503).json({ eroare: 'Coada de reconciliere este indisponibilă.', cod: 'PHOTO_RECONCILIATION_UNAVAILABLE' });
    }
  });

  router.post('/admin/photo-outcomes/:userId/:reservationId/confirm-failure', requireAuth, generalLimiter, requireAdmin, async (req, res) => {
    const { userId, reservationId } = req.params;
    const { confirmedFailure, evidenceReference } = req.body || {};
    if (!esteUuid(userId) || !esteUuid(reservationId) || confirmedFailure !== true
      || typeof evidenceReference !== 'string' || !/^[A-Za-z0-9._:-]{1,256}$/.test(evidenceReference)) {
      return res.status(400).json({ eroare: 'Este necesară dovadă validă pentru eșecul confirmat.', cod: 'CONFIRMED_FAILURE_EVIDENCE_REQUIRED' });
    }
    try {
      const result = await flowCredits.resolvePhotoOutcomeUnknown({
        userId, reservationId, evidenceReference, operatorId: req.user.id,
      });
      return res.status(200).json({ status: result.status, replay: result.replay === true });
    } catch (error) {
      const status = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599
        ? error.status
        : 503;
      const code = typeof error?.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(error.code)
        ? error.code
        : 'PHOTO_RECONCILIATION_UNAVAILABLE';
      const eroare = status === 409
        ? 'Rezultatul nu poate fi reconciliat.'
        : 'Rezultatul nu a putut fi reconciliat.';
      return res.status(status).json({ eroare, cod: code });
    }
  });

  return router;
}

module.exports = createPhotoOutcomeOpsRouter;
