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
 * `warning`. Pragurile rate-limit nu se pot strânge automat prin MemoryStore
 * (fiecare instanță nu știe de celelalte), dar alerta Sentry notifică echipa
 * că Redis a căzut și pragurile efective s-au multiplicat.
 * Configurabil prin env `INSTANTE_ASTEPTATE` (default: 1).
 */

const { MemoryStore } = require('express-rate-limit');
// Task 1: codEroare mutat în utilitarul comun (utils/codEroare.js) — o singură
// definiție pentru întregul backend. Re-exportat mai jos, la module.exports,
// ca utils/contorPartajat.js (care îl destructure din acest modul) să rămână verde.
const { codEroare } = require('./codEroare');

const PLAFON_INTRARI = 5000;
const CURATARE_INTERVAL_MS = 5 * 60 * 1000;
const SALTIRE_LOGGING_MS = 30 * 1000;

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

  const instanteAsteptate = parseInt(process.env.INSTANTE_ASTEPTATE || '1', 10) || 1;
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
  const client = redis.createClient({ url });
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

class StoreCuRezerva {
  constructor({ client, storeRedis }) {
    this.client = client;
    this.storeRedis = storeRedis;
    this.storeRezerva = new MemoryStore();
    this.localKeys = false;
    this.optiuniInitRedis = null;
    this.initListenerAtasat = false;
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
    // client.connect() este asincron: la primul init clientul nu este inca 'ready',
    // asa ca init-ul RedisStore-ului se amana pana la evenimentul 'ready'. Altfel
    // RedisStore ramane fara windowMs si cade permanent pe rezerva (MemoryStore).
    this.optiuniInitRedis = options;
    const initializeazaRedis = () =>
      Promise.resolve(this.storeRedis.init(this.optiuniInitRedis)).catch((err) => {
        logWarnThrottled(`[RateLimit] init Redis esuat (${codEroare(err)}); ramane rezerva.`);
      });
    if (this.client.isReady) {
      initializeazaRedis();
    } else if (!this.initListenerAtasat && typeof this.client.on === 'function') {
      this.initListenerAtasat = true;
      this.client.on('ready', initializeazaRedis);
    }
  }

  async increment(key) {
    if (this.client.isReady) {
      try {
        return await this.storeRedis.increment(key);
      } catch (err) {
        const cod = codEroare(err);
        logWarnThrottled(`[RateLimit] Redis indisponibil (${cod}); trec pe rezerva.`);
        // P-11: alertă Sentry la fallback
        alertaSentryRedisCazut(cod);
      }
    } else {
      const cod = codEroare(eroareRedisNeconectat());
      logWarnThrottled(`[RateLimit] Redis neconectat (${cod}); trec pe rezerva.`);
      alertaSentryRedisCazut(cod);
    }
    return this.storeRezerva.increment(key);
  }

  async decrement(key) {
    if (this.client.isReady) {
      try {
        return await this.storeRedis.decrement(key);
      } catch (err) {
        logWarnThrottled(`[RateLimit] Redis indisponibil (${codEroare(err)}); trec pe rezerva.`);
      }
    }
    return this.storeRezerva.decrement(key);
  }

  async resetKey(key) {
    if (this.client.isReady) {
      try {
        return await this.storeRedis.resetKey(key);
      } catch (err) {
        logWarnThrottled(`[RateLimit] Redis indisponibil (${codEroare(err)}); trec pe rezerva.`);
      }
    }
    return this.storeRezerva.resetKey(key);
  }

  async resetAll() {
    if (this.client.isReady && this.storeRedis.resetAll) {
      try {
        return await this.storeRedis.resetAll();
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
        sendCommand: (...args) => client.sendCommand(args),
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

function creeazaRegistruCheiValori({ url, prefix = 'nutri' } = {}) {
  const cheieFinala = (key) => `${prefix}:${key}`;
  const rezerva = new MapCuExpirare();
  rezerva.pornesteCuratare();

  if (url) {
    const client = creeazaClientRedis({ url });
    return {
      redis: true,
      // M-04: flag expus — store-ul partajat e „degradat" când clientul Redis nu e
      // ready. Idempotency (rute critice) il consultă ca să închidă fail-closed (503)
      // fără a mai încerca vreun claim pe un stoc indisponibil. Comportamentul
      // de fallback (rezerva locală) rămâne neschimbat.
      get degradat() {
        return !client.isReady;
      },
      async get(key) {
        if (!client.isReady) return rezerva.get(cheieFinala(key));
        try {
          const val = await client.get(cheieFinala(key));
          return val ? JSON.parse(val) : null;
        } catch (err) {
          logWarnThrottled(`[Redis] get esuat (${codEroare(err)}); trec pe rezerva.`);
          return rezerva.get(cheieFinala(key));
        }
      },
      async set(key, value, ttlMs) {
        rezerva.set(cheieFinala(key), value, ttlMs);
        if (!client.isReady) return;
        try {
          const str = JSON.stringify(value);
          if (ttlMs && ttlMs > 0) {
            await client.set(cheieFinala(key), str, { PX: ttlMs });
          } else {
            await client.set(cheieFinala(key), str);
          }
        } catch (err) {
          logWarnThrottled(`[Redis] set esuat (${codEroare(err)}); ramane doar rezerva.`);
        }
      },
      async setIfAbsent(key, value, ttlMs) {
        const finala = cheieFinala(key);
        if (!client.isReady) return rezerva.setIfAbsent(finala, value, ttlMs);
        try {
          const optiuni = { NX: true };
          if (ttlMs && ttlMs > 0) optiuni.PX = ttlMs;
          const rezultat = await client.set(finala, JSON.stringify(value), optiuni);
          if (rezultat === 'OK') {
            rezerva.set(finala, value, ttlMs);
            return true;
          }
          return false;
        } catch (err) {
          logWarnThrottled(`[Redis] SET NX esuat (${codEroare(err)}); trec pe rezerva.`);
          return rezerva.setIfAbsent(finala, value, ttlMs);
        }
      },
      async del(key) {
        rezerva.del(cheieFinala(key));
        if (!client.isReady) return;
        try {
          await client.del(cheieFinala(key));
        } catch (err) {
          logWarnThrottled(`[Redis] del esuat (${codEroare(err)}).`);
        }
      },
    };
  }

  return {
    redis: false,
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
  };
}

module.exports = {
  creeazaClientRedis,
  creeazaStoreRateLimit,
  creeazaRegistruCheiValori,
  StoreCuRezerva,
  MapCuExpirare,
  codEroare,
  resetAlertaSentry, // expus pentru teste
};
