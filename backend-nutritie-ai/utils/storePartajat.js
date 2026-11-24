'use strict';

/**
 * P-11: Fallback Redis — strângere proporțională a pragurilor + alertă Sentry.
 * P-12: Cache premium mutat din Map per-proces în registrul K/V partajat.
 *
 * PROBLEMA P-11: `StoreCuRezerva` trecea pe `MapCuExpirare` per-proces.
 * Pe 4 instanțe, rate limit-ul devenea efectiv 4× mai permisiv, iar cota AI
 * de 50/zi devenea 200/zi. Degradarea era invizibilă.
 *
 * FIX P-11: la trecerea pe fallback, emite eveniment Sentry de severitate
 * `warning`, ca echipa să afle că Redis a căzut.
 *
 * FIX M-03: strângere proporțională a pragurilor — contorul rezervei locale
 * (MemoryStore, per-proces) se înmulțește cu `INSTANTE_ASTEPTATE`, echivalent cu
 * împărțirea bugetului global la numărul de instanțe. Pe 4 instanțe, limita
 * efectivă rămâne aceeași (100/15min nu mai devine 400/15min).
 * Configurabil prin env `INSTANTE_ASTEPTATE` (default: 1).
 */

// Task 1: codEroare mutat în utilitarul comun (utils/codEroare.js) — o singură
// definiție pentru întregul backend. Re-exportat mai jos, la module.exports,
// ca utils/contorPartajat.js (care îl destructure din acest modul) să rămână verde.
const { codEroare } = require('./codEroare');

const PLAFON_INTRARI = 5000;
const PLAFON_RATE_LIMIT_MEMORIE = 10_000;
const CURATARE_INTERVAL_MS = 5 * 60 * 1000;
const SALTIRE_LOGGING_MS = 30 * 1000;
const TIMEOUT_COMANDA_REDIS_MS = 1500;

/**
 * Mărginește durata oricărei comenzi Redis (inclusiv când pachetele sunt deja
 * în bufferul TCP și clientul așteaptă răspuns pe un socket half-open).
 */
