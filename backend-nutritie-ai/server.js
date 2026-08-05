'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const Sentry = require('@sentry/node');
// FIX: pachetul `imagekit` v6 are getAuthenticationParameters(); `@imagekit/nodejs` v7
// e doar un client REST si arunca "getAuthenticationParameters is not a function",
// deci /api/imagekit-auth esua mereu cu 500 indiferent de chei.
const ImageKit = require('imagekit');
const { tasks } = require('@trigger.dev/sdk/v3');

// Audit securitate: modulele reparate pentru C1 (rate limit), C2/C3 (barcode),
// C4 (identitate), C6 (token cache). Detalii in backend-nutritie-ai/PATCH-CRITIC.md.
// Auditul din 2026-08 a adaugat: config validata, deadline-uri reale, semafor de
// concurenta, parsare JSON unificata, validare partajata a meselor si tratarea
// intregului input controlat de client inainte de a ajunge intr-un prompt.
const { incarcaConfig } = require('./config/env');
const { creeazaLimitatoare } = require('./utils/rateLimit');
const { TokenCache } = require('./utils/tokenCache');
const { rezolvaIdentitate, EroareIdentitate } = require('./utils/identitate');
const { callWithTimeout } = require('./utils/httpTimeout');
const { Semafor } = require('./utils/semafor');
const { creeazaContextDate, EroareContextDate } = require('./utils/clientUtilizator');
const { idempotencyMiddleware } = require('./utils/idempotency');
const { checkAiUsageQuota } = require('./utils/aiUsageQuota');
const createGdprRouter = require('./routes/gdpr');
const createStatusRouter = require('./routes/status');
const createAiRouter = require('./routes/ai');
const createBarcodeRouter = require('./routes/barcode');
const createProfilRouter = require('./routes/profil');
const createMeseRouter = require('./routes/mese');
const createUserRouter = require('./routes/user');
const createMeseRepo = require('./repositories/meseRepo');
const createBarcodeRepo = require('./repositories/barcodeRepo');
const createProfilRepo = require('./repositories/profilRepo');
const { creazaStoreRateLimit, creazaRegistruCheiValori } = require('./utils/storePartajat');
const { getAiStatistici } = require('./utils/metrics');
const { sanitizeRequest } = require('./utils/sanitize');

// ETAPA 3 (B-14): serviciile AI au fost extrase din server.js in services/ai/.
// server.js le primeste ca fabrici construite aici, cu dependintele de la radacina.
const { creeazaServiciuVision } = require('./services/ai/vision');
const { creeazaServiciuCascada } = require('./services/ai/cascada');
const { creeazaServiciuChat } = require('./services/ai/chat');

// Configurarea este citita si validata o singura data, la boot. Un deploy cu
// variabile lipsa moare aici, nu la prima cerere a unui utilizator real.
const config = incarcaConfig();

// ==========================================
// PLASA DE SIGURANTA A PROCESULUI
// ==========================================
process.on('unhandledRejection', (motiv) => {
  // B-2: nu logam obiectul brut — mesajele de eroare pot contine URL-uri cu
  // parole (Redis) sau date de utilizator. Se logheaza cod/name si maxim 200
  // de caractere din mesaj.
  console.error('[Proces] Promisiune respinsa netratata:', {
    cod: motiv?.code ?? motiv?.name ?? 'NECUNOSCUT',
    nume: motiv?.name ?? 'Necunoscut',
    mesaj: String(motiv?.message ?? '').slice(0, 200),
  });
  if (config.sentryDsn) Sentry.captureException(motiv);
});

process.on('uncaughtException', (eroare) => {
  // B-2: aceeasi restrangere ca la unhandledRejection.
  console.error('[Proces] Exceptie netratata:', {
    cod: eroare?.code ?? eroare?.name ?? 'NECUNOSCUT',
    nume: eroare?.name ?? 'Necunoscut',
    mesaj: String(eroare?.message ?? '').slice(0, 200),
  });
  if (config.sentryDsn) Sentry.captureException(eroare);
  // O exceptie necapturata lasa procesul intr-o stare nesigura: raportam si iesim,
  // ca orchestratorul sa porneasca o instanta curata.
  if (config.esteProductie) {
    setTimeout(() => process.exit(1), 1000).unref();
  }
});

