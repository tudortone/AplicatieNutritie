'use strict';

const express = require('express');
const router = express.Router();

/**
 * Rute GDPR (Export date & Ștergere cont).
 *
 * B-12: exportul citește datele utilizatorului prin `ctx.db` (clientul legat de
 * JWT-ul utilizatorului, cu RLS activ pe auth.uid() = user_id), nu prin clientul
 * admin. Astfel izolarea e aplicată de baza de date, nu doar de un filtru în cod.
 *
 * Ștergerea contului folosește `auth.admin.deleteUser`, care șterge rândul din
 * `auth.users`. Toate tabelele cu date de utilizator au FK `ON DELETE CASCADE`
 * către `auth.users(id)` (migrările 001/002 + 20260805000001_gdpr_complete), deci
 * o singură ștergere curăță totul în cascadă, fără rânduri orfane.
 */
/**
 * Sterge best-effort fisierele de pe ImageKit aflate sub folderul unui utilizator.
 * Imaginile de analiza sunt incarcate in /mancare/<userId>/ (vezi lib/imagekit.ts
 * pe frontend), deci folderul identifica fara ambiguitate datele lui.
 */
async function stergeFisiereImageKit(imagekit, folderPath) {
  if (!imagekit || !folderPath) return;
  try {
    const raspuns = await imagekit.listFiles({ path: folderPath, limit: 1000 });
    const lista = Array.isArray(raspuns) ? raspuns : Array.isArray(raspuns?.files) ? raspuns.files : [];
    const fileIds = lista.map((f) => f.fileId).filter(Boolean);
    if (fileIds.length === 0) return;
    // API-ul de bulk s-a numit `bulkDeleteFiles` la v3, `deleteFiles` in v4+;
    // folosim oricare exista si, la limita, stergem unul cate unul.
    if (typeof imagekit.deleteFiles === 'function') {
      await imagekit.deleteFiles(fileIds);
    } else if (typeof imagekit.bulkDeleteFiles === 'function') {
      await imagekit.bulkDeleteFiles(fileIds);
    } else {
      for (const fileId of fileIds) {
        await imagekit.deleteFile(fileId);
      }
    }
  } catch (err) {
    console.warn('[GDPR] Stergere fisiere ImageKit esuata:', err.message);
  }
}

function createGdprRouter({ requireAuth, generalLimiter, supabaseAdmin, contextDate, imagekit }) {
  // GET /api/user/export-data
  router.get('/export-data', requireAuth, generalLimiter, async (req, res) => {
    try {
      const ctx = contextDate(req, res);
      const userId = ctx.userId;

      // Citim fiecare tabelă separat și tolerăm erorile per-tabelă: un tabel lipsă
      // sau indisponibil nu trebuie să doboare tot exportul.
      const citeste = async (tabela) => {
        try {
          const { data, error } = await ctx.db.from(tabela).select('*').eq('user_id', userId);
          if (error) {
            console.warn(`[GDPR] Export ${tabela} esuat:`, error.message);
            return null;
          }
          return data ?? [];
        } catch (err) {
          console.warn(`[GDPR] Export ${tabela} exceptie:`, err.message);
          return null;
        }
      };

      const [mese, profil, antrenamente, estimariBarcode, audit] = await Promise.all([
        citeste('mese'),
        ctx.db.from('profil').select('*').eq('user_id', userId).maybeSingle().then(({ data }) => data ?? null).catch(() => null),
        citeste('antrenamente'),
        citeste('barcode_estimari_utilizator'),
        citeste('audit_log'),
      ]);

      return res.json({
        exportDate: new Date().toISOString(),
        user_id: userId,
        user: req.user,
        profil: profil || null,
        mese: mese || [],
        antrenamente: antrenamente || [],
        estimari_barcode: estimariBarcode || [],
        audit_log: audit || [],
      });
    } catch (err) {
      console.error('Eroare export date GDPR:', err);
      return res.status(500).json({ eroare: 'Nu s-au putut meșteri datele pentru export.' });
    }
  });

  // DELETE /api/user/delete-account
  router.delete('/delete-account', requireAuth, generalLimiter, async (req, res) => {
    try {
      const ctx = contextDate(req, res);
      const userId = ctx.userId;

      // În plus față de cascada FK (acoperită de deleteUser), ștergem explicit
      // tabelele reale cu date de utilizator — apărare în adâncime, iar la unele
      // identități (mapate Clerk) rândul din auth.users poate lipsi.
      const sterge = async (tabela) => {
        try {
          await ctx.db.from(tabela).delete().eq('user_id', userId);
        } catch (err) {
          console.warn(`[GDPR] Stergere ${tabela} esuata:`, err.message);
        }
      };

      await Promise.all([
        sterge('mese'),
        sterge('profil'),
        sterge('antrenamente'),
        sterge('barcode_estimari_utilizator'),
        sterge('audit_log'),
        stergeFisiereImageKit(imagekit, `/mancare/${userId}`),
      ]);

      // Sursele reale de adevăr: șterge contul Supabase. FK ON DELETE CASCADE pe
      // toate tabelele care referențiază auth.users idempotent curăță restul.
      if (supabaseAdmin.auth?.admin?.deleteUser) {
        const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
        if (error) {
          console.error('[GDPR] Eroare auth.admin.deleteUser:', error.message);
        }
      }

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