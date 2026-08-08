'use strict';

/**
 * Plafon zilnic pentru cererile AI costisitoare.
 *
 * Contorul este partajat intre instante prin Redis, daca REDIS_URL este
 * configurat. Daca Redis cade, se continua cu o rezerva locala marginita, in
 * acord cu politica de disponibilitate din storePartajat.js.
 */

const crypto = require('crypto');

const { creeazaContorPartajat } = require('./contorPartajat');
const { inregistreazaUtilizareAdmin } = require('./clientUtilizator');

const DAILY_LIMIT = 50;
const WINDOW_MS = 24 * 60 * 60 * 1000;

function creeazaCheckAiUsageQuota({
  contor,
  supabaseAdmin = null,
  limitaZi = DAILY_LIMIT,
  fereastraMs = WINDOW_MS,
} = {}) {
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
    const clientSupabase = supabaseAdmin || req.supabaseAdmin;
    if (clientSupabase) {
      try {
        // M-05: generăm un event_id la debitare. Refund-ul (la eșec 5xx) folosește
        // ACELAȘI event_id prin RPC-ul existent aplica_tranzactie_credite (delta +1),
        // iar UNIQUE pe credite_tranzactii.event_id garantează idempotența: dubla
        // debitare/refund pe același eveniment este anulată de DB.
        req._creditEventId = crypto.randomUUID();
        const { data: soldRamas, error } = await clientSupabase.rpc('consuma_credit', {
          p_user_id: userId,
          p_cost: 1,
        });

        if (!error && typeof soldRamas === 'number' && soldRamas >= 0) {
          // C1-S4: RPC consuma_credit executat prin client admin (service_role),
          // fara context per-cerere — quota AI.
          inregistreazaUtilizareAdmin();
          res.setHeader('X-Credite-Ramase', String(soldRamas));
          res.setHeader('X-AI-Quota-Remaining', String(soldRamas));
          // M-05: creditul a fost consumat înainte de a rula operațiunea AI.
          req._creditConsumat = true;

          // M-05: refund atomic și idempotent pe event_id. Dacă următoarea operație
          // AI eșuează (status >= 500), restituim creditul prin RPC-ul existent
          // aplica_tranzactie_credite, cu event_type REFUND_AI_FAILURE și delta +1.
          // Reapelarea cu același event_id e respinsă de DB (UNIQUE pe event_id).
          if (typeof res.once === 'function') {
            res.once('finish', () => {
              // DOAR erorile de server (5xx) arată că operația AI a eșuat — 4xx
              // înseamnă cerere invalidă; acolo creditul nu se returnează.
              if (!req._creditConsumat || !res.statusCode || res.statusCode < 500) return;
              Promise.resolve(clientSupabase.rpc('aplica_tranzactie_credite', {
                p_user_id: userId,
                p_event_id: req._creditEventId,
                p_event_type: 'REFUND_AI_FAILURE',
                p_delta: 1,
                p_produs_id: null,
                p_metadata: { status: res.statusCode },
              })).then(({ error: errRefund }) => {
                if (errRefund) {
                  console.error('[Quota AI] Refund esuat:', errRefund.message);
                }
              }).catch((err) => {
                console.error('[Quota AI] Refund esuat:', err?.message || err);
              });
            });
          }

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
    // S4-03: cota gratuită a fost deja debitată mai sus. Dacă operația AI eșuează
    // (5xx) sau e respinsă de cooldown-ul furnizorului (429), restituim unitatea
    // prin decrement — altfel un eșec arde o analiză gratuită fără rezultat.
    // (Creditul plătit are propriul refund idempotent pe event_id, mai sus.)
    req._quotaGratuitaConsumata = true;
    if (typeof res.once === 'function' && typeof sursa.decrement === 'function') {
      res.once('finish', () => {
        if (!req._quotaGratuitaConsumata || !res.statusCode) return;
        if (res.statusCode !== 429 && res.statusCode < 500) return;
        Promise.resolve(sursa.decrement(userId)).catch((err) => {
          console.error('[Quota AI] Refund cota gratuita esuat:', err?.message || err);
        });
      });
    }
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