// Sentry Node.js initialization
if (config.sentryDsn) {
  // B-11: adaugam un httpClient identic celui implicit pentru a ATA aproape de
  // datele de transport. Handler-ul Sentry.setupExpressErrorHandler (mai jos)
  // ataseaza automat `request` cu corpul cererii la evenimentele de eroare.
  // Fara o lista alba, un corp care contine mesaj/utilizator/imagine base64
  // (date de sanatate) ar ajunge pe serverele Sentry.
  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.NODE_ENV,
    // M9: 1.0 in productie = 100% trasare, cost si volum de PII inutile.
    tracesSampleRate: config.esteProductie ? 0.1 : 1.0,
    // Scrub PII la nivel de eveniment: pastram doar URL-ul/metoda, nu corpul.
    beforeSend(event) {
      if (event.request) {
        if (event.request.data !== undefined) event.request.data = '[SCRUBBED_PII]';
        if (event.request.headers) {
          event.request.headers = Object.fromEntries(
            Object.entries(event.request.headers).filter(([k]) => !/authorization|cookie|token/i.test(k)),
          );
        }
      }
      if (Array.isArray(event.breadcrumbs)) {
        event.breadcrumbs = event.breadcrumbs.map((crumb) => {
          // B-1: scrub-ul se aplica neconditionat oricarui breadcrumb cu obiect
          // `data`, nu doar celor cu mesaj lung — un breadcrumb cu mesaj scurt dar
          // `data` ce contine PII ar scapa altfel la Sentry.
          const c = { ...crumb };
          if (c.data && typeof c.data === 'object') c.data = '[SCRUBBED_PII]';
          if (c.message && c.message.length > 200) {
            c.message = c.message.slice(0, 200) + '...[truncat]';
          }
          return c;
        });
      }
      return event;
    },
  });
  console.log('Sentry Node.js configurat cu succes');
}

// ImageKit SDK initialization
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
// Decizie (audit): 1 = un singur hop de proxy in fata (Render) — req.ip provine
// din X-Forwarded-For setat de proxy, nu din header-ul clientului. Gruparea IPv6
// si legarea cheilor de rate-limit pe IP se fac in utils/rateLimit.js (ipKeyGenerator).
app.set('trust proxy', 1);
app.use(helmet());
app.use(compression());
const port = config.port;

// CORS securizat. In productie, config-ul garanteaza deja o lista explicita:
// varianta `origin: true` (reflectarea oricarui Origin primit) nu mai e posibila.
app.use(cors({
  origin: config.cors.permiteOrice ? true : config.cors.origini,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Sanitizare automata a input-ului pe toate rutele.
// Nota: query string-ul NU poate fi rescris pe Express 5 (getter pe prototip) -
// se citeste prin citesteQuery(). Vezi utils/sanitize.js.
app.use(sanitizeRequest);

// Idempotenta pe scrieri (A-9): replierea unui POST din acelasi client, cu acelasi
// Idempotency-Key, nu mai creaza o intrare dubla la deconectari de retea.
app.use(idempotencyMiddleware);

// ==========================================
// RATE-LIMIT (C1)
// ==========================================
// B-10: daca REDIS_URL e configurat, store-ul este partajat intre instante.
// Fara el, creeazaLimitatoare foloseste MemoryStore (per-proces).
const storePartajat = creazaStoreRateLimit({ url: config.redisUrl });
const { preAuthLimiter, generalLimiter, statusLimiter, aiLimiter } =
  creeazaLimitatoare({
    store: storePartajat?.store,
    avertizeazaFaraStore: config.esteProductie,
  });

app.use('/api/', (req, res, next) => {
  // B-18: /api/v1 e noul prefix. Sub montajul /api/, calea /api/v1/ai-status are
  // req.path === '/v1/ai-status'; ambele variante primesc statusLimiter.
  if (req.path === '/ai-status' || req.path === '/v1/ai-status') return statusLimiter(req, res, next);
  return preAuthLimiter(req, res, next);
});

// Upload pe disc temporar pentru prevenirea OOM
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, os.tmpdir());
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'nutri-' + uniqueSuffix + path.extname(file.originalname || '.jpg'));
  },
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
  },
});

const supabase = createClient(config.supabase.url, config.supabase.anonKey);

// Supabase Admin (service_role) - ocoleste RLS prin definitie.
//
// REGULA (S-1, audit 2026-08): acest client se foloseste EXCLUSIV pentru tabele
// fara politici de utilizator, adica cele care sunt intentionat backend-only:
//   - `barcode_cache`   (politica `using (false)`)
//   - `clerk_user_map`  (RLS activ, fara nicio politica: deny-all)
//
// Pentru datele utilizatorului (mese, profil, estimari, antrenamente) se foloseste
// `ctx.db` din contextDate(req), care este legat de JWT-ul utilizatorului si lasa
// baza de date sa aplice izolarea. Nu adauga aici interogari pe datele oamenilor.
const supabaseAdmin = createClient(config.supabase.url, config.supabase.serviceRoleKey);

