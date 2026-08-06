'use strict';

const { task } = require('@trigger.dev/sdk/v3');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { PROMPT_ANALIZA_FOTO, numarModel } = require('../../services/ai/vision');
const { parseJsonFromLlm } = require('../../utils/llmJson');
const { callWithSoftTimeout } = require('../../utils/httpTimeout');
const {
  construiesteGazdePermise,
  creeazaValideazaUrlImagine,
} = require('../../utils/valideazaUrlImagine');

const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];
const MAX_IMAGINE_BYTES = 5 * 1024 * 1024;
const MAX_ALIMENTE = 50;
const MIME_PERMISE = new Set(['image/jpeg', 'image/png', 'image/webp']);
const VARIABILE_OBLIGATORII = Object.freeze([
  'IMAGEKIT_URL_ENDPOINT',
  'SUPABASE_URL',
  'GEMINI_API_KEY',
]);
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIPURI_MASA = new Set(['mic_dejun', 'pranz', 'cina', 'gustare', 'Mic dejun', 'Pranz', 'Cina', 'Gustare']);

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
 */
async function updateAiJob(jobId, patch) {
  if (!jobId || typeof jobId !== 'string') return;
  const client = supabaseAiJobs();
  if (!client) {
    console.warn('updateAiJob: lipsesc SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — nu pot urmari jobul.');
    return;
  }
  try {
    const { error } = await client
      .from('ai_jobs')
      .update(patch)
      .eq('id', jobId);
    if (error) {
      console.warn('updateAiJob: esec actualizare ai_jobs:', error.message);
    }
  } catch (err) {
    console.warn('updateAiJob: eroare neasteptata:', (err && err.message) || err);
  }
}

function modelsDeIncercat() {
  const preferat = (process.env.GEMINI_MODEL || '').trim();
  if (!preferat) return [...GEMINI_MODELS];
  return [preferat, ...GEMINI_MODELS.filter((model) => model !== preferat)];
}

function detecteazaMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) return 'image/webp';
  return null;
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
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 5000,
    factor: 2,
  },
  run: async (payload) => {
    const { imageUrl, tipMasa, userId, jobId } = payload || {};
    // Marcheaza job-ul ca fiind in curs, din oficiu (persistarea ramane la confirmarea
    // explicita a utilizatorului in frontend; aici urmarim doar stadiul analizei).
    if (jobId) await updateAiJob(jobId, { status: 'processing' });

    const lipsesteCheiaPrincipalaGemini = !process.env.GEMINI_API_KEY;
    const lipsa = VARIABILE_OBLIGATORII.filter((cheie) => !process.env[cheie]?.trim());
    if (lipsesteCheiaPrincipalaGemini || lipsa.length > 0) {
      // Eroare de configurare: nu se retry (ar esua identic), dar se raporteaza.
      if (jobId) await updateAiJob(jobId, { status: 'failed', error_code: 'NEEDS_CONFIG' });
      return {
        success: false,
        status: 'needs_config',
        eroare: 'Task-ul de analiza nu este configurat complet.',
        variabileLipsa: lipsa,
      };
    }

    if (typeof imageUrl !== 'string' || !imageUrl.trim() || !REGEX_UUID.test(String(userId || ''))) {
      if (jobId) await updateAiJob(jobId, { status: 'failed', error_code: 'PAYLOAD_INVALID' });
      return { success: false, eroare: 'Payload invalid pentru analiza imaginii.' };
    }

    const valideazaImagine = creeazaValideazaUrlImagine({
      gazdePermise: construiesteGazdePermise({
        imagekitUrlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
        supabaseUrl: process.env.SUPABASE_URL,
      }),
    });
    const verificare = valideazaImagine(imageUrl);
    if (!verificare.ok) {
      if (jobId) await updateAiJob(jobId, { status: 'failed', error_code: 'URL_IMAGINE_INVALIDA' });
      return { success: false, eroare: verificare.eroare };
    }

    try {
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

      for (const key of chei) {
        const client = new GoogleGenerativeAI(key);
        for (const modelName of modelsDeIncercat()) {
          try {
            const model = client.getGenerativeModel({ model: modelName });
            const result = await callWithSoftTimeout(model.generateContent({
              contents: [{ role: 'user', parts: [{ text: PROMPT_ANALIZA_FOTO }, imagePart] }],
              generationConfig: { responseMimeType: 'application/json' },
            }), 30000);
            text = result?.response?.text();
            if (text) break;
          } catch (err) {
            ultimaEroare = err;
          }
        }
        if (text) break;
      }
      if (!text) throw ultimaEroare || new Error('NICIUN_MODEL_DISPONIBIL');

      const items = parseJsonFromLlm(text, { asteapta: 'array' });
      if (!Array.isArray(items)) throw new Error('JSON_AI_INVALID');

      const normalizate = items.slice(0, MAX_ALIMENTE)
        .map((item) => ({
          nume: String(item?.nume || 'Aliment identificat').trim().substring(0, 150),
          estimare_grame: numarModel(item?.estimare_grame, { min: 1, max: 5000, implicit: 100 }),
          calorii_per_100g: numarModel(item?.calorii_per_100g, { max: 1000 }),
          proteine_per_100g: numarModel(item?.proteine_per_100g, { max: 100 }),
          grasimi_per_100g: numarModel(item?.grasimi_per_100g, { max: 100 }),
          carbohidrati_per_100g: numarModel(item?.carbohidrati_per_100g, { max: 100 }),
          incredere: String(item?.incredere || 'mediu').substring(0, 20),
        }))
        .filter((item) => item.nume.length > 0);
      if (normalizate.length === 0) throw new Error('LISTA_AI_GOALA');

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
        if (jobId) await updateAiJob(jobId, { status: 'completed', result: rezultatNotFood });
        return rezultatNotFood;
      }

      const totalKcal = normalizate.reduce(
        (suma, item) => suma + (item.calorii_per_100g * item.estimare_grame) / 100,
        0,
      );

      const rezultatFinal = {
        success: true,
        items: normalizate,
        totals: { kcal: Math.round(totalKcal) },
        tipMasa: TIPURI_MASA.has(tipMasa) ? tipMasa : 'Pranz',
        userId,
        processedAt: new Date().toISOString(),
      };
      if (jobId) await updateAiJob(jobId, { status: 'completed', result: rezultatFinal });
      return rezultatFinal;
    } catch (err) {
      if (process.env.SENTRY_DSN) {
        try {
          require('@sentry/node').captureException(err);
        } catch {
          // Telemetria optionala nu schimba rezultatul task-ului.
        }
      }
      const cod = codEroareSigur(err);
      console.error('[Trigger analiza-mancare-ai] Esuare:', cod);
      // Marcam esecul in ai_jobs apoi RE-ARUNCAM: retry-ul Trigger.dev (maxAttempts: 3)
      // depinde de `throw`, nu de un `return { success: false }`.
      if (jobId) await updateAiJob(jobId, { status: 'failed', error_code: cod });
      throw err;
    }
  },
});

exports._test = { citesteCorpLimitat, detecteazaMime, codEroareSigur, updateAiJob };
