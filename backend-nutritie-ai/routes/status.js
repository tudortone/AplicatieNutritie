'use strict';

const express = require('express');

/**
 * Rute de status AI (GET /api/ai-status).
 * Limiter-ul este selectat o singura data in server.js.
 */
function createStatusRouter({ getProviderStatus, getAiStatistici }) {
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
        gemini,
        openai,
        groq,
        openrouter,
        metriciAi: getAiStatistici(),
      });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

module.exports = createStatusRouter;
