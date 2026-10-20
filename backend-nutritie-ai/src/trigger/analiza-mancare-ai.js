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
  const { data, error } = await client.rpc('settle_flow_photo_credit_v2', {
    p_user_id: userId,
    p_reservation_id: reservationId,
    p_action: action,
    p_reason: reason,
    p_now: new Date().toISOString(),
  });
  if (error || !data || data.ok !== true) {
    throw Object.assign(new Error('FLOW_CREDIT_SETTLEMENT_FAILED'), { cause: error || data });
  }
  const expectedStatus = action === 'commit' ? 'COMMITTED' : 'RELEASED';
  if (data.status && data.status !== expectedStatus) {
    throw Object.assign(new Error('FLOW_CREDIT_SETTLEMENT_STATE_MISMATCH'), { cause: data });
  }
  inregistreazaOperational(action === 'commit' ? 'credit.commit' : 'credit.release');
  return data;
}

async function readPhotoReservation({ userId, reservationId }) {
  if (!userId || !reservationId) throw new Error('RESERVATION_OWNERSHIP_MISMATCH');
  const client = supabaseAiJobs();
  if (!client) throw new Error('SUPABASE_CONFIG_MISSING');
  const { data, error } = await client.from('flow_credit_reservations')
    .select('id,user_id,logical_analysis_id,status,request_fingerprint,inference_claimed_at,outcome_unknown_at,result')
    .eq('id', reservationId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) throw new Error('RESERVATION_OWNERSHIP_MISMATCH');
  return data;
}

async function claimPhotoInference(input) {
  const client = supabaseAiJobs();
  if (!client) throw new Error('SUPABASE_CONFIG_MISSING');
  const { data, error } = await client.rpc('claim_flow_photo_inference', {
    p_user_id: input.userId,
    p_reservation_id: input.reservationId,
    p_request_fingerprint: input.requestFingerprint,
    p_job_id: input.jobId,
    p_logical_analysis_id: input.logicalAnalysisId,
    p_image_url: input.imageUrl,
    p_image_file_id: input.imageFileId || null,
    p_now: new Date().toISOString(),
  });
  if (error || data?.ok !== true) {
    throw Object.assign(new Error(data?.code || 'PHOTO_INFERENCE_CLAIM_FAILED'), { cause: error || data });
  }
  return data;
}

async function recordPhotoResult({ userId, reservationId, requestFingerprint, result }) {
  const client = supabaseAiJobs();
  if (!client) throw new Error('SUPABASE_CONFIG_MISSING');
  const { data, error } = await client.rpc('record_flow_photo_result', {
    p_user_id: userId,
    p_reservation_id: reservationId,
    p_request_fingerprint: requestFingerprint,
    p_result: result,
  });
  if (error || data?.ok !== true || !data.result) {
    throw Object.assign(new Error(data?.code || 'PHOTO_RESULT_PERSISTENCE_FAILED'), { cause: error || data });
  }
  return data.result;
}

async function markPhotoOutcomeUnknown({ userId, jobId, reservationId }) {
  const client = supabaseAiJobs();
  if (!client) throw new Error('SUPABASE_CONFIG_MISSING');
  const { data, error } = await client.rpc('mark_flow_photo_outcome_unknown', {
    p_user_id: userId,
    p_reservation_id: reservationId,
    p_job_id: jobId,
    p_now: new Date().toISOString(),
  });
  if (error || data?.ok !== true) {
    throw Object.assign(new Error(data?.code || 'PHOTO_OUTCOME_UNKNOWN_PERSIST_FAILED'), { cause: error || data });
  }
  return data;
}

