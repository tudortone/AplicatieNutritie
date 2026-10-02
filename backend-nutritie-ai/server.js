'use strict';

// Sentry trebuie inițializat înainte ca Express (direct sau prin routere) să fie
// încărcat; altfel integrarea nu poate instrumenta cererile și tranzacțiile.
const Sentry = require('@sentry/node');
const { incarcaConfig } = require('./config/env');
const {
  scrubbedBreadcrumb,
  scrubSentryEvent,
  rezumatEroareSigur,
} = require('./utils/sentrySanitize');

const config = incarcaConfig();

if (config.sentryDsn) {
  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.NODE_ENV,
    tracesSampleRate: config.esteProductie ? 0.1 : 1.0,
    sendDefaultPii: false,
    beforeSend: scrubSentryEvent,
    beforeBreadcrumb(crumb) {
      if (crumb?.category === 'console') return null;
      return scrubbedBreadcrumb(crumb);
    },
  });
  console.log('Sentry Node.js configurat cu succes');
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');
const os = require('os');
const ImageKit = require('imagekit');
const { tasks } = require('@trigger.dev/sdk/v3');

const { creeazaLimitatoare, ipFallbackKey } = require('./utils/rateLimit');
const rateLimit = require('express-rate-limit');
const { rezolvaIdentitate, EroareIdentitate } = require('./utils/identitate');
const { callWithTimeout } = require('./utils/httpTimeout');
const { Semafor } = require('./utils/semafor');
const { creeazaContextDate, EroareContextDate, getStatisticiClientDate } = require('./utils/clientUtilizator');
const { idempotencyMiddleware, idempotencyMiddlewareCritic } = require('./utils/idempotency');
const { creeazaCheckAiUsageQuota } = require('./utils/aiUsageQuota');
const createGdprRouter = require('./routes/gdpr');
const createStatusRouter = require('./routes/status');
const createAiRouter = require('./routes/ai');
const createBarcodeRouter = require('./routes/barcode');
const createProfilRouter = require('./routes/profil');
const createMeseRouter = require('./routes/mese');
const createUserRouter = require('./routes/user');
const createBillingGoogleRouter = require('./routes/billingGoogle');
const createPhotoFlowRouter = require('./routes/photoFlow');
const createRewardedRouter = require('./routes/rewarded');
const createGooglePlayWebhookRouter = require('./routes/webhooksGooglePlay');
const createWebhooksRouter = require('./routes/webhooks');
const createMeseRepo = require('./repositories/meseRepo');
const createBarcodeRepo = require('./repositories/barcodeRepo');
const createProfilRepo = require('./repositories/profilRepo');
const { createGoogleBillingRepo } = require('./repositories/googleBillingRepo');
const { createFlowCreditsRepo } = require('./repositories/flowCreditsRepo');
const { createPhotoJobsRepo } = require('./repositories/photoJobsRepo');
const { createRewardedRepo } = require('./repositories/rewardedRepo');
const { creeazaStoreRateLimit, creeazaRegistruCheiValori } = require('./utils/storePartajat');
const { createDistributedAdmission } = require('./utils/distributedAdmission');
const { getAiStatistici } = require('./utils/metrics');
const { sanitizeRequest } = require('./utils/sanitize');
const { creeazaServiciuVision } = require('./services/ai/vision');
const { creeazaServiciuCascada } = require('./services/ai/cascada');
const { creeazaServiciuChat } = require('./services/ai/chat');
const { createFlowCreditsService } = require('./services/monetization/flowCreditsService');
const { createPhotoJobService } = require('./services/ai/photoJobService');
const { createRewardedService } = require('./services/monetization/rewardedService');
const {
  createGoogleAccessTokenProvider,
  createGooglePlayPublisher,
} = require('./services/billing/googlePlayPublisher');
const { createGoogleBillingService } = require('./services/billing/googleBillingService');
const { createGooglePubsubVerifier } = require('./utils/googlePubsubAuth');
const { createGoogleBillingWorker } = require('./utils/googleBillingWorker');
const { createAdmobSsvVerifier } = require('./utils/admobSsv');
const {
  createGooglePlayIntegrityDecoder,
  createPlayIntegrityGuard,
  createPlayIntegrityVerifier,
} = require('./utils/playIntegrity');