// Cache pentru token-uri deja validate. Cheia e hash SHA-256 al token-ului
// (niciodata tokenul brut), iar durata e plafonata de `exp`-ul real.
const tokenCache = new TokenCache({ maxEntries: 5000, ttlMs: 60 * 1000 });
tokenCache.startSweeper();
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// Plafon de cereri AI simultane pe instanta (imaginile base64 stau in heap pe
// toata durata cascadei de furnizori).
const semaforAi = new Semafor({
  max: config.ai.maxConcurenta,
  maxCoada: config.ai.maxCoada,
});

// Middleware Autentificare (C4: identitate normalizata, fail-closed).
const requireAuth = async (req, res, next) => {
  if (req.method === 'OPTIONS') {
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ eroare: 'Acces neautorizat. Token lipsă.' });
  }

  const token = authHeader.slice(7);
  const tokenKey = hashToken(token);

  // Tokenul brut este necesar pentru a construi clientul care respecta RLS.
  // Nu este logat, nu este stocat si nu supravietuieste cererii.
  req.tokenBrut = token;

  const utilizatorCache = tokenCache.get(tokenKey);
  if (utilizatorCache) {
    req.user = utilizatorCache;
    // Antetul de izolare este setat aici (nu doar in contextDate) ca orice ruta
    // autentificata sa fie observabila in trafic. Pentru Clerk nu exista JWT
    // Supabase: singura bariera ramane filtrul explicit, marcat 'inactiv'.
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
    // Sesiunea nu poate fi memorata mai mult decat este valabil tokenul: altfel
    // un logout sau o suspendare de cont ramaneau fara efect pana la 60 de secunde.
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
    console.error('[Auth] Eroare neasteptata:', err);
    return res.status(503).json({ eroare: 'Serviciul de autentificare este indisponibil.' });
  }
};

/**
 * Contextul de date al cererii curente (S-1).
 *
 * `ctx.db`    - clientul pentru datele utilizatorului. Cand tokenul este un JWT
 *               Supabase, RLS este ACTIV: o interogare fara filtru intoarce zero
 *               randuri in loc de datele altcuiva.
 * `ctx.admin` - clientul privilegiat, exclusiv pentru tabelele backend-only.
 *
 * Construit lenes si memorat pe cerere: rutele care nu ating baza de date nu
 * plateasc nimic, iar doua interogari din aceeasi cerere refolosesc acelasi client.
 *
 * Pentru utilizatorii Clerk nu exista JWT Supabase, deci `modAdmin` devine true si
 * singura bariera rmane filtrul explicit din cod. Semnalam asta in raspuns ca sa
 * fie observabil in trafic, nu doar in comentarii.
 */
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

// B-3: cheia vine din config validat (obligatorie in productie), nu citita direct
// in bootstrap. Fara literal placeholder — un deploy fara cheie moare la boot.
const genAI = new GoogleGenerativeAI(config.ai.geminiApiKey);

// ==========================================
// REGISTRU STARE FURNIZORI AI (COOLDOWN & STATUS)
// Nota: registrul este per-proces. Pe mai multe instante, cooldown-urile nu sunt
// partajate - de mutat intr-un store comun odata cu rate limiting-ul.
// ==========================================

// B-10: cooldown-ul e partajat intre instante prin acelasi store ca rate-limiting.
const registruAi = creazaRegistruCheiValori({ url: config.redisUrl, prefix: 'nutri:ai' });

// Wiring-ul serviciilor AI (B-14): compute-ul a fost extras in services/ai/,
// aici doar le tesem cu dependintele construite la radacina.
const serviciuVision = creeazaServiciuVision({ config });
const serviciuCascada = creeazaServiciuCascada({ config, registruAi });
const serviciuChat = creeazaServiciuChat({ config, genAI });

// ==========================================
// RUTE DE HEALTH CHECK & ROOT
// ==========================================
app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    service: 'NutriAI Secure Backend',
    version: '2.4.0-rls-per-cerere',
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', healthy: true, uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// ==========================================
// MONTAJ RUTE API (B-15)
// Router-ele sunt fabrici (tipar createGdprRouter) care primesc singletonii
// construiti la radacina ca parametri — nu construiesc dependinte singure.
// Ordinea de montare: status → ai → barcode → profil → mese → /api/user (gdpr).
// Switch-ul de limiter de pe /api/ (mai sus) ramane aici, in server.js.
// ==========================================
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
});
const barcodeR = createBarcodeRouter({ requireAuth, generalLimiter, contextDate, barcodeRepo: createBarcodeRepo() });
const profilR = createProfilRouter({ requireAuth, generalLimiter, config });
const meseR = createMeseRouter({ requireAuth, generalLimiter, contextDate, meseRepo: createMeseRepo() });
const userR = createUserRouter({ requireAuth, generalLimiter, config });
const statusR = createStatusRouter({
  getProviderStatus: serviciuCascada.getProviderStatus,
  getAiStatistici,
});
const gdprR = createGdprRouter({ requireAuth, generalLimiter, supabaseAdmin, contextDate, profilRepo: createProfilRepo() });

