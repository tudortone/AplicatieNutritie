'use strict';

/**
 * P-05 / P-06: GDPR atomic deletion — outbox pattern.
 *
 * PROBLEMA (P-05): ordinea originală era ireversibil-primul:
 *   ImageKit → Clerk → DB → deleteUser
 * Dacă eșua la jumătate, utilizatorul rămânea cu un cont gol și fără cale de
 * recuperare. Resursele externe (ImageKit, Clerk) fuseseră deja distruse.
 *
 * FIX: Outbox pattern cu tabelul `gdpr_deletions`:
 *   1. Marchează contul ca `deletion_pending` (atomic, instantaneu)
 *   2. Execută pașii în ordinea REVERSIBIL → IREVERSIBIL:
 *      DB rows → Clerk → ImageKit → auth.deleteUser
 *   3. Fiecare pas e idempotent și reluabil
 *   4. Confirmarea finală doar când toate statusurile sunt `completed`
 *
 * PROBLEMA (P-06): `extrageFileIds` și `stergeActiveImageKit` rămâneau cod
 * mort. Se ștergeau doar folderele `/mancare/<userId>/` și `/meals/<userId>/`.
 * Fișierele în căi non-standard supraviețuiau ștergerii.
 *
 * FIX P-06: reactivăm `extrageFileIds` din JSONB-ul `alimente` și ștergem
 * pe `fileId` în plus față de ștergerea de foldere (complementare, nu alternative).
 */

const express = require('express');
const {
  tabelUtilizator,
  inregistreazaUtilizareAdmin,
  TABELE_CU_RLS_UTILIZATOR,
} = require('../utils/clientUtilizator');

// N-03: codurile pentru „tabela inexistentă" + helper-ii ImageKit/Clerk sunt
// mutați în utils/gdprServices.js (unica definiție, rută + worker). Păstrăm aici
// importul, ca ruta să nu mai dețină definiții paralele față de worker.
const {
  CODURI_TABELA_INEXISTENTA,
  extrageFileIds,
  stergeActiveImageKit,
  stergeFoldereImageKit,
  stergeIdentitateClerk,
  extrageFileIdsUtilizator,
} = require('../utils/gdprServices');
const { codEroare } = require('../utils/codEroare');