process.on('unhandledRejection', (motiv) => {
  console.error('[Proces] Promisiune respinsa netratata:', rezumatEroareSigur(motiv, { operation: 'unhandled_rejection' }));
  if (config.sentryDsn) Sentry.captureException(motiv);
});

process.on('uncaughtException', (eroare) => {
  console.error('[Proces] Exceptie netratata:', rezumatEroareSigur(eroare, { operation: 'uncaught_exception' }));
  if (config.sentryDsn) Sentry.captureException(eroare);
  if (config.esteProductie) setTimeout(() => process.exit(1), 1000).unref();
});

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
// trust proxy = 1: Render termina TLS/proxy in fata aplicatiei, deci req.ip citeste
// adresa reala a clientului din X-Forwarded-For (necesar pentru rate-limiting pe IP).
// ATENTIE: sigur DOAR in spatele unui proxy. Daca serverul ar fi expus direct la
// internet (fara proxy), X-Forwarded-For ar fi spoofabil si limitele per-IP ar fi
// ocolite prin rotirea unor IP-uri false — nu expune portul direct.
app.set('trust proxy', 1);
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: config.cors.permiteOrice ? true : config.cors.origini,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  // P1-12: `X-Payload-Fingerprint` transporta amprenta de continut pentru cererile
  // multipart (analiza foto), unde corpul nu e parsat inca la momentul verificarii
  // de idempotenta. Fara el in allowlist, preflight-ul CORS al build-ului web ar
  // bloca antetul si analiza foto ar ramane fara protectie la replay.
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Idempotency-Key',
    'X-Payload-Fingerprint',
    'X-Play-Integrity',
    'X-Play-Integrity-Request-Hash',
  ],
  exposedHeaders: ['Idempotency-Status', 'Retry-After', 'X-AI-Quota-Remaining', 'X-Protectie-RLS', 'X-Credite-Ramase'],
}));
// S4-06: fara timeout pe apelurile Supabase, o partitie de retea sau GoTrue
// agatat blocheaza cererea pana la default-ul Node (~300s). Wrapper global cu
// AbortSignal.timeout(10000); daca supabase-js furnizeaza deja un signal, il
// combina cu timeout-ul (AbortSignal.any, disponibil din Node 20.3).
const fetchCuTimeoutSupabase = (input, init = {}) => {
  const semnalCombinat = init.signal
    ? AbortSignal.any([init.signal, AbortSignal.timeout(10000)])
    : AbortSignal.timeout(10000);
  return fetch(input, { ...init, signal: semnalCombinat });
};
const supabase = createClient(config.supabase.url, config.supabase.anonKey, { global: { fetch: fetchCuTimeoutSupabase } });
const supabaseAdmin = createClient(config.supabase.url, config.supabase.serviceRoleKey, { global: { fetch: fetchCuTimeoutSupabase } });
const googleBillingRepo = createGoogleBillingRepo({ supabaseAdmin });
const flowCreditsService = createFlowCreditsService({
  repo: createFlowCreditsRepo({
    supabaseAdmin,
    dailyLimit: config.flowCredits.dailyLimit,
    rewardLimit: config.flowCredits.rewardedDailyLimit,
    premiumFairUse: config.flowCredits.premiumDailyFairUse,
  }),
});
const rewardedService = createRewardedService({
  repo: createRewardedRepo({
    supabaseAdmin,
    dailyLimit: config.flowCredits.rewardedDailyLimit,
  }),
  flowCredits: flowCreditsService,
});
const googleBillingService = createGoogleBillingService({
  publisher: createGooglePlayPublisher({
    packageName: config.googlePlay.packageName,
    getAccessToken: createGoogleAccessTokenProvider(),
  }),
  repo: googleBillingRepo,
  allowedProductIds: config.googlePlay.productIds,
  allowedCreditProductIds: config.googlePlay.creditProductIds,
  flowCredits: flowCreditsService,
});
const photoJobService = createPhotoJobService({
  repo: createPhotoJobsRepo({ supabaseAdmin }),
  flowCredits: flowCreditsService,
  tasks,
  billing: googleBillingService,
});
const playIntegrityGuard = config.playIntegrity.mode === 'off'
  ? createPlayIntegrityGuard({ mode: 'off' })
  : createPlayIntegrityGuard({
    mode: config.playIntegrity.mode,
    verifier: createPlayIntegrityVerifier({
      packageName: config.playIntegrity.packageName,
      decodeToken: createGooglePlayIntegrityDecoder({ packageName: config.playIntegrity.packageName }),
    }),
  });
