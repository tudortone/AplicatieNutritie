'use strict';

const express = require('express');

const STATUSURI_PUBLICE = new Set([
  'active',
  'disponibil',
  'ok',
  'cooldown',
  'rate_limit',
  'indisponibil',
]);

function statusPublic(detalii) {
  const statusBrut = String(detalii?.status || 'indisponibil');
  const status = STATUSURI_PUBLICE.has(statusBrut) ? statusBrut : 'indisponibil';
  const secunde = Number(detalii?.secundeRamase);
  return {
    status,
    secundeRamase: Number.isFinite(secunde) ? Math.max(0, Math.min(Math.ceil(secunde), 3600)) : 0,
  };
}

/**
 * GET /api/ai-status este protejat cu JWT si rate limiting. Raspunsul ramane
 * minimal: nu expune modele, tokeni, costuri sau mesaje interne ale providerilor.
 */
function createStatusRouter({ requireAuth, getProviderStatus }) {
  if (typeof requireAuth !== 'function') {
    throw new TypeError('requireAuth este obligatoriu pentru status router.');
  }
  if (typeof getProviderStatus !== 'function') {
    throw new TypeError('getProviderStatus este obligatoriu pentru status router.');
  }

  const router = express.Router();

  router.get('/ai-status', requireAuth, async (_req, res, next) => {
    try {
      const [gemini, openai, groq, openrouter] = await Promise.all([
        getProviderStatus('gemini'),
        getProviderStatus('openai'),
        getProviderStatus('groq'),
        getProviderStatus('openrouter'),
      ]);
      return res.json({
        gemini: statusPublic(gemini),
        openai: statusPublic(openai),
        groq: statusPublic(groq),
        openrouter: statusPublic(openrouter),
      });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

createStatusRouter.statusPublic = statusPublic;

module.exports = createStatusRouter;
