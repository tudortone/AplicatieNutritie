'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');
const os = require('os');
const crypto = require('crypto');
const Sentry = require('@sentry/node');
const ImageKit = require('imagekit');
const { tasks } = require('@trigger.dev/sdk/v3');

const { incarcaConfig } = require('./config/env');
const { creeazaLimitatoare, ipFallbackKey } = require('./utils/rateLimit');
const rateLimit = require('express-rate-limit');
const { TokenCache } = require('./utils/tokenCache');
const { rezolvaIdentitate, EroareIdentitate } = require('./utils/identitate');
const { callWithTimeout } = require('./utils/httpTimeout');
const { Semafor } = require('./utils/semafor');
const { creeazaContextDate, EroareContextDate } = require('./utils/clientUtilizator');
const { idempotencyMiddleware, idempotencyMiddlewareCritic } = require('./utils/idempotency');
const { checkAiUsageQuota } = require('./utils/aiUsageQuota');
const createGdprRouter = require('./routes/gdpr');
const createStatusRouter = require('./routes/status');
const createAiRouter = require('./routes/ai');
const createBarcodeRouter = require('./routes/barcode');
const createProfilRouter = require('./routes/profil');
const createMeseRouter = require('./routes/mese');
const createUserRouter = require('./routes/user');
const createWebhooksRouter = require('./routes/webhooks');
const createWebhooksRevenueCatRouter = require('./routes/webhooksRevenueCat');
const createMeseRepo = require('./repositories/meseRepo');
const createBarcodeRepo = require('./repositories/barcodeRepo');
const createProfilRepo = require('./repositories/profilRepo');
const { creeazaStoreRateLimit, creeazaRegistruCheiValori } = require('./utils/storePartajat');
const { getAiStatistici } = require('./utils/metrics');
const { sanitizeRequest } = require('./utils/sanitize');
const { creeazaServiciuVision } = require('./services/ai/vision');
const { creeazaServiciuCascada } = require('./services/ai/cascada');
const { creeazaServiciuChat } = require('./services/ai/chat');

const config = incarcaConfig();

function rezumatEroare(eroare) {
  return {
    cod: eroare?.code ?? eroare?.name ?? 'NECUNOSCUT',
    nume: eroare?.name ?? 'Necunoscut',
    mesaj: String(eroare?.message ?? '').slice(0, 200),
  };
}

process.on('unhandledRejection', (motiv) => {
  console.error('[Proces] Promisiune respinsa netratata:', rezumatEroare(motiv));
  if (config.sentryDsn) Sentry.captureException(motiv);
});

process.on('uncaughtException', (eroare) => {
  console.error('[Proces] Exceptie netratata:', rezumatEroare(eroare));
  if (config.sentryDsn) Sentry.captureException(eroare);
  if (config.esteProductie) setTimeout(() => process.exit(1), 1000).unref();
});

const JWT_RE = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const BEARER_RE = /Bearer\s+\S+/gi;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE = /(?:\+?\d[\s().-]*){9,15}/g;
function redacteazaPii(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(JWT_RE, '[REDACTED_JWT]')
    .replace(BEARER_RE, '[REDACTED_BEARER]')
    .replace(EMAIL_RE, '[REDACTED_EMAIL]')
    .replace(PHONE_RE, '[REDACTED_PHONE]');
}

if (config.sentryDsn) {
  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.NODE_ENV,
    tracesSampleRate: config.esteProductie ? 0.1 : 1.0,
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.message) event.message = redacteazaPii(event.message);
      if (event.request) {
        event.request.data = '[SCRUBBED_PII]';
        event.request.headers = {};
        if (event.request.url) event.request.url = event.request.url.split('?')[0];
      }
      event.user = undefined;
      if (event.extra) event.extra = { redacted: true };
      if (event.contexts) event.contexts = {};
      if (Array.isArray(event.breadcrumbs)) {
        event.breadcrumbs = event.breadcrumbs.slice(-50).map((crumb) => {
          const message = typeof crumb.message === 'string'
            ? redacteazaPii(crumb.message).slice(0, 200)
            : crumb.message;
          return {
            ...crumb,
            data: crumb.data ? { redacted: true } : undefined,
            message,
          };
        });
      }
      return event;
    },
  });
  console.log('Sentry Node.js configurat cu succes');
}

let imagekit = null;
if (config.imagekit.publicKey && config.imagekit.privateKey && config.imagekit.urlEndpoint) {
  imagekit = new ImageKit({
    publicKey: config.imagekit.publicKey,
    privateKey: config.imagekit.privateKey,
    urlEndpoint: config.imagekit.urlEndpoint,
  });
  console.log('ImageKit SDK initializat cu succes');
}

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: config.cors.permiteOrice ? true : config.cors.origini,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  exposedHeaders: ['Idempotency-Status', 'Retry-After', 'X-AI-Quota-Remaining', 'X-Protectie-RLS'],
}));
const supabase = createClient(config.supabase.url, config.supabase.anonKey);
const supabaseAdmin = createClient(config.supabase.url, config.supabase.serviceRoleKey);
// P-012: limitator dedicat webhook-urilor (Clerk/Svix). Se monteaza pe calea
// webhook-urilor INAINTE de router (si INAINTE de preAuthLimiter, care altfel nu
// se aplica), ca burst-urile legitime Clerk sa treaca dar traficul evadat sa fie
// blocat (600 req/min/IP, MemoryStore per proces).
const webhooksLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  keyGenerator: ipFallbackKey,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  message: { eroare: 'Prea multe cereri webhook. Incearca mai tarziu.' },
});

