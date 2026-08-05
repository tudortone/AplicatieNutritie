'use strict';

const express = require('express');
const router = express.Router();

/**
 * Rute de status AI (GET /api/ai-status).
 *
 * Nota limiter: selectia limiter-ului pentru /api/ai-status o face switch-ul din
 * server.js (statusLimiter pe aceasta cale, preAuthLimiter pe restul). Nu se
 * re-aplica limiter aici — altfel fiecare cerere ar fi contorizata de doua ori.
 */
function createStatusRouter({ getProviderStatus, getAiStatistici }) {
  router.get('/ai-status', async (req, res) => {
    res.json({
      gemini: await getProviderStatus('gemini'),
      openai: await getProviderStatus('openai'),
      groq: await getProviderStatus('groq'),
      openrouter: await getProviderStatus('openrouter'),
      // B-23: tokeni, cost estimat si rata de esec, per furnizor si ruta.
      metriciAi: getAiStatistici(),
    });
  });

  return router;
}

module.exports = createStatusRouter;
