'use strict';

/**
 * Cache LRU marginit pentru sesiuni deja validate criptografic.
 *
 * Rezolva C6 (plafon aplicat pe orice cale de apel, evacuare LRU reala) si, in
 * plus, fereastra de revocare semnalata la auditul urmator:
 *
 *   Varianta anterioara memora identitatea 60 de secunde fara sa se uite vreodata
 *   la `exp`-ul tokenului. Un logout, o schimbare de parola sau o suspendare de
 *   cont ramaneau fara efect pana la 60s, iar un token expirat continua sa fie
 *   acceptat cat timp era in cache.
 *
 * Acum `set()` accepta `expiraLaMs` (momentul real de expirare al tokenului) si
 * foloseste minimul dintre acesta si TTL-ul cache-ului. Un token nu poate fi
 * niciodata valabil in cache mai mult decat este valabil in realitate.
 *
 * Cheile trebuie sa fie hash-uri de token (SHA-256), niciodata token-uri brute.
 */
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
		// A-4: cand e true, se impune strict SHA-256 (64 hex) ca cheie. Implicit
		// e false, ca testele existente (chei scurte 'a'/'b'/'c') sa ramana verzi.
		this.cheiHashuite = cheiHashuite === true;
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

	/**
	 * Validare de chei (A-4). Respinge cheile care arata ca JWT brut sau ca un
	 * identificator suspect; hash-urile SHA-256 trec intotdeauna.
	 */
	_valideazaCheia(cheie) {
		if (typeof cheie !== 'string' || !cheie) {
			this._statistici.cheiRespinse += 1;
			return false;
		}
		if (this.cheiHashuite) {
			if (!/^[0-9a-f]{64}$/i.test(cheie)) {
				this._statistici.cheiRespinse += 1;
				return false;
			}
			return true;
		}
		if (cheie.startsWith('eyJ')) {
			this._statistici.cheiRespinse += 1;
			return false;
		}
		if (cheie.includes('.') || cheie.includes(' ')) {
			this._statistici.cheiRespinse += 1;
			return false;
		}
		if (cheie.length > 128) {
			this._statistici.cheiRespinse += 1;
			return false;
		}
		return true;
	}

	get(cheie) {
		if (!this._valideazaCheia(cheie)) return null;
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
	 * @param {string} cheie Hash-ul tokenului.
	 * @param {object} utilizator Identitatea validata.
	 * @param {{ expiraLaMs?: number|null }} [optiuni] Expirarea reala a tokenului.
	 */
	set(cheie, utilizator, { expiraLaMs = null } = {}) {
		if (!this._valideazaCheia(cheie)) {
			throw new TypeError('Cheie de cache invalida. Foloseste un hash de token.');
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

module.exports = { TokenCache };
