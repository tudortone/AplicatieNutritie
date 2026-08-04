'use strict';

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
 */

let storeRateLimitCache = null;
let registerEntryKeyCache = null;

function creeazaClientRedis({ url }) {
  if (registerEntryKeyCache) return registerEntryKeyCache;
  const redis = require('redis');
  const client = redis.createClient({ url });
  client.on('error', (err) => {
    // Doar avertisment: inca o cale care functioneaza in lipsa Redis.
    console.warn('[Redis] Eroare client:', err.message);
  });
  client.connect().catch((err) => {
    console.warn('[Redis] Conectare esuata, se continua cu memorie locala:', err.message);
  });
  registerEntryKeyCache = client;
  return client;
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
    store: new RedisStore({
      sendCommand: (...args) => client.sendCommand(args),
    }),
  };
  return storeRateLimitCache;
}

/**
 * Registru cheie-valoare cu TTL, sincron API async. Folosit pentru cooldown-ul
 * furnizorilor AI si (optional) pentru orice contor partajat.
 *
 * API: { get(key) -> valoare|null, set(key, valoare, ttlMs), del(key) }
 * Toate intorc Promise. Suporta Redis sau memorie locala.
 */
function creazaRegistruCheiValori({ url, prefix = 'nutri' } = {}) {
  const cheieFinala = (key) => `${prefix}:${key}`;

  if (url) {
    const client = creeazaClientRedis({ url });
    return {
      redis: true,
      async get(key) {
        try {
          const val = await client.get(cheieFinala(key));
          return val ? JSON.parse(val) : null;
        } catch (err) {
          console.warn('[Redis] get esuat:', err.message);
          return null;
        }
      },
      async set(key, value, ttlMs) {
        try {
          const str = JSON.stringify(value);
          if (ttlMs && ttlMs > 0) {
            await client.set(cheieFinala(key), str, { PX: ttlMs });
          } else {
            await client.set(cheieFinala(key), str);
          }
        } catch (err) {
          console.warn('[Redis] set esuat:', err.message);
        }
      },
      async del(key) {
        try {
          await client.del(cheieFinala(key));
        } catch (err) {
          console.warn('[Redis] del esuat:', err.message);
        }
      },
    };
  }

  const map = new Map();
  return {
    redis: false,
    async get(key) {
      const entry = map.get(cheieFinala(key));
      if (!entry) return null;
      if (entry.expira && entry.expira <= Date.now()) {
        map.delete(cheieFinala(key));
        return null;
      }
      return entry.valoare;
    },
    async set(key, value, ttlMs) {
      map.set(cheieFinala(key), {
        valoare: value,
        expira: ttlMs && ttlMs > 0 ? Date.now() + ttlMs : 0,
      });
      if ((!ttlMs || ttlMs <= 0) && map.size > 5000) {
        // Plafon de igiena in-memory: intrare fara TTL tinuta la nesfarsit nu are sens.
        map.delete(cheieFinala(key));
      }
    },
    async del(key) {
      map.delete(cheieFinala(key));
    },
  };
}

module.exports = {
  creeazaClientRedis,
  creazaStoreRateLimit,
  creazaRegistruCheiValori,
};