function createGdprRouter({ requireAuth, generalLimiter, supabaseAdmin, contextDate, profilRepo }) {
  const router = express.Router();

  router.get('/export-data', requireAuth, generalLimiter, async (req, res) => {
    try {
      const ctx = contextDate(req, res);
      const userId = ctx.userId;
      const citeste = async (tabela) => {
        const { data, error } = await tabelUtilizator(ctx, tabela).select('*').eq('user_id', userId);
        if (error) throw error;
        return data ?? [];
      };

      const [mese, profil, antrenamente, estimariBarcode] = await Promise.all([
        citeste('mese'),
        profilRepo.getProfil(ctx),
        citeste('antrenamente'),
        citeste('barcode_estimari_utilizator'),
      ]);

      return res.json({
        exportDate: new Date().toISOString(),
        user_id: userId,
        user: req.user,
        profil: profil || null,
        mese,
        antrenamente,
        estimari_barcode: estimariBarcode,
      });
    } catch (err) {
      console.error('[GDPR] Export esuat:', codEroare(err));
      return res.status(500).json({ eroare: 'Nu s-au putut pregăti datele pentru export.' });
    }
  });

  /**
   * P-05: Ștergere cont atomică cu outbox pattern (`gdpr_deletions`).
   *
   * Ordinea pașilor: REVERSIBIL → IREVERSIBIL (M-06)
   *   1. Înregistrare outbox în tabela `gdpr_deletions`
   *   2. DB rows (reversibil prin restaurare backup)
   *   3. Clerk (reversibil — reluabil: eșecul lasă contul intact)
   *   4. ImageKit (reversibil — reluabil: eșecul lasă contul intact)
   *   5. auth.deleteUser Supabase (IREVERSIBIL — ULTIMUL pas, după ce
   *      curățarea Clerk/ImageKit a reușit)
   *
   * Statusurile outbox: `db_done` (după rândurile DB), `auth_done` (după
   * deleteUser), `completed`. Ruta scrie direct `db_done`/`auth_done`/`completed`;
   * workerul (gdprWorker.js, N-02) folosește `clerk_done` și `imagekit_done`
   * pentru reluarea granulară, urmând aceeași ordine a rutei:
   * `db_done` → Clerk → `clerk_done` → ImageKit → `imagekit_done` →
   * auth.deleteUser → `auth_done` → `completed`. Dacă ruta e întreruptă după
   * `db_done`, workerul reia exact de la statusul persistat (M-06).
   */
  router.delete('/delete-account', requireAuth, generalLimiter, async (req, res) => {
    try {
      const ctx = contextDate(req, res);
      const userId = ctx.userId;

      if (!supabaseAdmin.auth?.admin?.deleteUser) {
        throw new Error('ADMIN_DELETE_UNAVAILABLE');
      }

      // Citim mapping-ul Clerk ÎNAINTE de orice ștergere
      const { data: mapare, error: eroareMapare } = await supabaseAdmin
        .from('clerk_user_map')
        .select('clerk_user_id')
        .eq('supabase_user_id', userId)
        .maybeSingle();
      if (eroareMapare) throw eroareMapare;
      const clerkUserId = mapare?.clerk_user_id || null;

      // P-05: înregistrare atomică în outbox (idempotent)
      const { data: outboxId, error: outboxErr } = await supabaseAdmin
        .rpc('initiate_gdpr_deletion', {
          p_user_id: userId,
          p_clerk_user_id: clerkUserId,
        });
      if (outboxErr) {
        console.error('[GDPR] Outbox indisponibil:', codEroare(outboxErr));
        return res.status(503).json({
          eroare: 'Ștergerea nu poate fi inițiată în siguranță acum. Reîncearcă în câteva minute.',
        });
      }

      const actualizezaStatus = async (status, lastError = null) => {
        if (!outboxId) return;
        try {
          await supabaseAdmin
            .from('gdpr_deletions')
            .update({ status, last_error: lastError, ...(status === 'completed' ? { completed_at: new Date().toISOString() } : {}) })
            .eq('id', outboxId);
        } catch { /* best-effort */ }
      };

      // P-06: extrage fileId-urile ÎNAINTE de a șterge rândurile din DB
      let fileIds = await extrageFileIdsUtilizator({ supabaseAdmin, userId });

      // N-04: persistenăm fileIds-urile în outbox ÎNAINTE de ștergerea rândurilor
      // `mese` (sursa lor e JSONB-ul `alimente`, pe cale să dispară). Un retry după
      // un eșec (rândurile deja șterse, extragere goală) reutilizează lista
      // persistată; nu suprascriem o listă non-goală cu una goală.
      if (outboxId) {
        try {
          const { data: randOutbox } = await supabaseAdmin
            .from('gdpr_deletions')
            .select('file_ids')
            .eq('id', outboxId)
            .maybeSingle();
          const fileIdsPersistate = Array.isArray(randOutbox?.file_ids) ? randOutbox.file_ids : [];
          if (fileIds.size === 0 && fileIdsPersistate.length > 0) {
            fileIds = new Set(fileIdsPersistate);
          }
          if (fileIds.size > 0 || fileIdsPersistate.length === 0) {
            await supabaseAdmin
              .from('gdpr_deletions')
              .update({ file_ids: [...fileIds] })
              .eq('id', outboxId);
          }
        } catch {
          // best-effort: ștergerea continuă și fără fileIds persistate
        }
      }

      // PASUL 1 (reversibil): Ștergere rânduri DB din TOATE tabelele user-scoped.
      // N-03: o singură listă — TABELE_CU_RLS_UTILIZATOR din clientUtilizator.js
      // (sursa de adevăr) — acoperă exact toate tabelele, inclusiv cele rămase
      // negate (produse_camara, gamificare, workout_logs, ai_jobs, credite_ai).
      // C1-S4: stergere admin (service_role) pe tabele de utilizator, fara
      // context — calea GDPR (utilizatorul s-a autentificat si a confirmat).
      // routes/gdpr.js e scutit explicit de regula C1-S3 anti-by-pass RLS
      // (eslint.config.js) exact pentru acest caz: unele dintre tabele
      // (gamificare, audit_log, credite_ai) au DOAR politici SELECT-own, deci
      // ștergerea prin clientul legat al utilizatorului ar eșua cu RLS.
      inregistreazaUtilizareAdmin();

      const sterge = async (tabela) => {
        const rezultat = await supabaseAdmin.from(tabela).delete().eq('user_id', userId);
        const eroare = rezultat?.error;
        // Try-per-table (P-05b): un tabel care nu există pe un anumit mediu
        // (e.g. migrări neaplicate) e ignorat, ca și în gdprWorker; orice altă
        // eroare oprește ștergerea ca să nu marchem `completed` cu date rămase.
        if (eroare && !CODURI_TABELA_INEXISTENTA.has(eroare.code)) throw eroare;
      };
      await Promise.all(TABELE_CU_RLS_UTILIZATOR.map(tabela => sterge(tabela)));
      await actualizezaStatus('db_done');

      // PASUL 2 (reversibil — reluabil): Ștergere identitate Clerk
      // M-06: se execută ÎNAINTE de auth.deleteUser. Un eșec aici lasă contul
      // intact — utilizatorul se poate încă autentifica și reîncerca.
      await stergeIdentitateClerk({
        clerkUserId,
        secretKey: process.env.CLERK_SECRET_KEY?.trim(),
      });

      // PASUL 3 (reversibil — reluabil): Ștergere media ImageKit
      // P-06: stergeActiveImageKit + foldere + fileIds individuale
      await stergeActiveImageKit({
        userId,
        fileIds,
        privateKey: process.env.IMAGEKIT_PRIVATE_KEY?.trim(),
      });

      // PASUL 4 (IREVERSIBIL — ULTIMUL pas): Ștergere identitate Supabase
      // M-06: auth.deleteUser rulează doar după ce curățarea Clerk/ImageKit a
      // reușit, ca un eșec la un pas reversibil să lase contul intact și reluabil.
      const { error: eroareAuth } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (eroareAuth) throw eroareAuth;
      await actualizezaStatus('auth_done');

      await actualizezaStatus('completed');

      return res.json({
        succes: true,
        mesaj: 'Contul, datele și activele media asociate au fost șterse definitiv.',
      });
    } catch (err) {
      const cod = codEroare(err);
      console.error('[GDPR] Stergere cont esuata:', cod);
      const status = cod === 'IMAGEKIT_NOT_CONFIGURED' || cod === 'CLERK_NOT_CONFIGURED' ? 503 : 500;
      return res.status(status).json({
        eroare: 'Ștergerea contului a eșuat. Este posibil ca unele date să fi fost deja șterse, iar o nouă încercare poate să nu restabilească resursele externe (ImageKit/Clerk). Poți încerca din nou în siguranță — operația poate fi reluată, dar succesul ei nu e garantat complet.',
      });
    }
  });

  return router;
}

createGdprRouter.extrageFileIds = extrageFileIds;
createGdprRouter.stergeActiveImageKit = stergeActiveImageKit;
createGdprRouter.stergeFoldereImageKit = stergeFoldereImageKit;
createGdprRouter.stergeIdentitateClerk = stergeIdentitateClerk;
createGdprRouter.extrageFileIdsUtilizator = extrageFileIdsUtilizator;
module.exports = createGdprRouter;
