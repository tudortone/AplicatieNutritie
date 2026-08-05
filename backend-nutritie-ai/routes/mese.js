'use strict';

const express = require('express');
const router = express.Router();

const { esteUuid } = require('../utils/identitate');
const { valideazaMasa } = require('../utils/validareMese');

/**
 * Rute de gestionare a meselor (DELETE/PUT/POST /api/mese).
 *
 * Interogarile trec prin `meseRepo`, care foloseste `tabelUtilizator(ctx, 'mese')`
 * pe `ctx.db` (clientul legat de JWT-ul utilizatorului, RLS activ): un id care nu
 * apartine utilizatorului nu poate fi sters/actualizat chiar daca filtrul din cod
 * ar lipsi. Validarea este partajata cu utils/validareMese.js.
 */
function createMeseRouter({ requireAuth, generalLimiter, contextDate, meseRepo }) {
  // ==========================================
  // RUTA 4: STERGERE MASA
  // ==========================================
  router.delete('/mese/:id', requireAuth, generalLimiter, async (req, res) => {
    try {
      const { id } = req.params;
      if (!esteUuid(id)) {
        return res.status(400).json({ eroare: 'ID de masă invalid.' });
      }
      const ctx = contextDate(req, res);
      const { data, error } = await meseRepo.deleteMasa(ctx, id);

      if (error) {
        console.error('Eroare DB stergere masa:', error.message);
        return res.status(500).json({ eroare: 'Eroare la ștergerea mesei. Încearcă din nou.' });
      }
      if (!data || data.length === 0) {
        return res.status(404).json({ eroare: 'Masa nu a fost găsită.' });
      }
      res.json({ succes: true });
    } catch (error) {
      console.error('Eroare stergere masa:', error.message);
      res.status(500).json({ eroare: 'Eroare la ștergerea mesei.' });
    }
  });

  // ==========================================
  // RUTA 5: EDITARE MASA
  // ==========================================
  router.put('/mese/:id', requireAuth, generalLimiter, async (req, res) => {
    try {
      const { id } = req.params;
      if (!esteUuid(id)) {
        return res.status(400).json({ eroare: 'ID de masă invalid.' });
      }

      const validare = valideazaMasa(req.body, { pentruActualizare: true });
      if (!validare.ok) {
        return res.status(400).json({ eroare: validare.eroare });
      }

      const ctx = contextDate(req, res);
      const { data, error } = await meseRepo.updateMasa(ctx, id, validare.payload);

      if (error) {
        console.error('Eroare DB actualizare masa:', error.message);
        return res.status(500).json({ eroare: 'Eroare la actualizarea mesei. Încearcă din nou.' });
      }
      if (!data || data.length === 0) {
        return res.status(404).json({ eroare: 'Masa nu a fost găsită.' });
      }
      res.json({ succes: true, masa: data[0] });
    } catch (error) {
      console.error('Eroare actualizare masa:', error.message);
      res.status(500).json({ eroare: 'Eroare la actualizarea mesei.' });
    }
  });

  // ==========================================
  // RUTA 5.1: SALVARE NOUA MASA
  // `user_id` vine EXCLUSIV din identitatea rezolvata, niciodata din corpul cererii.
  // Cu RLS activ, `with check (auth.uid() = user_id)` respinge oricum o inserare
  // pe numele altcuiva.
  // ==========================================
  router.post('/mese', requireAuth, generalLimiter, async (req, res) => {
    try {
      const validare = valideazaMasa(req.body, { pentruActualizare: false });
      if (!validare.ok) {
        return res.status(400).json({ eroare: validare.eroare });
      }

      const { data: dataMasa, ora } = req.body;
      const ctx = contextDate(req, res);

      const insertPayload = {
        ...validare.payload,
        user_id: ctx.userId,
        // Validare format data (YYYY-MM-DD) si ora (HH:MM)
        data: /^\d{4}-\d{2}-\d{2}$/.test(String(dataMasa || '')) ? dataMasa : null,
        ora: /^\d{2}:\d{2}(:\d{2})?$/.test(String(ora || '')) ? ora : null,
      };

      const { data: result, error } = await meseRepo.createMasa(ctx, insertPayload);

      if (error) {
        console.error('Eroare DB inserare masa:', error.message);
        return res.status(500).json({ eroare: 'Eroare la adăugarea mesei. Încearcă din nou.' });
      }
      res.json({ succes: true, masa: result?.[0] || null });
    } catch (error) {
      console.error('Eroare adaugare masa:', error.message);
      res.status(500).json({ eroare: 'Eroare la adăugarea mesei.' });
    }
  });

  return router;
}

module.exports = createMeseRouter;
