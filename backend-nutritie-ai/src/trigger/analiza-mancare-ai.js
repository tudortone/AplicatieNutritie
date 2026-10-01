'use strict';

const { task } = require('@trigger.dev/sdk/v3');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { obtinePromptAnalizaFoto } = require('../../services/ai/vision');
const {
  normalizePhotoItems,
  evaluatePhotoQuality,
  inferMealType,
} = require('../../services/ai/photoResultQuality');
const { parseJsonFromLlm } = require('../../utils/llmJson');
const { callWithSoftTimeout } = require('../../utils/httpTimeout');
const {
  construiesteGazdePermise,
  creeazaValideazaUrlImagine,
} = require('../../utils/valideazaUrlImagine');
const { detecteazaMime, MIME_PERMISE } = require('../../utils/detecteazaMime');
const { esteUuid } = require('../../utils/identitate');
const { rezumatEroareSigur } = require('../../utils/sentrySanitize');
const { inregistreazaOperational } = require('../../utils/metrics');

const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];
const MAX_IMAGINE_BYTES = 5 * 1024 * 1024;
const MAX_ALIMENTE = 50;
const VARIABILE_OBLIGATORII = Object.freeze([
  'IMAGEKIT_URL_ENDPOINT',
  'SUPABASE_URL',
  'GEMINI_API_KEY',
]);
const PHOTO_CONCURRENCY = (() => {
  const value = Number(process.env.AI_PHOTO_TRIGGER_CONCURRENCY);
  return Number.isInteger(value) && value >= 1 && value <= 32 ? value : 8;
})();

// Client admin (service_role) pentru tabela `ai_jobs` — nu are politici de
// insert/update pentru clienti (revoke pe anon/authenticated), deci doar
// backendul scrie aici. Lazy: construit doar daca variabilele exista.
let clientAiJobs = null;
function supabaseAiJobs() {
  if (clientAiJobs) return clientAiJobs;
  const url = (process.env.SUPABASE_URL || '').trim();
  const cheie = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !cheie) return null;
  clientAiJobs = createClient(url, cheie);
  return clientAiJobs;
}

/**
 * Actualizeaza starea unui job din tabela `ai_jobs`.
 * Best-effort: o eroare la DB nu trebuie sa darame analiza AI in sine.
 *
 * P1-12 — `completed` este stare FINALA. Task-ul are `maxAttempts: 3`, deci pot
 * exista scrieri intarziate ale unei incercari anterioare. Fara garda, o incercare
 * ramasa in urma isi scria `failed` PESTE un `completed` deja obtinut si sterge
 * rezultatul reusit (utilizatorul vede „analiza a esuat" desi exista rezultat).
 * Filtrul `not('status','eq','completed')` se evalueaza IN BAZA DE DATE, in aceeasi
 * instructiune cu scrierea: nu exista fereastra de cursa intre citire si scriere.
 * `failed` ramane NE-final intentionat — o reluare reusita trebuie sa il poata
 * inlocui cu `completed`.
 */
async function updateAiJob(jobId, patch, userId = null) {
  if (!jobId || typeof jobId !== 'string') return;
  const client = supabaseAiJobs();
  if (!client) {
    console.warn('updateAiJob: lipsesc SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — nu pot urmari jobul.');
    return;
  }
  try {
    let query = client
      .from('ai_jobs')
      .update(patch)
      .eq('id', jobId)
      .not('status', 'eq', 'completed')
      .not('status', 'eq', 'succeeded');
    if (userId) query = query.eq('user_id', userId);
    const { error } = await query;
    if (error) {
      console.warn('[AI job]', rezumatEroareSigur(error, { operation: 'update_ai_job', provider: 'supabase' }));
    }
  } catch (err) {
    console.warn('[AI job]', rezumatEroareSigur(err, { operation: 'update_ai_job', provider: 'supabase' }));
  }
}

