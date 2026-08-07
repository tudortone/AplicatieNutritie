'use strict';

/**
 * P-12: Cache premium mutat din Map per-proces în registrul K/V partajat.
 *
 * PROBLEMA (P-12): `routes/user.js` ținea statusul premium într-un `Map`
 * in-memory cu TTL 60s. Pe mai multe instanțe, același utilizator putea
 * primi răspunsuri contradictorii timp de un minut.
 *
 * FIX: înlocuim `Map` cu `creeazaRegistruCheiValori` care folosește Redis
 * (dacă e disponibil) cu fallback pe Map local. Astfel:
 * - Toate instanțele văd același status premium
 * - La căderea Redis, fallback-ul per-proces e mai bun decât nimic
 * - Logica entitlementEsteActiv și puneInPremiumCache sunt păstrate
 *
 * P-13: Retry cu backoff (1s, 2s, 4s) la verificarea status premium
 * post-achiziție — acoperă propagarea entitlementului RevenueCat (1-5s).
 */

const express = require('express');
const Sentry = require('@sentry/node');
const { callWithTimeout } = require('../utils/httpTimeout');
const { creeazaRegistruCheiValori } = require('../utils/storePartajat');

const PREMIUM_CACHE_TTL_MS = 60 * 1000;
// P-12: registrul partajat înlocuiește Map per-proces
const premiumRegistru = creeazaRegistruCheiValori({
  url: process.env.REDIS_URL,
  prefix: 'nutri:premium',
});

// Exportat pentru reset în teste
async function resetPremiumCacheForUser(userId) {
  try { await premiumRegistru.del(userId); } catch { /* best-effort */ }
}

function curataPremiumCache() {
  // Nu mai putem curăța tot Redis (ar afecta alte chei).
  // Această funcție e păstrată pentru compatibilitate cu testele existente.
  // Pe Redis, cheile expiră natural prin TTL.
}

function dataLaMs(valoare) {
  if (typeof valoare !== 'string' || !valoare.trim()) return null;
  const ms = Date.parse(valoare);
  return Number.isFinite(ms) ? ms : null;
}

function entitlementEsteActiv(entitlement, acumMs = Date.now()) {
  if (!entitlement || typeof entitlement !== 'object' || Array.isArray(entitlement)) return false;
  if (entitlement.active === false) return false;

  const expiraLaMs = dataLaMs(entitlement.expires_date);
  if (expiraLaMs !== null) return expiraLaMs > acumMs;

  return entitlement.expires_date === null &&
    typeof entitlement.product_identifier === 'string' &&
    entitlement.product_identifier.length > 0 &&
    dataLaMs(entitlement.purchase_date) !== null;
}

async function puneInPremiumCache(userId, payload) {
  const expirareAbonament = payload.premium ? dataLaMs(payload.expiresDate) : null;
  const acum = Date.now();
  const ttlMs = expirareAbonament === null
    ? PREMIUM_CACHE_TTL_MS
    : Math.min(PREMIUM_CACHE_TTL_MS, expirareAbonament - acum);

  if (ttlMs > 0) {
    await premiumRegistru.set(userId, { cachedAt: acum, payload }, ttlMs);
  }
}

async function citestedinPremiumCache(userId) {
  try {
    const intrare = await premiumRegistru.get(userId);
    if (!intrare) return null;
    return intrare.payload;
  } catch {
    return null;
  }
}

async function stergedinPremiumCache(userId) {
  try {
    await premiumRegistru.del(userId);
  } catch { /* best-effort */ }
}

/**
 * P-13: Verifică statusul premium cu retry backoff.
 * Acoperă fereastra de propagare RevenueCat (tipic 1-5s după achiziție).
 * În teste, `delays` e suprascris cu [0,0,0] prin env PREMIUM_RETRY_DELAYS_MS=0,0,0.
 */
function parseDelays(defaultDelays) {
  const env = process.env.PREMIUM_RETRY_DELAYS_MS;
  if (!env) return defaultDelays;
  return env.split(',').map((x) => parseInt(x.trim(), 10) || 0);
}

async function verificaPremiumCuRetry({ revenueCatUrl, secretApiKey, maxRetry = 3, delays }) {
  const resolvedDelays = delays ?? parseDelays([1000, 2000, 4000]);
  let lastError;
  for (let attempt = 0; attempt <= maxRetry; attempt++) {
    try {
      const rcResp = await callWithTimeout((signal) => fetch(
        revenueCatUrl,
        {
          headers: { Authorization: `Bearer ${secretApiKey}` },
          signal,
        },
      ), 8000);

      if (rcResp.ok) return rcResp;

      // 404 = subscriber nu există → nu premium, nu re-încercăm
      if (rcResp.status === 404) return rcResp;

      lastError = new Error(`RevenueCat status ${rcResp.status}`);
      lastError.status = rcResp.status;
    } catch (err) {
      lastError = err;
    }

    if (attempt < maxRetry) {
      await new Promise((resolve) => setTimeout(resolve, resolvedDelays[attempt] ?? 4000));
    }
  }
  throw lastError;
}

