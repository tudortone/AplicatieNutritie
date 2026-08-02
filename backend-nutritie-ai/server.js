const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

require('dotenv').config();

// 1.1 Sanitizare input — previne XSS stocat si caractere de control
const { sanitizeText, sanitizeName, sanitizeRequest, detectPromptInjection } = require('./utils/sanitize');

// 1.2 Validare chei de mediu la startup (Crash-on-boot)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY;
const groqApiKey = process.env.GROQ_API_KEY;
const corsOriginsEnv = process.env.CORS_ORIGINS || '*';
if (!process.env.CORS_ORIGINS) {
  console.warn('⚠️  AVERTISMENT SECURITATE: Variabila CORS_ORIGINS nu este setată — backend-ul acceptă cereri de la orice origine. Setează CORS_ORIGINS în producție.');
}

const missingVars = [];
if (!supabaseUrl) missingVars.push('SUPABASE_URL');
if (!supabaseAnonKey) missingVars.push('SUPABASE_ANON_KEY');
if (!geminiApiKey) missingVars.push('GEMINI_API_KEY');
if (!groqApiKey) missingVars.push('GROQ_API_KEY');

if (missingVars.length > 0) {
  console.error(`EROARE CRITICĂ: Lipsesc variabilele de mediu obligatorii: ${missingVars.join(', ')}`);
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(compression());
const port = process.env.PORT || 3000;

// 1.3 CORS Securizat și restrictiv
const corsOrigins = corsOriginsEnv.split(',').map(o => o.trim());

app.use(cors({
  origin: corsOrigins.includes('*') ? true : corsOrigins,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Sanitizare automata a input-ului pe toate rutele
app.use(sanitizeRequest);

// ==========================================
// RATE-LIMIT: cheie stabila per user (claim sub din JWT, fallback IP)
// Anterior se folosea header-ul Authorization brut, permitand ocolirea limitei.
// Acum folosim claim-ul sub din JWT + fallback IP.
// ==========================================
const jwtSubject = (req) => {
  const authHeader = req.headers?.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const payloadBase64 = authHeader.slice(7).split('.')[1];
  if (!payloadBase64) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'));
    return payload?.sub ? `user:${payload.sub}` : null;
  } catch {
    return null;
  }
};

const ipFallbackKey = (req) => {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  if (ip.includes(':')) return `ip6:${ip.split(':').slice(0, 4).join(':')}`;
  return `ip4:${ip}`;
};

const rateLimitKey = (req) =>
  (req.user?.id ? `user:${req.user.id}` : jwtSubject(req)) || ipFallbackKey(req);

// Validare UUID (Postgres arunca eroare de sintaxa pentru ID-uri malformate)
const isUuid = (value) =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

// Rate Limiting general pentru API (cheie stabila per utilizator, altfel per IP)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minute
  max: 100, // max 100 cereri per fereastră
  keyGenerator: rateLimitKey,
  message: { eroare: "Prea multe cereri. Încearcă mai târziu." },
  standardHeaders: true,
  legacyHeaders: false,
});
// /api/ai-status are rate-limit propriu (generos, pentru polling).
// Anterior era complet exclus — vector de abuz.
const statusLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  keyGenerator: rateLimitKey,
  message: { eroare: "Prea multe cereri de status. Incearca in cateva secunde." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', (req, res, next) => {
  if (req.path === '/ai-status') return statusLimiter(req, res, next);
  return generalLimiter(req, res, next);
});

// 1.4 Rate Limiting strict pentru endpoint-urile AI (15 cereri pe minut) diferentiat per cont de la JWT auth header.
const aiRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minut
  max: 15, // max 15 cereri per minut
  keyGenerator: rateLimitKey,
  message: { eroare: "Ai depășit limita de 15 cereri pe minut pentru AI. Te rugăm să aștepți un minut." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Upload pe disc temporar pentru prevenirea OOM (Out of Memory)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, os.tmpdir());
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'nutri-' + uniqueSuffix + path.extname(file.originalname || '.jpg'));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (validTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tip fișier nepermis. Doar imagini JPEG/PNG/WEBP sunt acceptate.'));
    }
  }
});

// Inițializare Supabase pentru validarea token-ului JWT și operațiuni DB sigure
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Supabase Admin (service_role) — ocolește RLS pentru operațiuni server-side.
// ⚠️ NU folosim fallback la anon key: ar face ca operațiunile admin să pice silențios
//    sau să ocolească incorect RLS-ul. Cerem cheia service_role explicit.
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseServiceKey) {
  console.error('EROARE CRITICĂ: Lipsește SUPABASE_SERVICE_ROLE_KEY — operațiunile admin (audit log etc.) nu pot rula sigur.');
  console.error('Setează SUPABASE_SERVICE_ROLE_KEY în variabilele de mediu ale backend-ului.');
  process.exit(1);
}
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Cache in-memory TTL (60 secunde) pentru token-uri JWT.
// Token cache: hash SHA-256 in loc de token brut (evita heap dump leaks).
// Plafon maxim de intrari pentru protectie DoS de memorie.
const tokenCache = new Map();
const CACHE_TTL_MS = 60 * 1000;
const MAX_TOKEN_CACHE_ENTRIES = 5000;
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of tokenCache.entries()) {
    if (now > entry.expiresAt) tokenCache.delete(key);
  }
}, 5 * 60 * 1000).unref();

// Middleware Autentificare cu Cache TTL
const requireAuth = async (req, res, next) => {
  if (req.method === 'OPTIONS') {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (process.env.NODE_ENV === 'development') {
    console.log("=== Incoming Request ===");
    console.log("Method:", req.method);
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ eroare: "Acces neautorizat. Token lipsă." });
  }

  const token = authHeader.slice(7);
  const tokenKey = hashToken(token);

  // Validare locala simplă a structurii JWT (exp) fara secret, inainte de network
  try {
    const payloadBase64 = token.split('.')[1];
    if (payloadBase64) {
      const decodedJson = Buffer.from(payloadBase64, 'base64').toString('utf8');
      const payload = JSON.parse(decodedJson);
      if (payload.exp && Date.now() >= payload.exp * 1000) {
        tokenCache.delete(tokenKey);
        return res.status(401).json({ eroare: "Token expirat (JWT local exp)." });
      }
    }
  } catch (e) {
    return res.status(401).json({ eroare: "Structura JWT coruptă." });
  }

  const now = Date.now();
  const cached = tokenCache.get(tokenKey);
  if (cached && now < cached.expiresAt) {
    req.user = cached.user;
    return next();
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      tokenCache.delete(tokenKey);
      return res.status(401).json({ eroare: "Token invalid sau respins de serverul Auth." });
    }
    if (tokenCache.size >= MAX_TOKEN_CACHE_ENTRIES) {
      // Evacuam cea mai veche intrare (LRU).
      const oldest = tokenCache.keys().next().value;
      if (oldest) tokenCache.delete(oldest);
    }
    tokenCache.set(tokenKey, { user, expiresAt: now + CACHE_TTL_MS });
    req.user = user;
    next();
  } catch (error) {
    return res.status(500).json({ eroare: "Eroare la transferul validării autentificării." });
  }
};

// Inițializare AI Gemini și listă modele în cascadă (modele stabile prioritar)
const genAI = new GoogleGenerativeAI(geminiApiKey);
const GEMINI_FALLBACK_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite"
];

// Modelul preferat din GEMINI_MODEL are prioritate in cascada.
const getGeminiModelsList = () => {
  const preferat = (process.env.GEMINI_MODEL || '').trim();
  if (!preferat) return [...GEMINI_FALLBACK_MODELS];
  return [preferat, ...GEMINI_FALLBACK_MODELS.filter((m) => m !== preferat)];
};