const checkAiUsageQuota = creeazaCheckAiUsageQuota({ supabaseAdmin, billingService: googleBillingService });
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
const webhooksGooglePlayR = createGooglePlayWebhookRouter({
  verifier: createGooglePubsubVerifier({
    audience: config.googlePlay.pubsubAudience,
    serviceAccountEmail: config.googlePlay.pubsubServiceAccountEmail,
  }),
  repo: googleBillingRepo,
  billingService: googleBillingService,
  googlePlayConfig: config.googlePlay,
});
app.use('/api/v1/webhooks', webhooksLimiter);
app.use('/api/v1/webhooks/google-play', webhooksGooglePlayR);
app.use('/api/v1/webhooks', webhooksR);
app.use('/api/webhooks', webhooksLimiter);
app.use('/api/webhooks/google-play', webhooksGooglePlayR);
app.use('/api/webhooks', webhooksR);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(sanitizeRequest);

// Normalizare URL: elimina slashes duble, prefixe /api/api sau /v1/v1 duplicat.
// P-10: trebuie sa ruleze INAINTE de idempotency — cheia de idempotenta se
// construieste din req.originalUrl, iar o cale bruta (//api/v1/... sau
// /api/api/...) ar crea un namespace divergent si ar eluda dedup-ul pe aceeasi
// Idempotency-Key. originalUrl se sincronizeaza cu url-ul normalizat.
// M-09: normalizarea se aplica DOAR pe pathname, query-ul ramane intact. Inainte,
// `req.url.replace(/\/{2,}/g, '/')` se aplica pe tot URL-ul, inclusiv pe query
// (?url=a//b devenea ?url=a/b) — strica parametrii. Se normalizeaza doar partea
// dinaintea primului '?' si se reconstruieste cale + cautare.
app.use((req, res, next) => {
  if (req.url) {
    const indexSemnIntrebare = req.url.indexOf('?');
    const cale = indexSemnIntrebare === -1 ? req.url : req.url.slice(0, indexSemnIntrebare);
    const cautare = indexSemnIntrebare === -1 ? '' : req.url.slice(indexSemnIntrebare);
    let caleCurata = cale.replace(/\/{2,}/g, '/');
    caleCurata = caleCurata.replace(/^\/api\/api\//i, '/api/');
    caleCurata = caleCurata.replace(/^\/api\/v1\/api\/v1\//i, '/api/v1/');
    caleCurata = caleCurata.replace(/^\/api\/v1\/api\//i, '/api/v1/');
    const curat = caleCurata + cautare;
    if (curat !== req.url) {
      req.url = curat;
      req.originalUrl = curat;
    }
  }
  next();
});

app.use(idempotencyMiddleware);

const storePartajat = creeazaStoreRateLimit({ url: config.redisUrl });
const { preAuthLimiter, generalLimiter, statusLimiter, aiLimiter, healthLimiter, billingLimiter } = creeazaLimitatoare({
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

const semaforAi = new Semafor({ max: config.ai.maxConcurenta, maxCoada: config.ai.maxCoada });

const requireAuth = async (req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ eroare: 'Acces neautorizat. Token lipsă.' });
  }

  const token = authHeader.slice(7);
  req.tokenBrut = token;

  try {
    const utilizator = await rezolvaIdentitate({
      token,
      supabase,
    });
    req.user = utilizator;
    return next();
  } catch (err) {
    if (err instanceof EroareIdentitate) {
      return res.status(err.status).json({ eroare: err.message, cod: err.cod });
    }
    console.error('[Auth] Eroare neasteptata:', rezumatEroareSigur(err, { operation: 'auth_resolve' }));
    return res.status(503).json({ eroare: 'Serviciul de autentificare este indisponibil.' });
  }
};

function contextDate(req, res) {
  if (!req._ctxDate) {
    req._ctxDate = creeazaContextDate({
      config,
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
const chatAdmission = createDistributedAdmission({
  url: config.redisUrl,
  globalLimit: config.ai.chatGlobalConcurrency,
  ttlMs: 60_000,
});

app.get('/', (_req, res) => {
  res.json({
    status: 'OK',
    service: 'NutriAI Secure Backend',
    version: '2.5.0-audit',
    timestamp: new Date().toISOString(),
  });
});
// S4-01: /health face acum un ping real catre Supabase (readiness), nu doar
// versiunea statica. Daca PostgREST/Supabase sunt jos, fetch-ul prin wrapper-ul
// fetchCuTimeoutSupabase (S4-06, 10s) arunca si raspundem 503. Runda de tabele
// de sanatate este aleasa ca sa nu depinda de date: intereseaza doar ca reteaua
// si PostgREST raspund; eroarea de tabel inexistent este ignorata.
app.get('/health', healthLimiter, async (_req, res) => {
  try {
    await supabase.from('health_check').select('*').maybeSingle();
    res.status(200).json({
      status: 'ok',
      healthy: true,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({
      status: 'degradat',
      healthy: false,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  }
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
  chatAdmission,
  idempotencyCritic: idempotencyMiddlewareCritic,
  supabaseAdmin,
});
const barcodeR = createBarcodeRouter({
  requireAuth,
  generalLimiter,
  aiLimiter,
  checkAiUsageQuota,
  contextDate,
  config,
  barcodeRepo: createBarcodeRepo({ supabaseAdmin }),
  // P1-12: zălogul atomic pentru fallback-ul AI de barcode. Aceeași infrastructură
  // partajată ca idempotența (Redis `SET NX`), cu prefix separat ca spațiile de
  // chei ale celor două tipuri de operații să nu se ciocnească.
  registruClaim: creeazaRegistruCheiValori({ url: config.redisUrl, prefix: 'nutri:barcode-ai' }),
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
  contextDate,
  profilRepo: createProfilRepo(),
  billingService: googleBillingService,
});
const billingGoogleR = createBillingGoogleRouter({
  requireAuth,
  billingLimiter,
  billingService: googleBillingService,
  googlePlayConfig: config.googlePlay,
  integrityGuard: playIntegrityGuard,
});
const photoFlowR = createPhotoFlowRouter({
  requireAuth,
  aiLimiter,
  generalLimiter,
  photoJobs: photoJobService,
  flowCredits: flowCreditsService,
  contextDate,
  config,
  imagekit,
  integrityGuard: playIntegrityGuard,
});
const rewardedR = createRewardedRouter({
  requireAuth,
  generalLimiter,
  rewardedService,
  integrityGuard: playIntegrityGuard,
  verifier: createAdmobSsvVerifier({
    expectedAdUnit: config.admob.rewardedAdUnitId,
    expectedRewardAmount: config.admob.rewardedAmount,
    expectedRewardItem: config.admob.rewardedItem,
  }),
});
const statusR = createStatusRouter({
  getProviderStatus: serviciuCascada.getProviderStatus,
  getAiStatistici,
  getStatisticiClientDate,
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
app.use('/api/v1', photoFlowR);
app.use('/api/v1', rewardedR);
app.use('/api/v1', barcodeR);
app.use('/api/v1', profilR);
app.use('/api/v1', meseR);
app.use('/api/v1/user', gdprR);
app.use('/api/v1/user', userR);
app.use('/api/v1/billing/google', billingGoogleR);

// P-19: /api = prefix deprecat, anunțat cu Sunset + Deprecation
// Clientul (lib/api.ts) construiește deja URL-uri cu /api/v1.
// Prefixul /api rămâne activ până la 2026-09-30 pentru compatibilitate.
app.use('/api', (req, res, next) => {
  // M-20: /api/v1 e calea canonica — nu i se aplica antetele de deprecation.
  // Altfel un 404 pe /api/v1/... ar capata Sunset+Deprecation+Link-catre-sine.
  if (req.path === '/v1' || req.path.startsWith('/v1/')) return next();
  res.setHeader('Sunset', 'Wed, 30 Sep 2026 00:00:00 GMT');
  res.setHeader('Deprecation', 'true');
  res.setHeader('Link', '</api/v1>; rel="successor-version"');
  next();
});
app.use('/api', statusR);
app.use('/api', aiR);
app.use('/api', photoFlowR);
app.use('/api', rewardedR);
app.use('/api', barcodeR);
app.use('/api', profilR);
app.use('/api', meseR);
app.use('/api/user', gdprR);
app.use('/api/user', userR);
app.use('/api/billing/google', billingGoogleR);

app.use((_req, res) => {
  res.status(404).json({ eroare: 'Ruta solicitată nu există (404).' });
});

Sentry.setupExpressErrorHandler(app);
app.use((err, _req, res, _next) => {
  const message = err?.message || '';
  console.error('Eroare globala:', rezumatEroareSigur(err, { operation: 'express_error' }));
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ eroare: 'Fișierul este prea mare. Limita este 5MB.' });
  }
  // CHAT-007: corp JSON/urlencoded peste limita express.json (1MB) arunca
  // `entity.too.large`; fara aceasta ramura cadea pe 500 generic in loc de 413.
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ eroare: 'Corpul cererii depășește limita (1MB).' });
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
      console.error('Keep-Alive eroare:', rezumatEroareSigur(err, { operation: 'keep_alive' }));
    }
  }, intervalMs);
  if (ticker.unref) ticker.unref();
  return ticker;
}

if (require.main === module) {
  const billingWorker = createGoogleBillingWorker({
    billingService: googleBillingService,
    onError: (error) => {
      console.error('[Google billing worker]', rezumatEroareSigur(error, { operation: 'billing_acknowledgement', provider: 'google_play' }));
      if (config.sentryDsn) Sentry.captureException(error);
    },
  });
  console.log('[Google billing] Worker acknowledgement activ, interval 1 minut.');

  if (process.env.GDPR_WORKER_ACTIV === '1') {
    const { reiaStergerileBlocate } = require('./utils/gdprWorker');
    const tickerGdpr = setInterval(() => {
      reiaStergerileBlocate({ supabaseAdmin, config }).catch((e) =>
        console.error('[GDPR worker]', rezumatEroareSigur(e, { operation: 'gdpr_retry' })));
    }, 5 * 60 * 1000);
    if (tickerGdpr.unref) tickerGdpr.unref();
    console.log('[GDPR] Worker de reluare activ, interval 5 minute.');
  } else {
    console.log('[GDPR] Worker de reluare inactiv (GDPR_WORKER_ACTIV != 1).');
  }

  // H3: reconcilierea creditelor e activă implicit (nu necesita flag), pentru ca
  // lansarea backend-ului să protejeze automat banii. Poate fi dezactivată cu
  // CREDIT_RECONCILE_ACTIV=0. Restituie doar debite orfane (crash-window) —
  // mutare în favoarea utilizatorului, deci default-on e sigur.
  if (process.env.CREDIT_RECONCILE_ACTIV !== '0') {
    const { reconciliaCrediteConsumate } = require('./utils/reconcileCredite');
    const tickerReconcile = setInterval(() => {
      reconciliaCrediteConsumate({ supabaseAdmin }).catch((e) =>
        console.error('[Reconciliere credite]', rezumatEroareSigur(e, { operation: 'reconcile_credits' })));
    }, 15 * 60 * 1000);
    if (tickerReconcile.unref) tickerReconcile.unref();
    console.log('[Credite] Worker reconciliere activ, interval 15 minute.');
  } else {
    console.log('[Credite] Worker reconciliere inactiv (CREDIT_RECONCILE_ACTIV=0).');
  }

  const server = app.listen(config.port, config.host, () => {
    console.log(`Serverul securizat ruleaza pe ${config.host}:${config.port}`);
    startKeepAliveTicker();
  });
  // S4-06: timeout la nivel de socket — o cerere ramasa in aer (provider AI
  // care nu raspunde, DB agatat) nu tine conexiunea deschisa la nesfarsit.
  // G4: bugetul AI (cascada de furnizori, 30s per apel, plafonat la
  // maxApeluriPerRequest=8) poate atinge ~4 min in cel mai rau caz legitim. La 25s
  // se distrugea socket-ul pe o analiza lenta dar valida. Acoperim intregul buget;
  // fiecare apel de furnizor se auto-intrerupe la 30s, deci cererea nu ramane
  // blocata la nesfarsit.
  server.timeout = 300000;
  const shutdown = (signal) => {
    console.log(`${signal} primit - inchid serverul elegant...`);
    billingWorker.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
