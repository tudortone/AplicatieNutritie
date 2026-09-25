'use strict';

const express = require('express');

function safeError(res, error, { log = false } = {}) {
  const status = Number.isInteger(error?.status) ? error.status : 503;
  const code = typeof error?.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(error.code) ? error.code : 'REWARDED_UNAVAILABLE';
  if (log) console.warn('[AdMob SSV] Callback rejected:', code);
  return res.status(status).json({ eroare: 'Creditul recompensat nu a putut fi procesat.', cod: code });
}

function createRewardedRouter({ requireAuth, generalLimiter, rewardedService, verifier } = {}) {
  if (!rewardedService || !verifier) throw new TypeError('Rewarded route dependencies are required.');
  const router = express.Router();
  router.post('/rewarded/intents', requireAuth, generalLimiter, async (req, res) => {
    try {
      const intent = await rewardedService.createIntent({ userId: req.user.id });
      return res.status(201).json({ intentId: intent.intentId, expiresAt: intent.expiresAt, ssv: { userId: intent.intentId, customData: intent.customData } });
    } catch (error) {
      return safeError(res, error);
    }
  });
  router.get('/webhooks/admob/rewarded', async (req, res) => {
    try {
      const verified = await verifier.verify(req.originalUrl);
      await rewardedService.applyVerified(verified);
      return res.status(200).json({ ok: true });
    } catch (error) {
      return safeError(res, error, { log: true });
    }
  });
  return router;
}

module.exports = createRewardedRouter;
