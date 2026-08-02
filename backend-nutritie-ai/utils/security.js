/**
 * Configurari de securitate centralizate pentru serverul NutriAI.
 *
 * Acopera punctele MUST-FIX #3 si #4 din auditul de pregatire pentru productie:
 * - CORS permisiv (`*`) care ajungea in productie;
 * - lipsa unui control explicit asupra rutelor care folosesc
 *   `SUPABASE_SERVICE_ROLE_KEY` (ocolesc RLS).
 *
 * Utilizare in `server.js`:
 * ```js
 * const {
 *   buildCorsOptions, helmetOptions, limiters,
 *   assertOwnership, serviceRoleGuard,
 * } = require('./utils/security');
 *
 * app.use(helmet(helmetOptions));
 * app.use(cors(buildCorsOptions()));
 * app.use('/api/', limiters.general);
 * app.use('/api/chat', limiters.ai);
 * app.use('/api/analizeaza-mancare-structurat', limiters.upload);
 * ```
 */

const rateLimit = require('express-rate-limit');

const isProduction = () => process.env.NODE_ENV === 'production';

/**
 * MUST-FIX #3 — CORS strict in productie.
 *
 * In dezvoltare se accepta orice origine (inclusiv requesturi fara Origin,
 * cum sunt cele din Expo Go / aplicatia nativa).
 * In productie se accepta DOAR domeniile din `CORS_ORIGINS` (lista separata
 * prin virgula). `*` este ignorat explicit in productie.
 */
function getAllowedOrigins() {
  return (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

function buildCorsOptions() {
  const allowed = getAllowedOrigins();

  if (isProduction() && (allowed.length === 0 || allowed.includes('*'))) {
    // Nu pornim in productie cu CORS deschis — esec explicit, nu silentios.
    throw new Error(
      '[SECURITATE] In productie CORS_ORIGINS trebuie sa contina lista explicita de domenii permise (fara "*").',
    );
  }

  return {
    origin(origin, callback) {
      // Aplicatiile native nu trimit header-ul Origin — sunt permise mereu,
      // protectia reala pentru ele fiind token-ul JWT.
      if (!origin) return callback(null, true);
      if (!isProduction()) return callback(null, true);
      if (allowed.includes(origin)) return callback(null, true);
      return callback(new Error('Origine nepermisa de politica CORS'));
    },
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  };
}

/** Configurare helmet potrivita pentru un API JSON consumat de o aplicatie mobila. */
const helmetOptions = {
  contentSecurityPolicy: false, // API JSON, nu servim HTML
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  referrerPolicy: { policy: 'no-referrer' },
  hsts: isProduction() ? { maxAge: 15552000, includeSubDomains: true } : false,
};

/**
 * Rate limiting pe niveluri: rutele AI si upload-urile sunt scumpe si
 * trebuie limitate mult mai agresiv decat restul API-ului.
 * Cheia este user-ul autentificat (nu IP-ul), pentru a nu penaliza
 * utilizatorii din spatele aceluiasi NAT mobil.
 */
const keyByUser = (req) => req.user?.id || req.ip;

const limiters = {
  general: rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    keyGenerator: keyByUser,
    standardHeaders: true,
    legacyHeaders: false,
    message: { eroare: 'Prea multe cereri. Incearca din nou intr-un minut.' },
  }),
  ai: rateLimit({
    windowMs: 60 * 1000,
    max: 15,
    keyGenerator: keyByUser,
    standardHeaders: true,
    legacyHeaders: false,
    message: { eroare: 'Ai trimis prea multe cereri catre AI. Asteapta un minut.' },
  }),
  upload: rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    keyGenerator: keyByUser,
    standardHeaders: true,
    legacyHeaders: false,
    message: { eroare: 'Prea multe imagini trimise. Asteapta un minut.' },
  }),
  auth: rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { eroare: 'Prea multe incercari. Reincearca peste 15 minute.' },
  }),
};

/**
 * MUST-FIX #4 — orice interogare facuta cu SUPABASE_SERVICE_ROLE_KEY ocoleste RLS.
 *
 * `assertOwnership` verifica explicit ca resursa apartine utilizatorului
 * autentificat inainte de a returna/modifica date. Se apeleaza DUPA `requireAuth`
 * si INAINTE de orice scriere cu clientul service-role.
 *
 * @throws {Error} cu `status = 403` daca resursa nu apartine userului.
 */
function assertOwnership(req, resourceUserId) {
  const currentUserId = req.user?.id;
  if (!currentUserId) {
    const err = new Error('Neautentificat');
    err.status = 401;
    throw err;
  }
  if (!resourceUserId || resourceUserId !== currentUserId) {
    const err = new Error('Nu ai acces la aceasta resursa');
    err.status = 403;
    throw err;
  }
  return true;
}

/**
 * Middleware care marcheaza o ruta ca folosind clientul service-role.
 * Refuza cererile neautentificate si adauga `req.usesServiceRole = true`,
 * ca sa poata fi auditat usor ce rute ocolesc RLS.
 */
function serviceRoleGuard(req, res, next) {
  if (!req.user?.id) {
    return res.status(401).json({ eroare: 'Token lipsa sau invalid' });
  }
  req.usesServiceRole = true;
  next();
}

/**
 * Handler final de erori: nu scurge stack trace-uri catre client in productie.
 */
function errorHandler(err, req, res, _next) {
  const status = err.status || 500;
  const payload = { eroare: status >= 500 ? 'Eroare interna de server' : err.message };
  if (!isProduction()) payload.detalii = err.stack;
  if (status >= 500) console.error('[server] Eroare neasteptata:', err);
  res.status(status).json(payload);
}

module.exports = {
  isProduction,
  getAllowedOrigins,
  buildCorsOptions,
  helmetOptions,
  limiters,
  assertOwnership,
  serviceRoleGuard,
  errorHandler,
};
