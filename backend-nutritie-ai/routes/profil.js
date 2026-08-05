'use strict';

const express = require('express');

/**
 * Rute de profil nutritional (POST /api/calculeaza-profil).
 *
 * Calculele profilului sunt deterministe (Mifflin-St Jeor). Validarea premium
 * server-side a fost mutata in routes/user.js (C-2).
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

  return router;
}

module.exports = createProfilRouter;
