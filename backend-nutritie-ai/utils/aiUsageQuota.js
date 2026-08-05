'use strict';

/**
 * Plafon zilnic pentru cererile AI costisitoare.
 *
 * Contorul este partajat intre instante prin Redis, daca REDIS_URL este
 * configurat. Daca Redis cade, se continua cu o rezerva locala marginita, in
 * acord cu politica de disponibilitate din storePartajat.js.
 */

const { creeazaContorPartajat } = require('./contorPartajat');

const DAILY_LIMIT = 50;
const WINDOW_MS = 24 * 60 * 60 * 1000;

function creeazaCheckAiUsageQuota({ contor, limitaZi = DAILY_LIMIT, fereastraMs = WINDOW_MS } = {}) {
  const sursa = contor || creeazaContorPartajat({
    url: process.env.REDIS_URL,
    prefix: 'nutri:quota-ai',
  });

  return async function checkAiUsageQuota(req, res, next) {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        eroare: 'Acces neautorizat. Token lipsă sau nevalidat.',
      });
    }

    const count = await sursa.increment(userId, fereastraMs);
    if (!Number.isFinite(count)) {
      return res.status(503).json({
        eroare: 'Contorul de analize AI este temporar indisponibil.',
        cod: 'AI_QUOTA_STORE_UNAVAILABLE',
      });
    }

    if (count > limitaZi) {
      const secundeRamase = await sursa.ttl(userId);
      const oreRamase = secundeRamase > 0 ? Math.ceil(secundeRamase / 3600) : 24;
      return res.status(429).json({
        eroare: `Ai atins plafonul zilnic de ${limitaZi} de analize AI. Limita se resetează în aproximativ ${oreRamase} ore.`,
        cod: 'AI_QUOTA_EXCEEDED',
      });
    }

    res.setHeader('X-AI-Quota-Remaining', Math.max(0, limitaZi - count));
    return next();
  };
}

const checkAiUsageQuota = creeazaCheckAiUsageQuota();

module.exports = {
  checkAiUsageQuota,
  creeazaCheckAiUsageQuota,
  DAILY_LIMIT,
  WINDOW_MS,
};
