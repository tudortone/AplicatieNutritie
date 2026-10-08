'use strict';

const express = require('express');
const {
  calculeazaPlanNutritional,
  MAPARE_SEX,
  MAPARE_ACTIVITATE,
  MAPARE_OBIECTIV,
} = require('../utils/calculNutritional');
const { rezumatEroareSigur } = require('../utils/sentrySanitize');

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

      if (v === null || !Number.isInteger(v) || v < 18 || v > 100) {
        return res.status(400).json({ eroare: 'Vârsta trebuie să fie un număr valid între 18 și 100 ani.' });
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

      // F-08: aceeasi matematica cu lib/onboarding.ts (`calculeazaPlan`), prin
      // modulul canonic utils/calculNutritional.js. Inainte, acest endpoint avea
      // propria formula (deficit fix -500/+350, proteine g/kg, grasimi 25%),
      // deci acelasi utilizator primea tinte diferite fata de chestionar.
      const plan = calculeazaPlanNutritional({
        gen: MAPARE_SEX[sex],
        varsta: v,
        greutateKg: g,
        inaltimeCm: i,
        activitate: MAPARE_ACTIVITATE[activitate],
        scop: MAPARE_OBIECTIV[obiectiv],
      });

      if (!plan) {
        return res.status(400).json({ eroare: 'Datele trimise nu permit calculul unui plan.' });
      }

      return res.json({
        caloriiTinta: plan.calorii,
        proteineTinta: plan.proteineG,
        grasimiTinta: plan.grasimiG,
        carbiTinta: plan.carbohidratiG,
      });
    } catch (error) {
      console.error('[Profile route]', rezumatEroareSigur(error, { operation: 'calculate_profile' }));
      return res.status(500).json({ eroare: 'Îmi pare rău, am întâmpinat o problemă la calcul. Mai încearcă!' });
    }
  });

  return router;
}

createProfilRouter.numarStrict = numarStrict;
module.exports = createProfilRouter;
