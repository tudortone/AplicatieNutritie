'use strict';

const express = require('express');
const Sentry = require('@sentry/node');
const { callWithTimeout } = require('../utils/httpTimeout');

const PREMIUM_CACHE_TTL_MS = 60 * 1000;
const PREMIUM_CACHE_MAX_ENTRIES = 10000;
const premiumCache = new Map();

function curataPremiumCache() {
  premiumCache.clear();
}

function dataLaMs(valoare) {
  if (typeof valoare !== 'string' || !valoare.trim()) return null;
  const ms = Date.parse(valoare);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * RevenueCat v1 nu garanteaza un camp `active` pe entitlement. Sursa de adevar
 * este expirarea: o data valida trebuie sa fie strict in viitor. Pentru produse
 * lifetime, `expires_date` este null si cerem identificatorul produsului plus o
 * data de achizitie, ca un obiect gol sau malformat sa ramana fail-closed.
 */
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

function puneInPremiumCache(userId, payload) {
  const acum = Date.now();
  if (premiumCache.size >= PREMIUM_CACHE_MAX_ENTRIES) {
    for (const [id, intrare] of premiumCache) {
      if (acum - intrare.cachedAt >= PREMIUM_CACHE_TTL_MS) premiumCache.delete(id);
    }
    if (premiumCache.size >= PREMIUM_CACHE_MAX_ENTRIES) {
      const ceaMaiVeche = premiumCache.keys().next().value;
      if (ceaMaiVeche !== undefined) premiumCache.delete(ceaMaiVeche);
    }
  }

  const expirareAbonament = payload.premium ? dataLaMs(payload.expiresDate) : null;
  const expiraCacheLa = expirareAbonament === null
    ? acum + PREMIUM_CACHE_TTL_MS
    : Math.min(acum + PREMIUM_CACHE_TTL_MS, expirareAbonament);
  premiumCache.set(userId, { cachedAt: acum, expiraCacheLa, payload });
}

/**
 * Rute de utilizator (GET /api/user/premium-status).
 * Validarea premium este fail-closed: timeouturile, cheile lipsa, raspunsurile
 * malformate si entitlement-urile expirate nu pot acorda privilegii.
 */
function createUserRouter({ requireAuth, generalLimiter, config }) {
  const router = express.Router();

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
    const cached = premiumCache.get(userId);
    if (cached) {
      if (Date.now() < cached.expiraCacheLa) return res.json(cached.payload);
      premiumCache.delete(userId);
    }

    try {
      const rcResp = await callWithTimeout((signal) => fetch(
        `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
        {
          headers: {
            Authorization: `Bearer ${config.revenuecat.secretApiKey}`,
            Accept: 'application/json',
          },
          signal,
        },
      ), 8000);

      if (!rcResp.ok) {
        premiumCache.delete(userId);
        return res.status(502).json({ eroare: `RevenueCat a raspuns cu ${rcResp.status}.` });
      }

      let data;
      try {
        data = await rcResp.json();
      } catch {
        premiumCache.delete(userId);
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
      puneInPremiumCache(userId, payload);
      return res.json(payload);
    } catch (err) {
      premiumCache.delete(userId);
      if (config.sentryDsn) Sentry.captureException(err);
      console.error('Eroare validare premium RevenueCat:', err?.code || err?.name || 'NECUNOSCUT');
      return res.status(503).json({ eroare: 'Nu s-a putut valida abonamentul.' });
    }
  });

  return router;
}

createUserRouter.curataPremiumCache = curataPremiumCache;
createUserRouter.entitlementEsteActiv = entitlementEsteActiv;
createUserRouter._premiumCache = premiumCache;

module.exports = createUserRouter;