// /api/v1 — versiunea curenta a API-ului. Router-ele sunt montate O SINGURA
// data; aliasele de mai jos refolosesc exact aceleasi obiecte, deci nu exista
// doua implementari de intretinut („o singura implementare per functionalitate").
app.use('/api/v1', statusR);
app.use('/api/v1', aiR);
app.use('/api/v1', barcodeR);
app.use('/api/v1', profilR);
app.use('/api/v1', meseR);
// Rute GDPR (export date & stergere cont). Se bazeaza pe supabaseAdmin pentru
// export, dar acoperite de requireAuth; izolarea pe export este doar cosmetica
// fata de RLS-ul real aplicat pe scrieri.
app.use('/api/v1/user', gdprR);
// C-2: rutele de utilizator (premium-status) stau impreuna cu cele GDPR, sub
// acelasi prefix, ca „unde e ruta X" sa aiba un singur raspuns.
app.use('/api/v1/user', userR);

// LEGACY ALIASES — TEMPORARE. EXPIRE 2026-09-30 — migrare client la /api/v1.
// Aceleasi obiecte router, sub prefixul vechi; server.test.js exerseaza aceste
// cai, deci raman byte-identice pana la expirare.
app.use('/api', statusR);
app.use('/api', aiR);
app.use('/api', barcodeR);
app.use('/api', profilR);
app.use('/api', meseR);
app.use('/api/user', gdprR);
app.use('/api/user', userR);

// ==========================================
// HANDLER 404 PENTRU RUTE INEXISTENTE
// ==========================================
app.use((req, res) => {
  res.status(404).json({ eroare: 'Ruta solicitată nu există (404).' });
});

// ==========================================
// HANDLER GLOBAL DE ERORI
// M9: raportarea in Sentry o face exclusiv setupExpressErrorHandler.
// ==========================================
Sentry.setupExpressErrorHandler(app);

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const message = err?.message || '';
  console.error('Eroare globala:', message);

  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ eroare: 'Fișierul este prea mare. Limita este 5MB.' });
  }
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ eroare: message });
  }
  if (message.includes('Tip fișier nepermis')) {
    return res.status(400).json({ eroare: message });
  }
  if (err instanceof EroareContextDate) {
    // A-3: clientul legat de JWT nu a putut fi construit pe calea Supabase —
    // refuzam cu 503 (mesaj neutru, fara detalii interne), nu degradam pe admin.
    return res.status(err.status).json({ eroare: 'Serviciul de date este indisponibil.' });
  }
  res.status(500).json({ eroare: 'Eroare internă a serverului.' });
});

// Export pentru teste
module.exports = app;

// ==========================================
// KEEP-ALIVE TICKER
// Se activeaza DOAR daca exista o adresa externa configurata. Varianta anterioara
// cadea pe http://127.0.0.1:<port>/health, adica procesul se pinguia pe sine -
// zero efect asupra adormirii instantei, dar zgomot in log-uri la fiecare ciclu.
// ==========================================
const startKeepAliveTicker = () => {
  const baseUrl = config.keepAlive.url;
  if (!baseUrl) {
    console.log('Keep-Alive dezactivat (KEEP_ALIVE_URL / RENDER_EXTERNAL_URL nesetate).');
    return null;
  }

  const intervalMs = config.keepAlive.intervalMinute * 60 * 1000;
  const targetUrl = `${baseUrl.replace(/\/+$/, '')}${/\/health\/?$/.test(baseUrl) ? '' : '/health'}`;

  console.log(`Keep-Alive activat: ping catre ${targetUrl} la fiecare ${config.keepAlive.intervalMinute} minute.`);

  const ticker = setInterval(async () => {
    try {
      const raspuns = await callWithTimeout((signal) => fetch(targetUrl, { signal }), 10000);
      if (!raspuns.ok) {
        console.warn(`Keep-Alive: raspuns neasteptat (${raspuns.status})`);
      }
    } catch (err) {
      console.error('Keep-Alive eroare:', err.message);
    }
  }, intervalMs);

  if (ticker.unref) ticker.unref();
  return ticker;
};

// Pornire server doar daca fisierul este rulat direct (nu importat in teste)
if (require.main === module) {
  const server = app.listen(port, config.host, () => {
    console.log(`Serverul securizat ruleaza pe ${config.host}:${port}`);
    startKeepAliveTicker();
  });

  // Graceful shutdown: cererile in curs se finalizeaza.
  const shutdown = (signal) => {
    console.log(`${signal} primit - inchid serverul elegant...`);
    server.close(() => {
      console.log('Server inchis.');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
