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

// Plafon anti-DoS pentru contoarele in-memory (cota AI): fara TTL expirat se
// adauga din nou la acces, dar capacitatea trebuie marginita totusi.
const MAX_INTRARI_MAP = 50000;

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
 * furnizorilor AI si pentru contorul de cota AI per utilizator (S-10).
 *
 * API: { get(key) -> valoare|null, set(key, valoare, ttlMs), del(key),
 *        increment(key, ttlMs) -> numar, ttl(key) -> secunde }
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
      // Contor atomic (INCR + PEXPIRE la prima incrementare). Atomicitatea din
      // Redis inchide cursa dintre citire si scriere a cotei AI (S-10): doua
      // procese care incrementeaza simultan nu pot depasi ambele plafonul.
      async increment(key, ttlMs) {
        try {
          const cheie = cheieFinala(key);
          const valoare = await client.incr(cheie);
          if (valoare === 1 && ttlMs && ttlMs > 0) {
            await client.pExpire(cheie, ttlMs);
          }
          return valoare;
        } catch (err) {
          console.warn('[Redis] increment esuat:', err.message);
          return null;
        }
      },
      // Secunde ramase pana la expirare. -1 = cheie fara TTL, -2 = cheie inexistenta.
      async ttl(key) {
        try {
          return await client.ttl(cheieFinala(key));
        } catch (err) {
          console.warn('[Redis] ttl esuat:', err.message);
          return -1;
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
      const cheie = cheieFinala(key);
      if (!map.has(cheie) && map.size >= MAX_INTRARI_MAP) {
        // Plafon anti-DoS: eliberam intrarile expirate, apoi pe cea mai veche
        // (Map pastreaza ordinea de insertie) — aproximativ LRU, ca TokenCache.
        const acum = Date.now();
        const expirate = [];
        for (const [k, e] of map) {
          if (e?.expira && e.expira <= acum) expirate.push(k);
        }
        expirate.forEach((k) => map.delete(k));
        if (map.size >= MAX_INTRARI_MAP) {
          const ceaMaiVeche = map.keys().next().value;
          if (ceaMaiVeche !== undefined) map.delete(ceaMaiVeche);
        }
      }
      map.set(cheie, {
        valoare: value,
        expira: ttlMs && ttlMs > 0 ? Date.now() + ttlMs : 0,
      });
    },
    async del(key) {
      map.delete(cheieFinala(key));
    },
    // Contor sincron pe Map, cu aceleasi garantii ca versiunea Redis: expirare
    // din prima incrementare si capacitate marginita.
    async increment(key, ttlMs) {
      const cheie = cheieFinala(key);
      const acum = Date.now();
      let intrare = map.get(cheie);
      if (!intrare || (intrare.expira && intrare.expira <= acum)) {
        if (map.size >= MAX_INTRARI_MAP) {
          // Mai intai eliberam intrarile expirate; daca ramane la capacitate,
          // refuzam noua intrare in loc sa crestem nelimitat.
          const expirate = [];
          for (const [k, e] of map) {
            if (e?.expira && e.expira <= acum) expirate.push(k);
          }
          expirate.forEach((k) => map.delete(k));
          if (map.size >= MAX_INTRARI_MAP) return null;
        }
        intrare = { valoare: 0, expira: ttlMs && ttlMs > 0 ? acum + ttlMs : 0 };
        map.set(cheie, intrare);
      }
      intrare.valoare += 1;
      return intrare.valoare;
    },
    async ttl(key) {
      const cheie = cheieFinala(key);
      const intrare = map.get(cheie);
      if (!intrare) return -2;
      if (intrare.expira && intrare.expira > Date.now()) {
        return Math.ceil((intrare.expira - Date.now()) / 1000);
      }
      return -1;
    },
  };
}

module.exports = {
  creeazaClientRedis,
  creazaStoreRateLimit,
  creazaRegistruCheiValori,
};