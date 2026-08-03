const { task } = require('@trigger.dev/sdk/v3');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Cascade de modele Gemini vision, identica cu cea din server.js.
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];

function modelsDeIncercat() {
  const preferat = (process.env.GEMINI_MODEL || '').trim();
  if (!preferat) return [...GEMINI_MODELS];
  return [preferat, ...GEMINI_MODELS.filter((m) => m !== preferat)];
}

// Acelasi prompt ca /api/analizeaza-mancare-structurat din server.js,
// ca rezultatul task-ului sa fie compatibil cu ecranul de scanare.
const PROMPT_ANALIZA = `Analizează această imagine cu mâncare.
Consideră o farfurie standard de ~25cm diametru ca referință de scară (E1). Folosește baze de date nutriționale recunoscute (cum ar fi USDA) pentru o precizie cât mai mare.
Identifică TOATE alimentele de pe farfurie separat. Pentru fiecare aliment, estimează cantitatea vizuală în grame, oferă valorile nutriționale PENTRU SUTA DE GRAME (100g) și adaugă nivelul tău de încredere în estimare (E4).
RETURNEAZĂ DOAR UN ARRAY JSON în următorul format (fără text înainte sau după):
[
  {
    "nume": "numele alimentului 1",
    "estimare_grame": număr grame estimat de tine vizual,
    "calorii_per_100g": număr calorii per 100g,
    "proteine_per_100g": grame proteină per 100g,
    "grasimi_per_100g": grame grăsime per 100g,
    "carbohidrati_per_100g": grame carbohidrați per 100g,
    "incredere": "ridicat"
  }
]`;

exports.analizaMancareTask = task({
  id: "analiza-mancare-ai",
  run: async (payload, { ctx }) => {
    const { imageUrl, tipMasa, userId } = payload || {};
    if (!imageUrl) {
      return { success: false, eroare: "imageUrl lipsește din payload." };
    }

    // Fara cheie Gemini in env-ul Trigger.dev task-ul nu poate analiza.
    if (!process.env.GEMINI_API_KEY) {
      return {
        success: false,
        status: "needs_config",
        eroare: "GEMINI_API_KEY lipsește din variabilele de mediu ale proiectului Trigger.dev.",
      };
    }

    try {
      // 1. Descarcam imaginea de pe CDN (ImageKit) — nu mai depindem de upload-ul multipart.
      const resp = await fetch(imageUrl, { signal: AbortSignal.timeout(20000) });
      if (!resp.ok) {
        throw new Error(`Descărcarea imaginii a eșuat (${resp.status}) pentru ${imageUrl}`);
      }
      const buffer = Buffer.from(await resp.arrayBuffer());
      const mimeType = resp.headers.get('content-type') || 'image/jpeg';

      // 2. Analiza Gemini vision, cu cascada de chei + modele (ca in server.js).
      const imagePart = { inlineData: { data: buffer.toString('base64'), mimeType } };
      let text = null;
      let lastError = null;
      const chei = [
        process.env.GEMINI_API_KEY,
        process.env.GEMINI_API_KEY_2,
        process.env.GEMINI_API_KEY_3,
        process.env.GEMINI_API_KEY_4,
      ].filter(Boolean);

      for (const key of chei) {
        const client = new GoogleGenerativeAI(key);
        for (const modelName of modelsDeIncercat()) {
          try {
            const model = client.getGenerativeModel({ model: modelName });
            const result = await model.generateContent({
              contents: [{ role: 'user', parts: [{ text: PROMPT_ANALIZA }, imagePart] }],
            });
            text = result.response.text();
            if (text) break;
          } catch (err) {
            lastError = err;
          }
        }
        if (text) break;
      }
      if (!text) {
        throw new Error(lastError?.message || 'Niciun model Gemini nu a răspuns.');
      }

      // 3. Parsare JSON cu aceeasi curatare ca in server.js.
      const curatat = text.replace(/```[a-z]*\s*/gi, '').replace(/```/g, '').trim();
      const firstBracket = curatat.indexOf('[');
      const lastBracket = curatat.lastIndexOf(']');
      let items = null;
      if (firstBracket !== -1 && lastBracket > firstBracket) {
        try {
          items = JSON.parse(curatat.substring(firstBracket, lastBracket + 1));
        } catch {
          items = null;
        }
      }
      if (!items) {
        try {
          items = JSON.parse(curatat);
        } catch {
          items = null;
        }
      }
      if (!Array.isArray(items)) {
        throw new Error('Răspunsul AI nu conține un array JSON de alimente.');
      }

      const normalizate = items
        .map((i) => ({
          nume: String(i.nume || 'Aliment identificat'),
          estimare_grame: Math.max(1, Number(i.estimare_grame) || 100),
          calorii_per_100g: Math.max(0, Number(i.calorii_per_100g) || 0),
          proteine_per_100g: Math.max(0, Number(i.proteine_per_100g) || 0),
          grasimi_per_100g: Math.max(0, Number(i.grasimi_per_100g) || 0),
          carbohidrati_per_100g: Math.max(0, Number(i.carbohidrati_per_100g) || 0),
          incredere: String(i.incredere || 'mediu'),
        }))
        .filter((i) => i.nume.trim().length > 0);

      const totalKcal = normalizate.reduce(
        (s, i) => s + (i.calorii_per_100g * i.estimare_grame) / 100,
        0,
      );

      return {
        success: true,
        items: normalizate,
        totals: { kcal: Math.round(totalKcal) },
        tipMasa: tipMasa || 'Pranz',
        userId,
        processedAt: new Date().toISOString(),
      };
    } catch (err) {
      if (process.env.SENTRY_DSN) {
        try {
          require('@sentry/node').captureException(err);
        } catch {
          // Sentry optional in task — nu blocam analiza din cauza lui.
        }
      }
      return {
        success: false,
        eroare: err?.message || 'Eroare necunoscută în task-ul de analiză.',
        imageUrl,
        processedAt: new Date().toISOString(),
      };
    }
  },
});
