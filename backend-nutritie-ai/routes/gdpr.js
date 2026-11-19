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
const Sentry = require('@sentry/node');
const {
  tabelUtilizator,
  inregistreazaUtilizareAdmin,
  TABELE_STERGERE_GDPR_UTILIZATOR,
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
  stergeDeadLetterUtilizator,
  itereazaPaginatKeyset,
  DIMENSIUNE_PAGINA_KEYSET,
  COLOANE_EXPORT_ABONAMENTE_GOOGLE,
  COLOANE_EXPORT_USER_FEEDBACK,
  stergeEvenimenteRtdnUtilizator,
} = require('../utils/gdprServices');
const {
  revendicaRandOutbox,
  actualizeazaStatusOutbox,
  asiguraLeaseActiv,
  cuReinnoireLeaseContinua,
  pregatesteSiPersistaFileIdsOutbox,
} = require('../utils/gdprWorker');
const { codEroare } = require('../utils/codEroare');

function scrieChunkCuBackpressure(res, chunk) {
  if (res.destroyed || res.writableEnded) return Promise.resolve(false);
  if (res.write(chunk)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const peDrain = () => {
      res.removeListener('close', peClose);
      resolve(!res.destroyed);
    };
    const peClose = () => {
      res.removeListener('drain', peDrain);
      resolve(false);
    };
    res.once('drain', peDrain);
    res.once('close', peClose);
  });
}

