'use strict';

/**
 * P-10: Idempotență fail-closed pe rutele critice.
 *
 * PROBLEMA (P-10): `catch { return next(); }` — când Redis pică, protecția
 * dispare complet și tăcut. Pe o rută de plată sau de scanare AI, asta înseamnă
 * dublă execuție.
 *
 * FIX: Fail-closed pe rutele critice (AI, plăți) — 503.
 * Fail-open rămâne acceptabil doar pe rute idempotente prin natura lor (GET).
 *
 * API: `creeazaMiddlewareIdempotenta({ rutaCritica: true })` pentru rutele
 * unde o dublă execuție are consecințe reale (AI, plăți).
 */

const crypto = require('crypto');
const { creeazaRegistruCheiValori } = require('./storePartajat');

const TTL_MS = 15 * 60 * 1000;
// P-10: zălogul 'procesare' ține mult mai scurt decât rezultatul finalizat. Un crash
// la mijlocul analizei AI nu trebuie să țină clientul blocat pe 409 IDEMPOTENCY_IN_PROGRESS
// timp de 15 minute; la expirare, o reluare poate revendica din nou cheia. TTL-ul
// rezultatului finalizat (TTL_MS) rămâne neschimbat.
const TTL_PROCESSARE_MS = 2 * 60 * 1000;
// R2: un eșec de server (5xx) e păstrat ca 'failed' doar scurt, suficient cât un retry
// cu aceeași cheie să primească replay, nu o re-executare (care ar debita din nou).
const TTL_ESEC_MS = 2 * 60 * 1000;
// P1-12: TTL pentru cheile DERIVATE de server (clientul nu a trimis Idempotency-Key).
// Deliberat mult mai scurt decat TTL_MS: scopul lor e sa absoarba retry-urile de
// transport (timeout mobil, reconectare, proxy care reia POST-ul, dublu tap), NU sa
// transforme o repetare intentionata a aceleiasi actiuni intr-un replay permanent.
// Peste aceasta fereastra, aceeasi cerere se executa din nou — ca inainte.
const TTL_DERIVAT_MS = 90 * 1000;
// P1-12: amprenta de continut trimisa de client pentru cererile multipart, unde
// corpul nu e parsat inca (multer ruleaza dupa middleware). SHA-256 hex.
const ANTET_AMPRENTA = 'x-payload-fingerprint';
const TIPAR_AMPRENTA = /^[0-9a-f]{64}$/;
const registruImplicit = creeazaRegistruCheiValori({
  url: process.env.REDIS_URL,
  prefix: 'nutri:idem',
});

const hash = (valoare) => crypto
  .createHash('sha256')
  .update(String(valoare))
  .digest('hex');

function namespaceCerere(req) {
  // R2: identitatea utilizatorului e stabilă, token-ul Supabase se rotește (~1h).
  // Un retry cu aceeași Idempotency-Key sub token rotit ar ajunge altfel într-un
  // namespace diferit și ar re-executa operația (dublu debit consuma_credit).
  if (req.user?.id) return `user:${hash(req.user.id)}`;
  const autorizare = req.headers.authorization;
  if (typeof autorizare === 'string' && autorizare.startsWith('Bearer ')) {
    return `token:${hash(autorizare.slice(7))}`;
  }
  const ip = req.ip || req.socket?.remoteAddress || 'necunoscut';
  return `anon:${hash(`${ip}:${req.headers['user-agent'] || ''}`)}`;
}

function construiesteCheie(req, idempotencyKey) {
  const cale = String(req.originalUrl || req.path || '').split('?')[0];
  return `${namespaceCerere(req)}:${req.method}:${hash(cale)}:${hash(idempotencyKey)}`;
}

function serializeazaStabil(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (seen.has(value)) throw new TypeError('Corpul cererii contine o referinta circulara.');
  seen.add(value);
  let rezultat;
  if (Array.isArray(value)) {
    rezultat = `[${value.map((item) => serializeazaStabil(item, seen)).join(',')}]`;
  } else {
    const chei = Object.keys(value).sort();
    rezultat = `{${chei.map((cheie) => `${JSON.stringify(cheie)}:${serializeazaStabil(value[cheie], seen)}`).join(',')}}`;
  }
  seen.delete(value);
  return rezultat;
}

