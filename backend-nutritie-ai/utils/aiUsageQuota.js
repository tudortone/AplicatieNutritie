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
const { pseudonimizeaza, rezumatEroareSigur } = require('./sentrySanitize');

const DAILY_LIMIT = 50;
const TESTER_DAILY_LIMIT = 500;
const WINDOW_MS = 24 * 60 * 60 * 1000;

// M2: un defect real în consuma_credit (error truthy sau excepție) nu trebuie să
// dispară silențios — un utilizator cu credite plătite ar trece pe cota gratuită
// fără ca nimeni să observe. Emitem o alertă Sentry throttled (fail-loud), dar
// continuăm pe cota gratuită (fail-open pe disponibilitate). Cazul NORMAL „fără
// credite plătite" (soldRamas === -1, fără eroare) NU alertează.
const SALTIRE_ALERTE_CREDITE_MS = 30 * 1000;
const PLAFON_ALERTE_CREDITE = 100;
const ultimaAlertaCredite = new Map();

function alerteazaConsumCreditEsuat(eroare, userId) {
  const acum = Date.now();
  const ultimul = ultimaAlertaCredite.get(userId) || 0;
  if (acum - ultimul < SALTIRE_ALERTE_CREDITE_MS) return;
  // Plafon + curățare expirate + evicție FIFO (patternul din storePartajat.js),
  // ca o eroare abuzivă să nu umfle mapa peste limită.
  if (ultimaAlertaCredite.size >= PLAFON_ALERTE_CREDITE) {
    for (const [cheie, moment] of ultimaAlertaCredite) {
      if (acum - moment >= SALTIRE_ALERTE_CREDITE_MS) ultimaAlertaCredite.delete(cheie);
    }
    if (ultimaAlertaCredite.size >= PLAFON_ALERTE_CREDITE) {
      const ceaMaiVeche = ultimaAlertaCredite.keys().next().value;
      if (ceaMaiVeche !== undefined) ultimaAlertaCredite.delete(ceaMaiVeche);
    }
  }
  ultimaAlertaCredite.set(userId, acum);
  const rezumat = rezumatEroareSigur(eroare, {
    operation: 'consume_paid_credit',
    provider: 'supabase',
  });
  console.warn('[Quota AI] consuma_credit RPC esuat.', rezumat);
  try {
    const Sentry = require('@sentry/node');
    Sentry.withScope((scope) => {
      scope.setLevel('error');
      scope.setTag('component', 'ai-usage-quota');
      scope.setTag('rpc', 'consuma_credit');
      scope.setTag('user_pseudonym', pseudonimizeaza(userId));
      scope.setExtra('error_summary', rezumat);
      Sentry.captureMessage('AI_USAGE_QUOTA_RPC_FAILED');
    });
  } catch {
    // Sentry indisponibil — mesajul a fost deja loggat
  }
}