async function requireOwnedJob({ jobId, userId, imageUrl, imageFileId, logicalAnalysisId, reservationId }) {
  if (!jobId || !reservationId) throw new Error('JOB_OWNERSHIP_MISMATCH');
  const client = supabaseAiJobs();
  if (!client) throw new Error('SUPABASE_CONFIG_MISSING');
  let query = client.from('ai_jobs')
    .select('id,user_id,logical_analysis_id,image_url,image_file_id,credit_reservation_id,status,result,error_code')
    .eq('id', jobId)
    .eq('user_id', userId)
    .eq('image_url', imageUrl)
    .eq('credit_reservation_id', reservationId);
  if (logicalAnalysisId) query = query.eq('logical_analysis_id', logicalAnalysisId);
  if (imageFileId) query = query.eq('image_file_id', imageFileId);
  const { data, error } = await query.maybeSingle();
  if (error || !data) throw new Error('JOB_OWNERSHIP_MISMATCH');
  return data;
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
  const msg = String(err?.message || '');
  if (msg.includes('503') || /high demand|temporarily unavailable|service unavailable/i.test(msg)) {
    return 'AI_HIGH_DEMAND';
  }
  if (msg.includes('429') || /resource exhausted|quota/i.test(msg)) {
    return 'AI_RATE_LIMITED';
  }
  if (err?.message === 'PHOTO_RESULT_INVALID' || err?.message === 'JSON_AI_INVALID') {
    return err.message;
  }
  const cleanName = err?.name && err?.name !== 'Error' ? err.name : null;
  return err?.code || cleanName || 'ANALIZA_ESUATA';
}

async function finalizeStoredPhotoResult(payload, result) {
  const { userId, jobId, reservationId } = payload;
  const action = result.success === true ? 'commit' : 'release';
  await settlePhotoCredit({
    userId, reservationId, action,
    reason: result.success === true ? 'VALID_PHOTO_RESULT' : 'CONFIRMED_PHOTO_FAILURE',
  });
  await updateAiJob(jobId, {
    status: result.success === true ? 'succeeded' : 'failed',
    result,
    error_code: result.success === true ? null : (result.errorCode || 'NOT_FOOD'),
    completed_at: new Date().toISOString(),
  }, userId);
  return result;
}