function amprentaCerere(req) {
  // Amprenta ignore query-ul, la fel ca construiesteCheie: parametrii de query
  // (paginare/filtre) nu schimba identitatea operatiei, iar cheia si amprenta
  // trebuie sa fie consistente — altfel aceeasi cheie pe aceeasi ruta cu query
  // diferit ar produce un fals 409 IDEMPOTENCY_KEY_REUSED.
  const cale = String(req.originalUrl || req.path || '').split('?')[0];
  return hash(serializeazaStabil({ method: req.method, cale, body: req.body ?? null }));
}

function raspundeDinRegistru(res, existent, amprenta) {
  if (!existent) return false;

  if (existent.amprenta && existent.amprenta !== amprenta) {
    res.status(409).json({
      eroare: 'Idempotency-Key a fost reutilizat cu un payload diferit.',
      cod: 'IDEMPOTENCY_KEY_REUSED',
    });
    return true;
  }

  if (existent.stare === 'procesare') {
    res.setHeader?.('Retry-After', '1');
    res.status(409).json({
      eroare: 'O cerere cu acest Idempotency-Key este deja in curs.',
      cod: 'IDEMPOTENCY_IN_PROGRESS',
    });
    return true;
  }

  const esteFinalizat = existent.stare === 'finalizat' || existent.stare === undefined;
  const esteEsec = existent.stare === 'failed';
  // R2: replay și pentru claim-urile 'failed' (5xx), ca un retry cu aceeași cheie
  // să primească eșecul înregistrat, nu o re-executare (dublu debit consuma_credit).
  if (
    Number.isInteger(existent.status) &&
    ((esteFinalizat && existent.status >= 200 && existent.status < 300) || esteEsec)
  ) {
    res.setHeader?.('Idempotency-Status', 'replayed');
    res.status(existent.status).json(existent.body);
    return true;
  }

  return false;
}

/**
 * P1-12 (remediere) — finalizarea zălogului este best-effort prin design (scrierea
 * nu poate fi în aceeași tranzacție cu răspunsul HTTP). Consecința este MĂRGINITĂ:
 * dacă scrierea „finalizat" eșuează, înregistrarea `procesare` rămâne până la
 * TTL_PROCESSARE_MS, deci un retry în acea fereastră primește 409 IN_PROGRESS —
 * NU o a doua execuție. Abia după expirarea TTL-ului o reluare re-execută, și
 * atunci este deja o încercare logică nouă.
 *
 * Ce NU era acceptabil: `catch(() => {})` făcea eșecul complet invizibil. Acum e
 * observabil, ca degradarea să fie detectată, nu dedusă.
 */
function raporteazaFinalizareEsuata(err) {
  const mesaj = `[Idempotenta] Finalizarea zalogului a esuat: ${err?.message || err}`;
  console.warn(mesaj);
  try {
    const Sentry = require('@sentry/node');
    Sentry.withScope((scope) => {
      scope.setLevel('warning');
      scope.setTag('component', 'idempotency-finalize');
      Sentry.captureMessage(mesaj);
    });
  } catch {
    // Sentry indisponibil — mesajul a fost deja loggat.
  }
}

async function revendicaAtomic(registru, key, valoare, ttlMs) {
  if (typeof registru.setIfAbsent === 'function') {
    return registru.setIfAbsent(key, valoare, ttlMs);
  }
  const existent = await registru.get(key);
  if (existent) return false;
  await registru.set(key, valoare, ttlMs);
  return true;
}

/**
 * @param {object} [optiuni]
 * @param {object} [optiuni.registru] Store Redis/MapCuExpirare
 * @param {number} [optiuni.ttlMs] TTL al cheii de idempotență
 * @param {boolean} [optiuni.rutaCritica] Dacă true, store indisponibil → 503.
 *   Pe GET-uri sau rute idempotente prin natura lor, lasă false (comportament original).
 */
