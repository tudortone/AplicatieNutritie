'use strict';

const express = require('express');
const { tabelUtilizator } = require('../utils/clientUtilizator');

const IMAGEKIT_API = ['https:', '', 'api.imagekit.io', 'v1'].join('/');
const MAX_ADANCIME_JSON = 8;

function codEroare(err) {
  return err?.code || err?.name || 'NECUNOSCUT';
}

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

async function stergeActiveImageKit({ userId, fileIds, privateKey }) {
  if (!privateKey) {
    const error = new Error('IMAGEKIT_NOT_CONFIGURED');
    error.code = 'IMAGEKIT_NOT_CONFIGURED';
    throw error;
  }

  await imageKitRequest('/folder/', {
    privateKey,
    body: { folderPath: `/mancare/${userId}/` },
  });

  const ids = [...fileIds];
  for (let index = 0; index < ids.length; index += 5) {
    const lot = ids.slice(index, index + 5);
    await Promise.all(lot.map((fileId) => imageKitRequest(
      `/files/${encodeURIComponent(fileId)}`,
      { privateKey },
    )));
  }
}

// Șterge ambele foldere ImageKit asociate utilizatorului (`/mancare/` și
// `/meals/` legacy) — idempotent: o ștergere a unui folder inexistent (404)
// este tratată ca succes. Fără cheie privată → IMAGEKIT_NOT_CONFIGURED.
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

// Șterge identitatea Clerk (DELETE idempotent: 404 = deja șters, succes).
// Fără clerkUserId → return (nimic de șters); fără secretKey → CLERK_NOT_CONFIGURED.
async function stergeIdentitateClerk({ clerkUserId, secretKey }) {
  if (!clerkUserId) return;
  if (!secretKey) {
    const error = new Error('CLERK_NOT_CONFIGURED');
    error.code = 'CLERK_NOT_CONFIGURED';
    throw error;
  }

  const response = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(clerkUserId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${secretKey}` },
    signal: AbortSignal.timeout(10000),
  });

  // DELETE idempotent: un 404 înseamnă că utilizatorul a fost deja șters.
  if (response.status === 404) return;
  if (!response.ok) {
    const error = new Error('CLERK_DELETE_FAILED');
    error.code = `CLERK_${response.status}`;
    throw error;
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

  router.delete('/delete-account', requireAuth, generalLimiter, async (req, res) => {
    try {
      const ctx = contextDate(req, res);
      const userId = ctx.userId;

      // Verificăm disponibilitatea ștergerii identității ÎNAINTE de orice
      // ștergere, ca operația să fie fail-closed (fără succes parțial).
      if (!supabaseAdmin.auth?.admin?.deleteUser) {
        throw new Error('ADMIN_DELETE_UNAVAILABLE');
      }

      // 1) Citește mapping-ul Clerk pentru userId. Trebuie citit ÎNAINTE de
      //    ștergere; clerk_user_map nu se șterge manual aici — cascada de la
      //    deleteUser o curăță. Ștergerea ei înainte ar fi făcut imposibile
      //    retry-urile unei ștergeri eșuate (bug-ul istoric).
      const { data: mapare, error: eroareMapare } = await supabaseAdmin
        .from('clerk_user_map')
        .select('clerk_user_id')
        .eq('supabase_user_id', userId)
        .maybeSingle();
      if (eroareMapare) throw eroareMapare;
      const clerkUserId = mapare?.clerk_user_id || null;

      // 2) Șterge folderele ImageKit (ambele /mancare/ și /meals/ legacy) —
      //    idempotent (404 = deja șterse).
      await stergeFoldereImageKit({
        userId,
        privateKey: process.env.IMAGEKIT_PRIVATE_KEY?.trim(),
      });

      // 3) Șterge identitatea Clerk (DELETE idempotent; 404 = deja șters).
      await stergeIdentitateClerk({
        clerkUserId,
        secretKey: process.env.CLERK_SECRET_KEY?.trim(),
      });

      // 4) Tabelele utilizatorului (mese, profil, antrenamente, etc.) sunt
      //    şterse și prin cascada FK a deleteUser; le ștergem explicit în plus
      //    (fail-closed, idempotente), ca nici un rând orfan să nu rămână.
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

      // NOTĂ: clerk_user_map NU se șterge manual ÎNAINTE de deleteUser — cascada
      // FK de la deleteUser o curăță. Ștergerea ei manuală înainte de a șterge
      // identitatea ar fi făcut imposibile retry-urile (era bug-ul).

      // 5) În final: șterge identitatea Supabase. Cascada FK elimină și
      //    relațiile rămase (mese, profil, antrenamente, audit_log,
      //    barcode_estimari, ai_jobs, clerk_user_map).
      const { error: eroareAuth } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (eroareAuth) throw eroareAuth;

      return res.json({
        succes: true,
        mesaj: 'Contul, datele și activele media asociate au fost șterse definitiv.',
      });
    } catch (err) {
      const cod = codEroare(err);
      console.error('[GDPR] Stergere cont esuata:', cod);
      const status = cod === 'IMAGEKIT_NOT_CONFIGURED' || cod === 'CLERK_NOT_CONFIGURED' ? 503 : 500;
      return res.status(status).json({
        eroare: 'Ștergerea contului a eșuat. Poți încerca din nou în siguranță — orice eșec este în întregime acoperit și nu se raportează succes parțial.',
      });
    }
  });

  return router;
}

createGdprRouter.extrageFileIds = extrageFileIds;
createGdprRouter.stergeActiveImageKit = stergeActiveImageKit;
createGdprRouter.stergeFoldereImageKit = stergeFoldereImageKit;
createGdprRouter.stergeIdentitateClerk = stergeIdentitateClerk;
module.exports = createGdprRouter;
