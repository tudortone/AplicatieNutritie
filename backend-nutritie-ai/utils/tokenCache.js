'use strict';

/**
 * Cache LRU marginit pentru sesiuni deja validate criptografic.
 *
 * Rezolva C6 (plafon aplicat pe orice cale de apel, evacuare LRU reala) si,
 * in plus, fereastra de revocare semnalata la auditul urmator:
 *
 *   Varianta anterioara memora identitatea 60 de secunde fara sa se uite vreodata
 *   la `exp`-ul tokenului. Un logout, o schimbare de parola sau o suspendare de
 *   cont ramaneau fara efect pana la 60s, iar un token expirat continua sa fie
 *   acceptat cat timp era in cache.
 *
 * `set()` accepta `expiraLaMs` (momentul real de expirare al tokenului) si
 * foloseste minimul dintre acesta si TTL-ul cache-ului. Un token nu poate fi
 * niciodata valabil in cache mai mult decat este valabil in realitate.
 *
 * ==========================================================================
 * C-5 (audit 2026-08-05): invariantul cheii este acum IMPUS, nu doar promis.
 * ==========================================================================
 * Docstring-ul cerea hash-uri de token si nimic nu verifica: `set()` accepta
 * orice string nevid. Un apelant care pasa tokenul brut transforma acest cache
 * intr-un depozit de JWT-uri valide in memoria procesului, vizibile in orice
 * heap dump sau core file. Clasa valida pedant `maxEntries` si `ttlMs`, dar nu
 * si singura conditie cu consecinte de securitate.
 *
 * Validarea implicita este pe FORMA DE TOKEN, nu pe hex-64: respinge ce arata
 * a JWT (punct, spatiu, prefix `eyJ`, lungime peste 128) si lasa sa treaca
 * cheile scurte folosite in teste. Cu `cheiHashuite: true` se cere strict
 * hex de 64 de caractere - modul recomandat in productie.
 */

const REGEX_HASH_SHA256 = /^[0-9a-f]{64}$/i;

/** Lungime peste care o cheie nu mai poate fi un hash, deci e suspecta. */
const LUNGIME_MAXIMA_CHEIE = 128;

function verificaCheie(cheie, cheiHashuite) {
	if (typeof cheie !== 'string' || !cheie) {
		throw new TypeError('Cheia de cache trebuie sa fie un string nevid.');
	}

	if (cheiHashuite) {
		if (!REGEX_HASH_SHA256.test(cheie)) {
			throw new TypeError(
				'Cheia de cache trebuie sa fie un hash SHA-256 (64 caractere hex).',
			);
		}
		return;
	}

	// Fara mod strict, refuzam cel putin ce seamana cu un secret brut.
	if (
		cheie.length > LUNGIME_MAXIMA_CHEIE ||
		cheie.includes('.') ||
		/\s/.test(cheie) ||
		cheie.startsWith('eyJ')
	) {
		throw new TypeError(
			'Cheia de cache pare a fi un token brut. Foloseste hash-ul SHA-256 al tokenului, niciodata tokenul.',
		);
	}
}

class TokenCache {
	constructor({ maxEntries = 5000, ttlMs = 60 * 1000, cheiHashuite = false } = {}) {
		if (!Number.isInteger(maxEntries) || maxEntries < 1) {
			throw new TypeError('maxEntries trebuie sa fie un intreg pozitiv.');
		}
		if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
			throw new TypeError('ttlMs trebuie sa fie un numar pozitiv.');
		}
		this.maxEntries = maxEntries;
		this.ttlMs = ttlMs;
		this.cheiHashuite = Boolean(cheiHashuite);
		this._intrari = new Map();
		this._statistici = { hits: 0, misses: 0, evacuari: 0, expirate: 0, cheiRespinse: 0 };
	}

	get size() {
		return this._intrari.size;
	}

	/** Metrici de dimensionare. Un cache fara observabilitate nu poate fi reglat. */
	get statistici() {
		return { ...this._statistici, dimensiune: this._intrari.size };
	}

	get(cheie) {
		const intrare = this._intrari.get(cheie);
		if (!intrare) {
			this._statistici.misses += 1;
			return null;
		}

		if (Date.now() >= intrare.expiraLa) {
			this._intrari.delete(cheie);
			this._statistici.expirate += 1;
			this._statistici.misses += 1;
			return null;
		}

		// Reinserarea muta cheia la coada ordinii de iterare = cel mai recent folosit.
		this._intrari.delete(cheie);
		this._intrari.set(cheie, intrare);
		this._statistici.hits += 1;
		return intrare.utilizator;
	}

	/**
	 * @param {string} cheie Hash-ul SHA-256 al tokenului. NICIODATA tokenul brut.
	 * @param {object} utilizator Identitatea validata.
	 * @param {{ expiraLaMs?: number|null }} [optiuni] Expirarea reala a tokenului.
	 */
	set(cheie, utilizator, { expiraLaMs = null } = {}) {
		try {
			verificaCheie(cheie, this.cheiHashuite);
		} catch (err) {
			this._statistici.cheiRespinse += 1;
			throw err;
		}

		const acum = Date.now();
		let expiraLa = acum + this.ttlMs;

		if (Number.isFinite(expiraLaMs)) {
			// Un token deja expirat nu se memoreaza deloc.
			if (expiraLaMs <= acum) return;
			expiraLa = Math.min(expiraLa, expiraLaMs);
		}

		if (this._intrari.has(cheie)) this._intrari.delete(cheie);

		while (this._intrari.size >= this.maxEntries) {
			const ceaMaiVeche = this._intrari.keys().next().value;
			if (ceaMaiVeche === undefined) break;
			this._intrari.delete(ceaMaiVeche);
			this._statistici.evacuari += 1;
		}

		this._intrari.set(cheie, { utilizator, expiraLa });
	}

	delete(cheie) {
		return this._intrari.delete(cheie);
	}

	clear() {
		this._intrari.clear();
	}

	pruneExpired() {
		const acum = Date.now();
		let sterse = 0;
		for (const [cheie, intrare] of this._intrari.entries()) {
			if (acum >= intrare.expiraLa) {
				this._intrari.delete(cheie);
				sterse += 1;
			}
		}
		this._statistici.expirate += sterse;
		return sterse;
	}

	/** Curatare periodica. Timer-ul e unref-uit, nu tine procesul viu. */
	startSweeper(intervalMs = 5 * 60 * 1000) {
		const ticker = setInterval(() => this.pruneExpired(), intervalMs);
		if (typeof ticker.unref === 'function') ticker.unref();
		return ticker;
	}
}

module.exports = { TokenCache, REGEX_HASH_SHA256 };