function createGdprRouter({
  requireAuth,
  generalLimiter,
  gdprExportLimiter = generalLimiter,
  supabaseAdmin,
  contextDate,
  profilRepo,
}) {
  const router = express.Router();

  router.get('/export-data', requireAuth, gdprExportLimiter, async (req, res) => {
    try {
      const ctx = contextDate(req, res);
      const userId = ctx?.userId;
      if (!userId || !ctx?.db) {
        throw new Error('GDPR_EXPORT_CONTEXT_INVALID');
      }
      const clientUtilizator = { from: (t) => tabelUtilizator(ctx, t) };

      const profil = await profilRepo.getProfil(ctx);

      const surseExport = [
        { cheie: 'mese', client: clientUtilizator, tabela: 'mese', coloanaOrdine: 'id' },
        { cheie: 'antrenamente', client: clientUtilizator, tabela: 'antrenamente', coloanaOrdine: 'id' },
        { cheie: 'produse_camara', client: clientUtilizator, tabela: 'produse_camara', coloanaOrdine: 'id' },
        { cheie: 'gamificare', client: clientUtilizator, tabela: 'gamificare', coloanaOrdine: 'id' },
        { cheie: 'gamificare_evenimente', client: clientUtilizator, tabela: 'gamificare_evenimente', coloanaOrdine: 'id' },
        { cheie: 'workout_logs', client: clientUtilizator, tabela: 'workout_logs', coloanaOrdine: 'id' },
        { cheie: 'audit_log', client: clientUtilizator, tabela: 'audit_log', coloanaOrdine: 'id' },
        { cheie: 'estimari_barcode', client: clientUtilizator, tabela: 'barcode_estimari_utilizator', coloanaOrdine: 'code' },
        { cheie: 'ai_jobs', client: clientUtilizator, tabela: 'ai_jobs', coloanaOrdine: 'id' },
        { cheie: 'credite_ai', client: clientUtilizator, tabela: 'credite_ai', coloanaOrdine: 'user_id' },
        { cheie: 'credite_tranzactii', client: clientUtilizator, tabela: 'credite_tranzactii', coloanaOrdine: 'id' },
        { cheie: 'flow_credit_reservations', client: clientUtilizator, tabela: 'flow_credit_reservations', coloanaOrdine: 'id' },
        { cheie: 'flow_reward_intents', client: clientUtilizator, tabela: 'flow_reward_intents', coloanaOrdine: 'id' },
        { cheie: 'workout_templates', client: clientUtilizator, tabela: 'workout_templates', coloanaOrdine: 'id' },
        {
          cheie: 'abonamente_google_play',
          client: supabaseAdmin,
          tabela: 'google_play_subscriptions',
          coloane: COLOANE_EXPORT_ABONAMENTE_GOOGLE,
          coloanaOrdine: 'purchase_token_hash',
        },
        {
          cheie: 'user_feedback',
          client: supabaseAdmin,
          tabela: 'user_feedback',
          coloane: COLOANE_EXPORT_USER_FEEDBACK,
          coloanaOrdine: 'id',
        },
      ];

      const antetJson = JSON.stringify({
        exportDate: new Date().toISOString(),
        user_id: userId,
        user: req.user,
        media_export_scope: {
          type: 'metadata_and_urls',
          description: 'Acest export conține metadatele și URL-urile securizate ale fișierelor media asociate contului. Fișierele binare brute nu sunt înglobate direct în formatul JSON, dar pot fi descărcate individual utilizând URL-urile furnizate înainte de ștergerea contului.',
        },
        profil: profil || null,
      });

      // Export secvențial: 1 tabelă pe rând, paginare keyset (id > last_id LIMIT 500).
      // Fiecare lot de 500 rânduri este serializat imediat și eliberat din heap,
      // iar răspunsul HTTP pornește abia după confirmarea tuturor tabelelor ca orice
      // eroare DB să întoarcă atomic 500 (niciodată un 200 cu JSON trunchiat).
      const bucati = [antetJson.slice(0, -1)];
      for (const sursa of surseExport) {
        if (res.destroyed || req.socket?.destroyed) return undefined;
        bucati.push(`,${JSON.stringify(sursa.cheie)}:[`);
        let primulRand = true;
        for await (const lot of itereazaPaginatKeyset({
          client: sursa.client,
          tabela: sursa.tabela,
          userId,
          dimensiunePagina: DIMENSIUNE_PAGINA_KEYSET,
          coloane: sursa.coloane || '*',
          coloanaOrdine: sursa.coloanaOrdine,
        })) {
          if (res.destroyed || req.socket?.destroyed) return undefined;
          let bucata = '';
          for (const rand of lot) {
            bucata += (primulRand ? '' : ',') + JSON.stringify(rand);
            primulRand = false;
          }
          if (bucata) bucati.push(bucata);
        }
        bucati.push(']');
      }
      bucati.push('}');

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      for (const bucata of bucati) {
        if (!(await scrieChunkCuBackpressure(res, bucata))) return undefined;
      }
      res.end();
      return undefined;
    } catch (err) {
      console.error('[GDPR] Export esuat:', codEroare(err));
      if (!res.headersSent) {
        return res.status(500).json({ eroare: 'Nu s-au putut pregăti datele pentru export.' });
      }
      res.destroy(err);
      return undefined;
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
   * Statusurile outbox urmează secvența strictă granulară (atât în rută cât și în worker):
   * `pending` → `db_done` → `clerk_done` → `imagekit_done` → `auth_done` → `completed`.
   * Fiecare pas este persistat durabil; un eșec la scrierea outbox blochează avansarea
   * spre operația distructivă următoare (fail-closed).
   */
  router.delete('/delete-account', requireAuth, generalLimiter, async (req, res) => {
    let outboxId = null;
    let ownerId = null;
    let fencingToken = null;
    let leaseExpiresAt = null;
    let statusAsteptat = 'pending';
    let numariIncercare = 1;
    let hasActiveClaim = false;
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
      const { data: outboxNou, error: outboxErr } = await supabaseAdmin
        .rpc('initiate_gdpr_deletion', {
          p_user_id: userId,
          p_clerk_user_id: clerkUserId,
        });
      outboxId = outboxNou;
      // N-OUTBOX: fail-closed dacă lipsește fie eroarea, fie rândul outbox (data
      // null) — nu continuăm ștergerea ireversibilă fără rând de audit/resumare.
      if (outboxErr || !outboxId) {
        console.error('[GDPR] Outbox indisponibil:', codEroare(outboxErr));
        return res.status(503).json({
          eroare: 'Ștergerea nu poate fi inițiată în siguranță acum. Reîncearcă în câteva minute.',
        });
      }

      // P1 FINDING 2 & 3: Ruta și workerul împart același protocol de claim și lease.
      // Dacă o încercare anterioară a avansat deja la un pas intermediar (db_done,
      // clerk_done, imagekit_done, auth_done), reluăm idempotent de la acel pas.
      ownerId = `route_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      let claim = await revendicaRandOutbox(supabaseAdmin, outboxId, {
        workerId: ownerId,
        expectedStatus: 'pending',
        leaseSeconds: 300,
      });

      let fileIdsDinOutbox = null;
      if (!claim.success) {
        let randCurent = null;
        try {
          const { data: citit } = await supabaseAdmin
            .from('gdpr_deletions')
            .select('status, file_ids, retry_count')
            .eq('id', outboxId)
            .maybeSingle();
          randCurent = citit || null;
        } catch {
          randCurent = null;
        }

        if (randCurent?.status === 'completed') {
          return res.json({
            succes: true,
            mesaj: 'Contul, datele și activele media asociate au fost șterse definitiv.',
          });
        }

        if (randCurent?.status === 'failed' || (randCurent?.retry_count ?? 0) >= 5) {
          return res.status(409).json({
            eroare: 'Cererea de ștergere a depășit numărul maxim de încercări automate și necesită intervenție.',
            cod: 'GDPR_MAX_RETRIES_EXCEEDED',
          });
        }

        const statusuriReluabile = new Set(['db_done', 'clerk_done', 'imagekit_done', 'auth_done']);
        if (randCurent?.status && statusuriReluabile.has(randCurent.status)) {
          claim = await revendicaRandOutbox(supabaseAdmin, outboxId, {
            workerId: ownerId,
            expectedStatus: randCurent.status,
            leaseSeconds: 300,
          });
          if (claim.success) {
            statusAsteptat = randCurent.status;
            numariIncercare = (randCurent.retry_count ?? 0) + 1;
            fileIdsDinOutbox = Array.isArray(randCurent.file_ids) ? randCurent.file_ids : [];
          }
        }
      }

      if (!claim.success) {
        console.warn('[GDPR] Outbox claim eșuat pentru rută:', claim.error);
        return res.status(409).json({
          eroare: 'O cerere de ștergere este deja în curs de procesare pentru acest cont.',
        });
      }

      hasActiveClaim = true;
      fencingToken = claim.fencingToken;
      leaseExpiresAt = claim.leaseExpiresAt;

      const verificaSiReinnoiesteLease = async () => {
        leaseExpiresAt = await asiguraLeaseActiv(supabaseAdmin, outboxId, {
          workerId: ownerId,
          fencingToken,
          leaseExpiresAt,
        });
      };

      const actualizezaStatus = async (status, lastError = null) => {
        if (!outboxId) return;
        const finalizat = status === 'completed';
        const payload = {
          status,
          last_error: finalizat ? null : lastError,
          ...(finalizat ? {
            completed_at: new Date().toISOString(),
            // Rândul rămâne ca audit operațional, dar nu mai păstrează PII
            // sau fileId-uri după ce reluarea nu mai este necesară.
            user_id: outboxId,
            clerk_user_id: null,
            file_ids: [],
          } : {}),
        };

        await actualizeazaStatusOutbox(supabaseAdmin, outboxId, payload, {
          workerId: ownerId,
          fencingToken,
          expectedStatus: statusAsteptat,
        });
        statusAsteptat = status;
      };

      let fileIds = new Set(Array.isArray(fileIdsDinOutbox) ? fileIdsDinOutbox : []);

      if (statusAsteptat === 'pending') {
        try {
          const pregatire = await pregatesteSiPersistaFileIdsOutbox(supabaseAdmin, {
            outboxId,
            userId,
            workerId: ownerId,
            fencingToken,
            leaseExpiresAt,
            existingFileIds: fileIdsDinOutbox,
          });
          fileIds = pregatire.fileIds;
          leaseExpiresAt = pregatire.leaseExpiresAt;
          if (typeof pregatire.retryCount === 'number') {
            numariIncercare = pregatire.retryCount + 1;
          }
        } catch (err) {
          try {
            Sentry.withScope((scope) => {
              scope.setLevel('error');
              scope.setTag('gdpr.file_ids_persist_failed', 'true');
              scope.setTag('gdpr.outbox_id', String(outboxId));
              Sentry.captureException(err);
            });
          } catch {}
          throw err;
        }

        // PASUL 1 (reversibil): Ștergere rânduri DB din TOATE tabelele user-scoped.
        inregistreazaUtilizareAdmin();
        await verificaSiReinnoiesteLease();

        await stergeEvenimenteRtdnUtilizator({
          supabaseAdmin, userId, onBeforeDelete: verificaSiReinnoiesteLease,
        });

        const sterge = async (tabela) => {
          await verificaSiReinnoiesteLease();
          const rezultat = await supabaseAdmin.from(tabela).delete().eq('user_id', userId);
          const eroare = rezultat?.error;
          if (eroare && !CODURI_TABELA_INEXISTENTA.has(eroare.code)) throw eroare;
        };
        for (const tabela of TABELE_STERGERE_GDPR_UTILIZATOR) await sterge(tabela);

        await stergeDeadLetterUtilizator({
          supabaseAdmin, userId, clerkUserId, onBeforeDelete: verificaSiReinnoiesteLease,
        });

        await actualizezaStatus('db_done');
      }

      if (statusAsteptat === 'db_done') {
        await verificaSiReinnoiesteLease();
        // PASUL 2 (reversibil — reluabil): Ștergere identitate Clerk
        await cuReinnoireLeaseContinua(
          () => stergeIdentitateClerk({
            clerkUserId,
            secretKey: process.env.CLERK_SECRET_KEY?.trim(),
          }),
          verificaSiReinnoiesteLease,
        );
        await actualizezaStatus('clerk_done');
      }

      if (statusAsteptat === 'clerk_done') {
        await verificaSiReinnoiesteLease();
        // PASUL 3 (reversibil — reluabil): Ștergere media ImageKit
        await cuReinnoireLeaseContinua(
          () => stergeActiveImageKit({
            userId,
            fileIds,
            privateKey: process.env.IMAGEKIT_PRIVATE_KEY?.trim(),
            onBeforeStep: verificaSiReinnoiesteLease,
          }),
          verificaSiReinnoiesteLease,
        );
        await actualizezaStatus('imagekit_done');
      }

      if (statusAsteptat === 'imagekit_done') {
        await verificaSiReinnoiesteLease();
        // PASUL 4 (IREVERSIBIL — ULTIMUL pas): Ștergere identitate Supabase
        const { error: eroareAuth } = await supabaseAdmin.auth.admin.deleteUser(userId);
        if (eroareAuth && !String(eroareAuth.message).toLowerCase().includes('not found')) {
          throw eroareAuth;
        }
        await actualizezaStatus('auth_done');
      }

      if (statusAsteptat === 'auth_done') {
        await verificaSiReinnoiesteLease();
        await actualizezaStatus('completed');
      }

      return res.json({
        succes: true,
        mesaj: 'Contul, datele și activele media asociate au fost șterse definitiv.',
      });
    } catch (err) {
      const cod = codEroare(err);
      console.error('[GDPR] Stergere cont esuata:', cod);
      if (outboxId && hasActiveClaim) {
        try {
          await actualizeazaStatusOutbox(supabaseAdmin, outboxId, {
            ...(numariIncercare >= 5 ? { status: 'failed' } : {}),
            last_error: cod,
            retry_count: numariIncercare,
          }, {
            workerId: ownerId,
            fencingToken,
            expectedStatus: statusAsteptat,
          });
        } catch {
          // eroare persistare last_error ignorata ca sa nu mascam eroarea primara
        }
      }
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
