'use strict';

/**
 * Cache LRU marginit pentru sesiuni deja validate criptografic.
 *
 * Rezolva C6. Implementarea anterioara din server.js avea doua defecte:
 *   1. Plafonul MAX_TOKEN_CACHE_ENTRIES era verificat DOAR pe ramura Supabase.
 *      Ramura Clerk apela tokenCache.set() fara nicio verificare, deci cache-ul
 *      putea creste nelimitat -> epuizare de memorie.
 *   2. Evacuarea prin `keys().next().value` era FIFO dupa inserare, nu LRU:
 *      elimina sesiunea cea mai veche, chiar daca era cea mai activa.
 *
 * Aici plafonul este aplicat in `set()`, deci pe orice cale de apel, iar
 * accesul prin `get()` reimprospateaza pozitia intrarii (LRU real).
 *
 * Cheile trebuie sa fie hash-uri de token (SHA-256), niciodata token-uri brute.
 */
class TokenCache {
	constructor({ maxEntries = 5000, ttlMs = 60 * 1000 } = {}) {
		if (!Number.isInteger(maxEntries) || maxEntries < 1) {
			throw new TypeError('maxEntries trebuie sa fie un intreg pozitiv.');
		}
		if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
			throw new TypeError('ttlMs trebuie sa fie un numar pozitiv.');
		}
		this.maxEntries = maxEntries;
		this.ttlMs = ttlMs;
		this._intrari = new Map();
	}

	get size() {
		return this._intrari.size;
	}

	/**
	 * Intoarce utilizatorul memorat sau null daca lipseste ori a expirat.
	 * Reimprospateaza pozitia LRU la fiecare acces reusit.
	 */
	get(cheie) {
		const intrare = this._intrari.get(cheie);
		if (!intrare) return null;

		if (Date.now() >= intrare.expiraLa) {
			this._intrari.delete(cheie);
			return null;
		}

		// Reinserarea muta cheia la coada ordinii de iterare = cel mai recent folosit.
		this._intrari.delete(cheie);
		this._intrari.set(cheie, intrare);
		return intrare.utilizator;
	}

	/**
	 * Memoreaza un utilizator validat. Plafonul se aplica aici, deci nicio cale
	 * de apel nu il poate ocoli (spre deosebire de varianta din server.js).
	 */
	set(cheie, utilizator) {
		if (typeof cheie !== 'string' || !cheie) {
			throw new TypeError('Cheia de cache trebuie sa fie un string nevid.');
		}

		if (this._intrari.has(cheie)) {
			this._intrari.delete(cheie);
		}

		while (this._intrari.size >= this.maxEntries) {
			const ceaMaiVeche = this._intrari.keys().next().value;
			if (ceaMaiVeche === undefined) break;
			this._intrari.delete(ceaMaiVeche);
		}

		this._intrari.set(cheie, {
			utilizator,
			expiraLa: Date.now() + this.ttlMs,
		});
	}

	delete(cheie) {
		return this._intrari.delete(cheie);
	}

	clear() {
		this._intrari.clear();
	}

	/** Elimina intrarile expirate. Intoarce cate au fost sterse. */
	pruneExpired() {
		const acum = Date.now();
		let sterse = 0;
		for (const [cheie, intrare] of this._intrari.entries()) {
			if (acum >= intrare.expiraLa) {
				this._intrari.delete(cheie);
				sterse += 1;
			}
		}
		return sterse;
	}

	/** Porneste curatarea periodica. Timer-ul e unref-uit, nu tine procesul viu. */
	startSweeper(intervalMs = 5 * 60 * 1000) {
		const ticker = setInterval(() => this.pruneExpired(), intervalMs);
		if (typeof ticker.unref === 'function') ticker.unref();
		return ticker;
	}
}

module.exports = { TokenCache };
