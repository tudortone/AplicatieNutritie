'use strict';

const express = require('express');
const Sentry = require('@sentry/node');
const { compuneRaspunsAcces } = require('../utils/accessEntitlement');

const EMPTY_PAID_ENTITLEMENT = Object.freeze({
  premium: false,
  productId: null,
  basePlanId: null,
  offerId: null,
  state: null,
  expiresDate: null,
  acknowledgementPending: false,
  isTestPurchase: false,
});

function createUserRouter({
  requireAuth,
  generalLimiter,
  contextDate,
  profilRepo,
  billingService,
}) {
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
    } catch (error) {
      console.error('Eroare la citirea profilului:', error?.code || error?.name || 'NECUNOSCUT');
      return res.status(503).json({ eroare: 'Nu s-a putut citi profilul.' });
    }
  });

  router.get('/premium-status', requireAuth, generalLimiter, async (req, res) => {
    try {
      const paid = req.user?.esteAdmin
        ? EMPTY_PAID_ENTITLEMENT
        : await billingService.getPaidEntitlement({ userId: req.user.id });
      return res.json(compuneRaspunsAcces(req.user, paid || EMPTY_PAID_ENTITLEMENT));
    } catch (error) {
      if (Sentry.getClient()) Sentry.captureException(error);
      console.error('Eroare la citirea entitlement-ului Google Play:', error?.code || error?.name || 'NECUNOSCUT');
      // P0-03: metadata de tester este deja verificata server-side de requireAuth.
      // Daca storage-ul comercial cade temporar, nu transformam testerul in FREE
      // si nu il facem eligibil pentru reclame. Cand storage-ul raspunde, Premium
      // platit pastreaza prioritatea fata de tier-ul tester.
      if (req.user?.esteTester === true) {
        return res.json(compuneRaspunsAcces(req.user, EMPTY_PAID_ENTITLEMENT));
      }
      return res.status(503).json({
        eroare: 'Nu s-a putut valida abonamentul.',
        status: 'unavailable',
      });
    }
  });

  return router;
}

// Compatibilitate temporara pentru testele care goleau vechiul cache; noua cale
// nu are cache comercial si functia este intentionat no-op.
createUserRouter.curataPremiumCache = () => {};
createUserRouter.resetPremiumCacheForUser = async () => {};

module.exports = createUserRouter;
