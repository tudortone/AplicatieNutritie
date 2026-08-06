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
		this.max = max;
		this.maxCoada = maxCoada;
		this.activi = 0;
		this._coada = [];
	}

	get inAsteptare() {
		return this._coada.length;
	}

	async ruleaza(functie, signal = null) {
		if (signal?.aborted) {
			const eroare = new Error('Cererea a fost anulată înainte de procesarea AI.');
			eroare.status = 499;
			throw eroare;
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
			await new Promise((rezolva, respinge) => {
				const peAbort = () => {
					const idx = this._coada.findIndex((item) => item.rezolva === rezolva);
					if (idx !== -1) {
						this._coada.splice(idx, 1);
					}
					const err = new Error('Cererea a fost anulată.');
					err.status = 499;
					respinge(err);
				};

				if (signal) {
					signal.addEventListener('abort', peAbort, { once: true });
				}

				const cb = () => {
					if (signal) signal.removeEventListener('abort', peAbort);
					if (signal?.aborted) {
						const err = new Error('Cererea a fost anulată.');
						err.status = 499;
						respinge(err);
					} else {
						rezolva();
					}
				};
				cb.rezolva = rezolva;
				this._coada.push(cb);
			});
		}

		this.activi += 1;
		try {
			if (signal?.aborted) {
				const eroare = new Error('Cererea a fost anulată.');
				eroare.status = 499;
				throw eroare;
			}
			return await functie();
		} finally {
			this.activi -= 1;
			const urmatorul = this._coada.shift();
			if (urmatorul) {
				urmatorul();
			}
		}
	}
}

module.exports = { Semafor };
