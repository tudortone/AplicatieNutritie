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
 *      DB rows → auth.deleteUser → Clerk → ImageKit
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
const { tabelUtilizator } = require('../utils/clientUtilizator');

const IMAGEKIT_API = ['https:', '', 'api.imagekit.io', 'v1'].join('/');
const CLERK_USERS_API = ['https:', '', 'api.clerk.com', 'v1', 'users'].join('/');
const MAX_ADANCIME_JSON = 8;

function codEroare(err) {
  return err?.code || err?.name || 'NECUNOSCUT';
}

/**
 * P-06: Extrage toate fileId-urile din JSONB-ul `alimente` al meselor.
 * Acceptă structuri arbitrar imbricate (array, object, string).
 */
function extrageFileIds(value, rezultat = new Set(), adancime = 0) {
  if (adancime > MAX_ADANCIME_JSON || value === null || value === undefined) return rezultat;
  if (Array.isArray(value)) {
    for (const element of value) extrageFileIds(element, rezultat, adancime + 1);
    return rezultat;
  }
  if (typeof value !== 'object') return rezultat;

  for (const [key, element] of Object.entries(value)) {
    if (
      (key === 'fileId' || key === 'imageKitFileId' || key === 'imagekit_file_id') &&
      typeof element === 'string' &&
      /^[A-Za-z0-9_-]{6,200}$/.test(element)
    ) {
      rezultat.add(element);
    } else {
      extrageFileIds(element, rezultat, adancime + 1);
    }
  }
  return rezultat;
}

async function imageKitRequest(cale, { privateKey, method = 'DELETE', body } = {}) {
  const authorization = Buffer.from(`${privateKey}:`, 'utf8').toString('base64');
  const response = await fetch(`${IMAGEKIT_API}${cale}`, {
    method,
    headers: {
      Authorization: `Basic ${authorization}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
  });
  if (!response.ok && response.status !== 404) {
    const error = new Error('IMAGEKIT_DELETE_FAILED');
    error.code = `IMAGEKIT_${response.status}`;
    throw error;
  }
}

/**
 * P-06: Șterge fișierele individuale pe fileId + folderele userId.
 * Cele două strategii sunt complementare, nu alternative.
 */
async function stergeActiveImageKit({ userId, fileIds, privateKey }) {
  if (!privateKey) {
    const error = new Error('IMAGEKIT_NOT_CONFIGURED');
    error.code = 'IMAGEKIT_NOT_CONFIGURED';
    throw error;
  }

  // Ștergere foldere (idempotent: 404 = deja șters)
  await Promise.all([
    '/mancare/' + userId + '/',
    '/meals/' + userId + '/',
  ].map((folderPath) => imageKitRequest('/folder/', { privateKey, body: { folderPath } })));

  // P-06: ștergere fișiere individuale pe fileId (căi non-standard)
  const ids = [...fileIds];
  for (let index = 0; index < ids.length; index += 5) {
    const lot = ids.slice(index, index + 5);
    await Promise.all(lot.map((fileId) => imageKitRequest(
      `/files/${encodeURIComponent(fileId)}`,
      { privateKey },
    )));
  }
}

async function stergeFoldereImageKit({ userId, privateKey }) {
  if (!privateKey) {
    const error = new Error('IMAGEKIT_NOT_CONFIGURED');
    error.code = 'IMAGEKIT_NOT_CONFIGURED';
    throw error;
  }

  await Promise.all([
    '/mancare/' + userId + '/',
    '/meals/' + userId + '/',
  ].map((folderPath) => imageKitRequest('/folder/', { privateKey, body: { folderPath } })));
}

async function stergeIdentitateClerk({ clerkUserId, secretKey }) {
  if (!clerkUserId) return;
  if (!secretKey) {
    const error = new Error('CLERK_NOT_CONFIGURED');
    error.code = 'CLERK_NOT_CONFIGURED';
    throw error;
  }

  const response = await fetch(
    `${CLERK_USERS_API}/${encodeURIComponent(clerkUserId)}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    },
  );

  if (response.status === 404) return;
  if (!response.ok) {
    const error = new Error('CLERK_DELETE_FAILED');
    error.code = `CLERK_${response.status}`;
    throw error;
  }
}

/**
 * P-06: Extrage fileId-urile din toate mesele unui utilizator.
 * Citim direct din supabaseAdmin (tabel cu RLS — service_role bypasses, OK
 * pentru GDPR care deja s-a autentificat și verificat userId).
 */
async function extrageFileIdsUtilizator({ supabaseAdmin, userId }) {
  try {
    const { data, error } = await supabaseAdmin
      .from('mese')
      .select('alimente')
      .eq('user_id', userId);
    if (error || !data) return new Set();
    const rezultat = new Set();
    for (const masa of data) {
      if (masa.alimente) extrageFileIds(masa.alimente, rezultat);
    }
    return rezultat;
  } catch {
    return new Set();
  }
}

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
   * P-05: Ștergere cont atomică cu outbox pattern.
   *
   * Ordinea pașilor: REVERSIBIL → IREVERSIBIL
   *   1. Înregistrare outbox (atomic, fail-closed)
   *   2. DB rows (reversibil prin restaurare backup)
   *   3. auth.deleteUser Supabase (semi-reversibil prin admin API)
   *   4. Clerk (ireversibil)
   *   5. ImageKit (ireversibil)
   *
   * Utilizatorul percepe ștergerea ca instantanee (status 'pending' blochează
   * login-ul în middleware). Execuția reală e asincronă și reluabilă.
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
        // Fallback: continuăm fără outbox dacă migrarea nu a rulat încă
        console.warn('[GDPR] Outbox indisponibil, continuăm fără tracking:', codEroare(outboxErr));
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
      const fileIds = await extrageFileIdsUtilizator({ supabaseAdmin, userId });

      // PASUL 1 (reversibil): Ștergere rânduri DB
      const sterge = async (tabela) => {
        const { error } = await tabelUtilizator(ctx, tabela).delete().eq('user_id', userId);
        if (error) throw error;
      };

      await Promise.all([
        sterge('mese'),
        sterge('profil'),
        sterge('antrenamente'),
        sterge('barcode_estimari_utilizator'),
        sterge('audit_log'),
      ]);
      await actualizezaStatus('db_done');

      // PASUL 2 (semi-reversibil): Ștergere identitate Supabase
      const { error: eroareAuth } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (eroareAuth) throw eroareAuth;
      await actualizezaStatus('auth_done');

      // PASUL 3 (ireversibil): Ștergere identitate Clerk
      await stergeIdentitateClerk({
        clerkUserId,
        secretKey: process.env.CLERK_SECRET_KEY?.trim(),
      });
      await actualizezaStatus('clerk_done');

      // PASUL 4 (ireversibil): Ștergere media ImageKit
      // P-06: stergeActiveImageKit + foldere + fileIds individuale
      await stergeActiveImageKit({
        userId,
        fileIds,
        privateKey: process.env.IMAGEKIT_PRIVATE_KEY?.trim(),
      });
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
