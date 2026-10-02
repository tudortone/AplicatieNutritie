'use strict';

const express = require('express');
const { compuneRaspunsAcces } = require('../utils/accessEntitlement');

function bodyHasOnly(body, keys) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const actual = Object.keys(body).sort();
  return actual.length === keys.length && keys.every((key, index) => key === actual[index]);
}

function safeBillingError(res, error) {
  const status = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599
    ? error.status
    : 503;
  const code = typeof error?.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(error.code)
    ? error.code
    : 'GOOGLE_BILLING_UNAVAILABLE';
  return res.status(status).json({
    eroare: 'Verificarea Google Play nu a putut fi finalizata.',
    cod: code,
  });
}

function createBillingGoogleRouter({
  requireAuth,
  billingLimiter,
  billingService,
  googlePlayConfig,
  integrityGuard,
} = {}) {
  if (!billingService || !googlePlayConfig || typeof integrityGuard !== 'function') {
    throw new TypeError('Google billing route dependencies are required.');
  }
  const router = express.Router();
  const verifyIntegrity = integrityGuard({
    action: 'billing.verify',
    canonicalPath: '/billing/google/verify',
    preserveEntitlement: true,
  });
  const resyncIntegrity = integrityGuard({
    action: 'billing.resync',
    canonicalPath: '/billing/google/resync',
    preserveEntitlement: true,
  });
  const consumableIntegrity = integrityGuard({
    action: 'billing.verify-consumable',
    canonicalPath: '/billing/google/verify-consumable',
    preserveEntitlement: true,
  });

  router.get('/products', requireAuth, billingLimiter, (_req, res) => res.json({
    packageName: googlePlayConfig.packageName,
    productIds: [...googlePlayConfig.productIds],
    creditProductIds: [...(googlePlayConfig.creditProductIds || [])],
  }));

  router.post('/verify', requireAuth, billingLimiter, verifyIntegrity, async (req, res) => {
    if (!bodyHasOnly(req.body, ['purchaseToken']) || typeof req.body.purchaseToken !== 'string') {
      return res.status(400).json({ eroare: 'Corpul cererii billing este invalid.' });
    }
    try {
      const paid = await billingService.verifyAndPersist({
        userId: req.user.id,
        purchaseToken: req.body.purchaseToken,
      });
      return res.json(compuneRaspunsAcces(req.user, paid));
    } catch (error) {
      return safeBillingError(res, error);
    }
  });

  router.post('/resync', requireAuth, billingLimiter, resyncIntegrity, async (req, res) => {
    if (!bodyHasOnly(req.body, ['purchaseTokens']) || !Array.isArray(req.body.purchaseTokens)) {
      return res.status(400).json({ eroare: 'Corpul cererii billing este invalid.' });
    }
    try {
      const restored = await billingService.resync({
        userId: req.user.id,
        purchaseTokens: req.body.purchaseTokens,
      });
      const paid = await billingService.getPaidEntitlement({ userId: req.user.id });
      return res.json({
        ...compuneRaspunsAcces(req.user, paid),
        restored: restored.results.length,
      });
    } catch (error) {
      return safeBillingError(res, error);
    }
  });

  router.post('/verify-consumable', requireAuth, billingLimiter, consumableIntegrity, async (req, res) => {
    if (
      !bodyHasOnly(req.body, ['productId', 'purchaseToken']) ||
      typeof req.body.productId !== 'string' ||
      typeof req.body.purchaseToken !== 'string'
    ) {
      return res.status(400).json({ eroare: 'Corpul cererii billing este invalid.' });
    }
    try {
      return res.json(await billingService.verifyConsumable({
        userId: req.user.id,
        productId: req.body.productId,
        purchaseToken: req.body.purchaseToken,
      }));
    } catch (error) {
      return safeBillingError(res, error);
    }
  });

  return router;
}

module.exports = createBillingGoogleRouter;
