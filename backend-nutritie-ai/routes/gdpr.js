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

      const { data: mese, error: eroareMese } = await tabelUtilizator(ctx, 'mese')
        .select('alimente')
        .eq('user_id', userId);
      if (eroareMese) throw eroareMese;

      const fileIds = extrageFileIds(mese || []);
      await stergeActiveImageKit({
        userId,
        fileIds,
        privateKey: process.env.IMAGEKIT_PRIVATE_KEY?.trim(),
      });

      // Curățare legacy: fișierele vechi de dinainte de folderul unic
      // `/mancare/<userId>/` locuiau în `/meals/<userId>/`. Ștergem acest
      // folder vechi ca best-effort (nu doboară ștergerea contului), ca nici un
      // activ media abandonat să nu rămână pe CDN după Art. 17.
      if (process.env.IMAGEKIT_PRIVATE_KEY && process.env.IMAGEKIT_PUBLIC_KEY) {
        try {
          const ImageKit = require('imagekit');
          const ik = new ImageKit({
            publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
            privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
            urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT || 'https://ik.imagekit.io/nutriai',
          });
          const fileList = await new Promise((rezolve) => {
            ik.listFiles({
              searchQuery: `folderPath : "/meals/${userId}/*" OR name : "*${userId}*"`,
            }, (err, raspuns) => {
              if (err || !Array.isArray(raspuns)) rezolve([]);
              else rezolve(raspuns);
            });
          });
          const idsLegacy = (fileList || []).map((f) => f?.fileId).filter(Boolean);
          if (idsLegacy.length > 0) {
            await new Promise((rezolve) => {
              ik.bulkDeleteFiles(idsLegacy, (delErr) => {
                if (delErr) console.warn('[GDPR] Ștergere fișiere ImageKit vechi eșuată:', delErr.message);
                rezolve();
              });
            });
          }
        } catch (ikErr) {
          console.warn('[GDPR] Curățare ImageKit legacy omisă:', ikErr.message);
        }
      }

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

      const { error: eroareMapare } = await supabaseAdmin
        .from('clerk_user_map')
        .delete()
        .eq('supabase_user_id', userId);
      if (eroareMapare) throw eroareMapare;

      if (!supabaseAdmin.auth?.admin?.deleteUser) {
        return res.status(500).json({ eroare: 'Nu s-a putut șterge contul.' });
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
      const status = cod === 'IMAGEKIT_NOT_CONFIGURED' ? 503 : 500;
      return res.status(status).json({
        eroare: 'Ștergerea completă a contului nu a putut fi finalizată. Niciun succes parțial nu a fost raportat.',
      });
    }
  });

  return router;
}

createGdprRouter.extrageFileIds = extrageFileIds;
createGdprRouter.stergeActiveImageKit = stergeActiveImageKit;
module.exports = createGdprRouter;
