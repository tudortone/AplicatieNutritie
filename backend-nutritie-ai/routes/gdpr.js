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

/**
 * Sterge atat structura curenta, cat si folderul legacy. Operatiile sunt
 * idempotente: un 404 inseamna ca activul fusese deja sters intr-o incercare
 * anterioara. File IDs acopera si active istorice salvate in afara folderelor.
 */
async function stergeActiveImageKit({ userId, fileIds, privateKey }) {
  if (!privateKey) {
    const error = new Error('IMAGEKIT_NOT_CONFIGURED');
    error.code = 'IMAGEKIT_NOT_CONFIGURED';
    throw error;
  }

  await Promise.all([
    `/mancare/${userId}/`,
    `/meals/${userId}/`,
  ].map((folderPath) => imageKitRequest('/folder/', {
    privateKey,
    body: { folderPath },
  })));

  const ids = [...fileIds];
  for (let index = 0; index < ids.length; index += 5) {
    const lot = ids.slice(index, index + 5);
    await Promise.all(lot.map((fileId) => imageKitRequest(
      `/files/${encodeURIComponent(fileId)}`,
      { privateKey },
    )));
  }
}

async function stergeIdentitateClerk({ clerkUserId, secretKey }) {
  if (!clerkUserId) return;
  if (!secretKey) {
    const error = new Error('CLERK_NOT_CONFIGURED');
    error.code = 'CLERK_NOT_CONFIGURED';
    throw error;
  }

  const response = await fetch(
    `https://api.clerk.com/v1/users/${encodeURIComponent(clerkUserId)}`,
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

  if (!response.ok && response.status !== 404) {
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

      // Colectam toate datele necesare inainte de primul pas distructiv.
      const [{ data: mese, error: eroareMese }, { data: mapare, error: eroareMapare }] =
        await Promise.all([
          tabelUtilizator(ctx, 'mese').select('alimente').eq('user_id', userId),
          supabaseAdmin
            .from('clerk_user_map')
            .select('clerk_user_id')
            .eq('supabase_user_id', userId)
            .maybeSingle(),
        ]);
      if (eroareMese) throw eroareMese;
      if (eroareMapare) throw eroareMapare;

      const imageKitPrivateKey = process.env.IMAGEKIT_PRIVATE_KEY?.trim();
      const clerkSecretKey = process.env.CLERK_SECRET_KEY?.trim();
      if (!imageKitPrivateKey) {
        const error = new Error('IMAGEKIT_NOT_CONFIGURED');
        error.code = 'IMAGEKIT_NOT_CONFIGURED';
        throw error;
      }
      if (mapare?.clerk_user_id && !clerkSecretKey) {
        const error = new Error('CLERK_NOT_CONFIGURED');
        error.code = 'CLERK_NOT_CONFIGURED';
        throw error;
      }

      // Saga idempotenta: fiecare pas poate fi repetat in siguranta. Stergerea
      // Auth ramane ultima; FK-urile ON DELETE CASCADE curata atomic toate
      // randurile Supabase, inclusiv clerk_user_map si audit_log.
      await stergeActiveImageKit({
        userId,
        fileIds: extrageFileIds(mese || []),
        privateKey: imageKitPrivateKey,
      });
      await stergeIdentitateClerk({
        clerkUserId: mapare?.clerk_user_id ?? null,
        secretKey: clerkSecretKey,
      });

      if (!supabaseAdmin.auth?.admin?.deleteUser) {
        throw new Error('SUPABASE_ADMIN_UNAVAILABLE');
      }
      const { error: eroareAuth } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (eroareAuth) throw eroareAuth;

      return res.json({
        succes: true,
        mesaj: 'Contul, datele și activele media asociate au fost șterse definitiv.',
      });
    } catch (err) {
      const cod = codEroare(err);
      console.error('[GDPR] Stergere cont esuata:', cod);
      const indisponibil = cod === 'IMAGEKIT_NOT_CONFIGURED' || cod === 'CLERK_NOT_CONFIGURED';
      return res.status(indisponibil ? 503 : 500).json({
        eroare: 'Ștergerea completă nu a putut fi finalizată. Operația poate fi reîncercată în siguranță.',
      });
    }
  });

  return router;
}

createGdprRouter.extrageFileIds = extrageFileIds;
createGdprRouter.stergeActiveImageKit = stergeActiveImageKit;
createGdprRouter.stergeIdentitateClerk = stergeIdentitateClerk;
module.exports = createGdprRouter;