function cuTimeoutRedis(promisiune, ms = TIMEOUT_COMANDA_REDIS_MS) {
  const p = Promise.resolve(promisiune);
  // Previne unhandledRejection dacă promisiunea originală respinge după timeout.
  p.catch(() => { });
  let timer = null;
  const timeoutPromise = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`REDIS_COMMAND_TIMEOUT (${ms}ms)`);
      err.name = 'RedisTimeoutError';
      err.code = 'REDIS_COMMAND_TIMEOUT';
      reject(err);
    }, ms);
    if (timer.unref) timer.unref();
  });
  return Promise.race([p, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

// M-03: numărul de instanțe așteptate (env INSTANTE_ASTEPTATE), citit per apel.
// Fallback sigur: lipsă, zero sau ne-numeric -> 1 — nu se împarte niciodată la 0.
function numarInstanteAsteptate() {
  const valoare = parseInt(process.env.INSTANTE_ASTEPTATE || '1', 10);
  return Number.isInteger(valoare) && valoare > 0 ? valoare : 1;
}

// M-21: cache de clienți Redis CHEIE = URL. Un singleton global ignora `url` la
// al doilea apel și intoarce clientul vechi chiar și pentru un URL diferit
// (ex. staging vs prod) — două URL-uri distincte trebuie să primească clienți distincti.
const clientRedisCache = new Map();
let sentriAlertaTrimisa = false; // evităm flooding Sentry
// throttle independent per mesaj, nu un singur timestamp global (P-11)
const ultimulAvertismentPeMesaj = new Map();
// M-06: plafon pentru mapa de mai sus — mesajele unice sunt nelimitate ca formă,
// fara plafon mapa ar creste fara limita. Tiparul plafon + curatare expirate +
// evictie FIFO (vezi MapCuExpirare / ContorLocalCuTtl) — throttling-ul ramane
// neschimbat, doar cresterea memoriei e limitata.
const PLAFON_AVERTISMENTE = 200;

function logWarnThrottled(mesaj) {
  const acum = Date.now();
  const ultimul = ultimulAvertismentPeMesaj.get(mesaj) || 0;
  if (acum - ultimul < SALTIRE_LOGGING_MS) return;
  // M-06: plafon pe mapa de mai sus — curățăm mai întâi intrările expirate, apoi
  // evicție FIFO (cea mai veche), ca o eroare abuzivă să nu umfle mapa nelimitat.
  if (ultimulAvertismentPeMesaj.size >= PLAFON_AVERTISMENTE) {
    for (const [cheie, moment] of ultimulAvertismentPeMesaj) {
      if (acum - moment >= SALTIRE_LOGGING_MS) ultimulAvertismentPeMesaj.delete(cheie);
    }
    if (ultimulAvertismentPeMesaj.size >= PLAFON_AVERTISMENTE) {
      const ceaMaiVeche = ultimulAvertismentPeMesaj.keys().next().value;
      if (ceaMaiVeche !== undefined) ultimulAvertismentPeMesaj.delete(ceaMaiVeche);
    }
  }
  ultimulAvertismentPeMesaj.set(mesaj, acum);
  console.warn(mesaj);
}

/**
 * P-11: Emite o alertă Sentry când Redis cade și pragurile efective se multiplică.
 * Se emite o singură dată per ciclu de viață al procesului (nu la fiecare cerere).
 */
function alertaSentryRedisCazut(codErorii) {
  if (sentriAlertaTrimisa) return;
  sentriAlertaTrimisa = true;

  const instanteAsteptate = numarInstanteAsteptate();
  const mesaj = `[Redis CĂZUT] Rate limiting pe MemoryStore. Cu ${instanteAsteptate} instanțe, ` +
    `limitele efective sunt ${instanteAsteptate}× mai permisive. Cod: ${codErorii}`;
  console.error(mesaj);

  // Emitem alert Sentry dacă e disponibil
  try {
    const Sentry = require('@sentry/node');
    Sentry.withScope((scope) => {
      scope.setLevel('warning');
      scope.setTag('component', 'redis-rate-limit');
      scope.setExtra('instante_asteptate', instanteAsteptate);
      scope.setExtra('cod_eroare', codErorii);
      Sentry.captureMessage(mesaj);
    });
  } catch {
    // Sentry indisponibil — mesajul a fost deja loggat
  }
}

function resetAlertaSentry() {
  sentriAlertaTrimisa = false;
}

function eroareRedisNeconectat() {
  const err = new Error('REDIS_NECONECTAT');
  err.code = 'REDIS_NECONECTAT';
  return err;
}

function creeazaClientRedis({ url }) {
  // M-21: cheia cache-ului include `url`, ca două URL-uri distincte să primească
  // clienți distincti (înainte, un singur slot global ignora url după primul apel).
  const cheieCache = url || 'default';
  const existent = clientRedisCache.get(cheieCache);
  if (existent) return existent;
  const redis = require('redis');
  const client = redis.createClient({
    url,
    disableOfflineQueue: true,
    pingInterval: 240_000,
    commandsQueueMaxLength: 500,
    socket: {
      connectTimeout: 3000,
      // Omitem `socketTimeout`: un timeout de inactivitate mai mic decât `pingInterval`
      // (15s) ar închide conexiunile sănătoase Upstash în repaus; fiecare comandă
      // este deja mărginită individual prin `cuTimeoutRedis`.
      // Strategia implicită din @redis/client oprește reconectarea pe erori de socket;
      // backoff cu jitter menține clientul recuperabil după pauze de rețea/Redis.
      reconnectStrategy: (retries) => (
        Math.min((2 ** Math.min(retries, 10)) * 50, 2000) + Math.floor(Math.random() * 200)
      ),
    },
  });
  if (typeof client.setMaxListeners === 'function') client.setMaxListeners(25);
  client.on('error', (err) => {
    const cod = codEroare(err);
    logWarnThrottled(`[Redis] Eroare client: ${cod}`);
    // P-11: alertă Sentry la prima eroare Redis
    alertaSentryRedisCazut(cod);
  });
  client.on('ready', () => {
    // Resetăm alerta când Redis revine (la reconectare, alerta va fi retrimisă dacă cade din nou)
    sentriAlertaTrimisa = false;
  });
  client.connect().catch((err) => {
    const cod = codEroare(err);
    logWarnThrottled(`[Redis] Conectare esuata, se continua cu memorie locala: ${cod}`);
    alertaSentryRedisCazut(cod);
  });
  clientRedisCache.set(cheieCache, client);
  return client;
}

/**
 * Așteaptă conexiunea inițială Redis (mărginit la timeoutMs) înainte ca serverul
 * HTTP să înceapă să accepte trafic, prevenind fereastra de degradare la cold start.
 */
function asteaptaConexiuneRedis({ url, timeoutMs = 3000 } = {}) {
  if (!url) return Promise.resolve(false);
  const client = creeazaClientRedis({ url });
  if (client.isReady) return Promise.resolve(true);

  return new Promise((resolve) => {
    let finalizat = false;
    let timer = null;
    const gata = (rezultat) => {
      if (finalizat) return;
      finalizat = true;
      if (timer) clearTimeout(timer);
      if (typeof client.off === 'function') client.off('ready', peReady);
      else if (typeof client.removeListener === 'function') client.removeListener('ready', peReady);
      resolve(rezultat);
    };
    const peReady = () => gata(true);
    if (typeof client.on === 'function') {
      client.on('ready', peReady);
    }
    timer = setTimeout(() => gata(Boolean(client.isReady)), timeoutMs);
    if (timer.unref) timer.unref();
  });
}

/**
 * Store local LRU/FIFO mărginit pentru express-rate-limit (max 10.000 chei).
 * Înlocuiește MemoryStore-ul nemărginit, prevenind OOM sub IP rotation / DDoS.
 */
class MemoryStoreMarginit {
  constructor({ maxKeys = PLAFON_RATE_LIMIT_MEMORIE } = {}) {
    this.maxKeys = Number.isInteger(maxKeys) && maxKeys > 0 ? maxKeys : PLAFON_RATE_LIMIT_MEMORIE;
    this.windowMs = 60 * 1000;
    this.localKeys = true;
    this.map = new Map();
  }

  init(options) {
    if (options && Number.isFinite(options.windowMs) && options.windowMs > 0) {
      this.windowMs = options.windowMs;
    }
  }

  _curataSiEvicta(acum) {
    if (this.map.size < this.maxKeys) return;
    for (const [k, entry] of this.map) {
      if (entry.resetTimeMs <= acum) this.map.delete(k);
    }
    while (this.map.size >= this.maxKeys) {
      const ceaMaiVeche = this.map.keys().next().value;
      if (ceaMaiVeche === undefined) break;
      this.map.delete(ceaMaiVeche);
    }
  }

  increment(key) {
    const acum = Date.now();
    const existent = this.map.get(key);
    if (existent && existent.resetTimeMs > acum) {
      existent.totalHits += 1;
      // Reîmprospătăm poziția LRU (cel mai recent accesat la final).
      this.map.delete(key);
      this.map.set(key, existent);
      return {
        totalHits: existent.totalHits,
        resetTime: new Date(existent.resetTimeMs),
      };
    }
    if (existent) this.map.delete(key);
    this._curataSiEvicta(acum);
    const resetTimeMs = acum + this.windowMs;
    this.map.set(key, { totalHits: 1, resetTimeMs });
    return {
      totalHits: 1,
      resetTime: new Date(resetTimeMs),
    };
  }

  decrement(key) {
    const existent = this.map.get(key);
    if (!existent) return;
    if (existent.resetTimeMs <= Date.now()) {
      this.map.delete(key);
      return;
    }
    if (existent.totalHits > 0) existent.totalHits -= 1;
  }

  resetKey(key) {
    this.map.delete(key);
  }

  resetAll() {
    this.map.clear();
  }

  shutdown() {
    this.map.clear();
  }
}

class StoreCuRezerva {
  constructor({ client, storeRedis }) {
    this.client = client;
    this.storeRedis = storeRedis;
    this.storeRezerva = new MemoryStoreMarginit({ maxKeys: PLAFON_RATE_LIMIT_MEMORIE });
    this.localKeys = false;
    this.optiuniInitRedis = null;
    this.initListenerAtasat = false;
    this._initializeazaRedis = null;
  }

  init(options) {
    if (this.storeRezerva.init) {
      try {
        this.storeRezerva.init(options);
      } catch (err) {
        logWarnThrottled(`[RateLimit] init rezerva esuat (${codEroare(err)}).`);
      }
    }
    if (!this.storeRedis.init) return;
    // Atașăm ÎNTOTDEAUNA listener-ul `ready`, chiar dacă clientul e deja `isReady`:
    // la reconectare după restart Redis, `rate-limit-redis` trebuie să reîncarce scriptul
    // Lua (altele `incrementScriptSha` ar rămâne otrăvit permanent).
    this.optiuniInitRedis = options;
    this._initializeazaRedis = () =>
      cuTimeoutRedis(Promise.resolve(this.storeRedis.init(this.optiuniInitRedis)), TIMEOUT_COMANDA_REDIS_MS)
        .catch((err) => {
          logWarnThrottled(`[RateLimit] init Redis esuat (${codEroare(err)}); ramane rezerva.`);
        });
    if (!this.initListenerAtasat && typeof this.client.on === 'function') {
      this.initListenerAtasat = true;
      this.client.on('ready', () => {
        if (this._initializeazaRedis) this._initializeazaRedis();
      });
    }
    if (this.client.isReady) {
      this._initializeazaRedis();
    }
  }

  // M-03: MemoryStore-ul de rezervă e per-proces — când Redis cade, fiecare
  // instanță își numără doar traficul ei, iar limita efectivă s-ar multiplica
  // cu numărul de instanțe (pe 4 instanțe, 100/15min ar deveni 400/15min).
  // Înmulțim totalHits-ul local cu INSTANTE_ASTEPTATE, echivalent cu împărțirea
  // bugetului global per instanță. Se întoarce o COPIE (resetTime păstrat), ca
  // clientul intern al MemoryStore să rămână cu contorul local neschimbat.
  scaleazaRezerva(info) {
    if (!info || typeof info.totalHits !== 'number') return info;
    return {
      totalHits: info.totalHits * numarInstanteAsteptate(),
      resetTime: info.resetTime,
    };
  }

  async increment(key) {
    if (this.client.isReady) {
      try {
        return await cuTimeoutRedis(this.storeRedis.increment(key), TIMEOUT_COMANDA_REDIS_MS);
      } catch (err) {
        const cod = codEroare(err);
        logWarnThrottled(`[RateLimit] Redis indisponibil (${cod}); trec pe rezerva.`);
        // P-11: alertă Sentry la fallback
        alertaSentryRedisCazut(cod);
        // Re-inițializăm scriptul Lua dacă eroarea poate proveni dintr-un SHA/script invalid.
        if (this.client.isReady && this._initializeazaRedis && !/NOSCRIPT/i.test(String(err?.message || ''))) {
          this._initializeazaRedis();
        }
      }
    } else {
      const cod = codEroare(eroareRedisNeconectat());
      logWarnThrottled(`[RateLimit] Redis neconectat (${cod}); trec pe rezerva.`);
      alertaSentryRedisCazut(cod);
    }
    return this.scaleazaRezerva(await this.storeRezerva.increment(key));
  }

  async decrement(key) {
    if (this.client.isReady) {
      try {
        return await cuTimeoutRedis(this.storeRedis.decrement(key), TIMEOUT_COMANDA_REDIS_MS);
      } catch (err) {
        logWarnThrottled(`[RateLimit] Redis indisponibil (${codEroare(err)}); trec pe rezerva.`);
      }
    }
    return this.storeRezerva.decrement(key);
  }

  async resetKey(key) {
    if (this.client.isReady) {
      try {
        return await cuTimeoutRedis(this.storeRedis.resetKey(key), TIMEOUT_COMANDA_REDIS_MS);
      } catch (err) {
        logWarnThrottled(`[RateLimit] Redis indisponibil (${codEroare(err)}); trec pe rezerva.`);
      }
    }
    return this.storeRezerva.resetKey(key);
  }

  async resetAll() {
    if (this.client.isReady && this.storeRedis.resetAll) {
      try {
        return await cuTimeoutRedis(this.storeRedis.resetAll(), TIMEOUT_COMANDA_REDIS_MS);
      } catch (err) {
        logWarnThrottled(`[RateLimit] Redis indisponibil (${codEroare(err)}); trec pe rezerva.`);
      }
    }
    if (this.storeRezerva.resetAll) return this.storeRezerva.resetAll();
    return undefined;
  }
}

function creeazaStoreRateLimit({ url }) {
  if (!url) return null;
  const { RedisStore } = require('rate-limit-redis');
  const client = creeazaClientRedis({ url });
  // Fabricant: instanță NOUĂ de store per limiter, cu prefix unic. Un singur
  // store partajat între 4 limitatoare ar fi interzis de express-rate-limit v8
  // (ERR_ERL_STORE_REUSE), iar ultimul init() ar suprascrie windowMs-ul.
  const creeaza = ({ prefix } = {}) =>
    new StoreCuRezerva({
      client,
      storeRedis: new RedisStore({
        prefix,
        sendCommand: (...args) => cuTimeoutRedis(client.sendCommand(args), TIMEOUT_COMANDA_REDIS_MS),
      }),
    });
  return { store: creeaza };
}

class MapCuExpirare {
  constructor() {
    this.map = new Map();
    this.intervalCuratare = null;
  }

  get(cheie) {
    const entry = this.map.get(cheie);
    if (!entry) return null;
    if (entry.expira && entry.expira <= Date.now()) {
      this.map.delete(cheie);
      return null;
    }
    return entry.valoare;
  }

  set(cheie, valoare, ttlMs) {
    if (this.map.size >= PLAFON_INTRARI && !this.map.has(cheie)) {
      const ceaMaiVeche = this.map.keys().next().value;
      if (ceaMaiVeche !== undefined) this.map.delete(ceaMaiVeche);
    }
    this.map.set(cheie, {
      valoare,
      expira: ttlMs && ttlMs > 0 ? Date.now() + ttlMs : 0,
    });
  }

  setIfAbsent(cheie, valoare, ttlMs) {
    if (this.get(cheie) !== null) return false;
    this.set(cheie, valoare, ttlMs);
    return true;
  }

  del(cheie) {
    this.map.delete(cheie);
  }

  pornesteCuratare() {
    if (this.intervalCuratare) return;
    this.intervalCuratare = setInterval(() => {
      const acum = Date.now();
      for (const [cheie, entry] of this.map) {
        if (entry.expira && entry.expira <= acum) this.map.delete(cheie);
      }
    }, CURATARE_INTERVAL_MS);
    if (this.intervalCuratare.unref) this.intervalCuratare.unref();
  }
}

function creeazaRegistruCheiValori({ url, prefix = 'nutri', failClosed = false } = {}) {
  const cheieFinala = (key) => `${prefix}:${key}`;
  const rezerva = new MapCuExpirare();
  rezerva.pornesteCuratare();

  if (url) {
    const client = creeazaClientRedis({ url });
    return {
      redis: true,
      failClosed: Boolean(failClosed),
      // M-04: flag expus — store-ul partajat e „degradat" când clientul Redis nu e
      // ready. Idempotency (rute critice) il consultă ca să închidă fail-closed (503)
      // fără a mai încerca vreun claim pe un stoc indisponibil.
      get degradat() {
        return !client.isReady;
      },
      async get(key) {
        if (!client.isReady) {
          if (failClosed) throw eroareRedisNeconectat();
          return rezerva.get(cheieFinala(key));
        }
        try {
          const val = await cuTimeoutRedis(client.get(cheieFinala(key)), TIMEOUT_COMANDA_REDIS_MS);
          return val ? JSON.parse(val) : null;
        } catch (err) {
          logWarnThrottled(`[Redis] get esuat (${codEroare(err)}); ${failClosed ? 'fail-closed' : 'trec pe rezerva'}.`);
          if (failClosed) throw err;
          return rezerva.get(cheieFinala(key));
        }
      },
      async set(key, value, ttlMs) {
        const finala = cheieFinala(key);
        if (!client.isReady) {
          if (failClosed) throw eroareRedisNeconectat();
          rezerva.set(finala, value, ttlMs);
          return;
        }
        try {
          const str = JSON.stringify(value);
          if (ttlMs && ttlMs > 0) {
            await cuTimeoutRedis(client.set(finala, str, { PX: ttlMs }), TIMEOUT_COMANDA_REDIS_MS);
          } else {
            await cuTimeoutRedis(client.set(finala, str), TIMEOUT_COMANDA_REDIS_MS);
          }
        } catch (err) {
          logWarnThrottled(`[Redis] set esuat (${codEroare(err)}); ${failClosed ? 'fail-closed' : 'trec pe rezerva'}.`);
          if (failClosed) throw err;
          rezerva.set(finala, value, ttlMs);
        }
      },
      async setIfAbsent(key, value, ttlMs) {
        const finala = cheieFinala(key);
        if (!client.isReady) {
          if (failClosed) throw eroareRedisNeconectat();
          return rezerva.setIfAbsent(finala, value, ttlMs);
        }
        try {
          const optiuni = { NX: true };
          if (ttlMs && ttlMs > 0) optiuni.PX = ttlMs;
          const rezultat = await cuTimeoutRedis(client.set(finala, JSON.stringify(value), optiuni), TIMEOUT_COMANDA_REDIS_MS);
          return rezultat === 'OK';
        } catch (err) {
          logWarnThrottled(`[Redis] SET NX esuat (${codEroare(err)}); ${failClosed ? 'fail-closed' : 'trec pe rezerva'}.`);
          if (failClosed) throw err;
          return rezerva.setIfAbsent(finala, value, ttlMs);
        }
      },
      async del(key) {
        rezerva.del(cheieFinala(key));
        if (!client.isReady) return;
        try {
          await cuTimeoutRedis(client.del(cheieFinala(key)), TIMEOUT_COMANDA_REDIS_MS);
        } catch (err) {
          logWarnThrottled(`[Redis] del esuat (${codEroare(err)}).`);
        }
      },
      // P1-12: compare-and-delete ATOMIC (eliberare de zălog deținută de proprietar).
      // Un `del` simplu are un defect clasic de lock distribuit: proprietarul A își
      // depășește TTL-ul, B revendică aceeași cheie, apoi curățenia întârziată a lui A
      // rulează și șterge zălogul LUI B — iar un al treilea apelant poate porni o a doua
      // execuție plătită. Scriptul rulează pe server, deci citirea și ștergerea sunt o
      // singură operație: nu există fereastră între verificare și ștergere.
      async delIfMatch(key, value) {
        const finala = cheieFinala(key);
        const asteptat = JSON.stringify(value);
        const local = rezerva.get(finala);
        if (local !== null && JSON.stringify(local) === asteptat) rezerva.del(finala);
        if (!client.isReady) return !failClosed;
        try {
          const rezultat = await cuTimeoutRedis(client.eval(
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
            { keys: [finala], arguments: [asteptat] },
          ), TIMEOUT_COMANDA_REDIS_MS);
          return Number(rezultat) === 1;
        } catch (err) {
          logWarnThrottled(`[Redis] delIfMatch esuat (${codEroare(err)}).`);
          return false;
        }
      },
    };
  }

  return {
    redis: false,
    failClosed: Boolean(failClosed),
    // M-04: fără Redis nu există „client căzut" — rezerva locală e sursa întreagă,
    // deci nu e degradat (flag-ul reflectă doar stocul partajat).
    degradat: false,
    async get(key) {
      return rezerva.get(cheieFinala(key));
    },
    async set(key, value, ttlMs) {
      rezerva.set(cheieFinala(key), value, ttlMs);
    },
    async setIfAbsent(key, value, ttlMs) {
      return rezerva.setIfAbsent(cheieFinala(key), value, ttlMs);
    },
    async del(key) {
      rezerva.del(cheieFinala(key));
    },
    // Fără Redis nu există concurență între procese, dar păstrăm aceeași semantică:
    // ștergem doar dacă valoarea stocată este chiar a proprietarului care eliberează.
    async delIfMatch(key, value) {
      const finala = cheieFinala(key);
      const curent = rezerva.get(finala);
      if (curent === null) return false;
      if (JSON.stringify(curent) !== JSON.stringify(value)) return false;
      rezerva.del(finala);
      return true;
    },
  };
}

module.exports = {
  creeazaClientRedis,
  asteaptaConexiuneRedis,
  cuTimeoutRedis,
  creeazaStoreRateLimit,
  creeazaRegistruCheiValori,
  StoreCuRezerva,
  MemoryStoreMarginit,
  MapCuExpirare,
  codEroare,
  resetAlertaSentry, // expus pentru teste
  logWarnThrottled, // expus pentru contorPartajat (L-03) și teste
  numarInstanteAsteptate, // expus pentru teste
};
