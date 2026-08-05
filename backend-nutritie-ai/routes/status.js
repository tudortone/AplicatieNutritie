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
 * GET /api/ai-status ramane utilizabil de ecranul camerei, dar expune numai
 * disponibilitatea necesara UI-ului. Modelele, mesajele interne, tokenii,
 * costurile si rata de esec nu mai sunt trimise pe un endpoint public.
 */
function createStatusRouter({ getProviderStatus }) {
  const router = express.Router();

  router.get('/ai-status', async (req, res, next) => {
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