function creeazaCheckAiUsageQuota({
  contor,
  supabaseAdmin = null,
  billingService = null,
  limitaZi = DAILY_LIMIT,
  limitaTester = TESTER_DAILY_LIMIT,
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

    let estePremium = false;
    if (billingService && typeof billingService.getPaidEntitlement === 'function') {
      try {
        const paid = await billingService.getPaidEntitlement({ userId });
        if (paid?.premium === true) {
          estePremium = true;
        }
      } catch {
        // fail-safe la fluxul normal
      }
    }

    const esteTester = req.user?.esteTester === true;
    const areAccesExtins = esteTester || estePremium;
    const limitaAplicata = areAccesExtins ? limitaTester : limitaZi;

    // ======================================================================
    // P1-12 — AUTORITATEA DE DECONTARE
    // ======================================================================
    // Implicit, decontarea urmează starea conexiunii HTTP: `close` fără răspuns
    // complet înseamnă „a eșuat", deci restituim. Asta e CORECT pentru rutele care
    // chiar ANULEAZĂ munca la deconectare (vision/chat, prin AbortController):
    // acolo socketul închis chiar implică operație oprită.
    //
    // NU este corect pentru rutele care supraviețuiesc deconectării (fallback-ul AI
    // de barcode): acolo operația continuă, produce un rezultat durabil pe care
    // utilizatorul îl primește la următoarea scanare, iar restituirea automată
    // transforma deconectarea într-o sursă de utilizare AI gratuită.
    //
    // O rută declară explicit că decontarea aparține OPERAȚIEI. Semnalul se citește
    // EXCLUSIV din starea server-side (`res.locals`) — niciodată dintr-un antet sau
    // din corpul cererii, ca un client să nu își poată controla propria facturare.
    const decontarePeOperatie = res.locals?.decontareAiPeOperatie === true;

    // Pas 1: Consumă ÎNTÂI creditele plătite ale utilizatorului prin RPC consuma_credit
    // L2: clientul vine doar din `supabaseAdmin` injectat — `req.supabaseAdmin` nu
    // este setat nicăieri în codebase, deci fallback-ul era cod mort și făcea
    // creditarea plătită dependentă de o cale inexistentă.
    const clientSupabase = supabaseAdmin;
    if (clientSupabase && !areAccesExtins) {
      // M2: distingem cazul NORMAL „utilizator fără credite plătite" (soldRamas === -1,
      // fără eroare) de un defect real al RPC (error truthy sau excepție), care până
      // acum se pierdea în catch-ul gol. Doar defectul real alertează (throttled).
      let eroareConsumCredit = null;
      try {
        // M-05/H3: generăm un event_id la debitare. Debitul e înregistrat ATOMIC
        // ca rând CONSUM_AI în credite_tranzactii (consuma_credit, p_event_id) —
        // astfel un crash hard între debit și răspuns e detectabil de jobul de
        // reconciliere (reconcileCredite.js), care restituie debitul orfan.
        // Refund-ul (eșec 5xx) și confirmarea (succes 2xx) folosesc event_id-uri
        // derivate `refund:<id>` / `ok:<id>` ca să NU colizeze cu rândul CONSUM_AI
        // (UNIQUE pe credite_tranzactii.event_id): UNIQUE garantează că dubla
        // refundare/confirmare pe același eveniment e anulată de DB.
        req._creditEventId = crypto.randomUUID();
        const { data: soldRamas, error } = await clientSupabase.rpc('consuma_credit', {
          p_user_id: userId,
          p_cost: 1,
          p_event_id: req._creditEventId,
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
          const restituiePlatit = () => {
            if (req._creditRestituit || req._creditConfirmat) return;
            req._creditRestituit = true;
            Promise.resolve(clientSupabase.rpc('aplica_tranzactie_credite', {
              p_user_id: userId,
              p_event_id: 'refund:' + req._creditEventId,
              p_event_type: 'REFUND_AI_FAILURE',
              p_delta: 1,
              p_produs_id: null,
              p_metadata: { status: res.statusCode || 'close' },
            })).then(({ error: errRefund }) => {
              if (errRefund) {
              console.error('[Quota AI]', rezumatEroareSigur(errRefund, { operation: 'refund_paid_credit', provider: 'supabase' }));
              }
            }).catch((err) => {
              console.error('[Quota AI]', rezumatEroareSigur(err, { operation: 'refund_paid_credit', provider: 'supabase' }));
            });
          };
          // H3: confirmarea atomică a consumului pe succes 2xx. Fără acest marcaj
          // `ok:<id>` jobul de reconciliere n-ar putea deosebi un consum legitim
          // (răspuns 2xx livrat) de un crash între debit și răspuns și ar restitui
          // în plus creditele câștigate corect. Dacă această scriere eșuează după
          // ce răspunsul a fost livrat, reconcilierea restituie creditul (dezechilibru
          // în favoarea utilizatorului) — acceptabil, direcția e sigură.
          const confirmaConsumat = () => {
            if (req._creditRestituit || req._creditConfirmat) return;
            req._creditConfirmat = true;
            Promise.resolve(clientSupabase.rpc('aplica_tranzactie_credite', {
              p_user_id: userId,
              p_event_id: 'ok:' + req._creditEventId,
              p_event_type: 'CONSUM_AI_CONFIRM',
              p_delta: 0,
              p_produs_id: null,
              p_metadata: { status: res.statusCode || 200 },
            })).then(({ error: errConfirm }) => {
              if (errConfirm) {
              console.error('[Quota AI]', rezumatEroareSigur(errConfirm, { operation: 'confirm_paid_credit', provider: 'supabase' }));
              }
            }).catch((err) => {
              console.error('[Quota AI]', rezumatEroareSigur(err, { operation: 'confirm_paid_credit', provider: 'supabase' }));
            });
          };
          // P1-12: mâner explicit de decontare. Ruta care deține operația logică
          // decide rezultatul; socketul nu mai are autoritate financiară.
          if (res.locals) {
            res.locals.decontareAi = { confirma: confirmaConsumat, restituie: restituiePlatit };
          }

          if (!decontarePeOperatie && typeof res.once === 'function') {
            res.once('finish', () => {
              // Refundăm creditul plătit când operația AI a eșuat: 5xx (eroare de
              // server) sau 429 (cooldown-ul furnizorului, idem cota gratuită de
              // mai jos). 4xx înseamnă cerere invalidă — acolo creditul nu se returnează.
              // La 2xx confirmăm consumul (marcaj `ok:` pentru reconciliere).
              if (!req._creditConsumat || !res.statusCode) return;
              if (res.statusCode !== 429 && res.statusCode < 500) {
                confirmaConsumat();
                return;
              }
              restituiePlatit();
            });
            // G3: și la `close` fără răspuns 2xx complet (client deconectat / socket
            // distrus / 499) restituim creditul. `finish` acoperă 5xx-urile livrate;
            // `close` acoperă cererile abandonate înainte de finalizare. Idempotența
            // rămâne garantată de UNIQUE pe credite_tranzactii.event_id.
            res.once('close', () => {
              if (!req._creditConsumat) return;
              if (res.writableEnded) return;
              restituiePlatit();
            });
          }

          return next();
        }
        if (error) {
          eroareConsumCredit = new Error(
            `consuma_credit RPC esuat: ${error.message || 'eroare necunoscuta'}`,
          );
        }
      } catch (e) {
        eroareConsumCredit = e instanceof Error ? e : new Error(String(e));
      }
      if (eroareConsumCredit) {
        alerteazaConsumCreditEsuat(eroareConsumCredit, userId);
      }
      // Fără credite plătite disponibile (sau defect, alertat mai sus) → continuăm
      // pe cota zilnică gratuită
    }

    // Pas 2: Dacă soldul de credite plătite este 0, utilizatorul consumă din cota zilnică gratuită
    const count = await sursa.increment(userId, fereastraMs);
    // M1: gardă defensivă, nu cale activă în producție. Contorul partajat
    // (contorPartajat.js) degradează prin design la o rezervă locală mărginită
    // când Redis cade (politica de disponibilitate din storePartajat.js:
    // „degradează, nu eșua"), deci `increment` întoarce mereu un număr finit.
    // Păstrăm fail-closed 503 doar ca plasă de siguranță pentru un contor
    // injectat defectuos — contractul rămâne neschimbat.
    if (!Number.isFinite(count)) {
      return res.status(503).json({
        eroare: 'Contorul de analize AI este temporar indisponibil.',
        cod: 'AI_QUOTA_STORE_UNAVAILABLE',
      });
    }

    if (count > limitaAplicata) {
      // B6: refuzul 429 nu trebuie să umfle contorul. Incrementul atomic de mai sus
      // a debitat 1 unitate; o restituim aici ca refuzul să nu prelungească blocarea
      // peste fereastra curentă. Răspunsul 429 rămâne identic (contract neschimbat).
      if (typeof sursa.decrement === 'function') {
        await sursa.decrement(userId).catch((err) => {
          console.error('[Quota AI]', rezumatEroareSigur(err, { operation: 'refund_free_quota_429' }));
        });
      }
      const secundeRamase = await sursa.ttl(userId);
      const oreRamase = secundeRamase > 0 ? Math.ceil(secundeRamase / 3600) : 24;
      if (areAccesExtins) {
        return res.status(429).json({
          eroare: `Ai atins plafonul zilnic intern de ${limitaAplicata} de analize AI. Limita se resetează în aproximativ ${oreRamase} ore.`,
          cod: esteTester ? 'AI_TESTER_QUOTA_EXCEEDED' : 'PREMIUM_FAIR_USE_REACHED',
        });
      }
      return res.status(429).json({
        eroare: `Ai atins plafonul zilnic gratuit de ${limitaZi} de analize AI. Limita se resetează în aproximativ ${oreRamase} ore. Puteți achiziționa credite suplimentare.`,
        cod: 'AI_QUOTA_EXCEEDED',
      });
    }

    res.setHeader('X-AI-Quota-Tier', esteTester ? 'tester' : (estePremium ? 'premium' : 'free'));
    res.setHeader('X-AI-Quota-Remaining', Math.max(0, limitaAplicata - count));
    // S4-03: cota gratuită a fost deja debitată mai sus. Dacă operația AI eșuează
    // (5xx) sau e respinsă de cooldown-ul furnizorului (429), restituim unitatea
    // prin decrement — altfel un eșec arde o analiză gratuită fără rezultat.
    // (Creditul plătit are propriul refund idempotent pe event_id, mai sus.)
    req._quotaGratuitaConsumata = true;
    const restituieGratuit = () => {
      // At-most-once: nici dublă restituire, nici restituire după confirmare.
      if (req._quotaGratuitaRestituita || req._quotaGratuitaConfirmata) return;
      req._quotaGratuitaRestituita = true;
      if (typeof sursa.decrement !== 'function') return;
      Promise.resolve(sursa.decrement(userId)).catch((err) => {
        console.error('[Quota AI]', rezumatEroareSigur(err, { operation: 'refund_free_quota' }));
      });
    };
    // P1-12: cota gratuită nu are marcaj durabil de confirmare (nu există job de
    // reconciliere pentru ea, spre deosebire de creditele plătite). „Confirmarea"
    // înseamnă exact: consumul rămâne definitiv, nicio restituire ulterioară.
    const confirmaGratuit = () => {
      if (req._quotaGratuitaRestituita || req._quotaGratuitaConfirmata) return;
      req._quotaGratuitaConfirmata = true;
    };
    if (res.locals) {
      res.locals.decontareAi = { confirma: confirmaGratuit, restituie: restituieGratuit };
    }

    if (!decontarePeOperatie && typeof res.once === 'function' && typeof sursa.decrement === 'function') {
      res.once('finish', () => {
        if (!req._quotaGratuitaConsumata || !res.statusCode) return;
        if (res.statusCode !== 429 && res.statusCode < 500) return;
        restituieGratuit();
      });
      // G3: și la `close` fără răspuns complet (deconectare / socket distrus / 499)
      // restituim cota gratuită. Flag-ul `_quotaGratuitaRestituita` previne dublul
      // decrement când și `finish` (5xx/429) a restituit deja.
      res.once('close', () => {
        if (!req._quotaGratuitaConsumata) return;
        if (res.writableEnded) return;
        restituieGratuit();
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
  TESTER_DAILY_LIMIT,
  WINDOW_MS,
};