// PR1-backend: webhook-urile (Clerk/Svix) sunt montate ÎNAINTE de body-parse,
// ca Svix sa prime bytes-urile brute netransformate. O singura periere webhooksR.
const webhooksR = createWebhooksRouter({ supabaseAdmin, config });
const webhooksRevenueCatR = createWebhooksRevenueCatRouter({ supabaseAdmin, config });
app.use('/api/v1/webhooks', webhooksLimiter);
app.use('/api/v1/webhooks', webhooksR);
app.use('/api/v1/webhooks/revenuecat', webhooksLimiter);
app.use('/api/v1/webhooks/revenuecat', webhooksRevenueCatR);
app.use('/api/webhooks', webhooksLimiter);
app.use('/api/webhooks', webhooksR);
app.use('/api/webhooks/revenuecat', webhooksLimiter);
app.use('/api/webhooks/revenuecat', webhooksRevenueCatR);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(sanitizeRequest);
app.use(idempotencyMiddleware);

// Normalizare URL: elimina slashes duble, prefixe /api/api sau /v1/v1 duplicat
app.use((req, res, next) => {
  if (req.url) {
    let cleanUrl = req.url.replace(/\/{2,}/g, '/');
    cleanUrl = cleanUrl.replace(/^\/api\/api\//i, '/api/');
    cleanUrl = cleanUrl.replace(/^\/api\/v1\/api\/v1\//i, '/api/v1/');
    cleanUrl = cleanUrl.replace(/^\/api\/v1\/api\//i, '/api/v1/');
    if (cleanUrl !== req.url) {
      req.url = cleanUrl;
    }
  }
  next();
});

const storePartajat = creeazaStoreRateLimit({ url: config.redisUrl });
const { preAuthLimiter, generalLimiter, statusLimiter, aiLimiter } = creeazaLimitatoare({
  store: storePartajat?.store,
  avertizeazaFaraStore: config.esteProductie,
});

// PR1-backend: statusLimiter nu mai e aplicat global pe /ai-status in server.js,
// ci direct pe ruta din routes/status.js (imprenn cu requireAuth).
app.use('/api/', (req, res, next) => preAuthLimiter(req, res, next));

const EXTENSIE_MIMETYPE = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, os.tmpdir()),
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    cb(null, `nutri-${uniqueSuffix}${EXTENSIE_MIMETYPE[file.mimetype] || '.jpg'}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (Object.hasOwn(EXTENSIE_MIMETYPE, file.mimetype)) cb(null, true);
    else cb(new Error('Tip fișier nepermis. Doar imagini JPEG/PNG/WEBP sunt acceptate.'));
  },
});

const tokenCache = new TokenCache({
  maxEntries: 5000,
  ttlMs: 60 * 1000,
  cheiHashuite: true,
});
tokenCache.startSweeper();
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const semaforAi = new Semafor({ max: config.ai.maxConcurenta, maxCoada: config.ai.maxCoada });

const requireAuth = async (req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ eroare: 'Acces neautorizat. Token lipsă.' });
  }

  const token = authHeader.slice(7);
  const tokenKey = hashToken(token);
  req.tokenBrut = token;
  const utilizatorCache = tokenCache.get(tokenKey);
  if (utilizatorCache) {
    req.user = utilizatorCache;
    if (!res.headersSent) {
      res.setHeader('X-Protectie-RLS', req.user.provider === 'clerk' ? 'inactiv' : 'activ');
    }
    return next();
  }

  try {
    const utilizator = await rezolvaIdentitate({
      token,
      supabase,
      supabaseAdmin,
      clerkSecretKey: config.clerkSecretKey,
    });
    tokenCache.set(tokenKey, utilizator, { expiraLaMs: utilizator.expiraLaMs });
    req.user = utilizator;
    if (!res.headersSent) {
      res.setHeader('X-Protectie-RLS', utilizator.provider === 'clerk' ? 'inactiv' : 'activ');
    }
    return next();
  } catch (err) {
    if (err instanceof EroareIdentitate) {
      return res.status(err.status).json({ eroare: err.message, cod: err.cod });
    }
    console.error('[Auth] Eroare neasteptata:', rezumatEroare(err).cod);
    return res.status(503).json({ eroare: 'Serviciul de autentificare este indisponibil.' });
  }
};

function contextDate(req, res) {
  if (!req._ctxDate) {
    req._ctxDate = creeazaContextDate({
      config,
      supabaseAdmin,
      token: req.tokenBrut,
      userId: req.user.id,
      sursaToken: req.user.provider,
    });
    if (res && !res.headersSent) {
      res.setHeader('X-Protectie-RLS', req._ctxDate.modAdmin ? 'inactiv' : 'activ');
    }
  }
  return req._ctxDate;
}

const genAI = new GoogleGenerativeAI(config.ai.geminiApiKey);
const registruAi = creeazaRegistruCheiValori({ url: config.redisUrl, prefix: 'nutri:ai' });
const serviciuVision = creeazaServiciuVision({ config });
const serviciuCascada = creeazaServiciuCascada({ config, registruAi });
const serviciuChat = creeazaServiciuChat({ config, genAI });

app.get('/', (_req, res) => {
  res.json({
    status: 'OK',
    service: 'NutriAI Secure Backend',
    version: '2.5.0-audit',
    timestamp: new Date().toISOString(),
  });
});
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    healthy: true,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

const aiR = createAiRouter({
  requireAuth,
  aiLimiter,
  generalLimiter,
  upload,
  checkAiUsageQuota,
  imagekit,
  tasks,
  config,
  serviciuVision,
  serviciuCascada,
  serviciuChat,
  semaforAi,
  idempotencyCritic: idempotencyMiddlewareCritic,
});
const barcodeR = createBarcodeRouter({
  requireAuth,
  generalLimiter,
  contextDate,
  barcodeRepo: createBarcodeRepo(),
});
const profilR = createProfilRouter({ requireAuth, generalLimiter, config });
const meseR = createMeseRouter({
  requireAuth,
  generalLimiter,
  contextDate,
  meseRepo: createMeseRepo(),
});
const userR = createUserRouter({
  requireAuth,
  generalLimiter,
  config,
  contextDate,
  profilRepo: createProfilRepo(),
});
const statusR = createStatusRouter({
  getProviderStatus: serviciuCascada.getProviderStatus,
  getAiStatistici,
  requireAuth,
  statusLimiter,
});
const gdprR = createGdprRouter({
  requireAuth,
  generalLimiter,
  supabaseAdmin,
  contextDate,
  profilRepo: createProfilRepo(),
});
// /api/v1 = prefix canonic
app.use('/api/v1', statusR);
app.use('/api/v1', aiR);
app.use('/api/v1', barcodeR);
app.use('/api/v1', profilR);
app.use('/api/v1', meseR);
app.use('/api/v1/user', gdprR);
app.use('/api/v1/user', userR);

// P-19: /api = prefix deprecat, anunțat cu Sunset + Deprecation
// Clientul (lib/api.ts) construiește deja URL-uri cu /api/v1.
// Prefixul /api rămâne activ până la 2026-09-30 pentru compatibilitate.
app.use('/api', (req, res, next) => {
  res.setHeader('Sunset', 'Wed, 30 Sep 2026 00:00:00 GMT');
  res.setHeader('Deprecation', 'true');
  res.setHeader('Link', '</api/v1>; rel="successor-version"');
  next();
});
app.use('/api', statusR);
app.use('/api', aiR);
app.use('/api', barcodeR);
app.use('/api', profilR);
app.use('/api', meseR);
app.use('/api/user', gdprR);
app.use('/api/user', userR);

app.use((_req, res) => {
  res.status(404).json({ eroare: 'Ruta solicitată nu există (404).' });
});

Sentry.setupExpressErrorHandler(app);
app.use((err, _req, res, _next) => {
  const message = err?.message || '';
  console.error('Eroare globala:', rezumatEroare(err).cod);
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ eroare: 'Fișierul este prea mare. Limita este 5MB.' });
  }
  if (err instanceof multer.MulterError || message.includes('Tip fișier nepermis')) {
    return res.status(400).json({ eroare: message });
  }
  if (err instanceof EroareContextDate) {
    return res.status(err.status).json({ eroare: 'Serviciul de date este indisponibil.' });
  }
  return res.status(500).json({ eroare: 'Eroare internă a serverului.' });
});

module.exports = app;

function startKeepAliveTicker() {
  const baseUrl = config.keepAlive.url;
  if (!baseUrl) {
    console.log('Keep-Alive dezactivat (KEEP_ALIVE_URL / RENDER_EXTERNAL_URL nesetate).');
    return null;
  }
  const intervalMs = config.keepAlive.intervalMinute * 60 * 1000;
  const targetUrl = `${baseUrl.replace(/\/+$/, '')}${/\/health\/?$/.test(baseUrl) ? '' : '/health'}`;
  const ticker = setInterval(async () => {
    try {
      const raspuns = await callWithTimeout((signal) => fetch(targetUrl, { signal }), 10000);
      if (!raspuns.ok) console.warn(`Keep-Alive: raspuns neasteptat (${raspuns.status})`);
    } catch (err) {
      console.error('Keep-Alive eroare:', rezumatEroare(err).cod);
    }
  }, intervalMs);
  if (ticker.unref) ticker.unref();
  return ticker;
}

if (require.main === module) {
  const server = app.listen(config.port, config.host, () => {
    console.log(`Serverul securizat ruleaza pe ${config.host}:${config.port}`);
    startKeepAliveTicker();
  });
  const shutdown = (signal) => {
    console.log(`${signal} primit - inchid serverul elegant...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