// Helper pentru timeout cereri cu AbortController real.
// Dacă promise este un fetch(), pasează { signal: controller.signal } la fetch().
// Pentru promisiuni Gemini SDK (care nu acceptă signal) funcționează tot, dar nu
// poate anula la nivel de socket — doar aruncă eroarea de timeout.
const callWithTimeout = async (promiseOrFactory, ms = 30000) => {
  const controller = new AbortController();
  const { signal } = controller;

  // Dacă e o funcție factory, o apelăm cu signal-ul (permite fetch-uri anulabile)
  const promise = typeof promiseOrFactory === 'function'
    ? promiseOrFactory(signal)
    : promiseOrFactory;

  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(`Cererea AI a expirat (Timeout strict de ${ms}ms - conexiune anulată).`));
    }, ms);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Cererea AI a expirat (Timeout strict de ${ms}ms - Socket închis).`);
    }
    throw error;
  }
};

// Helper pentru extragere chei API multiple din variabile de mediu (rotație automată la eroare/cotă depășită)
const getApiKeysList = (envPrefix) => {
  const keys = [];
  if (process.env[envPrefix]) keys.push(process.env[envPrefix]);
  if (process.env[`${envPrefix}S`]) {
    process.env[`${envPrefix}S`].split(',').forEach(k => {
      const trimmed = k.trim();
      if (trimmed) keys.push(trimmed);
    });
  }
  for (let i = 2; i <= 5; i++) {
    if (process.env[`${envPrefix}_${i}`]) keys.push(process.env[`${envPrefix}_${i}`]);
  }
  return keys.filter((v, i, a) => v && a.indexOf(v) === i);
};

// ==========================================
// REGISTRU STARE FURNIZORI AI (COOLDOWN & STATUS)
// ==========================================
const aiStatusRegistry = {
  gemini: { nume: "Google Gemini 2.5", status: "active", blockedUntil: 0, ultimulMesaj: "Disponibil" },
  openai: { nume: "OpenAI GPT-4o-mini", status: "active", blockedUntil: 0, ultimulMesaj: "Disponibil" },
  groq: { nume: "Groq Vision", status: "active", blockedUntil: 0, ultimulMesaj: "Disponibil" },
  openrouter: { nume: "OpenRouter Vision", status: "active", blockedUntil: 0, ultimulMesaj: "Disponibil" }
};

const blockProvider = (providerKey, cooldownSeconds, motiv) => {
  if (aiStatusRegistry[providerKey]) {
    aiStatusRegistry[providerKey].status = "cooldown";
    aiStatusRegistry[providerKey].blockedUntil = Date.now() + cooldownSeconds * 1000;
    aiStatusRegistry[providerKey].ultimulMesaj = motiv;
  }
};

const getProviderStatus = (providerKey) => {
  const p = aiStatusRegistry[providerKey];
  if (!p) return { id: providerKey, nume: providerKey, status: "active", secundeRamase: 0, mesaj: "Disponibil" };
  const acum = Date.now();
  if (p.blockedUntil > acum) {
    const sec = Math.ceil((p.blockedUntil - acum) / 1000);
    return { id: providerKey, nume: p.nume, status: "cooldown", secundeRamase: sec, mesaj: `Blocat (${sec}s): ${p.ultimulMesaj}` };
  } else {
    p.status = "active";
    p.blockedUntil = 0;
    p.ultimulMesaj = "Disponibil";
    return { id: providerKey, nume: p.nume, status: "active", secundeRamase: 0, mesaj: "Disponibil" };
  }
};

app.get('/api/ai-status', (req, res) => {
  res.json({
    gemini: getProviderStatus('gemini'),
    openai: getProviderStatus('openai'),
    groq: getProviderStatus('groq'),
    openrouter: getProviderStatus('openrouter')
  });
});

// ==========================================
// RUTE DE HEALTH CHECK & ROOT
// ==========================================
app.get('/', (req, res) => {
  res.json({
    status: "OK",
    service: "NutriAI Secure Backend",
    version: "2.2.0-ai-selector",
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', healthy: true, uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// ==========================================
// VALIDARE MAGIC BYTES IMAGINE
// Verifică primii bytes ai fișierului pentru a confirma tipul real,
// independent de extensie sau Content-Type declarat de client.
// ==========================================
// Intoarce tipul MIME real detectat din magic bytes.
function detectImageMime(buffer) {
  if (!buffer || buffer.length < 4) return null;
  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'image/jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'image/png';
  // WEBP: RIFF....WEBP (bytes 0-3 = RIFF, bytes 8-11 = WEBP)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) return 'image/webp';
  return null;
}

function validateImageMagicBytes(buffer) {
  return detectImageMime(buffer) !== null;
}

// ==========================================
// RUTE API PROTEJATE CU JWT
// ==========================================

// RUTA 1: ANALIZA FOTO STRUCTURATĂ (GEMINI)
const handleAnalizaFoto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ eroare: "Te rog încarcă o imagine." });
    }

    // 1.1 Validare strictă mimetype (trebuie să fie imagine) înainte de a apela Gemini
    if (!req.file.mimetype || !req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ eroare: "Tip fișier nepermis. Doar fișierele de tip imagine sunt acceptate." });
    }

    const fileBuffer = await fs.promises.readFile(req.file.path);
    const detectedMime = detectImageMime(fileBuffer);
    if (!detectedMime) {
      return res.status(400).json({ eroare: "Tip fișier nepermis. Doar imagini JPEG/PNG/WEBP sunt acceptate." });
    }

    // Citim buffer-ul o singura data (evita dublare consum de memorie).
    const imageBase64 = fileBuffer.toString("base64");
    const imageMime = detectedMime;

    const imagePart = {
      inlineData: {
        data: imageBase64,
        mimeType: imageMime
      },
    };

    const prompt = `Analizează această imagine cu mâncare.
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

    let text = null;
    let lastError = null;
    const requestedProvider = (req.body?.provider || req.query?.provider || 'auto').toLowerCase();

    if (requestedProvider !== 'auto' && aiStatusRegistry[requestedProvider]) {
      const st = getProviderStatus(requestedProvider);
      if (st.status === 'cooldown') {
        return res.status(429).json({
          eroare: `Modelul selectat (${st.nume}) este blocat temporar pentru încă ${st.secundeRamase}s (${st.mesaj}). Alege alt model sau modul Auto.`,
          providerStatus: 'cooldown',
          secundeRamase: st.secundeRamase
        });
      }
    }

    // 1) PRIORITATE: OpenAI GPT-4o-mini Vision (sau dacă s-a cerut specific openai)
    const runOpenAI = (requestedProvider === 'auto' || requestedProvider === 'openai');
    const openaiKeys = getApiKeysList('OPENAI_API_KEY');
    if (runOpenAI && openaiKeys.length > 0) {
      console.log("🔄 Încerc OpenAI GPT-4o-mini Vision...");
      for (const key of openaiKeys) {
        try {
          const oaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${key}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              messages: [
                {
                  role: "user",
                  content: [
                    { type: "text", text: prompt },
                    {
                      type: "image_url",
                      image_url: { url: `data:${imageMime};base64,${imageBase64}` }
                    }
                  ]
                }
              ],
              temperature: 0.2,
              max_tokens: 1500
            })
          });
          if (oaiRes.ok) {
            const oaiData = await oaiRes.json();
            text = oaiData.choices?.[0]?.message?.content;
            if (text) {
              console.log("✅ Succes OpenAI GPT-4o-mini Vision!");
              break;
            }
          } else {
            if (oaiRes.status === 429) blockProvider('openai', 60, "Limită de cereri (429)");
            const errBody = await oaiRes.text();
            console.warn(`⚠️ OpenAI Vision eșuat (${oaiRes.status}):`, errBody.substring(0, 150));
          }
        } catch (e) {
          console.warn("⚠️ OpenAI Vision excepție:", e.message);
        }
      }
    }

    // 2) Groq Vision AI (sau dacă s-a cerut specific groq)
    const runGroq = (!text && (requestedProvider === 'auto' || requestedProvider === 'groq'));
    if (runGroq) {
      console.log("🔄 Încerc Groq Vision AI...");
      const groqKeys = getApiKeysList('GROQ_API_KEY');
      // Modelele Groq vision sunt configurabile prin GROQ_VISION_MODELS.
      // acest pas al cascadei eșua garantat. Lista este acum configurabila prin env.
      const groqVisionModels = (
        process.env.GROQ_VISION_MODELS ||
        "meta-llama/llama-4-scout-17b-16e-instruct,meta-llama/llama-4-maverick-17b-128e-instruct"
      ).split(',').map((m) => m.trim()).filter(Boolean);
      for (const key of groqKeys) {
        for (const groqModel of groqVisionModels) {
          try {
            const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${key}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                model: groqModel,
                messages: [
                  {
                    role: "user",
                    content: [
                      { type: "text", text: prompt },
                      {
                        type: "image_url",
                        image_url: { url: `data:${imageMime};base64,${imageBase64}` }
                      }
                    ]
                  }
                ],
                temperature: 0.2,
                max_tokens: 1000
              })
            });

            if (groqRes.ok) {
              const groqData = await groqRes.json();
              text = groqData.choices?.[0]?.message?.content;
              if (text) {
                console.log(`✅ Succes Groq Vision cu modelul: ${groqModel}`);
                break;
              }
            } else {
              if (groqRes.status === 429) blockProvider('groq', 60, "Limită de cereri Groq (429)");
              const errBody = await groqRes.text();
              console.warn(`⚠️ Groq [${groqModel}] (${groqRes.status}):`, errBody.substring(0, 100));
            }
          } catch (groqErr) {
            console.warn(`⚠️ Groq Vision [${groqModel}] excepție:`, groqErr.message);
          }
        }
        if (text) break;
      }
    }

    // 3) Gemini AI fallback (sau dacă s-a cerut specific gemini)
    const runGemini = (!text && (requestedProvider === 'auto' || requestedProvider === 'gemini'));
    if (runGemini) {
      console.warn("🔄 Încerc Gemini API...");
      const geminiKeys = getApiKeysList('GEMINI_API_KEY');
      const modelsToTry = getGeminiModelsList();
      for (const key of geminiKeys) {
        const client = new GoogleGenerativeAI(key);
        for (const modelName of modelsToTry) {
          try {
            const model = client.getGenerativeModel({ model: modelName });
            const responsePromise = model.generateContent({
              contents: [{ role: "user", parts: [{ text: prompt }, imagePart] }],
              generationConfig: { responseMimeType: "application/json" }
            });
            const result = await callWithTimeout(responsePromise);
            if (result && result.response) {
              text = result.response.text();
              if (text) {
                console.log(`✅ Succes Gemini cu modelul: ${modelName}`);
                break;
              }
            }
          } catch (err) {
            lastError = err;
            const errMsg = err.message || String(err);
            if (errMsg.includes('429')) blockProvider('gemini', 60, "Limită de cereri Gemini (429)");
            console.warn(`⚠️ Gemini [${modelName}] eșuat:`, errMsg.substring(0, 100));
          }
        }
        if (text) break;
      }
    }

    // 4) OpenRouter Vision fallback (dacă există OPENROUTER_API_KEY)
    if (!text) {
      const orKeys = getApiKeysList('OPENROUTER_API_KEY');
      if (orKeys.length > 0) {
        console.warn("⚠️ Încerc OpenRouter AI...");
        for (const key of orKeys) {
          try {
            const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${key}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                model: "google/gemini-flash-1.5",
                messages: [
                  {
                    role: "user",
                    content: [
                      { type: "text", text: prompt },
                      {
                        type: "image_url",
                        image_url: { url: `data:${imageMime};base64,${imageBase64}` }
                      }
                    ]
                  }
                ]
              })
            });
            if (orRes.ok) {
              const orData = await orRes.json();
              text = orData.choices?.[0]?.message?.content;
              if (text) {
                console.log("✅ Succes OpenRouter Vision!");
                break;
              }
            }
          } catch (e) {
              // Inregistram si erorile OpenRouter pentru diagnosticare
              console.warn('⚠️ OpenRouter Vision excepție:', e.message || e);
            }
        }
      }
    }

    if (!text) {
      console.error("AI vision fail.");
      return res.status(503).json({
        eroare: "Toate sistemele AI au eșuat sau sunt temporar în limită de cereri (cooldown). Încearcă din nou peste un minut sau schimbă modelul AI.",
        stareAI: {
          gemini: getProviderStatus('gemini'),
          openai: getProviderStatus('openai'),
          groq: getProviderStatus('groq')
        }
      });
    }

    let cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(cleanedText);
    } catch (e) {
      const jsonMatch = cleanedText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch (e2) {
          console.warn("⚠️ Eroare parsing array JSON din text:", e2.message);
        }
      }
      if (!parsed) {
        const objMatch = cleanedText.match(/\{[\s\S]*\}/);
        if (objMatch) {
          try {
            parsed = JSON.parse(objMatch[0]);
          } catch (e3) {
            console.warn("⚠️ Eroare parsing obiect JSON din text:", e3.message);
          }
        }
      }
      if (!parsed) {
        return res.status(500).json({ eroare: "AI nu a returnat un format JSON valid." });
      }
    }

    if (!Array.isArray(parsed)) {
      const arrayProp = Object.values(parsed).find(val => Array.isArray(val));
      if (arrayProp) {
        parsed = arrayProp;
      } else {
        parsed = [parsed];
      }
    }

    // Schema de validare / normalizare
    const validated = parsed.map(item => ({
      nume: String(item.nume || item.aliment || "Aliment identificat"),
      estimare_grame: Number(item.estimare_grame || item.grame) || 100,
      calorii_per_100g: Number(item.calorii_per_100g || item.calorii) || 0,
      proteine_per_100g: Number(item.proteine_per_100g || item.proteine) || 0,
      grasimi_per_100g: Number(item.grasimi_per_100g || item.grasimi) || 0,
      carbohidrati_per_100g: Number(item.carbohidrati_per_100g || item.carbohidrati) || 0,
      incredere: String(item.incredere || "ridicat")
    }));

    res.json(validated);
  } catch (error) {
    console.error("Eroare Gemini structurat:", error.message || error);
    const msg = error?.message || "Eroare necunoscută de la AI";
    res.status(500).json({ eroare: `Eroare AI Gemini: ${msg}` });
  } finally {
    // 1.2 Ștergerea asincronă a fișierului temporar în blocul finally
    if (req.file && req.file.path) {
      fs.promises.unlink(req.file.path).catch(() => {});
    }
  }
};

