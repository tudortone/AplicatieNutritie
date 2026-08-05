'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { callWithTimeout, callWithSoftTimeout } = require('../../utils/httpTimeout');
const { inregistreazaAi } = require('../../utils/metrics');
const {
  creeazaServiciuVision,
  PROMPT_ANALIZA_FOTO,
  NUME_FURNIZORI_AI,
} = require('./vision');

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
  async function ruleazaCascadaVision({ imageBase64, imageMime, requestedProvider }) {
    let text = null;

    // Anti-cost (B2): plafon de apeluri de furnizori per cerere. Inainte, un
    // singur upload putea declansa zeci de call-uri platite (N chei x M modele
    // pe toata cascada) daca toate esuau pe rand. 0 = nelimitat.
    const maxApeluri = Number.isInteger(config.ai.maxApeluriPerRequest)
      ? config.ai.maxApeluriPerRequest
      : 0;
    let apeluri = 0;
    const cotaUnInceput = () => {
      if (maxApeluri > 0 && apeluri >= maxApeluri) return false;
      apeluri += 1;
      return true;
    };

    // 1) OpenAI GPT-4o-mini Vision
    const openaiKeys = serviciuVision.getApiKeysList('OPENAI_API_KEY');
    if ((requestedProvider === 'auto' || requestedProvider === 'openai') && openaiKeys.length > 0) {
      for (const key of openaiKeys) {
        if (!cotaUnInceput()) break;
        try {
          const oaiRes = await callWithTimeout((signal) => fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(serviciuVision.corpVisionCompatibilOpenAi('gpt-4o-mini', PROMPT_ANALIZA_FOTO, imageMime, imageBase64, {
              temperature: 0.2,
              max_tokens: 1500,
            })),
            signal,
          }), 30000);

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
            if (oaiRes.status === 429) await blockProvider('openai', 60, 'Limita de cereri (429)');
            console.warn(`OpenAI Vision esuat (${oaiRes.status}).`);
          }
        } catch (e) {
          inregistreazaAi({ provider: 'openai', model: 'gpt-4o-mini', ruta: 'analiza-foto', ok: false });
          console.warn('OpenAI Vision exceptie:', e.message);
        }
      }
    }

    // 2) Groq Vision
    if (!text && (requestedProvider === 'auto' || requestedProvider === 'groq')) {
      const groqKeys = serviciuVision.getApiKeysList('GROQ_API_KEY');
      const groqVisionModels = config.ai.groqVisionModels.length > 0
        ? config.ai.groqVisionModels
        : [
          'meta-llama/llama-4-scout-17b-16e-instruct',
          'meta-llama/llama-4-maverick-17b-128e-instruct',
        ];

      for (const key of groqKeys) {
        for (const groqModel of groqVisionModels) {
          if (!cotaUnInceput()) break;
          try {
            const groqRes = await callWithTimeout((signal) => fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(serviciuVision.corpVisionCompatibilOpenAi(groqModel, PROMPT_ANALIZA_FOTO, imageMime, imageBase64, {
                temperature: 0.2,
                max_tokens: 1000,
              })),
              signal,
            }), 30000);

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
              if (groqRes.status === 429) await blockProvider('groq', 60, 'Limita de cereri Groq (429)');
              console.warn(`Groq [${groqModel}] (${groqRes.status}).`);
            }
          } catch (groqErr) {
            inregistreazaAi({ provider: 'groq', model: groqModel, ruta: 'analiza-foto', ok: false });
            console.warn(`Groq Vision [${groqModel}] exceptie:`, groqErr.message);
          }
        }
      }
    }

    // 3) Gemini
    if (!text && (requestedProvider === 'auto' || requestedProvider === 'gemini')) {
      const geminiKeys = serviciuVision.getApiKeysList('GEMINI_API_KEY');
      const modelsToTry = serviciuVision.getGeminiModelsList();
      const imagePart = { inlineData: { data: imageBase64, mimeType: imageMime } };

      for (const key of geminiKeys) {
        const client = new GoogleGenerativeAI(key);
        for (const modelName of modelsToTry) {
          if (!cotaUnInceput()) break;
          try {
            const model = client.getGenerativeModel({ model: modelName });
            // SDK-ul Gemini nu accepta AbortSignal: deadline "soft", marcat explicit.
            const result = await callWithSoftTimeout(model.generateContent({
              contents: [{ role: 'user', parts: [{ text: PROMPT_ANALIZA_FOTO }, imagePart] }],
              generationConfig: { responseMimeType: 'application/json' },
            }), 30000);

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
            const errMsg = err.message || String(err);
            if (errMsg.includes('429')) await blockProvider('gemini', 60, 'Limita de cereri Gemini (429)');
            console.warn(`Gemini [${modelName}] esuat:`, errMsg.substring(0, 100));
          }
        }
      }
    }

    // 4) OpenRouter - doar in modul 'auto' (M2).
    if (!text && requestedProvider === 'auto') {
      const orKeys = serviciuVision.getApiKeysList('OPENROUTER_API_KEY');
      for (const key of orKeys) {
        if (!cotaUnInceput()) break;
        try {
          const orRes = await callWithTimeout((signal) => fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(serviciuVision.corpVisionCompatibilOpenAi('google/gemini-flash-1.5', PROMPT_ANALIZA_FOTO, imageMime, imageBase64)),
            signal,
          }), 30000);

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
            if (orRes.status === 429) await blockProvider('openrouter', 60, 'Limita de cereri (429)');
          }
        } catch (e) {
          inregistreazaAi({ provider: 'openrouter', model: 'google/gemini-flash-1.5', ruta: 'analiza-foto', ok: false });
          console.warn('OpenRouter Vision exceptie:', e.message || e);
        }
      }
    }

    return { text: null, furnizor: null };
  }

  return { ruleazaCascadaVision, blockProvider, getProviderStatus };
}

module.exports = { creeazaServiciuCascada };
