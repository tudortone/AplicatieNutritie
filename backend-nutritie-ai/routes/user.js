'use strict';

const express = require('express');

const Sentry = require('@sentry/node');
const { callWithTimeout } = require('../utils/httpTimeout');

/**
 * Rute de utilizator (GET /api/user/premium-status).
 *
 * C-2: mutat din routes/profil.js intr-un router dedicat, montat o singura data
 * alaturi de cel GDPR, ca toate rutele de utilizator sa aiba un singur raspuns
 * la intrebarea „unde e ruta X".
 *
 * B-09: validarea premium e fail-closed: fara cheie configurata sau la eroare de
 * retea, NU se raporteaza "premium" — un raspuns de eroare nu poate fi folosit
 * ca sa se acorde privilegii.
 */
function createUserRouter({ requireAuth, generalLimiter, config }) {
  // C-2: router-ul se creeaza per-instanta de fabrica, la fel ca in restul rutelor.
  const router = express.Router();

  // ==========================================
  // VALIDARE PREMIUM SERVER-SIDE (B-09)
  // RevenueCat decide entitlement-ul; serverul doar il verifica cu cheia SECRETA.
  // Fail-closed: fara cheie configurata sau la eroare de retea, NU se raporteaza
  // "premium" — un raspuns de eroare nu poate fi folosit ca sa se acorde privilegii.
  // ==========================================
  router.get('/premium-status', requireAuth, generalLimiter, async (req, res) => {
    if (!config.revenuecat.secretApiKey) {
      return res.status(503).json({
        eroare: 'Validarea premium nu este configurata (lipseste REVENUECAT_SECRET_API_KEY).',
        status: 'disabled',
      });
    }
    try {
      const rcResp = await callWithTimeout((signal) => fetch(
        `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(req.user.id)}`,
        { headers: { Authorization: `Bearer ${config.revenuecat.secretApiKey}` }, signal },
      ), 8000);

      if (!rcResp.ok) {
        return res.status(502).json({ eroare: `RevenueCat a raspuns cu ${rcResp.status}.` });
      }

      const data = await rcResp.json();
      const entitlement = data?.subscriber?.entitlements?.premium;
      const premium = entitlement?.active === true;
      return res.json({
        premium,
        entitlement: premium ? entitlement : null,
        expiresDate: entitlement?.expires_date || null,
        validatServer: true,
      });
    } catch (err) {
      if (config.sentryDsn) Sentry.captureException(err);
      console.error('Eroare validare premium RevenueCat:', err.message);
      return res.status(503).json({ eroare: 'Nu s-a putut valida abonamentul.' });
    }
  });

  return router;
}

module.exports = createUserRouter;
