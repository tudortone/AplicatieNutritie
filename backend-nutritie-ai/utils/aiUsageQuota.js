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

    // Contul de admin are analize AI nelimitate — nu consuma din plafonul zilnic sau credite.
    if (req.user?.esteAdmin) {
      return next();
    }

    // Pas 1: Consumă ÎNTÂI creditele plătite ale utilizatorului prin RPC consuma_credit
    if (req.supabaseAdmin) {
      try {
        const { data: soldRamas, error } = await req.supabaseAdmin.rpc('consuma_credit', {
          p_user_id: userId,
          p_cost: 1,
        });

        if (!error && typeof soldRamas === 'number' && soldRamas >= 0) {
          res.setHeader('X-Credite-Ramase', String(soldRamas));
          res.setHeader('X-AI-Quota-Remaining', String(soldRamas));
          return next();
        }
      } catch {
        // Fără credite plătite disponibile → continuăm pe cota zilnică gratuită
      }
    }

    // Pas 2: Dacă soldul de credite plătite este 0, utilizatorul consumă din cota zilnică gratuită
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
        eroare: `Ai atins plafonul zilnic gratuit de ${limitaZi} de analize AI. Limita se resetează în aproximativ ${oreRamase} ore. Puteți achiziționa credite suplimentare.`,
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
