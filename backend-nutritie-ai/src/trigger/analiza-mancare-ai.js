const { task } = require('@trigger.dev/sdk/v3');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { PROMPT_ANALIZA_FOTO } = require('../../services/ai/vision');
const {
  construiesteGazdePermise,
  creeazaValideazaUrlImagine,
} = require('../../utils/valideazaUrlImagine');

const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];
const MAX_IMAGINE_BYTES = 5 * 1024 * 1024;
const MIME_PERMISE = new Set(['image/jpeg', 'image/png', 'image/webp']);

function modelsDeIncercat() {
  const preferat = (process.env.GEMINI_MODEL || '').trim();
  if (!preferat) return [...GEMINI_MODELS];
  return [preferat, ...GEMINI_MODELS.filter((m) => m !== preferat)];
}

exports.analizaMancareTask = task({
  id: 'analiza-mancare-ai',
  run: async (payload) => {
    const { imageUrl, tipMasa, userId } = payload || {};
    if (!imageUrl) {
      return { success: false, eroare: 'imageUrl lipsește din payload.' };
    }

    if (!process.env.GEMINI_API_KEY) {
      return {
        success: false,
        status: 'needs_config',
        eroare: 'GEMINI_API_KEY lipsește din variabilele de mediu ale proiectului Trigger.dev.',
      };
    }

    // Validarea se repeta in task, nu doar in API. Trigger.dev poate primi un
    // payload separat, iar fetch-ul este punctul la care SSRF trebuie blocat.
    const valideazaImagine = creeazaValideazaUrlImagine({
      gazdePermise: construiesteGazdePermise({
        imagekitUrlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
        supabaseUrl: process.env.SUPABASE_URL,
      }),
    });
    const verificare = valideazaImagine(imageUrl);
    if (!verificare.ok) return { success: false, eroare: verificare.eroare };

    try {
      // Redirect-urile sunt refuzate: o gazda permisa nu poate redirectiona
      // fetch-ul catre localhost sau catre o adresa privata.
      const resp = await fetch(verificare.url, {
        signal: AbortSignal.timeout(20000),
        redirect: 'manual',
      });
      if (resp.status >= 300 && resp.status < 400) {
        throw new Error('Stocarea imaginii a raspuns cu redirect nepermis.');
      }
      if (!resp.ok) throw new Error(`Descărcarea imaginii a eșuat (${resp.status}).`);

      const mimeType = String(resp.headers.get('content-type') || '')
        .split(';')[0]
        .trim()
        .toLowerCase();
      if (!MIME_PERMISE.has(mimeType)) {
        throw new Error('Fisierul descarcat nu este o imagine JPEG, PNG sau WEBP.');
      }

      const lungime = Number(resp.headers.get('content-length'));
      if (Number.isFinite(lungime) && lungime > MAX_IMAGINE_BYTES) {
        throw new Error('Imaginea depaseste limita de 5 MB.');
      }
      const buffer = Buffer.from(await resp.arrayBuffer());
      if (buffer.length > MAX_IMAGINE_BYTES) {
        throw new Error('Imaginea depaseste limita de 5 MB.');
      }

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
              contents: [{ role: 'user', parts: [{ text: PROMPT_ANALIZA_FOTO }, imagePart] }],
            });
            text = result.response.text();
            if (text) break;
          } catch (err) {
            lastError = err;
          }
        }
        if (text) break;
      }
      if (!text) throw new Error(lastError?.message || 'Niciun model Gemini nu a răspuns.');

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
          nume: String(i.nume || 'Aliment identificat').substring(0, 150),
          estimare_grame: Math.min(5000, Math.max(1, Number(i.estimare_grame) || 100)),
          calorii_per_100g: Math.min(1000, Math.max(0, Number(i.calorii_per_100g) || 0)),
          proteine_per_100g: Math.min(100, Math.max(0, Number(i.proteine_per_100g) || 0)),
          grasimi_per_100g: Math.min(100, Math.max(0, Number(i.grasimi_per_100g) || 0)),
          carbohidrati_per_100g: Math.min(100, Math.max(0, Number(i.carbohidrati_per_100g) || 0)),
          incredere: String(i.incredere || 'mediu').substring(0, 20),
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
          // Sentry este optional in task.
        }
      }
      return {
        success: false,
        eroare: err?.message || 'Eroare necunoscută în task-ul de analiză.',
        processedAt: new Date().toISOString(),
      };
    }
  },
});
