'use strict';

const express = require('express');

const Sentry = require('@sentry/node');
const { callWithTimeout } = require('../utils/httpTimeout');

/**
 * Rute de profil nutritional (POST /api/calculeaza-profil) si validare premium
 * (GET /api/user/premium-status).
 *
 * Calculele profilului sunt deterministe (Mifflin-St Jeor); premium-status este
 * fail-closed: fara cheie configurata sau la eroare de retea, NU se raporteaza
 * "premium" — un raspuns de eroare nu poate fi folosit ca sa se acorde privilegii.
 */
function createProfilRouter({ requireAuth, generalLimiter, config }) {
  // C-1: router-ul se creeaza per-instanta de fabrica, nu la nivel de modul.
  const router = express.Router();

  // ==========================================
  // RUTA 3: CALCUL PROFIL NUTRITIONAL (DETERMINIST)
  // ==========================================
  router.post('/calculeaza-profil', requireAuth, generalLimiter, async (req, res) => {
    try {
      const { varsta, greutate, inaltime, sex, activitate, obiectiv } = req.body;

      if (!varsta || !greutate || !inaltime || !sex || !activitate || !obiectiv) {
        return res.status(400).json({ eroare: 'Date incomplete. Te rog să completezi tot formularul.' });
      }

      const v = parseInt(varsta, 10);
      const g = parseFloat(greutate);
      const i = parseFloat(inaltime);

      if (isNaN(v) || v < 10 || v > 100) {
        return res.status(400).json({ eroare: 'Vârsta trebuie să fie un număr valid între 10 și 100 ani.' });
      }
      if (isNaN(g) || g < 30 || g > 300) {
        return res.status(400).json({ eroare: 'Greutatea trebuie să fie un număr valid între 30 și 300 kg.' });
      }
      if (isNaN(i) || i < 100 || i > 250) {
        return res.status(400).json({ eroare: 'Înălțimea trebuie să fie un număr valid între 100 și 250 cm.' });
      }
      if (sex !== 'Masculin' && sex !== 'Feminin') {
        return res.status(400).json({ eroare: 'Sexul selectat este invalid.' });
      }
      const activitatiPermise = ['Sedentar', 'Moderat', 'Foarte Activ'];
      if (!activitatiPermise.includes(activitate)) {
        return res.status(400).json({ eroare: 'Nivelul de activitate selectat este invalid.' });
      }
      const obiectivePermise = ['Slăbire', 'Menținere', 'Masă Musculară'];
      if (!obiectivePermise.includes(obiectiv)) {
        return res.status(400).json({ eroare: 'Obiectivul selectat este invalid.' });
      }

      // Mifflin-St Jeor (B1, B2)
      const bmr = sex === 'Masculin'
        ? 10 * g + 6.25 * i - 5 * v + 5
        : 10 * g + 6.25 * i - 5 * v - 161;

      const multiplicatori = { Sedentar: 1.2, Moderat: 1.55, 'Foarte Activ': 1.725 };
      const tdee = bmr * (multiplicatori[activitate] || 1.2);

      let caloriiTinta;
      if (obiectiv === 'Slăbire') {
        caloriiTinta = Math.max(tdee - 500, sex === 'Masculin' ? 1500 : 1200);
      } else if (obiectiv === 'Masă Musculară') {
        caloriiTinta = tdee + 350;
      } else {
        caloriiTinta = tdee;
      }

      const protPerKg = obiectiv === 'Menținere' ? 1.6 : 2.0;
      const proteineTinta = Math.round(g * protPerKg);

      const calT = Math.round(caloriiTinta);
      const grasimiTinta = Math.round((calT * 0.25) / 9); // 25% din calorii, 9 kcal/g
      const carbiTinta = Math.round(Math.max((calT - (proteineTinta * 4) - (grasimiTinta * 9)) / 4, 50));

      res.json({ caloriiTinta: calT, proteineTinta, grasimiTinta, carbiTinta });
    } catch (error) {
      console.error('Eroare la calculul profilului:', error.message);
      res.status(500).json({ eroare: 'Îmi pare rău, am întâmpinat o problemă la calcul. Mai încearcă!' });
    }
  });

  // ==========================================
  // VALIDARE PREMIUM SERVER-SIDE (B-09)
  // RevenueCat decide entitlement-ul; serverul doar il verifica cu cheia SECRETA.
  // Fail-closed: fara cheie configurata sau la eroare de retea, NU se raporteaza
  // "premium" — un raspuns de eroare nu poate fi folosit ca sa se acorde privilegii.
  // ==========================================
  router.get('/user/premium-status', requireAuth, generalLimiter, async (req, res) => {
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

module.exports = createProfilRouter;