async function reconcileTerminalPhotoFailure(payload, error) {
  const { userId, jobId, reservationId } = payload || {};
  if (!userId || !reservationId) return;
  const reservation = await readPhotoReservation({ userId, reservationId });
  if (reservation.result) {
    await finalizeStoredPhotoResult(payload, reservation.result);
    return;
  }
  if (reservation.status !== 'RESERVED') {
    await updateAiJob(jobId, {
      status: reservation.status === 'COMMITTED' ? 'failed' : 'failed',
      error_code: reservation.status === 'COMMITTED' ? 'PHOTO_OUTCOME_UNKNOWN' : codEroareSigur(error),
      completed_at: new Date().toISOString(),
    }, userId);
    return;
  }
  if (reservation.inference_claimed_at) {
    const reconciliation = await markPhotoOutcomeUnknown({ userId, jobId, reservationId });
    if (reconciliation.result) await finalizeStoredPhotoResult(payload, reconciliation.result);
    return;
  }
  await settlePhotoCredit({ userId, reservationId, action: 'release', reason: codEroareSigur(error) });
  await updateAiJob(jobId, {
    status: 'failed', error_code: codEroareSigur(error), completed_at: new Date().toISOString(),
  }, userId);
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
    await reconcileTerminalPhotoFailure(payload, error).catch(async () => {
      await updateAiJob(payload?.jobId, {
        status: 'failed', error_code: 'PHOTO_OUTCOME_UNKNOWN', completed_at: new Date().toISOString(),
      }, payload?.userId);
    });
    inregistreazaOperational('photo.failed');
  },
  onCancel: async ({ payload }) => {
    await reconcileTerminalPhotoFailure(payload, new Error('TRIGGER_CANCELLED')).catch(async () => {
      await updateAiJob(payload?.jobId, {
        status: 'failed', error_code: 'PHOTO_OUTCOME_UNKNOWN', completed_at: new Date().toISOString(),
      }, payload?.userId);
    });
    inregistreazaOperational('photo.failed');
  },
  run: async (payload) => {
    const executionStartedAt = Date.now();
    const {
      imageUrl, imageFileId, logicalAnalysisId, requestFingerprint,
      tipMasa, limba, userId, jobId, reservationId,
    } = payload || {};
    inregistreazaOperational('photo.started');

    try {
      if (VARIABILE_OBLIGATORII.some((cheie) => !process.env[cheie]?.trim())) {
        throw Object.assign(new Error('PHOTO_TASK_CONFIGURATION_MISSING'), { code: 'NEEDS_CONFIG' });
      }

      if (typeof imageUrl !== 'string' || !imageUrl.trim() || !esteUuid(userId)) {
        throw Object.assign(new Error('PHOTO_TASK_PAYLOAD_INVALID'), { code: 'PAYLOAD_INVALID' });
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
        throw Object.assign(new Error('PHOTO_IMAGE_URL_INVALID'), { code: 'URL_IMAGINE_INVALIDA' });
      }

      if (typeof logicalAnalysisId !== 'string' || !logicalAnalysisId.trim()
        || typeof requestFingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(requestFingerprint)) {
        throw new Error('PHOTO_JOB_CONTRACT_MISSING');
      }
      await requireOwnedJob({
        jobId, userId, imageUrl: verificare.url, imageFileId, logicalAnalysisId, reservationId,
      });
      const reservation = await readPhotoReservation({ userId, reservationId });
      if (reservation.logical_analysis_id !== logicalAnalysisId
        || reservation.request_fingerprint !== requestFingerprint) {
        throw new Error('JOB_OWNERSHIP_MISMATCH');
      }
      if (reservation.result) return await finalizeStoredPhotoResult(payload, reservation.result);
      if (reservation.status !== 'RESERVED') throw new Error('PHOTO_RESERVATION_NOT_ACTIVE');
      if (reservation.inference_claimed_at) throw new Error('PHOTO_OUTCOME_UNKNOWN');

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

      const incercariGemini = construiesteIncercariGemini({
        preferredModel: process.env.GEMINI_MODEL,
        keys: [process.env.GEMINI_API_KEY],
        maxAttempts: 1,
      });
      const claim = await claimPhotoInference({
        userId, reservationId, requestFingerprint, jobId, logicalAnalysisId,
        imageUrl: verificare.url, imageFileId,
      });
      if (claim.acquired !== true) {
        if (claim.result) return await finalizeStoredPhotoResult(payload, claim.result);
        throw new Error('PHOTO_OUTCOME_UNKNOWN');
      }

      const imagePart = { inlineData: { data: buffer.toString('base64'), mimeType: mimeDetectat } };
      const [{ key, model: modelName }] = incercariGemini;
      const client = new GoogleGenerativeAI(key);
      const model = client.getGenerativeModel({ model: modelName });
      const response = await callWithSoftTimeout(model.generateContent({
        contents: [{ role: 'user', parts: [{ text: obtinePromptAnalizaFoto(limba) }, imagePart] }],
        generationConfig: { responseMimeType: 'application/json' },
      }), 30000);
      const text = response?.response?.text();
      if (!text) throw new Error('AI_EMPTY_RESULT');

      const items = parseJsonFromLlm(text, { asteapta: 'array' });
      if (!Array.isArray(items)) throw new Error('JSON_AI_INVALID');

      // Ramura isNotFood: imaginea nu contine alimente (modelul a raspuns cu
      // array gol [] sau cu alimente/mesaje care semnaleaza non-food).
      const isNotFood = items.length === 0 || items.some((item) =>
        !item || typeof item !== 'object' || /nu.*(mancare|aliment)|non-food|nu s-a detectat|nu contine|not.*food|no.*food/i.test(String(item.nume || ''))
      );

      if (isNotFood) {
        const rezultatNotFood = {
          success: false,
          isNotFood: true,
          eroare: 'Imaginea încărcată nu pare să conțină alimente. Te rugăm să încerci cu o poză clară a unei mese.',
          processedAt: new Date().toISOString(),
        };
        await recordPhotoResult({ userId, reservationId, requestFingerprint, result: rezultatNotFood });
        return await finalizeStoredPhotoResult(payload, rezultatNotFood);
      }

      const normalizate = normalizePhotoItems(items.slice(0, MAX_ALIMENTE));

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
      await recordPhotoResult({ userId, reservationId, requestFingerprint, result: rezultatFinal });
      await finalizeStoredPhotoResult(payload, rezultatFinal);
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
      if (cod === 'TIMEOUT') inregistreazaOperational('gemini.timeout');
      if (cod === 'AI_RATE_LIMITED') inregistreazaOperational('gemini.429');
      console.error('[Trigger analiza-mancare-ai] Esuare:', cod);
      // A claimed call with no durable result is ambiguous; retries must not infer again.
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