app.post("/api/analiza-foto", requireAuth, aiRateLimiter, upload.single("imagine"), handleAnalizaFoto);
app.post("/api/analizeaza-mancare-structurat", requireAuth, aiRateLimiter, upload.single("imagine"), handleAnalizaFoto);

// ==========================================
// RUTA 2: CHAT CONVERSAȚIONAL (GROQ / LLAMA 3.3)
// Securizată cu requireAuth
// ==========================================
app.post('/api/chat', requireAuth, aiRateLimiter, async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ raspuns: "Format cerere invalid. Se așteaptă un obiect JSON." });
    }
    let { mesaj, mesaje, caloriiConsumate, caloriiTinta, proteineConsumate, proteineTinta } = req.body;
    const calCons = Number(caloriiConsumate) || 0;
    const calTinta = Number(caloriiTinta) || 2000;
    const protCons = Number(proteineConsumate) || 0;
    const protTinta = Number(proteineTinta) || 150;

    let ultimulMesaj = mesaj;
    if (Array.isArray(mesaje) && mesaje.length > 0) {
      ultimulMesaj = mesaje[mesaje.length - 1].text || mesaje[mesaje.length - 1].content || '';
    }

    if (!ultimulMesaj || typeof ultimulMesaj !== 'string' || !ultimulMesaj.trim()) {
      return res.status(400).json({ raspuns: "Serverul nu a primit niciun mesaj valid." });
    }

    ultimulMesaj = ultimulMesaj.replace(/[\x00-\x1F\x7F]/g, "").trim();
    if (ultimulMesaj.length > 500) {
      ultimulMesaj = ultimulMesaj.substring(0, 500);
    }

    // Securitate: detectam si blocam tentativele de prompt injection
    if (detectPromptInjection(ultimulMesaj)) {
      console.warn('[Securitate] Prompt injection detectat in /api/chat:', ultimulMesaj.substring(0, 80));
      return res.status(400).json({ raspuns: "Mesajul conține instrucțiuni interzise. Te rog reformulează." });
    }

    const systemPrompt = `Ești un asistent nutrițional prietenos, profesionist și empatic pentru aplicația NutriAI.
REGULA TA PRINCIPALĂ: Răspunde STRICT și EXCLUSIV la întrebări despre nutriție, diete, calorii, antrenamente și fitness.
Dacă utilizatorul te întreabă absolut orice altceva (programare, politică, cultură generală, mașini, glume, istorie etc.), trebuie să REFUZI POLITICOS și să îi amintești că ești setat doar pentru discuții despre sănătate și nutriție.

Contextul utilizatorului de astăzi:
- Calorii: a mâncat ${calCons} dintr-o țintă de ${calTinta} kcal.
- Proteine: a mâncat ${protCons}g dintr-o țintă de ${protTinta}g.

Instrucțiuni de formatare și stil:
1. Folosește emoji-uri relevante la începutul propozițiilor sau ideilor importante (de exemplu 🥗, 🔥, 🥩, 💡, ✅).
2. Structurează răspunsul cu bullet points dacă oferi mai mult de 2 sugestii sau opțiuni de mese.
3. Răspunde concis, clar și la obiect. Poți folosi maximum 6-8 propoziții dacă utilizatorul cere explicații detaliate sau planuri de mese.
4. REGULĂ JURNAL ALIMENTAR DIN CHAT: Dacă utilizatorul menționează că a mâncat, a consumat sau dorește să înregistreze o masă/un aliment (ex: "am mâncat 200g piept de pui și orez", "loghează o salată"), NU confirma și NU declara nimic salvat! Răspunde STRICT și EXCLUSIV cu un obiect JSON valid exact în formatul:
{
  "type": "MEAL_PROPOSAL",
  "meal_type": "mic_dejun",
  "items": [
    { "name": "nume aliment", "qty": 100, "unit": "g", "protein_g": 20, "carbs_g": 0, "fat_g": 5, "kcal": 130, "fiber_g": 0 }
  ],
  "totals": { "protein_g": 20, "carbs_g": 0, "fat_g": 5, "kcal": 130, "fiber_g": 0 }
}
Nu include absolut niciun alt caracter sau text în fața ori după acest obiect JSON când propui o masă! Cheia "meal_type" TREBUIE să fie neapărat una din valorile: "mic_dejun", "pranz", "cina", "gustare" (dedusă inteligent din alimentele consumate: ex. cereale/ouă/cafea = mic_dejun, ciorbă/meniu complet = pranz, cină ușoară = cina, fruct/snack = gustare).

Sarcina ta: Răspunde prietenos, ținând cont de istoricul discuției și de caloriile/proteinele rămase astăzi.`;

    const messages = [
      { role: "system", content: systemPrompt }
    ];

    if (Array.isArray(mesaje) && mesaje.length > 0) {
      const istoric = mesaje.slice(-10);
      istoric.forEach((m, idx) => {
        let role = m.role === 'user' || m.sender === 'user' ? 'user' : 'assistant';
        let content = m.text || m.content || '';
        // Ultimul mesaj din istoric apartine garantat userului.
        if (idx === istoric.length - 1 && role === 'user') content = ultimulMesaj;
        if (content.trim()) {
          messages.push({ role, content });
        }
      });
    } else {
      messages.push({ role: "user", content: ultimulMesaj });
    }

    // 1.3 Limitare istoric conversație Groq bazată pe estimare de tokens (caractere / 3.5)
    // Păstrăm maximum 6000 de tokens, asigurându-ne că primul mesaj (System Prompt) rămâne mereu la indexul 0.
    const getEstimatedTokens = (arr) => arr.reduce((acc, m) => acc + Math.ceil((m.content ? m.content.length : 0) / 3.5), 0);
    let totalTokens = getEstimatedTokens(messages);
    while (totalTokens > 6000 && messages.length > 2) {
      messages.splice(1, 1);
      totalTokens = getEstimatedTokens(messages);
    }

    try {
      const isMealLog = /am m[aâ]ncat|am consumat|logheaz[aă]|[iî]nregistreaz[aă]|pune [iî]n jurnal|adaug[aă] [iî]n jurnal|adaug[aă] masa|salveaz[aă] masa/i.test(ultimulMesaj);
      const groqBody = {
        model: "llama-3.3-70b-versatile",
        messages: messages,
        temperature: isMealLog ? 0.2 : 0.7,
        max_tokens: 800
      };
      if (isMealLog) {
        groqBody.response_format = { type: "json_object" };
      }

      const fetchPromise = fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${groqApiKey}`
        },
        body: JSON.stringify(groqBody)
      });

      const response = await callWithTimeout(fetchPromise, 35000);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Eroare Groq API (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const raspunsText = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : "Nu am putut genera un răspuns.";
      return res.json({ raspuns: raspunsText });
    } catch (groqError) {
      console.warn("Eroare Groq API în /api/chat, activăm fallback Gemini text:", groqError.message || groqError);
      
      const geminiPrompt = `${systemPrompt}\n\nIstoricul conversației și întrebarea curentă:\n${messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')}\n\nASSISTANT:
Te asiguri că folosești DOAR JSON VALID dacă utilizatorul a cerut înregistrarea mesei (în formatul MEAL_PROPOSAL), sau altfel formatul solicitat.`;
      const modelList = getGeminiModelsList().filter(Boolean);
      for (const modelName of modelList) {
        try {
          const model = genAI.getGenerativeModel({ model: modelName });
          const result = await callWithTimeout(model.generateContent({
            contents: [{ role: "user", parts: [{ text: geminiPrompt }] }],
            // Pentru chat generic preferăm să nu punem responseMimeType ca să nu spargem flow-ul normal de chat.
            // Dacă chat-ul e de logare, promptul îl ghidează.
          }), 30000);
          const raspunsText = result.response.text();
          if (raspunsText) {
            return res.json({ raspuns: raspunsText });
          }
        } catch (gemErr) {
          console.warn(`Fallback Gemini (${modelName}) a eșuat în /api/chat:`, gemErr.message);
        }
      }
      throw groqError;
    }
  } catch (error) {
    console.error("Eroare la generarea chat-ului AI:", error);
    res.status(500).json({ raspuns: "A apărut o problemă de conexiune cu asistentul AI. Te rugăm să mai încerci peste câteva momente!" });
  }
});

// ==========================================
// RUTA DEDICATĂ: LOGARE MASĂ DIN CHAT (JSON STRICT MEAL_PROPOSAL)
// ==========================================
app.post('/api/log-food-from-chat', requireAuth, aiRateLimiter, async (req, res) => {
  try {
    const { mesaj, mesaje } = req.body;
    if (!mesaj || typeof mesaj !== 'string') {
      return res.status(400).json({ eroare: "Mesaj invalid pentru logare." });
    }
    const textCurat = mesaj.replace(/[\x00-\x1F\x7F]/g, "").trim().substring(0, 500);

    if (!textCurat) return res.status(400).json({ eroare: "Mesaj invalid pentru logare." });
    if (detectPromptInjection(textCurat)) {
      console.warn('[Securitate] Prompt injection detectat in /api/log-food-from-chat');
      return res.status(400).json({ eroare: "Mesajul conține instrucțiuni interzise." });
    }

    const istoricText = Array.isArray(mesaje) && mesaje.length > 0
      ? mesaje.slice(-6).map(m => `${(m.role || m.sender || 'user').toUpperCase()}: ${m.text || m.content || ''}`).join('\n')
      : '';

    const prompt = `Utilizatorul dorește să înregistreze o masă în Jurnal.
Context Istoric Chat Recent:
${istoricText}

Ultimul Mesaj Utilizator: "${textCurat}"

MANDAT: EXTRAGE toate alimentele menționate și valorile lor nutriționale REALE (calorii, proteine g, carbohidrați g, grăsimi g, fibre g).
Dacă utilizatorul face referire la o masă sau alimente/valori estimate anterior în istoricul conversației (ex: "pune în jurnal", "salvează masa de 460 kcal și 32g proteine", "adaugă-o"), EXTRAGE acele alimente și valorile lor nutriționale exacte din istoricul recent! NU returna 0 la calorii/proteine dacă valorile au fost calculate/menționate în conversație!
DEDUCE cheia "meal_type" ("mic_dejun" | "pranz" | "cina" | "gustare").

RETURNEAZĂ STRICT UN OBIECT JSON valid în acest format:
{
  "type": "MEAL_PROPOSAL",
  "meal_type": "mic_dejun",
  "items": [
    { "name": "nume aliment", "qty": 100, "unit": "g", "protein_g": 20, "carbs_g": 0, "fat_g": 5, "kcal": 130, "fiber_g": 0 }
  ],
  "totals": { "protein_g": 20, "carbs_g": 0, "fat_g": 5, "kcal": 130, "fiber_g": 0 }
}`;

    const fetchPromise = fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${groqApiKey}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 600,
        response_format: { type: "json_object" }
      })
    });

    const response = await callWithTimeout(fetchPromise, 25000);
    if (!response.ok) {
      throw new Error(`Eroare Groq /api/log-food-from-chat (${response.status})`);
    }
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Răspuns gol primit de la AI.");

    let curatat = content
      .replace(/```[a-z]*\s*/gi, '')
      .replace(/```/g, '')
      .trim();

    const firstBrace = curatat.indexOf('{');
    const lastBrace = curatat.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      curatat = curatat.substring(firstBrace, lastBrace + 1);
    }

    let parsed;
    try {
      parsed = JSON.parse(curatat);
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        const fallbackCuratat = match[0].replace(/```[a-z]*\s*/gi, '').replace(/```/g, '');
        parsed = JSON.parse(fallbackCuratat);
      } else {
        throw new Error("Format JSON neidentificat.");
      }
    }

    if (!parsed || (parsed.type !== 'MEAL_PROPOSAL' && !Array.isArray(parsed.items))) {
      throw new Error("JSON invalid pentru MEAL_PROPOSAL.");
    }

    if (Array.isArray(parsed.items)) {
      parsed.type = 'MEAL_PROPOSAL';
      if (!parsed.meal_type || !['mic_dejun', 'pranz', 'cina', 'gustare'].includes(parsed.meal_type)) {
        parsed.meal_type = 'gustare';
      }
    }

    return res.json(parsed);
  } catch (err) {
    console.error("Eroare în /api/log-food-from-chat:", err.message);
    return res.status(500).json({ eroare: "Nu s-a putut genera propunerea de masă." });
  }
});

// ==========================================
// ==========================================
// RUTA: ESTIMARE RAPIDĂ TEXT ALIMENT (GROQ/LLM)
// ==========================================
app.post('/api/estimeaza-mancare-text', requireAuth, aiRateLimiter, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string') return res.status(400).json({ eroare: "Text invalid." });
    let curatat = text.replace(/[\x00-\x1F\x7F]/g, "").trim();
    if (curatat.length > 200) curatat = curatat.substring(0, 200);
    if (!curatat) return res.status(400).json({ eroare: "Text invalid." });
    
    if (detectPromptInjection(curatat)) {
      return res.status(400).json({ eroare: "Textul conține instrucțiuni interzise." });
    }

    const prompt = `Estimează valorile nutriționale pentru 1 porție standard din: "${curatat}". RETURNEAZĂ STRICT UN OBIECT JSON în formatul: {"nume": "${curatat}", "calorii": 300, "proteine": 15, "carbohidrati": 30, "grasimi": 10, "gramajDefault": 150}. Fără text adițional.`;
    
    const fetchPromise = fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${groqApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        response_format: { type: "json_object" }
      })
    });
    const groqResponse = await callWithTimeout(fetchPromise, 25000);
    if (!groqResponse.ok) {
      throw new Error(`Eroare Groq API (${groqResponse.status})`);
    }
    const data = await groqResponse.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Răspuns gol primit de la AI.");
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Nu s-a putut interpreta răspunsul ca JSON.");
      }
    }
    res.json(parsed);
  } catch (error) {
    console.error("Eroare estimare AI aliment:", error.message);
    res.status(500).json({ eroare: "Nu s-a putut estima alimentul cu AI." });
  }
});

// ==========================================
// RUTA 1.3: CORECTARE SI COMBINARE / VISION FALLBACK (SMART MERGE SAU REPLACE)
// ==========================================
const handleVisionFallbackOrCorrection = async (req, res) => {
  try {
    const currentIngredients = req.body.current_ingredients || req.body.imageIngredients || [];
    const userPrompt = req.body.user_prompt || req.body.userExplanation;

    if (!userPrompt || typeof userPrompt !== 'string' || !userPrompt.trim()) {
      return res.status(400).json({ eroare: "Explicația text (user_prompt) este obligatorie." });
    }

    if (detectPromptInjection(userPrompt)) {
      console.warn('[Securitate] Prompt injection detectat in /api/vision-fallback');
      return res.status(400).json({ eroare: "Instrucțiunea conține comenzi interzise." });
    }

    const prompt = `Ești un asistent nutrițional expert și precis. 
Ai o listă de ingrediente detectate inițial sau curent: ${JSON.stringify(currentIngredients)}
Și o instrucțiune/explicație de la utilizator: "${userPrompt}"

IMPORTANT - SMART MERGE SAU REPLACE LOGIC:
1. Analizează intenția utilizatorului:
   - DACĂ utilizatorul spune că un aliment identificat este COMPLET ALTCEVA (sau că nu este acel aliment deloc, ex: "Nu e sos roșu, sunt cârnăciori", "That's not tomato sauce, it's sausage", "Șterge orezul, am mâncat doar carne"), atunci ȘTERGE complet elementul/elementele vechi invalidate și returnează DOAR noile alimente corecte. Setează "action_taken": "replaced".
   - DACĂ utilizatorul adaugă un aliment nou sau corectează/modifică gramajul unui aliment existent (ex: "Am mai adăugat 50g brânză", "Cartofii au 200g, nu 100g", "I also added 50g of cheddar cheese and the potatoes are actually 200g"), combină/actualizează lista păstrând elementele valide și adăugându-le/corectându-le pe cele cerute. Setează "action_taken": "appended".

2. Calculează macronutrienții reali și rezonabili per 100g și estimează cantitatea în grame ("estimare_grame") pentru fiecare ingredient din lista finală.

Returnează DOAR JSON valid exact în formatul:
{
  "action_taken": "replaced" sau "appended",
  "ingredients": [
    {
      "nume": "string (numele alimentului în română)",
      "calorii_per_100g": number,
      "proteine_per_100g": number,
      "carbohidrati_per_100g": number,
      "grasimi_per_100g": number,
      "estimare_grame": number
    }
  ],
  "new_totals": {
    "kcal": number,
    "proteine": number,
    "grasimi": number,
    "carbohidrati": number
  }
}
Nu adăuga markdown, explicații sau text adițional în afara obiectului JSON valid.`;

    const groqKeys = getApiKeysList('GROQ_API_KEY');
    let content = null;
    let lastErr = null;

    for (const key of groqKeys) {
      try {
        const fetchPromise = fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.15,
            response_format: { type: "json_object" }
          })
        });

        const response = await callWithTimeout(fetchPromise, 30000);
        if (response.ok) {
          const data = await response.json();
          content = data.choices?.[0]?.message?.content;
          if (content) break;
        } else {
          lastErr = new Error(`Groq API (${response.status})`);
          console.warn(`⚠️ Groq vision-fallback eșuat (${response.status})`);
        }
      } catch (e) {
        lastErr = e;
        console.warn("⚠️ Eroare Groq vision-fallback:", e.message);
      }
    }

    if (!content) {
      const openaiKeys = getApiKeysList('OPENAI_API_KEY');
      for (const key of openaiKeys) {
        try {
          const fetchPromise = fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              messages: [{ role: "user", content: prompt }],
              temperature: 0.15,
              response_format: { type: "json_object" }
            })
          });
          const response = await callWithTimeout(fetchPromise, 30000);
          if (response.ok) {
            const data = await response.json();
            content = data.choices?.[0]?.message?.content;
            if (content) break;
          }
        } catch (e) {}
      }
    }

    if (!content) {
      const geminiKeys = getApiKeysList('GEMINI_API_KEY');
      const modelsToTry = getGeminiModelsList();
      for (const key of geminiKeys) {
        const client = new GoogleGenerativeAI(key);
        for (const modelName of modelsToTry) {
          try {
            const model = client.getGenerativeModel({ model: modelName });
            const responsePromise = model.generateContent({
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: "application/json" }
            });
            const result = await callWithTimeout(responsePromise, 30000);
            if (result && result.response) {
              content = result.response.text();
              if (content) break;
            }
          } catch (e) {}
        }
        if (content) break;
      }
    }

    if (!content) {
      throw lastErr || new Error("Toate modelele AI au eșuat pentru corecție/fallback.");
    }

    let parsed = null;
    if (content && typeof content === 'string') {
      let clean = content.replace(/```[a-z]*\s*/gi, '').replace(/```/g, '').trim();
      try {
        parsed = JSON.parse(clean);
      } catch {
        const match = clean.match(/\{[\s\S]*?(?:"action_taken"|"ingredients")[\s\S]*?\}/);
        if (match) {
          try { parsed = JSON.parse(match[0].replace(/,\s*([\]}])/g, '$1')); } catch {}
        }
      }
    }
    if (!parsed || typeof parsed !== 'object') {
      throw new Error("Format JSON incorect sau incomplet de la AI.");
    }

    const actionTaken = parsed?.action_taken === "replaced" ? "replaced" : "appended";
    const ingredients = Array.isArray(parsed?.ingredients) ? parsed.ingredients.map(item => ({
      nume: String(item?.nume || 'Ingredient').trim(),
      calorii_per_100g: Number(item?.calorii_per_100g || 0),
      proteine_per_100g: Number(item?.proteine_per_100g || 0),
      carbohidrati_per_100g: Number(item?.carbohidrati_per_100g || 0),
      grasimi_per_100g: Number(item?.grasimi_per_100g || 0),
      estimare_grame: Math.max(1, Number(item?.estimare_grame || 100))
    })) : [];

    // Recalculăm new_totals cu precizie maximă în backend din ingredientele procesate
    const totals = { kcal: 0, proteine: 0, grasimi: 0, carbohidrati: 0 };
    ingredients.forEach(item => {
      const gr = item.estimare_grame;
      totals.kcal += Math.round((item.calorii_per_100g * gr) / 100);
      totals.proteine += Math.round((item.proteine_per_100g * gr) / 100);
      totals.carbohidrati += Math.round((item.carbohidrati_per_100g * gr) / 100);
      totals.grasimi += Math.round((item.grasimi_per_100g * gr) / 100);
    });

    res.json({
      action_taken: actionTaken,
      ingredients: ingredients,
      new_totals: totals
    });
  } catch (err) {
    console.error("Eroare corectare vizual+text / vision-fallback:", err.message);
    res.status(500).json({ eroare: "Nu s-a putut procesa corecția cu AI." });
  }
};

app.post('/api/vision-fallback', requireAuth, aiRateLimiter, handleVisionFallbackOrCorrection);
app.post('/api/corecteaza-mancare-vizual-text', requireAuth, aiRateLimiter, handleVisionFallbackOrCorrection);

// ==========================================
// RUTA 2.1: PROXY PENTRU OPENFOODFACTS BARCODE + STRAT 1 CACHE LOCAL + STRAT 3 FALLBACK
// ==========================================
app.get('/api/produs-barcode/:code', requireAuth, aiRateLimiter, async (req, res) => {
  try {
    const code = (req.params.code || '').trim();
    // Validare stricta: doar coduri EAN/UPC (4-20 cifre).
    if (!/^[0-9]{4,20}$/.test(code)) {
      return res.status(400).json({ eroare: "Cod de bare invalid." });
    }

    // STRAT 1: Verificare Cache Local Supabase
    try {
      const { data: cachedItem } = await supabaseAdmin
        .from('barcode_cache')
        .select('*')
        .eq('code', code)
        .maybeSingle();

      if (cachedItem) {
        return res.json({
          source: 'cache',
          produs: {
            codBare: code,
            nume: cachedItem.name,
            brand: cachedItem.brand || '',
            cantitate: cachedItem.quantity || '',
            calorii: Number(cachedItem.kcal_100g || 0),
            proteine: Number(cachedItem.protein_100g || 0),
            carbohidrati: Number(cachedItem.carbs_100g || 0),
            grasimi: Number(cachedItem.fat_100g || 0),
          }
        });
      }
    } catch (cacheErr) {
      console.warn("Avertisment citire barcode_cache:", cacheErr.message);
    }

    // STRAT 2: Căutare în OpenFoodFacts API
    const fetchPromise = fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json`, {
      headers: { 'User-Agent': 'NutriAI - React Native App - Contact: tudortone' }
    });
    const resp = await callWithTimeout(fetchPromise, 12000);
    if (resp.ok) {
      const data = await resp.json();
      const product = data?.product;
      if (data?.status === 1 && product) {
        const nutriments = product.nutriments || {};
        const normalized = {
          codBare: code,
          nume: product.product_name || product.product_name_ro || 'Produs necunoscut',
          brand: product.brands || '',
          cantitate: product.quantity || '',
          calorii: Number(nutriments['energy-kcal_100g'] || nutriments['energy-kcal'] || 0),
          proteine: Number(nutriments.proteins_100g || 0),
          carbohidrati: Number(nutriments.carbohydrates_100g || 0),
          grasimi: Number(nutriments.fat_100g || 0),
          aminoacizi_100g: nutriments, // Temporar păstrăm tot pentru compatibilitate / extracție în frontend
          micronutrienti_100g: nutriments,
          imagine_url: product.image_front_small_url || product.image_url || null
        };

        try {
          await supabaseAdmin.from('barcode_cache').upsert({
            code,
            source: 'openfoodfacts',
            brand: normalized.brand,
            name: normalized.nume,
            quantity: normalized.cantitate,
            kcal_100g: normalized.calorii,
            protein_100g: normalized.proteine,
            carbs_100g: normalized.carbohidrati,
            fat_100g: normalized.grasimi,
            payload: product,
            updated_at: new Date().toISOString(),
          });
        } catch (saveErr) {
          console.warn("Nu s-a putut salva în barcode_cache:", saveErr.message);
        }

        return res.json({ source: 'openfoodfacts', produs: normalized });
      }
    }

    // STRAT 3: Fallback AI - Estimați din cod sau propuneți profil rezonabil
    try {
      console.warn(`Barcode ${code} negăsit în cache sau OpenFoodFacts, activăm estimare AI...`);
      const aiPrompt = `Utilizatorul din România a scanat codul de bare EAN/UPC "${code}" dar nu a fost găsit în baza internațională.
Dacă cunoști cu certitudine acest cod de bare și produsul asociat (ex. un brand românesc recunoscut, apă, iaurt, mezeluri, dulciuri), returnează detaliile reale.
Dacă nu știi cu exactitate produsul corespunzător codului "${code}", generează un profil generic plauzibil pentru un produs alimentar ambalat (ex. Nume: "Produs alimentar ambalat (${code})", calorii ~250, proteine ~10, carbohidrați ~30, grăsimi ~10).
RETURNEAZĂ STRICT EXCLUSIV UN OBIECT JSON valid în acest format:
{
  "codBare": "${code}",
  "nume": "Numele produsului (sau Produs alimentar ambalat)",
  "brand": "Brand recunoscut sau Estimat",
  "cantitate": "100g",
  "calorii": 250,
  "proteine": 10,
  "carbohidrati": 30,
  "grasimi": 10
}`;

      const fetchPromiseAi = fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${groqApiKey}`
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: aiPrompt }],
          temperature: 0.1,
          max_tokens: 400,
          response_format: { type: "json_object" }
        })
      });

      const aiResp = await callWithTimeout(fetchPromiseAi, 18000);
      if (aiResp.ok) {
        const aiData = await aiResp.json();
        const content = aiData.choices?.[0]?.message?.content;
        if (content) {
          let parsed;
          try {
            parsed = JSON.parse(content);
          } catch {
            const match = content.match(/\{[\s\S]*\}/);
            if (match) parsed = JSON.parse(match[0]);
          }

          if (parsed && parsed.nume) {
            const normalizedAi = {
              codBare: code,
              nume: parsed.nume,
              brand: parsed.brand || 'AI Estimat',
              cantitate: parsed.cantitate || '100g',
              calorii: Number(parsed.calorii || 0),
              proteine: Number(parsed.proteine || 0),
              carbohidrati: Number(parsed.carbohidrati || 0),
              grasimi: Number(parsed.grasimi || 0)
            };

            try {
              await supabaseAdmin.from('barcode_cache').upsert({
                code,
                source: 'estimare_ai',
                brand: normalizedAi.brand,
                name: normalizedAi.nume,
                quantity: normalizedAi.cantitate,
                kcal_100g: normalizedAi.calorii,
                protein_100g: normalizedAi.proteine,
                carbs_100g: normalizedAi.carbohidrati,
                fat_100g: normalizedAi.grasimi,
                payload: parsed,
                updated_at: new Date().toISOString()
              });
            } catch (sErr) {}

            return res.json({ source: 'estimare_ai', produs: normalizedAi });
          }
        }
      }
    } catch (aiErr) {
      console.warn("Eroare la estimarea AI a codului de bare:", aiErr.message);
    }

    // Dacă nici AI nu a putut estima, returnăm 404
    return res.status(404).json({
      eroare: "Produsul nu a fost găsit.",
      allowManualEntry: true,
      suggestedAction: "manual_or_ai_text",
    });
  } catch (err) {
    console.error("Eroare interogare barcode OpenFoodFacts proxy:", err.message);
    return res.status(500).json({ eroare: "Eroare la interogarea codului de bare." });
  }
});

// ==========================================
// RUTA 2.2: SALVARE PRODUS BARCODE COMPLETAT MANUAL ÎN CACHE LOCAL
// ==========================================
app.post('/api/salveaza-produs-barcode', requireAuth, async (req, res) => {
  try {
    const { code, name, brand, quantity, kcal_100g, protein_100g, carbs_100g, fat_100g } = req.body;
    if (!code || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ eroare: "Codul și numele produsului sunt obligatorii." });
    }

    const kc = Number(kcal_100g || 0);
    const p = Number(protein_100g || 0);
    const c = Number(carbs_100g || 0);
    const f = Number(fat_100g || 0);

    // Valori non-numerice blocate explicit.
    if (![kc, p, c, f].every((n) => Number.isFinite(n))) {
      return res.status(400).json({ eroare: "Valori nutriționale invalide." });
    }

    // Hard validations for injection / sanity limits (pe suta de grame limitile chimice fizice normale sunt max 100g macros / ~900kcal - grasime pura)
    if (kc > 1000 || kc < 0) return res.status(400).json({eroare: "Număr de calorii imposibil fizic pentru 100g."});
    if (p > 100 || p < 0 || c > 100 || c < 0 || f > 100 || f < 0) return res.status(400).json({eroare: "Macro-nutrienții gresiti (peste 100g din 100g)."});
    if ((p + c + f) > 100) return res.status(400).json({eroare: "Suma macro-nutrienților depășește 100g per total de 100g."});

    if (!/^[0-9]{4,20}$/.test(String(code).trim())) {
       return res.status(400).json({eroare: "Cod de bare malformat."});
    }

    // Check ownership / if it's already created by someone else to prevent arbitrary overwrites
    const { data: ext } = await supabaseAdmin.from('barcode_cache').select('created_by_user').eq('code', String(code).trim()).maybeSingle();
    // Do not allow if it's a global cache element created by system, or if it wasn't you who created this user_manual entry
    // unless you are an admin. Implementing simple first-come-first-serve ownership protection logic:
    if (ext && ext.created_by_user && ext.created_by_user !== req.user.id) {
       // Proprietar diferit => 409 Conflict.
       return res.status(409).json({ eroare: "Produsul este deja înregistrat de alt utilizator și nu poate fi suprascris." });
    }

    await supabaseAdmin.from('barcode_cache').upsert({
      code: String(code).trim(),
      source: 'user_manual',
      created_by_user: req.user.id,
      brand: String(brand || '').trim().substring(0, 100),
      name: String(name).trim().substring(0, 150),
      quantity: String(quantity || '').trim().substring(0, 50),
      kcal_100g: kc,
      protein_100g: p,
      carbs_100g: c,
      fat_100g: f,
      payload: { userInputs: true }, // Scapam logarea oarba a intregului req.body periculos
      updated_at: new Date().toISOString(),
    });
    return res.json({ succes: true, message: "Produs salvat în cache-ul local." });
  } catch (err) {
    console.error("Eroare la salvare produs barcode:", err.message);
    return res.status(500).json({ eroare: "Eroare la salvarea produsului." });
  }
});

// ==========================================
// RUTA 3: CALCUL PROFIL NUTRIȚIONAL (DETERMINIST)
// Securizată cu requireAuth
// ==========================================
app.post('/api/calculeaza-profil', requireAuth, async (req, res) => {
  try {
    const { varsta, greutate, inaltime, sex, activitate, obiectiv } = req.body;

    if (!varsta || !greutate || !inaltime || !sex || !activitate || !obiectiv) {
      return res.status(400).json({ eroare: "Date incomplete. Te rog să completezi tot formularul." });
    }

    const v = parseInt(varsta);
    const g = parseFloat(greutate);
    const i = parseFloat(inaltime);

    if (isNaN(v) || v < 10 || v > 100) {
      return res.status(400).json({ eroare: "Vârsta trebuie să fie un număr valid între 10 și 100 ani." });
    }
    if (isNaN(g) || g < 30 || g > 300) {
      return res.status(400).json({ eroare: "Greutatea trebuie să fie un număr valid între 30 și 300 kg." });
    }
    if (isNaN(i) || i < 100 || i > 250) {
      return res.status(400).json({ eroare: "Înălțimea trebuie să fie un număr valid între 100 și 250 cm." });
    }
    if (sex !== 'Masculin' && sex !== 'Feminin') {
      return res.status(400).json({ eroare: "Sexul selectat este invalid." });
    }
    const activitatiPermise = ['Sedentar', 'Moderat', 'Foarte Activ'];
    if (!activitatiPermise.includes(activitate)) {
      return res.status(400).json({ eroare: "Nivelul de activitate selectat este invalid." });
    }
    const obiectivePermise = ['Slăbire', 'Menținere', 'Masă Musculară'];
    if (!obiectivePermise.includes(obiectiv)) {
      return res.status(400).json({ eroare: "Obiectivul selectat este invalid." });
    }

    // Calcul direct, instant și determinist Mifflin-St Jeor (B1, B2)
    let bmr;
    if (sex === 'Masculin') {
      bmr = 10 * g + 6.25 * i - 5 * v + 5;
    } else {
      bmr = 10 * g + 6.25 * i - 5 * v - 161;
    }
    
    // Corectare multiplicatori conform literaturii (B2)
    const multiplicatori = { 'Sedentar': 1.2, 'Moderat': 1.55, 'Foarte Activ': 1.725 };
    const tdee = bmr * (multiplicatori[activitate] || 1.2);
    
    let caloriiTinta;
    if (obiectiv === 'Slăbire') {
      caloriiTinta = Math.max(tdee - 500, sex === 'Masculin' ? 1500 : 1200);
    } else if (obiectiv === 'Masă Musculară') {
      caloriiTinta = tdee + 350;
    } else {
      caloriiTinta = tdee;
    }
    
    const protPerKg = obiectiv === 'Menținere' ? 1.6 : 2.0;
    const proteineTinta = Math.round(g * protPerKg);
    
    const calT = Math.round(caloriiTinta);
    const grasimiTinta = Math.round((calT * 0.25) / 9); // 25% din calorii, 9 kcal/g
    const carbiTinta = Math.round(Math.max((calT - (proteineTinta * 4) - (grasimiTinta * 9)) / 4, 50));
    
    res.json({ caloriiTinta: calT, proteineTinta, grasimiTinta, carbiTinta });
    
  } catch (error) {
    console.error("Eroare la calculul profilului:", error.message);
    res.status(500).json({ eroare: "Îmi pare rău, am întâmpinat o problemă la calcul. Mai încearcă!" });
  }
});

// ==========================================
// RUTA 4: ȘTERGERE MASĂ
// ==========================================
app.delete('/api/mese/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    // Validare UUID inainte de interogare.
    if (!isUuid(id)) {
      return res.status(400).json({ eroare: 'ID de masă invalid.' });
    }
    const { data, error } = await supabaseAdmin
      .from('mese')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select('id');
    // Nu expunem erori interne catre client (pot conține nume coloane, constrângeri Postgres)
    if (error) {
      console.error('Eroare DB ștergere masă:', error.message);
      return res.status(500).json({ eroare: 'Eroare la ștergerea mesei. Încearcă din nou.' });
    }
    // 404 daca randul nu apartine userului sau nu exista.
    if (!data || data.length === 0) {
      return res.status(404).json({ eroare: 'Masa nu a fost găsită.' });
    }
    res.json({ succes: true });
  } catch (error) {
    res.status(500).json({ eroare: "Eroare la ștergerea mesei." });
  }
});

// ==========================================
// RUTA 5: EDITARE MASĂ
// ==========================================
// ==========================================
// RUTA 5: EDITARE MASĂ (CU SUPPORT PENTRU JSONB & TIP_MASA)
// ==========================================
app.put('/api/mese/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return res.status(400).json({ eroare: 'ID de masă invalid.' });
    }
    const { nume, calorii, proteine, grasimi, carbohidrati, tip_masa, alimente, fibre } = req.body;
    if (!nume || typeof nume !== 'string' || !nume.trim()) {
      return res.status(400).json({ eroare: "Numele mesei este obligatoriu." });
    }
    const cal = Number(calorii);
    const prot = Number(proteine);
    const gras = Number(grasimi);
    const carb = Number(carbohidrati);
    const fib = Number(fibre);
    if (isNaN(cal) || cal < 0 || cal > 10000) {
      return res.status(400).json({ eroare: "Caloriile trebuie să fie un număr valid între 0 și 10000." });
    }
    if (isNaN(prot) || prot < 0 || prot > 1000) {
      return res.status(400).json({ eroare: "Proteinele trebuie să fie un număr valid între 0 și 1000." });
    }
    if (isNaN(gras) || gras < 0 || gras > 1000) {
      return res.status(400).json({ eroare: "Grăsimile trebuie să fie un număr valid între 0 și 1000." });
    }
    if (isNaN(carb) || carb < 0 || carb > 2000) {
      return res.status(400).json({ eroare: "Carbohidrații trebuie să fie un număr valid între 0 și 2000." });
    }
    const updatePayload = {
      nume: nume.trim(),
      calorii: Math.round(cal),
      proteine: Math.round(prot),
      grasimi: isNaN(gras) ? 0 : Math.round(gras),
      carbohidrati: isNaN(carb) ? 0 : Math.round(carb),
      fibre: isNaN(fib) ? 0 : Math.round(fib)
    };
    if (tip_masa && ['mic_dejun', 'pranz', 'cina', 'gustare'].includes(tip_masa)) {
      updatePayload.tip_masa = tip_masa;
    }
    if (Array.isArray(alimente)) {
      // Plafon la 100 de alimente per masa.
      updatePayload.alimente = alimente.slice(0, 100);
    }
    const { data, error } = await supabaseAdmin
      .from('mese')
      .update(updatePayload)
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select();
    // Nu expunem erori interne catre client
    if (error) {
      console.error('Eroare DB actualizare masă:', error.message);
      return res.status(500).json({ eroare: 'Eroare la actualizarea mesei. Încearcă din nou.' });
    }
    // 404 daca randul nu apartine userului sau nu exista.
    if (!data || data.length === 0) {
      return res.status(404).json({ eroare: 'Masa nu a fost găsită.' });
    }
    res.json({ succes: true, masa: data[0] });
  } catch (error) {
    res.status(500).json({ eroare: "Eroare la actualizarea mesei." });
  }
});

// ==========================================
// RUTA 5.1: SALVARE NOUĂ MASĂ (POST /api/mese PENTRU JSONB & TIP_MASA)
// ==========================================
app.post('/api/mese', requireAuth, async (req, res) => {
  try {
    const { nume, calorii, proteine, grasimi, carbohidrati, tip_masa, alimente, fibre, data, ora } = req.body;
    if (!nume || typeof nume !== 'string' || !nume.trim()) {
      return res.status(400).json({ eroare: "Numele mesei este obligatoriu." });
    }
    const cal = Number(calorii);
    const prot = Number(proteine);
    const gras = Number(grasimi);
    const carb = Number(carbohidrati);
    const fib = Number(fibre);

    if (isNaN(cal) || cal < 0 || cal > 10000) {
      return res.status(400).json({ eroare: "Caloriile trebuie să fie un număr valid între 0 și 10000." });
    }
    if (isNaN(prot) || prot < 0 || prot > 1000) {
      return res.status(400).json({ eroare: "Proteinele trebuie să fie un număr valid între 0 și 1000." });
    }
    if (isNaN(gras) || gras < 0 || gras > 1000) {
      return res.status(400).json({ eroare: "Grăsimile trebuie să fie un număr valid între 0 și 1000." });
    }
    if (isNaN(carb) || carb < 0 || carb > 2000) {
      return res.status(400).json({ eroare: "Carbohidrații trebuie să fie un număr valid între 0 și 2000." });
    }

    const insertPayload = {
      user_id: req.user.id,
      nume: nume.trim(),
      calorii: Math.round(cal),
      proteine: Math.round(prot),
      grasimi: isNaN(gras) ? 0 : Math.round(gras),
      carbohidrati: isNaN(carb) ? 0 : Math.round(carb),
      fibre: isNaN(fib) ? 0 : Math.round(fib),
      tip_masa: tip_masa && ['mic_dejun', 'pranz', 'cina', 'gustare'].includes(tip_masa) ? tip_masa : 'gustare',
      alimente: Array.isArray(alimente) ? alimente.slice(0, 100) : [],
      // Validare format data (YYYY-MM-DD) si ora (HH:MM)
      data: /^\d{4}-\d{2}-\d{2}$/.test(String(data || '')) ? data : null,
      ora: /^\d{2}:\d{2}(:\d{2})?$/.test(String(ora || '')) ? ora : null,
    };

    // Folosim supabaseAdmin — user_id validat de requireAuth.
    const { data: result, error } = await supabaseAdmin
      .from('mese')
      .insert([insertPayload])
      .select();
    // Nu expunem erori Postgres catre client.
    if (error) {
      console.error('Eroare DB inserare masă:', error.message);
      return res.status(500).json({ eroare: 'Eroare la adăugarea mesei. Încearcă din nou.' });
    }
    res.json({ succes: true, masa: result?.[0] || null });
  } catch (error) {
    res.status(500).json({ eroare: "Eroare la adăugarea mesei." });
  }
});

// ==========================================
// HANDLER 404 PENTRU RUTE INEXISTENTE
// ==========================================
app.use((req, res, next) => {
  res.status(404).json({ eroare: "Ruta solicitată nu există (404)." });
});

// ==========================================
// HANDLER GLOBAL DE ERORI
// ==========================================
app.use((err, req, res, next) => {
  const message = err?.message || '';
  console.error("Eroare globală:", message);
  // Verificam codul erorii INAINTE de instanceof.
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ eroare: "Fișierul este prea mare. Limita este 5MB." });
  }
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ eroare: message });
  }
  if (message.includes('Tip fișier nepermis')) {
    return res.status(400).json({ eroare: message });
  }
  res.status(500).json({ eroare: "Eroare internă a serverului." });
});

// Export pentru teste
module.exports = app;

// ==========================================
// KEEP-ALIVE TICKER (MENTINERE SERVER ONLINE)
// Previne adormirea instanței pe platforme ca Render, Railway sau Heroku
// ==========================================
const startKeepAliveTicker = (serverPort) => {
  const intervalMinutes = parseFloat(process.env.KEEP_ALIVE_INTERVAL_MINUTES) || 10;
  const intervalMs = intervalMinutes * 60 * 1000;
  // Adaugam /health automat la URL-ul de keep-alive.
  const baseUrl = process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL;
  const targetUrl = baseUrl
    ? `${baseUrl.replace(/\/+$/, '')}${/\/health\/?$/.test(baseUrl) ? '' : '/health'}`
    : `http://127.0.0.1:${serverPort}/health`;

  console.log(`⏱️ Keep-Alive Ticker activat: Ping automat către ${targetUrl} la fiecare ${intervalMinutes} minute.`);

  const ticker = setInterval(async () => {
    try {
      const res = await fetch(targetUrl);
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        console.log(`[${new Date().toLocaleTimeString('ro-RO')}] 💓 Keep-Alive Ticker: Server activ (${res.status} OK). Timestamp: ${data.timestamp || 'N/A'}`);
      } else {
        console.warn(`[${new Date().toLocaleTimeString('ro-RO')}] ⚠️ Keep-Alive Ticker: Răspuns neașteptat (${res.status})`);
      }
    } catch (err) {
      console.error(`[${new Date().toLocaleTimeString('ro-RO')}] ❌ Keep-Alive Ticker Eroare:`, err.message);
    }
  }, intervalMs);

  if (ticker.unref) {
    ticker.unref();
  }
  
  return ticker;
};

// Pornire server doar dacă fișierul este rulat direct (nu importat în teste)
if (require.main === module) {
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Serverul securizat rulează pe http://0.0.0.0:${port}`);
    startKeepAliveTicker(port);
  });

  // Graceful shutdown: cererile in curs se finalizeaza.
  const shutdown = (signal) => {
    console.log(`${signal} primit — inchid serverul elegant...`);
    server.close(() => {
      console.log('Server inchis.');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}