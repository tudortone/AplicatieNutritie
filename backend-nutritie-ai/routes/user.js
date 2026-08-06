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
  premiumCache.set(userId, { cachedAt: acum, payload });
}

/**
 * Rute de utilizator (GET /api/user/premium-status).
 * Validarea premium ramane fail-closed: erorile RevenueCat nu sunt servite din
 * cache si nu pot acorda privilegii. Cache-ul reduce doar apelurile reusite.
 */
function createUserRouter({ requireAuth, generalLimiter, config, contextDate, profilRepo }) {
  const router = express.Router();

  // GET /api/user/profil — verificarea server-side a completitudinii profilului.
  // Folosit de gardul de navigare: un utilizator autentificat fara profil complet
  // este trimis inapoi la onboarding. Citit prin ctx (client RLS legat de JWT,
  // auth.uid() = user_id), nu prin clientul admin, deci doar propriul rand.
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
    // Contul de admin (app_metadata.rol === 'admin') are Premium permanent,
    // fara a depinde de RevenueCat sau de o cheie configurata.
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
      if (Date.now() - cached.cachedAt < PREMIUM_CACHE_TTL_MS) {
        return res.json(cached.payload);
      }
      premiumCache.delete(userId);
    }

    try {
      const rcResp = await callWithTimeout((signal) => fetch(
        `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
        { headers: { Authorization: `Bearer ${config.revenuecat.secretApiKey}` }, signal },
      ), 8000);

      if (!rcResp.ok) {
        premiumCache.delete(userId);
        return res.status(502).json({ eroare: `RevenueCat a raspuns cu ${rcResp.status}.` });
      }

      const data = await rcResp.json();
      const entitlement = data?.subscriber?.entitlements?.premium;
      const premium = entitlement?.active === true;
      const payload = {
        premium,
        entitlement: premium ? entitlement : null,
        expiresDate: entitlement?.expires_date || null,
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
createUserRouter._premiumCache = premiumCache;

module.exports = createUserRouter;