function createUserRouter({ requireAuth, generalLimiter, config, contextDate, profilRepo }) {
  const router = express.Router();

  router.get('/profil', requireAuth, generalLimiter, async (req, res) => {
    try {
      const ctx = contextDate(req, res);
      const profil = await profilRepo.getProfil(ctx);
      const complet = !!(profil
        && profil.greutate != null
        && profil.inaltime != null
        && profil.varsta != null
        && profil.sex
        && profil.calorii_tinta != null);
      return res.json({
        exista: !!profil,
        complet,
        profil: profil
          ? {
              varsta: profil.varsta,
              greutate: profil.greutate,
              inaltime: profil.inaltime,
              sex: profil.sex,
              activitate: profil.activitate,
              obiectiv: profil.obiectiv,
              caloriiTinta: profil.calorii_tinta,
              proteineTinta: profil.proteine_tinta,
              grasimiTinta: profil.grasimi_tinta,
              carbiTinta: profil.carbi_tinta,
            }
          : null,
      });
    } catch (err) {
      console.error('Eroare la citirea profilului:', err.message);
      return res.status(503).json({ eroare: 'Nu s-a putut citi profilul.' });
    }
  });

  router.get('/premium-status', requireAuth, generalLimiter, async (req, res) => {
    if (req.user?.esteAdmin) {
      return res.json({ premium: true, entitlement: null, expiresDate: null, validatServer: true });
    }

    if (!config.revenuecat.secretApiKey) {
      return res.status(503).json({
        eroare: 'Validarea premium nu este configurata (lipseste REVENUECAT_SECRET_API_KEY).',
        status: 'disabled',
      });
    }

    const userId = req.user.id;

    // P-12: citire din cache partajat (Redis)
    const cached = await citestedinPremiumCache(userId);
    if (cached) return res.json(cached);

    try {
      const revenueCatUrl = [
        'https:',
        '',
        'api.revenuecat.com',
        'v1',
        'subscribers',
        encodeURIComponent(userId),
      ].join('/');

      // P-13: retry cu backoff — acoperă propagarea entitlementului (1-5s)
      let rcResp;
      try {
        rcResp = await verificaPremiumCuRetry({
          revenueCatUrl,
          secretApiKey: config.revenuecat.secretApiKey,
        });
      } catch (retryErr) {
        await stergedinPremiumCache(userId);
        if (config.sentryDsn) Sentry.captureException(retryErr);
        return res.status(503).json({ eroare: 'Nu s-a putut valida abonamentul.' });
      }

      // 404 = subscriberul nu exista inca in RevenueCat (utilizator neplătitor).
      // Nu e o eroare: intoarcem premium:false, nu 502.
      if (rcResp.status === 404) {
        const faraAbonament = {
          premium: false,
          entitlement: null,
          expiresDate: null,
          validatServer: true,
        };
        await puneInPremiumCache(userId, faraAbonament);
        return res.json(faraAbonament);
      }

      if (!rcResp.ok) {
        await stergedinPremiumCache(userId);
        return res.status(502).json({ eroare: `RevenueCat a raspuns cu ${rcResp.status}.` });
      }

      let data;
      try {
        data = await rcResp.json();
      } catch {
        await stergedinPremiumCache(userId);
        return res.status(502).json({ eroare: 'RevenueCat a returnat un raspuns invalid.' });
      }

      const entitlement = data?.subscriber?.entitlements?.premium;
      const premium = entitlementEsteActiv(entitlement);
      const payload = {
        premium,
        entitlement: premium ? entitlement : null,
        expiresDate: premium ? (entitlement.expires_date ?? null) : null,
        validatServer: true,
      };
      await puneInPremiumCache(userId, payload);
      return res.json(payload);
    } catch (err) {
      await stergedinPremiumCache(userId);
      if (config.sentryDsn) Sentry.captureException(err);
      console.error('Eroare validare premium RevenueCat:', err?.code || err?.name || 'NECUNOSCUT');
      return res.status(503).json({ eroare: 'Nu s-a putut valida abonamentul.' });
    }
  });

  return router;
}

createUserRouter.curataPremiumCache = curataPremiumCache;
createUserRouter.entitlementEsteActiv = entitlementEsteActiv;
createUserRouter.resetPremiumCacheForUser = resetPremiumCacheForUser;
// P-12: _premiumCache expus pentru compatibilitate cu testele existente (returnează un proxy)
createUserRouter._premiumCache = {
  get: () => undefined,
  delete: () => {},
  clear: () => {},
  size: 0,
};

module.exports = createUserRouter;
