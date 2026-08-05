'use strict';

/**
 * Store partajat pentru rate-limit si pentru registrul de cooldown al
 * furnizorilor AI (B-10).
 *
 * Daca `REDIS_URL` este configurat, limitele si cooldown-urile sunt partajate
 * intre instante. Fara Redis (ex. sub Jest sau pe o instanta unica) se foloseste
 * memoria locala, iar limitele efective se inmultesc cu numarul de instante.
 *
 * ==========================================================================
 * REGULA (C-1, audit 2026-08-05)
 * ==========================================================================
 * Un Redis cazut degradeaza LIMITAREA, niciodata DISPONIBILITATEA.
 *
 * Varianta anterioara enunta acest principiu in comentariu si il incalca in
 * cod: `client.connect()` era fire-and-forget, iar `RedisStore` era construit
 * imediat peste clientul neconectat. Orice comanda emisa in fereastra de
 * pornire - sau pe toata durata unei caderi Redis - respingea, iar
 * express-rate-limit propaga respingerea prin `next(err)`. Rezultat: 500 pe
 * fiecare ruta limitata, adica pe tot /api/.
 *
 * Acum store-ul expus este `StoreCuRezerva`, care deleaga la Redis si cade pe
 * MemoryStore local la orice esec. Comportamentul degradat este explicit,
 * logat cu throttling si observabil prin `statistici()`.
 *
 * ==========================================================================
 * REGULA (C-2)
 * ==========================================================================
 * Erorile Redis NU se logheaza cu `err.message` brut: mesajele node-redis pot
 * contine URL-ul de conectare, care include `user:parola`. Se logheaza doar
 * codul erorii, prin Logger-ul cu scrubbing PII (B-11), niciodata prin
 * console.* direct.
 */

const { MemoryStore } = require('express-rate-limit');
const { Logger } = require('./logger');

let clientRedisCache = null;
let storeRateLimitCache = null;

/** Interval minim intre doua avertismente identice, ca sa nu inundam log-ul. */
const INTERVAL_AVERTISMENT_MS = 30 * 1000;

/**
 * Extrage un identificator de eroare SIGUR de logat.
 * `err.message` este interzis: poate contine credentiale din URL-ul de conectare.
 */
function codEroare(err) {
	if (!err) return 'necunoscut';
	return String(err.code || err.errno || err.name || 'necunoscut').slice(0, 40);
}

function creeazaClientRedis({ url }) {
	if (clientRedisCache) return clientRedisCache;

	const redis = require('redis');
	const client = redis.createClient({ url });

	let ultimaAvertizare = 0;
	client.on('error', (err) => {
		const acum = Date.now();
		if (acum - ultimaAvertizare < INTERVAL_AVERTISMENT_MS) return;
		ultimaAvertizare = acum;
		Logger.warn('Eroare client Redis', {
			furnizor: 'redis',
			status: codEroare(err),
		});
	});

	client.connect().catch((err) => {
		Logger.warn('Conectare Redis esuata; se continua cu memorie locala', {
			furnizor: 'redis',
			status: codEroare(err),
		});
	});

	clientRedisCache = client;
	return client;
}

/**
 * Store compatibil express-rate-limit care deleaga la `principal` si cade pe
 * `rezerva` la orice esec.
 *
 * Contractul express-rate-limit (v7+): `init(options)`, `increment(key)`,
 * `decrement(key)`, `resetKey(key)`, optional `resetAll()`. `localKeys` este
 * false pentru ca store-ul principal este partajat.
 */
class StoreCuRezerva {
	constructor({ principal, rezerva }) {
		this.principal = principal;
		this.rezerva = rezerva;
		this.localKeys = false;
		this._ultimaAvertizare = 0;
		this._statistici = { delegari: 0, caderiPeRezerva: 0 };
	}

	init(optiuni) {
		// MemoryStore are nevoie de windowMs; fara init ar arunca la prima cerere.
		if (typeof this.principal.init === 'function') this.principal.init(optiuni);
		if (typeof this.rezerva.init === 'function') this.rezerva.init(optiuni);
	}

	_semnaleazaDegradare(err) {
		this._statistici.caderiPeRezerva += 1;
		const acum = Date.now();
		if (acum - this._ultimaAvertizare < INTERVAL_AVERTISMENT_MS) return;
		this._ultimaAvertizare = acum;
		Logger.warn(
			'Rate-limit degradat pe MemoryStore local: store-ul partajat nu raspunde',
			{ furnizor: 'redis', status: codEroare(err) },
		);
	}

	async _cuRezerva(nume, ...argumente) {
		this._statistici.delegari += 1;
		try {
			return await this.principal[nume](...argumente);
		} catch (err) {
			this._semnaleazaDegradare(err);
			if (typeof this.rezerva[nume] !== 'function') return undefined;
			return this.rezerva[nume](...argumente);
		}
	}

	increment(cheie) {
		return this._cuRezerva('increment', cheie);
	}

	decrement(cheie) {
		return this._cuRezerva('decrement', cheie);
	}

