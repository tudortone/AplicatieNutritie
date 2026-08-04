'use strict';

const express = require('express');
const router = express.Router();

/**
 * Rute GDPR (Export date & Ștergere cont).
 */
function createGdprRouter({ requireAuth, generalLimiter, supabaseAdmin }) {
  // GET /api/user/export-data
  router.get('/export-data', requireAuth, generalLimiter, async (req, res) => {
    try {
      const userId = req.user.id;
      const { data: mese } = await supabaseAdmin.from('mese').select('*').eq('user_id', userId);
      const { data: profil } = await supabaseAdmin.from('utilizatori').select('*').eq('id', userId).single();

      return res.json({
        exportDate: new Date().toISOString(),
        user_id: userId,
        user: req.user,
        profil: profil || null,
        mese: mese || []
      });
    } catch (err) {
      console.error('Eroare export date GDPR:', err);
      return res.status(500).json({ eroare: 'Nu s-au putut meșteri datele pentru export.' });
    }
  });

  // DELETE /api/user/delete-account
  router.delete('/delete-account', requireAuth, generalLimiter, async (req, res) => {
    try {
      const userId = req.user.id;
      await supabaseAdmin.from('mese').delete().eq('user_id', userId);
      await supabaseAdmin.from('utilizatori').delete().eq('id', userId);

      return res.json({
        succes: true,
        mesaj: 'Contul și toate datele asociate au fost șterse definitiv (GDPR Right to be Forgotten).'
      });
    } catch (err) {
      console.error('Eroare ștergere cont GDPR:', err);
      return res.status(500).json({ eroare: 'Nu s-a putut șterge contul.' });
    }
  });

  return router;
}

module.exports = createGdprRouter;
