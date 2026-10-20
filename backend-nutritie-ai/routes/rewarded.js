'use strict';

const express = require('express');

function safeError(res, error, { log = false } = {}) {
  const status = Number.isInteger(error?.status) ? error.status : 503;
  const code = typeof error?.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(error.code) ? error.code : 'REWARDED_UNAVAILABLE';
  if (log) console.warn('[AdMob SSV] Callback rejected:', code);
  return res.status(status).json({ eroare: 'Creditul recompensat nu a putut fi procesat.', cod: code });
}

function createRewardedRouter({ requireAuth, generalLimiter, rewardedService, billingService, verifier, integrityGuard } = {}) {
  if (!rewardedService || !billingService || typeof billingService.getPaidEntitlement !== 'function' || !verifier || typeof requireAuth !== 'function' || typeof generalLimiter !== 'function' || typeof integrityGuard !== 'function') {
    throw new TypeError('Rewarded route dependencies are required.');
  }
  const router = express.Router();
  const intentIntegrity = integrityGuard({ action: 'rewarded.intent', canonicalPath: '/rewarded/intents' });
  router.post('/rewarded/intents', requireAuth, generalLimiter, intentIntegrity, async (req, res) => {
    try {
      if (req.playIntegrity?.trusted !== true
        || !/^[a-f0-9]{64}$/.test(req.playIntegrity.tokenHash || '')
        || typeof req.playIntegrity.requestHash !== 'string'
        || !req.playIntegrity.requestHash) {
        throw Object.assign(new Error('A verified reward request binding is required.'), { code: 'PLAY_INTEGRITY_REQUIRED', status: 403 });
      }
      if (req.user?.esteAdmin === true || req.user?.esteTester === true) {
        throw Object.assign(new Error('Rewarded ads are not available for full-access accounts.'), { code: 'REWARDED_NOT_ELIGIBLE', status: 403 });
      }
      const paidEntitlement = await billingService.getPaidEntitlement({ userId: req.user.id });
      if (paidEntitlement?.premium === true) {
        throw Object.assign(new Error('Rewarded ads are not available for full-access accounts.'), { code: 'REWARDED_NOT_ELIGIBLE', status: 403 });
      }
      if (paidEntitlement?.premium !== false) {
        throw Object.assign(new Error('Paid access could not be verified.'), { code: 'REWARDED_ENTITLEMENT_UNAVAILABLE', status: 503 });
      }
      const intent = await rewardedService.createIntent({
        userId: req.user.id,
        tokenHash: req.playIntegrity.tokenHash,
        requestHash: req.playIntegrity.requestHash,
      });
      return res.status(intent.replay === true ? 200 : 201).json({
        intentId: intent.intentId,
        expiresAt: intent.expiresAt,
        status: intent.status,
        ssv: { userId: intent.intentId, customData: intent.customData },
      });
    } catch (error) {
      return safeError(res, error);
    }
  });
  router.get('/rewarded/intents/:intentId', requireAuth, generalLimiter, async (req, res) => {
    try {
      const intent = await rewardedService.getIntentStatus({ intentId: req.params.intentId, userId: req.user.id });
      if (!intent) {
        return safeError(res, Object.assign(new Error('Reward intent not found.'), { code: 'REWARDED_INTENT_NOT_FOUND', status: 404 }));
      }
      return res.status(200).json({ status: intent.status });
    } catch (error) {
      return safeError(res, error);
    }
  });
  router.get('/webhooks/admob/rewarded', async (req, res) => {
    try {
      const verified = await verifier.verify(req.originalUrl);
      if (verified.kind === 'console_verification') {
        return res.status(200).json({ ok: true });
      }
      if (verified.kind !== 'reward') {
        throw Object.assign(new Error('Unexpected verified callback kind.'), { code: 'SSV_FORMAT_INVALID', status: 400 });
      }
      await rewardedService.applyVerified(verified);
      return res.status(200).json({ ok: true });
    } catch (error) {
      return safeError(res, error, { log: true });
    }
  });
  return router;
}

module.exports = createRewardedRouter;