	resetKey(cheie) {
		return this._cuRezerva('resetKey', cheie);
	}

	resetAll() {
		return this._cuRezerva('resetAll');
	}

	statistici() {
		return { ...this._statistici };
	}
}

/**
 * Store pentru express-rate-limit. Returneaza null daca `url` lipseste
 * (MemoryStore ramane implicit in utils/rateLimit.js).
 *
 * Forma returnata este `{ store }` - pastrata pentru compatibilitate cu
 * apelantul din server.js (`storePartajat?.store`).
 */
function creazaStoreRateLimit({ url }) {
	if (!url) return null;
	if (storeRateLimitCache) return storeRateLimitCache;

	const { RedisStore } = require('rate-limit-redis');
	const client = creeazaClientRedis({ url });

	// Nu atingem reteaua daca clientul nu e gata: o respingere sincrona e mai
	// ieftina decat un timeout, iar StoreCuRezerva o trateaza identic.
	const sendCommand = async (...argumente) => {
		if (!client.isReady) {
			const err = new Error('Client Redis neconectat.');
			err.code = 'REDIS_NECONECTAT';
			throw err;
		}
		return client.sendCommand(argumente);
	};

	storeRateLimitCache = {
		store: new StoreCuRezerva({
			principal: new RedisStore({ sendCommand }),
			rezerva: new MemoryStore(),
		}),
	};
	return storeRateLimitCache;
}

/**
 * Registru cheie-valoare cu TTL. Folosit pentru cooldown-ul furnizorilor AI.
 *
 * API: { get(key) -> valoare|null, set(key, valoare, ttlMs), del(key) }
 * Toate intorc Promise. Suporta Redis sau memorie locala.
 */
function creazaRegistruCheiValori({ url, prefix = 'nutri', maxIntrari = 5000 } = {}) {
	const cheieFinala = (key) => `${prefix}:${key}`;

	if (url) {
		const client = creeazaClientRedis({ url });
		return {
			redis: true,
			async get(key) {
				if (!client.isReady) return null;
				try {
					const val = await client.get(cheieFinala(key));
					return val ? JSON.parse(val) : null;
				} catch (err) {
					Logger.warn('Citire Redis esuata', { furnizor: 'redis', status: codEroare(err) });
					return null;
				}
			},
			async set(key, value, ttlMs) {
				if (!client.isReady) return;
				try {
					const str = JSON.stringify(value);
					if (ttlMs && ttlMs > 0) {
						await client.set(cheieFinala(key), str, { PX: ttlMs });
					} else {
						await client.set(cheieFinala(key), str);
					}
				} catch (err) {
					Logger.warn('Scriere Redis esuata', { furnizor: 'redis', status: codEroare(err) });
				}
			},
			async del(key) {
				if (!client.isReady) return;
				try {
					await client.del(cheieFinala(key));
				} catch (err) {
					Logger.warn('Stergere Redis esuata', { furnizor: 'redis', status: codEroare(err) });
				}
			},
		};
	}

	// ------------------------------------------------------------------
	// Varianta in memorie.
	//
	// Doua defecte reparate fata de varianta anterioara:
	//   1. Plafonul de igiena stergea cheia TOCMAI inserata, nu pe cea mai veche.
	//      Peste 5000 de intrari, orice set() fara TTL raporta succes fara sa
	//      scrie nimic - cea mai proasta forma de esec posibila.
	//   2. Intrarile cu TTL nu erau evacuate niciodata activ, ci doar lenes la
	//      get(). O cheie scrisa si necitita ramanea pe veci: scurgere de memorie.
	// ------------------------------------------------------------------
	const map = new Map();

	const curataExpirate = () => {
		const acum = Date.now();
		for (const [cheie, intrare] of map.entries()) {
			if (intrare.expira && intrare.expira <= acum) map.delete(cheie);
		}
	};

	const sweeper = setInterval(curataExpirate, 5 * 60 * 1000);
	if (typeof sweeper.unref === 'function') sweeper.unref();

	return {
		redis: false,
		async get(key) {
			const cheie = cheieFinala(key);
			const intrare = map.get(cheie);
			if (!intrare) return null;
			if (intrare.expira && intrare.expira <= Date.now()) {
				map.delete(cheie);
				return null;
			}
			return intrare.valoare;
		},
		async set(key, value, ttlMs) {
			const cheie = cheieFinala(key);
			map.delete(cheie);

			if (map.size >= maxIntrari) {
				curataExpirate();
				// Daca tot e plin, evacuam cea mai VECHE intrare (ordinea de
				// iterare a unui Map este ordinea de inserare).
				while (map.size >= maxIntrari) {
					const ceaMaiVeche = map.keys().next().value;
					if (ceaMaiVeche === undefined) break;
					map.delete(ceaMaiVeche);
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
		_dimensiune() {
			return map.size;
		},
	};
}

module.exports = {
	creeazaClientRedis,
	creazaStoreRateLimit,
	creazaRegistruCheiValori,
	StoreCuRezerva,
};
