'use strict';

const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = rateLimit;

/**
 * Limitatoare de trafic.
 *
 * Rezolva C1: nicio decizie de limitare nu se ia pe baza unui token nevalidat.
 * Cererile neautentificate se limiteaza pe IP; limitarea per utilizator se aplica
 * DOAR dupa requireAuth.
 *
 * Corectii dupa auditul urmator:
 *  - preAuthLimiter era 30 cereri / 15 min pe IP, aplicat pe tot /api/. In spatele
 *    unui CGNAT de operator mobil, o retea intreaga imparte acea cota: self-DoS
 *    pentru utilizatori legitimi. Pragul a fost ridicat, iar cererile OPTIONS
 *    (preflight CORS) nu se mai numara.
 *  - `store` se citeste acum din configurare, ca trecerea la Redis sa fie o
 *    schimbare de mediu, nu de cod. Cu MemoryStore, limitele efective se inmultesc
 *    cu numarul de instante — vezi avertismentul emis la pornire.
 */

const ipFallbackKey = (req) => {
	const ip = req.ip || req.socket?.remoteAddress || 'unknown';
	// IPv4-mapped (::ffff:1.2.3.4) se trateaza ca IPv4, altfel gruparea /64 ar
	// colapsa adrese distincte in aceeasi galeata. Folosim helperul ipKeyGenerator
	// al express-rate-limit: un keyGenerator custom care foloseste req.ip fara el
	// e respins la validare (ERR_ERL_KEY_GEN_IPV6) si limitele cad pe keying implicit.
	return ipKeyGenerator(ip, 64);
};

const cheieIdentitateVerificata = (req) =>
	req.user?.id ? `user:${req.user.id}` : ipFallbackKey(req);

const mesaj = (text) => ({ eroare: text });

const sarePreflight = (req) => req.method === 'OPTIONS';

/**
 * @param {object} [optiuni]
 * @param {object} [optiuni.store] Store partajat (ex. Redis). Obligatoriu daca
 *   backend-ul ruleaza pe mai multe instante.
 * @param {boolean} [optiuni.avertizeazaFaraStore]
 */
function creeazaLimitatoare({ store, avertizeazaFaraStore = false } = {}) {
	if (!store && avertizeazaFaraStore) {
		console.warn(
			'Rate limiting foloseste MemoryStore (per proces). Pe mai multe instante, ' +
				'limitele efective se inmultesc cu numarul de instante. Configureaza un store Redis.',
		);
	}

	const comun = {
		standardHeaders: true,
		legacyHeaders: false,
		skip: sarePreflight,
	};

	// `store` este un fabricant (funcție) care întoarce o instanță NOUĂ de store
	// per limiter, cu prefix unic. Un singur store partajat între 4 limitatoare
	// ar fi interzis de express-rate-limit v8 (ERR_ERL_STORE_REUSE), iar ultimul
	// init() ar suprascrie windowMs-ul celorlalte limitatoare.
	//
	// N-05: ramura „store = obiect" a fost eliminată. Contractul real al registrului
	// partajat (utils/storePartajat.js — creeazaStoreRateLimit) expune DOAR un
	// fabricant: { store: creeaza }. Un obiect store împărțit direct între cele 4
	// limitatoare ar fi respins la init() cu ERR_ERL_STORE_REUSE (v8), deci acea
	// ramură nu putea fi atinsă corect niciodată.
	const cuStorePropriu = (prefix) =>
		typeof store === 'function' ? { store: store({ prefix }) } : {};

	// N-05: dacă cineva trece un `store` nefuncțional, nu-l împărțim spre 4
	// limitatoare (ar crăpa la init) — avertisment unic la boot + MemoryStore implicit.
	if (store && typeof store !== 'function') {
		console.warn(
			'Rate limit: `store` nefuncțional ignorat (așteptat fabricant din ' +
				'creeazaStoreRateLimit); se folosește MemoryStore implicit.',
		);
	}

	const preAuthLimiter = rateLimit({
		...comun,
		...cuStorePropriu('rl:preauth:'),
		windowMs: 15 * 60 * 1000,
		max: 300,
		keyGenerator: ipFallbackKey,
		message: mesaj('Prea multe cereri. Incearca mai tarziu.'),
	});

	const generalLimiter = rateLimit({
		...comun,
		...cuStorePropriu('rl:general:'),
		windowMs: 15 * 60 * 1000,
		max: 100,
		keyGenerator: cheieIdentitateVerificata,
		message: mesaj('Prea multe cereri. Incearca mai tarziu.'),
	});

	const statusLimiter = rateLimit({
		...comun,
		...cuStorePropriu('rl:status:'),
		windowMs: 60 * 1000,
		max: 120,
		keyGenerator: ipFallbackKey,
		message: mesaj('Prea multe cereri de status. Incearca in cateva secunde.'),
	});

	const aiLimiter = rateLimit({
		...comun,
		...cuStorePropriu('rl:ai:'),
		windowMs: 60 * 1000,
		max: 15,
		keyGenerator: cheieIdentitateVerificata,
		message: mesaj(
			'Ai depasit limita de 15 cereri pe minut pentru AI. Te rugam sa astepti un minut.',
		),
	});

	return { preAuthLimiter, generalLimiter, statusLimiter, aiLimiter };
}

module.exports = {
	ipFallbackKey,
	cheieIdentitateVerificata,
	creeazaLimitatoare,
};
