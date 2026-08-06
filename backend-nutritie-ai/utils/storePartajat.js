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

const PLAFON_INTRARI = 5000;
const CURATARE_INTERVAL_MS = 5 * 60 * 1000;
const SALTIRE_LOGGING_MS = 30 * 1000;

let storeRateLimitCache = null;
let clientRedisCache = null;
let ultimulAvertisment = 0;
let sentriAlertaTrimisa = false; // evităm flooding Sentry

function codEroare(err) {
  if (!err) return 'NECUNOSCUT';
  return err?.code || err?.name || 'NECUNOSCUT';
}

function logWarnThrottled(mesaj) {
  const acum = Date.now();
  if (acum - ultimulAvertisment < SALTIRE_LOGGING_MS) return;
  ultimulAvertisment = acum;
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
  if (clientRedisCache) return clientRedisCache;
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
  clientRedisCache = client;
  return client;
}

class StoreCuRezerva {
  constructor({ client, storeRedis }) {
    this.client = client;
    this.storeRedis = storeRedis;
    this.storeRezerva = new MemoryStore();
    this.localKeys = false;
  }

  init(options) {
    if (this.storeRezerva.init) {
      try {
        this.storeRezerva.init(options);
      } catch (err) {
        logWarnThrottled(`[RateLimit] init rezerva esuat (${codEroare(err)}).`);
      }
    }
    if (this.client.isReady && this.storeRedis.init) {
      Promise.resolve(this.storeRedis.init(options)).catch((err) => {
        logWarnThrottled(`[RateLimit] init Redis esuat (${codEroare(err)}); ramane rezerva.`);
      });
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
  if (storeRateLimitCache) return storeRateLimitCache;
  const { RedisStore } = require('rate-limit-redis');
  const client = creeazaClientRedis({ url });
  storeRateLimitCache = {
    store: new StoreCuRezerva({
      client,
      storeRedis: new RedisStore({
        sendCommand: (...args) => client.sendCommand(args),
      }),
    }),
  };
  return storeRateLimitCache;
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
