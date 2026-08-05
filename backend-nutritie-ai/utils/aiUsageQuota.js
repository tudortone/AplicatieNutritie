'use strict';

/**
 * Middleware pentru plafonarea costurilor AI per utilizator (S-10).
 * Previne facturi neașteptate prin limitarea numărului de cereri AI scumpe pe o fereastră de 24 ore.
 *
 * Refactor audit 2026-08 (P1.1): contorul a fost mutat din Map per-proces intr-un
 * registru cheie-valoare partajat (Redis, daca e configurat) prin increment atomic.
 * Pe mai multe instante, inainte fiecare proces avea propriul Map cu 50/zi, deci
 * plafonul real era 50 * numarul_de_instante. Acum limita e globala si fereastra
 * de reset este definita de TTL-ul cheii, nu de un `resetTime` per proces.
 */

const { creazaRegistruCheiValori } = require('./storePartajat');

const DAILY_LIMIT = 50; // Maxim 50 cereri AI per utilizator în 24h
const WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Fabrica de middleware. `registru` trebuie sa fie un store din
 * creazaRegistruCheiValori() (suporta increment + ttl). Fara registru explicit,
 * se foloseste un Map in-memory — cazul testelor si al unei instante unice fara Redis.
 */
function creeazaCheckAiUsageQuota({ registru, limitaZi = DAILY_LIMIT } = {}) {
  const sursa = registru || creazaRegistruCheiValori({});

  return async function checkAiUsageQuota(req, res, next) {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ eroare: 'Acces neautorizat. Token lipsă sau nevalidat.' });
    }

    const count = await sursa.increment(userId, WINDOW_MS);
    if (count === null || count === undefined) {
      // Contor indisponibil (Redis cazut / capacitate interna): fail-closed. O
      // cerere necontorizata ar lasa costul AI fara plafon sub incarcare.
      return res.status(503).json({
        eroare: 'Contorul de analize AI este temporar indisponibil. Incearca din nou peste un minut.',
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

    res.setHeader('X-AI-Quota-Remaining', limitaZi - count);
    next();
  };
}

// Instanta implicita, compatibila cu importul vechi din server.js si cu testele
// care exercita middleware-ul fara sa construiasca un registru partajat.
const checkAiUsageQuota = creeazaCheckAiUsageQuota({});

module.exports = {
  checkAiUsageQuota,
  creeazaCheckAiUsageQuota,
  DAILY_LIMIT,
  WINDOW_MS,
};