function creeazaMiddlewareIdempotenta({
  registru = registruImplicit,
  ttlMs = TTL_MS,
  rutaCritica = false,
  permiteMultipart = false,
} = {}) {
  return async function idempotencyMiddleware(req, res, next) {
    if (req.method !== 'POST') return next();

    // P-10: o singură aplicare per cerere. Middleware-ul global e montat în
    // server.js înaintea routerelor, deci rulează PRIMUL; cel critic, montat
    // per-rută, rulează după. Fără gardă, cel critic ar revendica a doua oară
    // aceeași cheie deja revendicată de cel global și ar returna un 409 fals.
    if (req._idempotentaAplicata) {
      // R2: claim-ul global a rulat înainte de `requireAuth`, deci pe namespace-ul
      // token-ului (care se rotește ~1h). Pe rutele critice re-cheiem pe identitatea
      // utilizatorului, ca un retry cu aceeași cheie să găsească claim-ul inițial
      // chiar și după rotirea token-ului — altfel ar re-executa (dublu debit).
      if (!rutaCritica || !req.user?.id) return next();
    }

    const contentType = String(req.headers['content-type'] || '').toLowerCase();
    const esteMultipart = contentType.startsWith('multipart/form-data');
    if (esteMultipart && !permiteMultipart) return next();

    // P1-12: amprenta de continut pentru multipart. Fara ea, amprenta unei cereri
    // multipart era doar ruta — deci aceeasi cheie cu ALTA imagine returna tacut
    // rezultatul primei analize (date nutritionale gresite atribuite pozei noi).
    const amprentaClient = req.headers[ANTET_AMPRENTA];
    if (amprentaClient !== undefined) {
      if (typeof amprentaClient !== 'string' || !TIPAR_AMPRENTA.test(amprentaClient)) {
        return res.status(400).json({
          eroare: 'X-Payload-Fingerprint trebuie sa fie un SHA-256 hex de 64 de caractere.',
          cod: 'AMPRENTA_INVALIDA',
        });
      }
    }

    let amprenta;
    if (esteMultipart) {
      const cale = String(req.originalUrl || req.path || '').split('?')[0];
      // Corpul nu e parsat inca (multer ruleaza dupa). Cu amprenta de continut de la
      // client, doua imagini diferite produc amprente diferite => 409, nu replay.
      amprenta = hash(`multipart:${req.method}:${cale}:${amprentaClient || ''}`);
    } else {
      try {
        amprenta = amprentaCerere(req);
      } catch {
        return res.status(400).json({ eroare: 'Corpul cererii nu poate fi serializat.' });
      }
    }

    const idempotencyKey = req.headers['idempotency-key'];
    const areCheieExplicita = typeof idempotencyKey === 'string' && idempotencyKey.trim() !== '';
    let keyCurata;
    let cheieDerivata = false;

    if (areCheieExplicita) {
      keyCurata = idempotencyKey.trim();
      if (keyCurata.length > 200 || !/^[\x21-\x7e]+$/.test(keyCurata)) {
        return res.status(400).json({ eroare: 'Idempotency-Key este invalid sau prea lung.' });
      }
    } else {
      // P1-12 — MOD DE COMPATIBILITATE, EXPLICIT SI MARGINIT.
      //
      // Clientii deja lansati nu trimit `Idempotency-Key` decat pe /chat si
      // /log-food-from-chat. Pana acum middleware-ul facea `return next()`: ruta cea
      // mai scumpa (analiza foto) nu avea NICIO protectie la replay. Un refuz dur
      // (400) ar fi rupt clientii din magazin, deci serverul DERIVA o cheie mai slaba
      // din (utilizator, ruta, amprenta payload-ului) — suficient cat sa colapseze
      // retry-urile de transport, cu TTL scurt (TTL_DERIVAT_MS) ca sa nu schimbe
      // semantica repetarilor deliberate.
      //
      // Limita onesta: pe rutele necritice si pe multipart FARA amprenta de continut
      // nu exista de unde deriva o cheie stabila — acolo protectia ramane absenta
      // pana cand clientul trimite antetul. Nu este o bariera de securitate
      // cross-account (aceea e namespace-ul pe utilizator), ci o protectie
      // anti-dubla-debitare pentru acelasi utilizator.
      if (!rutaCritica) return next();
      if (esteMultipart && !amprentaClient) return next();
      keyCurata = `derivat:${amprenta}`;
      cheieDerivata = true;
    }

    const ttlRezultat = cheieDerivata ? Math.min(ttlMs, TTL_DERIVAT_MS) : ttlMs;
    const cacheKey = construiesteCheie(req, keyCurata);
    try {
      // M-04: fail-closed ÎNAINTE de orice claim — dacă store-ul partajat e „degradat"
      // (Redis neconectat), nu avem cum garanta idempotența. Un claim pe rezerva locală
      // ar fi per-proces și, la failover/scalare, dubla execuția. Deci răspundem 503
      // fără să atingem stocul. Fail-closed doar pe rutele critice; GET/necritic nu se aplicа.
      if (rutaCritica && registru.degradat) {
        return res.status(503).json({
          eroare: 'Serviciul de verificare a idempotenței este temporar indisponibil.',
          cod: 'IDEMPOTENCY_STORE_UNAVAILABLE',
        });
      }
      const existent = await registru.get(cacheKey);
      if (raspundeDinRegistru(res, existent, amprenta)) return undefined;

      const revendicat = await revendicaAtomic(registru, cacheKey, {
        stare: 'procesare',
        amprenta,
        inceputLa: Date.now(),
      }, TTL_PROCESSARE_MS);
      if (!revendicat) {
        const castigatoare = await registru.get(cacheKey);
        if (raspundeDinRegistru(res, castigatoare, amprenta)) return undefined;
        return res.status(409).json({
          eroare: 'O cerere cu acest Idempotency-Key este deja in curs.',
          cod: 'IDEMPOTENCY_IN_PROGRESS',
        });
      }
      // P-10: flagul se marchează DOAR după o revendicare atomică reușită.
      // Marcat mai devreme, middleware-ul global (fail-open) l-ar seta, ar
      // înghiți eroarea de store și ar scurtcircuita middleware-ul critic
      // montat mai jos pe rută — iar 503-ul fail-closed nu s-ar mai produce.
      req._idempotentaAplicata = true;
    } catch {
      // P-10: fail-closed pe rute critice (AI, plăți)
      if (rutaCritica) {
        return res.status(503).json({
          eroare: 'Serviciul de verificare a idempotenței este temporar indisponibil.',
          cod: 'IDEMPOTENCY_STORE_UNAVAILABLE',
        });
      }
      // Fail-open pe rute idempotente prin natura lor. Flagul rămâne nesetat
      // intenționat, ca middleware-ul critic montat mai jos pe aceeași cerere
      // să își poată aplica propriul fail-closed (503).
      return next();
    }

    let finalizat = false;
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      const status = res.statusCode;
      if (status >= 200 && status < 300) {
        finalizat = true;
        Promise.resolve(registru.set(cacheKey, {
          stare: 'finalizat',
          amprenta,
          status,
          body,
          finalizatLa: Date.now(),
        }, ttlRezultat)).catch(raporteazaFinalizareEsuata);
      } else if (status >= 500) {
        // R2: eșec de server (5xx) → păstrăm claim-ul 'failed' cu TTL scurt, ca un
        // retry cu aceeași cheie să primească replay 5xx, nu o re-executare (dublu
        // debit consuma_credit / insert duplicat). Erorile de client (4xx) se șterg.
        finalizat = true;
        Promise.resolve(registru.set(cacheKey, {
          stare: 'failed',
          amprenta,
          status,
          body,
          finalizatLa: Date.now(),
        }, TTL_ESEC_MS)).catch(() => {});
      } else {
        Promise.resolve(registru.del?.(cacheKey)).catch(() => {});
      }
      return originalJson(body);
    };

    res.once?.('close', () => {
      if (!finalizat) Promise.resolve(registru.del?.(cacheKey)).catch(() => {});
    });

    return next();
  };
}

const idempotencyMiddleware = creeazaMiddlewareIdempotenta();
const idempotencyMiddlewareCritic = creeazaMiddlewareIdempotenta({
  rutaCritica: true,
  permiteMultipart: true,
});

module.exports = {
  idempotencyMiddleware,
  idempotencyMiddlewareCritic,
  creeazaMiddlewareIdempotenta,
  namespaceCerere,
  construiesteCheie,
  amprentaCerere,
  serializeazaStabil,
  TTL_MS,
  TTL_PROCESSARE_MS,
  TTL_ESEC_MS,
  TTL_DERIVAT_MS,
  ANTET_AMPRENTA,
};
