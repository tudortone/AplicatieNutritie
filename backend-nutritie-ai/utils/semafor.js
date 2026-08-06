'use strict';

/**
 * Plafon de concurenta cu coada marginita.
 *
 * Motiv: /api/analiza-foto tine in heap imaginea bruta plus varianta base64
 * (~1,34x) pe toata durata cascadei de furnizori. Fara plafon, numarul de cereri
 * simultane este limitat doar de rate limiter-ul per utilizator, deci un varf de
 * trafic se traduce direct in sute de MB alocati si in zeci de apeluri platite
 * pornite in paralel.
 *
 * Coada este marginita intentionat: mai bine un 503 rapid si onest decat cereri
 * care asteapta minute in linie si expira oricum la client.
 */
class Semafor {
	constructor({ max = 4, maxCoada = 12 } = {}) {
		if (!Number.isInteger(max) || max < 1) {
			throw new TypeError('max trebuie sa fie un intreg pozitiv.');
		}
		if (!Number.isInteger(maxCoada) || maxCoada < 0) {
			throw new TypeError('maxCoada trebuie sa fie un intreg pozitiv.');
		}
		this.max = max;
		this.maxCoada = maxCoada;
		this.activi = 0;
		this._coada = [];
	}

	get inAsteptare() {
		return this._coada.length;
	}

	async ruleaza(functie, signal = null) {
		if (!functie || typeof functie !== 'function') {
			throw new TypeError('ruleaza necesita o functie.');
		}
		if (signal?.aborted) {
			throw this.eroareAnulare();
		}

		if (this.activi >= this.max) {
			if (this._coada.length >= this.maxCoada) {
				const eroare = new Error(
					'Serverul proceseaza deja numarul maxim de analize AI. Incearca in cateva secunde.',
				);
				eroare.cod = 'AI_SUPRAINCARCAT';
				eroare.status = 503;
				throw eroare;
			}

			// Coada retine promisiuni renuntabile: daca clientul se deconecteaza
			// (signal aborted) inainte ca un slot sa fie liber, intrarea se scoate
			// din coada si nu blocheaza locul celorlalti asteptatori.
			await new Promise((rezolva, respinge) => {
				const intrare = { rezolva, respinge, curatat: false, peAbort: null };
				intrare.peAbort = () => {
					intrare.curatat = true;
					const index = this._coada.indexOf(intrare);
					if (index !== -1) this._coada.splice(index, 1);
					respinge(this.eroareAnulare());
				};
				if (signal) signal.addEventListener('abort', intrare.peAbort, { once: true });
				this._coada.push(intrare);
			});
		}

		this.activi += 1;
		try {
			return await functie();
		} finally {
			this.activi -= 1;
			const urmatorul = this._coada.shift();
			if (urmatorul) {
				if (urmatorul.peAbort) signal?.removeEventListener('abort', urmatorul.peAbort);
				if (!urmatorul.curatat) urmatorul.rezolva();
			}
		}
	}

	eroareAnulare() {
		const eroare = new Error('Cererea a fost anulată înainte de procesarea AI.');
		eroare.cod = 'REQUEST_ABORTED';
		eroare.status = 499;
		return eroare;
	}
}

module.exports = { Semafor };
