'use strict';

const { MemoryStore } = require('express-rate-limit');

/**
 * Store partajat pentru rate-limit si pentru registry-ul de cooldown al
 * furnizorilor AI (B-10).
 *
 * Daca `REDIS_URL` este configurat, limitele si cooldown-urile sunt partajate
 * intre instante: doua procese locale imparte aceeasi limita. Fara Redis
 * (ex. sub Jest sau pe o instanta unica) se foloseste MemoryStore / map local,
 * iar limitele efective se inmultesc cu numarul de instante — acceptabil in dev.
 *
 * Un Redis cazut NU trebuie sa duca serverul la pamant: toate operatiile sunt
 * izolate prin try/catch si esueaza graceful, cadea pe valoarea implicita.
 *
 * A-1: rate-limiting-ul este un mecanism de protectie; daca store-ul Redis cade,
 * traficul trece pe un store local de rezerva (MemoryStore), nu se transforma in
 * 500 pe tot /api/. Acelasi tratament se aplica registry-ului de cooldown.
 * A-2: nicio logare din acest fisier nu expune mesajul brut al erorii — mesajele
 * de eroare Redis contin URL-ul complet cu parola (redis://utilizator:parola@gazda).
 * Se logheaza exclusiv err.code / err.name prin `codEroare()`.
 */

const PLAFON_INTRARI = 5000;
const CURATARE_INTERVAL_MS = 5 * 60 * 1000;
const SALTIRE_LOGGING_MS = 30 * 1000;

let storeRateLimitCache = null;
let clientRedisCache = null;
let ultimulAvertisment = 0;

/**
 * Cod de eroare sigur de logat (A-2). Nu intoarce niciodata mesajul brut.
 */
function codEroare(err) {
  if (!err) return 'NECUNOSCUT';
  return err?.code || err?.name || 'NECUNOSCUT';
}

/**
 * Avertisment cu throttling de 30 de secunde: un Redis cazut nu trebuie sa
 * genereze o linie de log per cerere.
 */
function logWarnThrottled(mesaj) {
  const acum = Date.now();
  if (acum - ultimulAvertisment < SALTIRE_LOGGING_MS) return;
  ultimulAvertisment = acum;
  console.warn(mesaj);
}

/**
 * Eroare de semnal pentru „Redis indisponibil". Se propaga doar in interiorul
 * acestui fisier, pentru ca logarea sa poarte codul, nu mesajul original.
 */
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
    // Doar avertisment: inca o cale care functioneaza in lipsa Redis.
    logWarnThrottled(`[Redis] Eroare client: ${codEroare(err)}`);
  });
  client.connect().catch((err) => {
    logWarnThrottled(`[Redis] Conectare esuata, se continua cu memorie locala: ${codEroare(err)}`);
  });
  clientRedisCache = client;
  return client;
}

/**
 * Store compatibil cu interfata express-rate-limit v8 (init / increment /
 * decrement / resetKey / resetAll / localKeys).
 *
 * Fiecare operatie incearca intai store-ul Redis; daca clientul nu e gata
 * (`isReady === false`) sau operatia arunca, executa aceeasi operatie pe
 * MemoryStore-ul de rezerva si intoarce rezultatul acestuia. Cererea nu
 * esueaza niciodata din cauza Redis.
 */
class StoreCuRezerva {
  constructor({ client, storeRedis }) {
    this.client = client;
    this.storeRedis = storeRedis;
    this.storeRezerva = new MemoryStore();
    // Store-ul primar e Redis (partajat intre instante), deci localKeys ramane
    // false — la fel ca la RedisStore-ul simplu.
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
        logWarnThrottled(`[RateLimit] Redis indisponibil (${codEroare(err)}); trec pe rezerva.`);
      }
    } else {
      logWarnThrottled(`[RateLimit] Redis neconectat (${codEroare(eroareRedisNeconectat())}); trec pe rezerva.`);
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

/**
 * Store compatibil express-rate-limit. Returneaza null daca `url` lipseste
 * (MemoryStore ramane implicit in utils/rateLimit.js).
 */
function creazaStoreRateLimit({ url }) {
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

/**
 * Map in memorie cu TTL, plafon de intrari cu evacuarea celei mai vechi chei si
 * curatare periodica a expirarilor. Este rezerva locala a registry-ului cand
 * Redis e indisponibil (si singurul backend cand url lipseste).
 */
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
    // Plafon de igiena: la depasire se evacueaza cea mai veche cheie (Map
    // pastreaza ordinea de insertie). Fara aceasta garda, o cheie scrisa fara
    // TTL ar ramane in memorie la nesfarsit.
    if (this.map.size >= PLAFON_INTRARI && !this.map.has(cheie)) {
      const ceaMaiVeche = this.map.keys().next().value;
      if (ceaMaiVeche !== undefined) this.map.delete(ceaMaiVeche);
    }
    this.map.set(cheie, {
      valoare,
      expira: ttlMs && ttlMs > 0 ? Date.now() + ttlMs : 0,
    });
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

/**
 * Registru cheie-valoare cu TTL, sincron API async. Folosit pentru cooldown-ul
 * furnizorilor AI si (optional) pentru orice contor partajat.
 *
 * API: { get(key) -> valoare|null, set(key, valoare, ttlMs), del(key) }
 * Toate intorc Promise. Suporta Redis cu rezerva locala, sau doar memorie.
 */
function creazaRegistruCheiValori({ url, prefix = 'nutri' } = {}) {
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
        // Se inscrie si in rezerva ca sa existe o copie locala pentru fereastra
        // in care Redis e indisponibil; scrierea Redis nu trebuie sa pice set-ul.
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
    async del(key) {
      rezerva.del(cheieFinala(key));
    },
  };
}

module.exports = {
  creeazaClientRedis,
  creazaStoreRateLimit,
  creazaRegistruCheiValori,
  StoreCuRezerva,
  codEroare,
};
