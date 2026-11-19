'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');
const {
  callWithTimeout,
  ClientAbortError,
  esteAnulatDeClient,
  creeazaDeadlineCerere,
} = require('../../utils/httpTimeout');
const { inregistreazaAi } = require('../../utils/metrics');
const { rezumatEroareSigur } = require('../../utils/sentrySanitize');
const {
  creeazaServiciuVision,
  PROMPT_ANALIZA_FOTO,
  obtinePromptAnalizaFoto,
  NUME_FURNIZORI_AI,
} = require('./vision');

const DEADLINE_VISION_MS = 50_000;
const TIMEOUT_INCERCARE_VISION_MS = 15_000;
const MAX_INCERCARI_IMPLICIT = 4;

/**
 * Cascada de furnizori AI pentru analiza vizuala + registrul de cooldown.
 * B-10: cooldown-ul e partajat intre instante prin acelasi store (registruAi)
 * ca rate-limiting-ul. Primeste config si registruAi de la radacina, nu le
 * construieste aici.
 */
function creeazaServiciuCascada({ config, registruAi }) {
  const serviciuVision = creeazaServiciuVision({ config });

  // Oglinda locala de cooldown (fail-closed): scriem in ea la fiecare blockProvider.
  // Cand Redis e indisponibil, registrul partajat citeste null (get -> null), ceea
  // ce facea providerii blocati sa para activi si erau rechemati (429 loop). Cu
  // oglinda, un provider blocat de acest proces ramane blocat local pentru fereastra
  // de cooldown, chiar daca citirea partajata a esuat.
  const cooldownLocal = new Map(); // providerKey -> blockedUntil (ms)

  const blockProvider = async (providerKey, cooldownSeconds, motiv) => {
    if (!NUME_FURNIZORI_AI[providerKey]) return;
    const blockedUntil = Date.now() + cooldownSeconds * 1000;
    cooldownLocal.set(providerKey, blockedUntil);
    await registruAi.set(
      providerKey,
      { blockedUntil, ultimulMesaj: motiv },
      cooldownSeconds * 1000,
    );
  };

  const getProviderStatus = async (providerKey) => {
    const nume = NUME_FURNIZORI_AI[providerKey] || providerKey;
    const acum = Date.now();
    const p = await registruAi.get(providerKey);
    // Oglinda locala are prioritate: daca acest proces a blocat providerul in
    // fereastra de cooldown, il tinem blocat chiar si cand Redis a picat.
    const localUntil = cooldownLocal.get(providerKey);
    if (localUntil && localUntil > acum) {
      const sec = Math.ceil((localUntil - acum) / 1000);
      return { id: providerKey, nume, status: 'cooldown', secundeRamase: sec, mesaj: `Blocat (${sec}s): ${p?.ultimulMesaj || 'cooldown local (Redis indisponibil)'}` };
    }
    if (!p || !p.blockedUntil || p.blockedUntil <= acum) {
      if (p) await registruAi.del(providerKey);
      cooldownLocal.delete(providerKey);
      return { id: providerKey, nume, status: 'active', secundeRamase: 0, mesaj: 'Disponibil' };
    }
    const sec = Math.ceil((p.blockedUntil - acum) / 1000);
    return { id: providerKey, nume, status: 'cooldown', secundeRamase: sec, mesaj: `Blocat (${sec}s): ${p.ultimulMesaj}` };
  };

  /**
   * Cascada de furnizori pentru analiza vizuala.
   * Fiecare apel are acum deadline REAL: inainte, apelurile OpenAI/Groq/OpenRouter
   * nu aveau niciun timeout, deci o singura conexiune blocata tinea cererea
   * utilizatorului deschisa la nesfarsit.
   */
  async function ruleazaCascadaVision({ imageBase64, imageMime, requestedProvider, limba = 'ro', semnalAnulare }) {
    let text = null;
    const prompt = typeof obtinePromptAnalizaFoto === 'function' ? obtinePromptAnalizaFoto(limba) : PROMPT_ANALIZA_FOTO;
    const deadline = creeazaDeadlineCerere(DEADLINE_VISION_MS, semnalAnulare);

    // Anti-cost (B2): plafon strict de incercari (max 4) + deadline global 50s.
    const maxApeluri = Number.isInteger(config?.ai?.maxApeluriPerRequest) && config.ai.maxApeluriPerRequest > 0
      ? Math.min(config.ai.maxApeluriPerRequest, MAX_INCERCARI_IMPLICIT)
      : MAX_INCERCARI_IMPLICIT;
    let apeluri = 0;
    const timpPentruIncercare = () => Math.min(TIMEOUT_INCERCARE_VISION_MS, deadline.timpRamasMs());
    const cotaUnInceput = () => {
      if (deadline.esteAnulatDeClient()) throw new ClientAbortError();
      if (deadline.esteExpirat() || timpPentruIncercare() <= 0) return false;
      if (apeluri >= maxApeluri) return false;
      apeluri += 1;
      return true;
    };

    const poateIncercaFurnizor = async (providerKey) => {
      if (deadline.esteAnulatDeClient()) throw new ClientAbortError();
      if (deadline.esteExpirat() || apeluri >= maxApeluri) return false;
      if (requestedProvider !== 'auto') return requestedProvider === providerKey;
      const st = await getProviderStatus(providerKey);
      return st.status === 'active';
    };

    // 1) OpenAI GPT-4o-mini Vision
    const openaiKeys = serviciuVision.getApiKeysList('OPENAI_API_KEY');
    if (openaiKeys.length > 0 && (await poateIncercaFurnizor('openai'))) {
      let authFailed = false;
      openaiLoop: for (const key of openaiKeys) {
        if (!cotaUnInceput()) break;
        const timeoutMs = timpPentruIncercare();
        try {
          const oaiRes = await callWithTimeout((signal) => fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(serviciuVision.corpVisionCompatibilOpenAi('gpt-4o-mini', prompt, imageMime, imageBase64, {
              temperature: 0.2,
              max_tokens: 1200,
            })),
            signal,
          }), timeoutMs, deadline.signal);

          if (oaiRes.ok) {
            const oaiData = await oaiRes.json();
            text = oaiData.choices?.[0]?.message?.content;
            if (text) {
              inregistreazaAi({ provider: 'openai', model: 'gpt-4o-mini', ruta: 'analiza-foto', usage: oaiData.usage, ok: true });
              return { text, furnizor: 'openai' };
            }
            inregistreazaAi({ provider: 'openai', model: 'gpt-4o-mini', ruta: 'analiza-foto', ok: false });
          } else {
            inregistreazaAi({ provider: 'openai', model: 'gpt-4o-mini', ruta: 'analiza-foto', ok: false });
            if (oaiRes.status === 429) {
              await blockProvider('openai', 60, 'Limita de cereri (429)');
              break openaiLoop;
            }
            if (oaiRes.status === 401 || oaiRes.status === 403) authFailed = true;
            console.warn(`OpenAI Vision esuat (${oaiRes.status}).`);
          }
        } catch (e) {
          inregistreazaAi({ provider: 'openai', model: 'gpt-4o-mini', ruta: 'analiza-foto', ok: false });
          if (esteAnulatDeClient(e, semnalAnulare)) throw new ClientAbortError();
          console.warn('[AI provider failure]', rezumatEroareSigur(e, {
            operation: 'photo_analysis',
            provider: 'openai',
          }));
        }
      }
      if (authFailed && !text) await blockProvider('openai', 300, 'Cheie OpenAI invalida (401/403)');
    }

    // 2) Groq Vision
    if (!text && (await poateIncercaFurnizor('groq'))) {
      const groqKeys = serviciuVision.getApiKeysList('GROQ_API_KEY');
      const groqVisionModels = config.ai.groqVisionModels.length > 0
        ? config.ai.groqVisionModels
        : [
          'meta-llama/llama-4-scout-17b-16e-instruct',
          'meta-llama/llama-4-maverick-17b-128e-instruct',
        ];
      let groqAuthFailed = false;

      groqLoop: for (const key of groqKeys) {
        for (const groqModel of groqVisionModels) {
          if (!cotaUnInceput()) break groqLoop;
          const timeoutMs = timpPentruIncercare();
          try {
            const groqRes = await callWithTimeout((signal) => fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(serviciuVision.corpVisionCompatibilOpenAi(groqModel, prompt, imageMime, imageBase64, {
                temperature: 0.2,
                max_tokens: 1000,
                ...(/gpt-oss|qwen/i.test(String(groqModel)) ? { reasoning_effort: 'low' } : {}),
              })),
              signal,
            }), timeoutMs, deadline.signal);

            if (groqRes.ok) {
              const groqData = await groqRes.json();
              text = groqData.choices?.[0]?.message?.content;
              if (text) {
                inregistreazaAi({ provider: 'groq', model: groqModel, ruta: 'analiza-foto', usage: groqData.usage, ok: true });
                return { text, furnizor: `groq:${groqModel}` };
              }
              inregistreazaAi({ provider: 'groq', model: groqModel, ruta: 'analiza-foto', ok: false });
            } else {
              inregistreazaAi({ provider: 'groq', model: groqModel, ruta: 'analiza-foto', ok: false });
              if (groqRes.status === 429) {
                await blockProvider('groq', 60, 'Limita de cereri Groq (429)');
                break groqLoop;
              }
              if (groqRes.status === 401 || groqRes.status === 403) {
                groqAuthFailed = true;
                break; // incearca urmatoarea cheie Groq
              }
              console.warn(`Groq [${groqModel}] (${groqRes.status}).`);
            }
          } catch (groqErr) {
            inregistreazaAi({ provider: 'groq', model: groqModel, ruta: 'analiza-foto', ok: false });
            if (esteAnulatDeClient(groqErr, semnalAnulare)) throw new ClientAbortError();
            console.warn('[AI provider failure]', rezumatEroareSigur(groqErr, {
              operation: 'photo_analysis',
              provider: 'groq',
            }));
          }
        }
      }
      if (groqAuthFailed && !text) await blockProvider('groq', 300, 'Cheie Groq invalida (401/403)');
    }

    // 3) Gemini
    if (!text && (await poateIncercaFurnizor('gemini'))) {
      const geminiKeys = serviciuVision.getApiKeysList('GEMINI_API_KEY');
      const modelsToTry = serviciuVision.getGeminiModelsList();
      const imagePart = { inlineData: { data: imageBase64, mimeType: imageMime } };

      geminiLoop: for (const key of geminiKeys) {
        const client = new GoogleGenerativeAI(key);
        for (const modelName of modelsToTry) {
          if (!cotaUnInceput()) break geminiLoop;
          const timeoutMs = timpPentruIncercare();
          try {
            const model = client.getGenerativeModel({ model: modelName });
            const result = await callWithTimeout((signal) => model.generateContent({
              contents: [{ role: 'user', parts: [{ text: prompt }, imagePart] }],
              generationConfig: {
                responseMimeType: 'application/json',
                maxOutputTokens: 1200,
                ...(String(modelName).includes('2.5') ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
              },
            }, { signal }), timeoutMs, deadline.signal);

            if (result?.response) {
              text = result.response.text();
              if (text) {
                inregistreazaAi({ provider: 'gemini', model: modelName, ruta: 'analiza-foto', usage: result.response.usageMetadata, ok: true });
                return { text, furnizor: `gemini:${modelName}` };
              }
              inregistreazaAi({ provider: 'gemini', model: modelName, ruta: 'analiza-foto', ok: false });
            }
          } catch (err) {
            inregistreazaAi({ provider: 'gemini', model: modelName, ruta: 'analiza-foto', ok: false });
            if (esteAnulatDeClient(err, semnalAnulare)) throw new ClientAbortError();
            const errMsg = err.message || String(err);
            if (errMsg.includes('429')) {
              await blockProvider('gemini', 60, 'Limita de cereri Gemini (429)');
              break geminiLoop;
            }
            if (errMsg.includes('401') || errMsg.includes('403')) {
              await blockProvider('gemini', 300, 'Cheie Gemini invalida (401/403)');
              break;
            }
            console.warn('[AI provider failure]', rezumatEroareSigur(err, {
              operation: 'photo_analysis',
              provider: 'gemini',
            }));
          }
        }
      }
    }

    // 4) OpenRouter - doar in modul 'auto' (M2).
    if (!text && requestedProvider === 'auto' && (await poateIncercaFurnizor('openrouter'))) {
      const orKeys = serviciuVision.getApiKeysList('OPENROUTER_API_KEY');
      let orAuthFailed = false;
      openrouterLoop: for (const key of orKeys) {
        if (!cotaUnInceput()) break;
        const timeoutMs = timpPentruIncercare();
        try {
          const orRes = await callWithTimeout((signal) => fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(serviciuVision.corpVisionCompatibilOpenAi('google/gemini-flash-1.5', prompt, imageMime, imageBase64, {
              max_tokens: 1200,
            })),
            signal,
          }), timeoutMs, deadline.signal);

          if (orRes.ok) {
            const orData = await orRes.json();
            text = orData.choices?.[0]?.message?.content;
            if (text) {
              inregistreazaAi({ provider: 'openrouter', model: 'google/gemini-flash-1.5', ruta: 'analiza-foto', usage: orData.usage, ok: true });
              return { text, furnizor: 'openrouter' };
            }
            inregistreazaAi({ provider: 'openrouter', model: 'google/gemini-flash-1.5', ruta: 'analiza-foto', ok: false });
          } else {
            inregistreazaAi({ provider: 'openrouter', model: 'google/gemini-flash-1.5', ruta: 'analiza-foto', ok: false });
            if (orRes.status === 429) {
              await blockProvider('openrouter', 60, 'Limita de cereri (429)');
              break openrouterLoop;
            }
            if (orRes.status === 401 || orRes.status === 403) orAuthFailed = true;
          }
        } catch (e) {
          inregistreazaAi({ provider: 'openrouter', model: 'google/gemini-flash-1.5', ruta: 'analiza-foto', ok: false });
          if (esteAnulatDeClient(e, semnalAnulare)) throw new ClientAbortError();
          console.warn('[AI provider failure]', rezumatEroareSigur(e, {
            operation: 'photo_analysis',
            provider: 'openrouter',
          }));
        }
      }
      if (orAuthFailed && !text) await blockProvider('openrouter', 300, 'Cheie OpenRouter invalida (401/403)');
    }

    return { text: null, furnizor: null };
  }

  return { ruleazaCascadaVision, blockProvider, getProviderStatus };
}

module.exports = { creeazaServiciuCascada };