async function settlePhotoCredit({ userId, reservationId, action, reason = null }) {
  if (!userId || !reservationId) return null;
  const client = supabaseAiJobs();
  if (!client) throw new Error('SUPABASE_CONFIG_MISSING');
  const { data, error } = await client.rpc('settle_flow_photo_credit', {
    p_user_id: userId,
    p_reservation_id: reservationId,
    p_action: action,
    p_reason: reason,
    p_now: new Date().toISOString(),
  });
  if (error) throw Object.assign(new Error('FLOW_CREDIT_SETTLEMENT_FAILED'), { cause: error });
  inregistreazaOperational(action === 'commit' ? 'credit.commit' : 'credit.release');
  return data;
}

async function requireOwnedJob({ jobId, userId, imageUrl, reservationId }) {
  if (!jobId) return;
  const client = supabaseAiJobs();
  if (!client) throw new Error('SUPABASE_CONFIG_MISSING');
  const { data, error } = await client.from('ai_jobs')
    .select('id')
    .eq('id', jobId)
    .eq('user_id', userId)
    .eq('image_url', imageUrl)
    .eq('credit_reservation_id', reservationId)
    .maybeSingle();
  if (error || !data) throw new Error('JOB_OWNERSHIP_MISMATCH');
}

function construiesteIncercariGemini({ preferredModel, keys, maxAttempts } = {}) {
  const model = typeof preferredModel === 'string' && preferredModel.trim()
    ? preferredModel.trim()
    : GEMINI_MODELS[0];
  const uniqueKeys = [...new Set((Array.isArray(keys) ? keys : [])
    .map((key) => (typeof key === 'string' ? key.trim() : ''))
    .filter(Boolean))];
  const requested = Number(maxAttempts);
  const limit = Number.isInteger(requested) ? Math.min(3, Math.max(1, requested)) : 2;
  return uniqueKeys.slice(0, limit).map((key) => ({ key, model }));
}

async function citesteCorpLimitat(resp, limita) {
  if (!resp.body?.getReader) {
    const buffer = Buffer.from(await resp.arrayBuffer());
    if (buffer.length > limita) throw new Error('IMAGINE_PREA_MARE');
    return buffer;
  }

  const reader = resp.body.getReader();
  const bucati = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limita) {
        await reader.cancel('limita depasita');
        throw new Error('IMAGINE_PREA_MARE');
      }
      bucati.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(bucati, total);
}

function codEroareSigur(err) {
  if (err?.name === 'TimeoutAiError' || err?.name === 'TimeoutError' || err?.name === 'AbortError') {
    return 'TIMEOUT';
  }
  if (err?.message === 'IMAGINE_PREA_MARE') return 'IMAGINE_PREA_MARE';
  return err?.code || err?.name || 'ANALIZA_ESUATA';
}

