'use strict';

const express = require('express');

function campLipsa(valoare) {
  return valoare === undefined || valoare === null ||
    (typeof valoare === 'string' && valoare.trim() === '');
}

function numarStrict(valoare) {
  if (typeof valoare !== 'number' && typeof valoare !== 'string') return null;
  if (typeof valoare === 'string' && valoare.trim() === '') return null;
  const numar = Number(valoare);
  return Number.isFinite(numar) ? numar : null;
}

/**
 * Rute de profil nutritional (POST /api/calculeaza-profil).
 * Calculele profilului sunt deterministe (Mifflin-St Jeor).
 */
function createProfilRouter({ requireAuth, generalLimiter }) {
  const router = express.Router();

  router.post('/calculeaza-profil', requireAuth, generalLimiter, async (req, res) => {
    try {
      const { varsta, greutate, inaltime, sex, activitate, obiectiv } = req.body;

      if ([varsta, greutate, inaltime, sex, activitate, obiectiv].some(campLipsa)) {
        return res.status(400).json({ eroare: 'Date incomplete. Te rog să completezi tot formularul.' });
      }

      const v = numarStrict(varsta);
      const g = numarStrict(greutate);
      const i = numarStrict(inaltime);

      if (v === null || !Number.isInteger(v) || v < 10 || v > 100) {
        return res.status(400).json({ eroare: 'Vârsta trebuie să fie un număr valid între 10 și 100 ani.' });
      }
      if (g === null || g < 30 || g > 300) {
        return res.status(400).json({ eroare: 'Greutatea trebuie să fie un număr valid între 30 și 300 kg.' });
      }
      if (i === null || i < 100 || i > 250) {
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

      const bmr = sex === 'Masculin'
        ? 10 * g + 6.25 * i - 5 * v + 5
        : 10 * g + 6.25 * i - 5 * v - 161;

      const multiplicatori = { Sedentar: 1.2, Moderat: 1.55, 'Foarte Activ': 1.725 };
      const tdee = bmr * multiplicatori[activitate];

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
      const grasimiTinta = Math.round((calT * 0.25) / 9);
      const carbiTinta = Math.round(
        Math.max((calT - proteineTinta * 4 - grasimiTinta * 9) / 4, 50),
      );

      return res.json({ caloriiTinta: calT, proteineTinta, grasimiTinta, carbiTinta });
    } catch (error) {
      console.error('Eroare la calculul profilului:', error.message);
      return res.status(500).json({ eroare: 'Îmi pare rău, am întâmpinat o problemă la calcul. Mai încearcă!' });
    }
  });

  return router;
}

createProfilRouter.numarStrict = numarStrict;
module.exports = createProfilRouter;
