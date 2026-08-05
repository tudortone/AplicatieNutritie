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
function createGdprRouter({ requireAuth, generalLimiter, supabaseAdmin, contextDate }) {
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

      // C3 (decizie): audit_log (action + details JSONB) e telemetrie interna de
      // actiuni, nu date cu care subiectul isi exercita portabilitatea. Il excludem
      // din export (confidentialitate minima, Art. 25), dar il STERGEM totusi la
      // delete-account (Art. 17 — dreptul la stergere acopera si logurile).
      const [mese, profil, antrenamente, estimariBarcode] = await Promise.all([
        citeste('mese'),
        ctx.db.from('profil').select('*').eq('user_id', userId).maybeSingle().then(({ data }) => data ?? null).catch(() => null),
        citeste('antrenamente'),
        citeste('barcode_estimari_utilizator'),
      ]);

      return res.json({
        exportDate: new Date().toISOString(),
        user_id: userId,
        user: req.user,
        profil: profil || null,
        mese: mese || [],
        antrenamente: antrenamente || [],
        estimari_barcode: estimariBarcode || [],
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
      ]);

      // C1: curatam explicit maparea Clerk -> Supabase. La identitati mapate Clerk,
      // randul din auth.users poate lipsi (comentariul de mai sus), caz in care
      // cascada FK peste clerk_user_map nu se declanseaza si ramane o mapare orfana.
      // clerk_user_map e admin-only (RLS deny-all), deci stergerea se face prin
      // service_role, nu prin ctx.db. Eroarea aici nu blocheaza restul: datele cu
      // continut real sunt deja sterse, iar maparea e doar o legatura de identitate.
      try {
        await supabaseAdmin.from('clerk_user_map').delete().eq('supabase_user_id', userId);
      } catch (err) {
        console.warn('[GDPR] Stergere clerk_user_map esuata:', err.message);
      }

      // Sursele reale de adevăr: șterge contul Supabase. FK ON DELETE CASCADE pe
      // toate tabelele care referențiază auth.users idempotent curăță restul.
      if (!supabaseAdmin.auth?.admin?.deleteUser) {
        // Garda anti-mintire (C2): fara capacitatea de a sterge identitatea auth,
        // nu putem garanta Art. 17 (GDPR). Nu raportam succes fals.
        return res.status(500).json({ eroare: 'Nu s-a putut șterge contul.' });
      }
      const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (error) {
        // C2: daca stergerea identitatii auth esueaza, stergerea e incompleta.
        // Datele curatate + randul auth ramas = contul inca exista. 500, nu succes.
        console.error('[GDPR] Eroare auth.admin.deleteUser:', error.message);
        return res.status(500).json({ eroare: 'Nu s-a putut șterge contul.' });
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