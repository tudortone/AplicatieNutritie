'use strict';

const express = require('express');

const { tabelUtilizator } = require('../utils/clientUtilizator');

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
function createGdprRouter({ requireAuth, generalLimiter, supabaseAdmin, contextDate, profilRepo }) {
  // C-1: router-ul se creeaza per-instanta de fabrica, nu la nivel de modul.
  const router = express.Router();

  // GET /api/user/export-data
  router.get('/export-data', requireAuth, generalLimiter, async (req, res) => {
    try {
      const ctx = contextDate(req, res);
      const userId = ctx.userId;

      // Citim fiecare tabelă separat și tolerăm erorile per-tabelă: un tabel lipsă
      // sau indisponibil nu trebuie să doboare tot exportul.
      const citeste = async (tabela) => {
        try {
          const { data, error } = await tabelUtilizator(ctx, tabela).select('*').eq('user_id', userId);
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
        profilRepo.getProfil(ctx).catch(() => null),
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
          await tabelUtilizator(ctx, tabela).delete().eq('user_id', userId);
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

      // Curățare fișiere imagine utilizator din ImageKit CDN
      if (process.env.IMAGEKIT_PRIVATE_KEY && process.env.IMAGEKIT_PUBLIC_KEY) {
        try {
          const ImageKit = require('imagekit');
          const ik = new ImageKit({
            publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
            privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
            urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT || 'https://ik.imagekit.io/nutriai',
          });

          // Fișierele sunt încărcate în folderul per-utilizator `/meals/<userId>/`
          // (frontend-nutritie/lib/imagekit.ts), cu nume unic generat de CDN care
          // NU conține userId. Căutarea după `name` nu găsea nimic; `folderPath`
          // e câmpul corect. Păstrăm și căutarea veche după nume, ca fallback
          // pentru eventuale fișiere legacy.
          const fileList = await new Promise((resolve) => {
            ik.listFiles({
              searchQuery: `folderPath : "/meals/${userId}/*" OR name : "*${userId}*"`,
            }, (err, res) => {
              if (err || !Array.isArray(res)) resolve([]);
              else resolve(res);
            });
          });

          if (fileList.length > 0) {
            const fileIds = fileList.map((f) => f.fileId).filter(Boolean);
            if (fileIds.length > 0) {
              await new Promise((resolve) => {
                ik.bulkDeleteFiles(fileIds, (delErr) => {
                  if (delErr) console.warn('[GDPR] Ștergere fișiere ImageKit eșuată:', delErr.message);
                  resolve();
                });
              });
            }
          }
        } catch (ikErr) {
          console.warn('[GDPR] Curățare ImageKit CDN omisă sau neconfigurată:', ikErr.message);
        }
      }

      // C1: curatam explicit maparea Clerk -> Supabase.
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