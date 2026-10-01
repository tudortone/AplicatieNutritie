'use strict';

const { detecteazaMime } = require('../../utils/detecteazaMime');

/**
 * Numar venit din raspunsul unui model. Fara coercitie tacuta: `Number(x) || 0`
 * transforma NaN si valorile negative in 0, iar `estimare_grame || 100`
 * transforma 0 in 100. Intr-un jurnal caloric asta inseamna date fabricate.
 */
function numarModel(valoare, { min = 0, max = 100000, implicit = 0 } = {}) {
  const numar = Number(valoare);
  if (!Number.isFinite(numar) || numar < min || numar > max) return implicit;
  return numar;
}

const GEMINI_FALLBACK_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
];

const NUME_FURNIZORI_AI = {
  gemini: 'Google Gemini 2.5',
  openai: 'OpenAI GPT-4o-mini',
  groq: 'Groq Vision',
  openrouter: 'OpenRouter Vision',
};

function obtinePromptAnalizaFoto(limba = 'ro') {
  const code = String(limba || 'ro').trim().toLowerCase().slice(0, 2);
  let directivaLimba = 'IMPORTANT: Numele alimentelor din campul "nume" trebuie sa fie in limba romana.';
  if (code === 'en') {
    directivaLimba = 'CRITICAL LANGUAGE DIRECTIVE: All food names in the "nume" field MUST be in English (e.g., "Grilled chicken breast", "White rice", "Boiled egg"). Do not use Romanian or other languages.';
  } else if (code === 'fr') {
    directivaLimba = 'DIRECTIVE DE LANGUE CRITIQUE: Tous les noms d\'aliments dans le champ "nume" DOIVENT être en français (ex: "Blanc de poulet grillé", "Riz blanc", "Œuf dur").';
  } else if (code === 'de') {
    directivaLimba = 'KRITISCHE SPRACHANWEISUNG: Alle Lebensmittelbezeichnungen im Feld "nume" MÜSSEN auf Deutsch sein (z.B. "Gegrillte Hähnchenbrust", "Weißer Reis", "Gekochtes Ei").';
  }

  return `Analizeaza aceasta imagine cu mancare.
Considera o farfurie standard de ~25cm diametru ca referinta de scara (E1). Foloseste baze de date nutritionale recunoscute (cum ar fi USDA) pentru o precizie cat mai mare.
Identifica TOATE alimentele de pe farfurie separat. Pentru fiecare aliment, estimeaza cantitatea vizuala in grame, ofera valorile nutritionale PENTRU SUTA DE GRAME (100g) si adauga nivelul tau de incredere in estimare (E4).
${directivaLimba}
RETURNEAZA DOAR UN ARRAY JSON in urmatorul format (fara text inainte sau dupa):
[
  {
    "nume": "numele alimentului 1",
    "estimare_grame": numar grame estimat de tine vizual,
    "calorii_per_100g": numar calorii per 100g,
    "proteine_per_100g": grame proteina per 100g,
    "grasimi_per_100g": grame grasime per 100g,
    "carbohidrati_per_100g": grame carbohidrati per 100g,
    "fibre_per_100g": grame fibre per 100g sau null daca nu poate fi estimat,
    "tip_masa_sugerat": "mic_dejun" sau "pranz" sau "cina" sau "gustare",
    "incredere": "ridicat"
  }
]`;
}

const PROMPT_ANALIZA_FOTO = obtinePromptAnalizaFoto('ro');

/**
 * Serviciu de tipar: primeste configuratia validata la boot si expune doar
 * functii pure (fara IO, fara stari), folosite de cascade, de chat si de
 * handler-ele de ruta din server.js.
 */
function creeazaServiciuVision({ config }) {
  const getGeminiModelsList = () => {
    const preferat = (config.ai.geminiModel || '').trim();
    if (!preferat) return [...GEMINI_FALLBACK_MODELS];
    return [preferat, ...GEMINI_FALLBACK_MODELS.filter((m) => m !== preferat)];
  };

  // Extragere chei API multiple (rotatie automata la eroare/cota depasita)
  const getApiKeysList = (envPrefix) => {
    const keys = [];
    if (process.env[envPrefix]) keys.push(process.env[envPrefix]);
    if (process.env[`${envPrefix}S`]) {
      process.env[`${envPrefix}S`].split(',').forEach((k) => {
        const trimmed = k.trim();
        if (trimmed) keys.push(trimmed);
      });
    }
    for (let i = 2; i <= 5; i++) {
      if (process.env[`${envPrefix}_${i}`]) keys.push(process.env[`${envPrefix}_${i}`]);
    }
    return keys.filter((v, i, a) => v && a.indexOf(v) === i);
  };

  /** Corp comun pentru furnizorii compatibili OpenAI (OpenAI, Groq, OpenRouter). */
  const corpVisionCompatibilOpenAi = (model, prompt, imageMime, imageBase64, extra = {}) => ({
    model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:${imageMime};base64,${imageBase64}` } },
        ],
      },
    ],
    ...extra,
  });

  // ==========================================
  // VALIDARE MAGIC BYTES IMAGINE
  // ==========================================
  // Magic-bytes-urile MIME au sursa unica in utils/detecteazaMime.js
  // (Task T2). Aici pastram doar interfata factoryului sub numele `detectImageMime`
  // folosit de routes/ai.js:208, cu comportament identic pentru Buffer-uri reale
  // (`fs.promises.readFile` livreaza intotdeauna Buffer).
  const detectImageMime = detecteazaMime;

  return { corpVisionCompatibilOpenAi, getApiKeysList, getGeminiModelsList, detectImageMime };
}

module.exports = {
  creeazaServiciuVision,
  numarModel,
  GEMINI_FALLBACK_MODELS,
  NUME_FURNIZORI_AI,
  PROMPT_ANALIZA_FOTO,
  obtinePromptAnalizaFoto,
};