exports.analizaMancareTask = task({
  id: 'analiza-mancare-ai',
  queue: {
    name: 'ai-photo',
    concurrencyLimit: PHOTO_CONCURRENCY,
  },
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 5000,
    factor: 2,
  },
  onFailure: async ({ payload, error }) => {
    const { userId, jobId, reservationId } = payload || {};
    const code = codEroareSigur(error);
    await settlePhotoCredit({ userId, reservationId, action: 'release', reason: code }).catch(() => {});
    await updateAiJob(jobId, {
      status: 'failed', error_code: code, completed_at: new Date().toISOString(),
    }, userId);
    inregistreazaOperational('photo.failed');
  },
  onCancel: async ({ payload }) => {
    const { userId, jobId, reservationId } = payload || {};
    await settlePhotoCredit({
      userId, reservationId, action: 'release', reason: 'TRIGGER_CANCELLED',
    }).catch(() => {});
    await updateAiJob(jobId, {
      status: 'cancelled', error_code: 'TRIGGER_CANCELLED', completed_at: new Date().toISOString(),
    }, userId);
    inregistreazaOperational('photo.failed');
  },
  run: async (payload) => {
    const executionStartedAt = Date.now();
    const { imageUrl, tipMasa, limba, userId, jobId, reservationId } = payload || {};
    // Marcheaza job-ul ca fiind in curs, din oficiu (persistarea ramane la confirmarea
    // explicita a utilizatorului in frontend; aici urmarim doar stadiul analizei).
    if (jobId) await updateAiJob(jobId, {
      status: 'running', started_at: new Date().toISOString(), error_code: null,
    }, userId);
    inregistreazaOperational('photo.started');

    const lipsesteCheiaPrincipalaGemini = !process.env.GEMINI_API_KEY;
    const lipsa = VARIABILE_OBLIGATORII.filter((cheie) => !process.env[cheie]?.trim());
    if (lipsesteCheiaPrincipalaGemini || lipsa.length > 0) {
      // Eroare de configurare: nu se retry (ar esua identic), dar se raporteaza.
      await settlePhotoCredit({ userId, reservationId, action: 'release', reason: 'NEEDS_CONFIG' }).catch(() => {});
      if (jobId) await updateAiJob(jobId, {
        status: 'failed', error_code: 'NEEDS_CONFIG', completed_at: new Date().toISOString(),
      }, userId);
      return {
        success: false,
        status: 'needs_config',
        eroare: 'Task-ul de analiza nu este configurat complet.',
        variabileLipsa: lipsa,
      };
    }

    if (typeof imageUrl !== 'string' || !imageUrl.trim() || !esteUuid(userId)) {
      await settlePhotoCredit({ userId, reservationId, action: 'release', reason: 'PAYLOAD_INVALID' }).catch(() => {});
      if (jobId) await updateAiJob(jobId, {
        status: 'failed', error_code: 'PAYLOAD_INVALID', completed_at: new Date().toISOString(),
      }, userId);
      return { success: false, eroare: 'Payload invalid pentru analiza imaginii.' };
    }

    const valideazaImagine = creeazaValideazaUrlImagine({
      gazdePermise: construiesteGazdePermise({
        imagekitUrlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
        supabaseUrl: process.env.SUPABASE_URL,
      }),
      folderPrefix: `/mancare/${userId}/`,
    });
    const verificare = valideazaImagine(imageUrl);
    if (!verificare.ok) {
      await settlePhotoCredit({ userId, reservationId, action: 'release', reason: 'URL_IMAGINE_INVALIDA' }).catch(() => {});
      if (jobId) await updateAiJob(jobId, {
        status: 'failed', error_code: 'URL_IMAGINE_INVALIDA', completed_at: new Date().toISOString(),
      }, userId);
      return { success: false, eroare: verificare.eroare };
    }

    try {
      await requireOwnedJob({ jobId, userId, imageUrl: verificare.url, reservationId });
      const resp = await fetch(verificare.url, {
        signal: AbortSignal.timeout(20000),
        redirect: 'manual',
      });
      if (resp.status >= 300 && resp.status < 400) throw new Error('REDIRECT_INTERZIS');
      if (!resp.ok) throw new Error('DESCARCARE_ESUATA');

      const mimeDeclarat = String(resp.headers.get('content-type') || '')
        .split(';')[0]
        .trim()
        .toLowerCase();
      if (!MIME_PERMISE.has(mimeDeclarat)) throw new Error('MIME_INTERZIS');

      const lungime = Number(resp.headers.get('content-length'));
      if (Number.isFinite(lungime) && lungime > MAX_IMAGINE_BYTES) {
        throw new Error('IMAGINE_PREA_MARE');
      }

      const buffer = await citesteCorpLimitat(resp, MAX_IMAGINE_BYTES);
      const mimeDetectat = detecteazaMime(buffer);
      if (!mimeDetectat || mimeDetectat !== mimeDeclarat) throw new Error('SEMNATURA_IMAGINE_INVALIDA');

      const imagePart = { inlineData: { data: buffer.toString('base64'), mimeType: mimeDetectat } };
      let text = null;
      let ultimaEroare = null;
      const chei = [
        process.env.GEMINI_API_KEY,
        process.env.GEMINI_API_KEY_2,
        process.env.GEMINI_API_KEY_3,
        process.env.GEMINI_API_KEY_4,
      ].map((cheie) => cheie?.trim()).filter(Boolean);

      const incercariGemini = construiesteIncercariGemini({
        preferredModel: process.env.GEMINI_MODEL,
        keys: chei,
        maxAttempts: Number(process.env.GEMINI_PHOTO_ATTEMPTS_PER_RUN || 2),
      });
      for (const { key, model: modelName } of incercariGemini) {
        const client = new GoogleGenerativeAI(key);
        try {
          const model = client.getGenerativeModel({ model: modelName });
          const result = await callWithSoftTimeout(model.generateContent({
            contents: [{ role: 'user', parts: [{ text: obtinePromptAnalizaFoto(limba) }, imagePart] }],
            generationConfig: { responseMimeType: 'application/json' },
          }), 30000);
          text = result?.response?.text();
        } catch (err) {
          ultimaEroare = err;
          const code = codEroareSigur(err);
          if (code === 'TIMEOUT') inregistreazaOperational('gemini.timeout');
          if (String(err?.status || err?.code || err?.message || '').includes('429')) {
            inregistreazaOperational('gemini.429');
          }
        }
        if (text) break;
      }
      if (!text) throw ultimaEroare || new Error('NICIUN_MODEL_DISPONIBIL');

      const items = parseJsonFromLlm(text, { asteapta: 'array' });
      if (!Array.isArray(items)) throw new Error('JSON_AI_INVALID');

      const normalizate = normalizePhotoItems(items.slice(0, MAX_ALIMENTE));

      // Ramura isNotFood: imaginea nu contine alimente (modelul a raspuns cu
      // alimente filtrate sau nume care semnaleaza non-food). Raspuns explicit
      // pentru frontend, distinct de o eroare tehnica.
      if (normalizate.some((item) => /nu.*mancare|non-food|nu s-a detectat|nu contine/i.test(item.nume))) {
        const rezultatNotFood = {
          success: false,
          isNotFood: true,
          eroare: 'Imaginea încărcată nu pare să conțină alimente. Te rugăm să încerci cu o poză clară a unei mese.',
          processedAt: new Date().toISOString(),
        };
        // Rezultat procesat valid: jobul se considera completed, nu o eroare tehnica.
        await settlePhotoCredit({ userId, reservationId, action: 'release', reason: 'NOT_FOOD' });
        if (jobId) await updateAiJob(jobId, {
          status: 'failed', result: rezultatNotFood, error_code: 'NOT_FOOD',
          completed_at: new Date().toISOString(),
        }, userId);
        return rezultatNotFood;
      }

      const quality = evaluatePhotoQuality(normalizate);
      const suggestedMeal = normalizate.find((item) => item.tip_masa_sugerat)?.tip_masa_sugerat;

      const rezultatFinal = {
        success: true,
        items: normalizate,
        totals: quality.totals,
        quality: { requiresReview: quality.requiresReview, issues: quality.issues },
        tipMasa: inferMealType(suggestedMeal, tipMasa),
        userId,
        processedAt: new Date().toISOString(),
      };
      await settlePhotoCredit({ userId, reservationId, action: 'commit' });
      if (jobId) await updateAiJob(jobId, {
        status: 'succeeded', result: rezultatFinal, error_code: null,
        completed_at: new Date().toISOString(),
      }, userId);
      inregistreazaOperational('photo.succeeded', Date.now() - executionStartedAt);
      return rezultatFinal;
    } catch (err) {
      if (process.env.SENTRY_DSN) {
        try {
          const Sentry = require('@sentry/node');
          Sentry.withScope((scope) => {
            scope.setLevel('error');
            scope.setExtra('error_summary', rezumatEroareSigur(err, {
              operation: 'trigger_photo_analysis',
              provider: 'gemini',
            }));
            Sentry.captureMessage('AI_TRIGGER_PHOTO_ANALYSIS_FAILED');
          });
        } catch {
          // Telemetria optionala nu schimba rezultatul task-ului.
        }
      }
      const cod = codEroareSigur(err);
      console.error('[Trigger analiza-mancare-ai] Esuare:', cod);
      // Starea ramane running intre incercari. Doar hook-ul terminal onFailure
      // marcheaza failed si elibereaza rezervarea, evitand refund intre retry-uri.
      if (jobId) await updateAiJob(jobId, { error_code: cod }, userId);
      throw err;
    }
  },
});

exports._test = {
  citesteCorpLimitat, detecteazaMime, codEroareSigur, updateAiJob,
  settlePhotoCredit, requireOwnedJob, construiesteIncercariGemini, PHOTO_CONCURRENCY,
  normalizePhotoItems, evaluatePhotoQuality, inferMealType,
};
