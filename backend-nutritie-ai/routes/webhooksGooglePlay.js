'use strict';

const express = require('express');
const { GooglePubsubAuthError } = require('../utils/googlePubsubAuth');
const { hashPurchaseToken } = require('../services/billing/googleBillingService');

function safeCode(error, fallback) {
  const code = typeof error?.code === 'string' ? error.code : fallback;
  return /^[A-Z0-9_]{1,64}$/.test(code) ? code : fallback;
}

function base64Json(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    return null;
  }
  try {
    const decoded = Buffer.from(value, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function dateIso(value) {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function millisIso(value) {
  if (typeof value !== 'string' || !/^\d{10,16}$/.test(value)) return null;
  const ms = Number(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function validToken(value) {
  return typeof value === 'string' && value.length >= 20 && value.length <= 4096 && /^[\x21-\x7e]+$/.test(value);
}

function createGooglePlayWebhookRouter({ verifier, repo, billingService, googlePlayConfig } = {}) {
  if (!verifier || !repo || !billingService || !googlePlayConfig) {
    throw new TypeError('Google Play RTDN dependencies are required.');
  }
  const router = express.Router();

  const authenticate = async (req, res, next) => {
    try {
      await verifier.verifyRequest(req);
      next();
    } catch (error) {
      const status = error instanceof GooglePubsubAuthError ? error.status : 401;
      res.status(status).json({ eroare: 'Autentificare Pub/Sub invalida.' });
    }
  };

  router.post('/', authenticate, express.json({ limit: '64kb', strict: true }), async (req, res) => {
    const message = req.body?.message;
    if (!message || typeof message !== 'object' || Array.isArray(message) ||
        typeof message.messageId !== 'string' || message.messageId.length === 0 || message.messageId.length > 512) {
      return res.status(400).json({ eroare: 'Mesaj Pub/Sub invalid.' });
    }
    const notification = base64Json(message.data);
    if (!notification || typeof notification.packageName !== 'string') {
      return res.status(400).json({ eroare: 'Date RTDN invalide.' });
    }

    const subscriptionNotification = notification.subscriptionNotification;
    const hasSubscription = subscriptionNotification &&
      typeof subscriptionNotification === 'object' &&
      !Array.isArray(subscriptionNotification);
    const purchaseToken = hasSubscription ? subscriptionNotification.purchaseToken : null;
    const notificationType = hasSubscription && Number.isInteger(subscriptionNotification.notificationType)
      ? subscriptionNotification.notificationType
      : null;
    const tokenIsValid = purchaseToken == null || validToken(purchaseToken);
    const event = {
      messageId: message.messageId,
      publishTime: dateIso(message.publishTime),
      eventTime: millisIso(notification.eventTimeMillis),
      packageName: notification.packageName,
      notificationType,
      purchaseTokenHash: validToken(purchaseToken) ? hashPurchaseToken(purchaseToken) : null,
    };

    let claimed;
    try {
      claimed = await repo.claimRtdnEvent(event);
    } catch {
      return res.status(503).json({ eroare: 'Persistenta RTDN indisponibila.' });
    }
    if (!claimed) return res.status(204).end();

    if (notification.packageName !== googlePlayConfig.packageName) {
      await repo.completeRtdnEvent({
        messageId: message.messageId,
        processingStatus: 'ignored',
        errorCode: 'PACKAGE_MISMATCH',
      });
      return res.status(204).end();
    }
    if (!hasSubscription || !tokenIsValid || notificationType == null) {
      await repo.completeRtdnEvent({
        messageId: message.messageId,
        processingStatus: 'ignored',
        errorCode: hasSubscription ? 'INVALID_SUBSCRIPTION_NOTIFICATION' : 'NON_SUBSCRIPTION_NOTIFICATION',
      });
      return res.status(204).end();
    }

    try {
      const result = await billingService.processRtdnToken({
        purchaseToken,
        messageId: message.messageId,
      });
      await repo.completeRtdnEvent({
        messageId: message.messageId,
        processingStatus: result.processed === false ? 'ignored' : 'processed',
        ...(result.processed === false ? { errorCode: result.reason ?? 'UNKNOWN_TOKEN' } : {}),
      });
      return res.status(204).end();
    } catch (error) {
      const retryable = error?.retryable === true || !Number.isInteger(error?.status) || error.status >= 500;
      const errorCode = safeCode(error, 'RTDN_PROCESSING_FAILED');
      try {
        await repo.completeRtdnEvent({
          messageId: message.messageId,
          processingStatus: retryable ? 'retryable_error' : 'permanent_error',
          errorCode,
        });
      } catch {
        return res.status(503).json({ eroare: 'Persistenta RTDN indisponibila.' });
      }
      if (retryable) return res.status(503).json({ eroare: 'Procesarea RTDN va fi reincercata.' });
      return res.status(204).end();
    }
  });

  return router;
}

module.exports = createGooglePlayWebhookRouter;
