'use strict';

const { sanitizeName } = require('./sanitize');

/**
 * Validarea unei mese. Sursa unica de adevar pentru POST si PUT /api/mese.
 *
 * Inainte, cele doua rute contineau ~55 de linii identice de validare, copiate.
 * Fibrele au fost adaugate la un moment dat doar intr-una dintre ele — exact
 * modul de esec previzibil al codului duplicat.
 *
 * Contine si o corectie de fond: `Number(x) || 0` transforma tacut NaN si
 * valorile negative in 0, iar `estimare_grame || 100` transforma 0 in 100.
 * Intr-un jurnal caloric, coercitia silentioasa e mai grava decat o eroare 400.
 */

const LIMITE = Object.freeze({
	calorii: { min: 0, max: 10000, eticheta: 'Caloriile' },
	proteine: { min: 0, max: 1000, eticheta: 'Proteinele' },
	grasimi: { min: 0, max: 1000, eticheta: 'Grasimile' },
	carbohidrati: { min: 0, max: 2000, eticheta: 'Carbohidratii' },
	fibre: { min: 0, max: 1000, eticheta: 'Fibrele' },
});

const TIPURI_MASA = Object.freeze(['mic_dejun', 'pranz', 'cina', 'gustare']);
const MAX_ALIMENTE = 100;
const MAX_OCTETI_ALIMENTE = 64 * 1024;

function valideazaNumar(valoare, cheie, { obligatoriu }) {
	const limita = LIMITE[cheie];

	if (valoare === undefined || valoare === null || valoare === '') {
		if (obligatoriu) {
			return { ok: false, eroare: `${limita.eticheta} sunt obligatorii.` };
		}
		return { ok: true, prezent: false };
	}

	const numar = Number(valoare);
	if (!Number.isFinite(numar)) {
		return { ok: false, eroare: `${limita.eticheta} trebuie sa fie un numar valid.` };
	}
	if (numar < limita.min || numar > limita.max) {
		return {
			ok: false,
			eroare: `${limita.eticheta} trebuie sa fie intre ${limita.min} si ${limita.max}.`,
		};
	}

	return { ok: true, prezent: true, valoare: Math.round(numar) };
}

function valideazaAlimente(alimente) {
	if (alimente === undefined || alimente === null) {
		return { ok: true, prezent: false };
	}
	if (!Array.isArray(alimente)) {
		return { ok: false, eroare: 'Campul "alimente" trebuie sa fie o lista.' };
	}
	if (alimente.length > MAX_ALIMENTE) {
		return { ok: false, eroare: `Maxim ${MAX_ALIMENTE} alimente pe masa.` };
	}

	const serializat = JSON.stringify(alimente);
	if (serializat.length > MAX_OCTETI_ALIMENTE) {
		return { ok: false, eroare: 'Lista de alimente este prea mare.' };
	}

	return { ok: true, prezent: true, valoare: alimente };
}

/**
 * @param {object} corp req.body
 * @param {{ pentruActualizare?: boolean }} [optiuni]
 *   La actualizare, campurile absente sunt lasate neatinse in loc sa fie cerute.
 * @returns {{ ok: boolean, eroare?: string, payload?: object }}
 */
function valideazaMasa(corp, { pentruActualizare = false } = {}) {
	if (!corp || typeof corp !== 'object') {
		return { ok: false, eroare: 'Corp de cerere invalid.' };
	}

	const payload = {};

	const numeBrut = corp.nume ?? corp.nume_masa;
	if (numeBrut !== undefined && numeBrut !== null) {
		const nume = sanitizeName(numeBrut, 150);
		if (!nume) {
			return { ok: false, eroare: 'Numele mesei este obligatoriu.' };
		}
		payload.nume = nume;
	} else if (!pentruActualizare) {
		return { ok: false, eroare: 'Numele mesei este obligatoriu.' };
	}

	for (const cheie of Object.keys(LIMITE)) {
		// Caloriile sunt obligatorii la creare; restul macronutrientilor sunt
		// optionali, dar daca sunt trimisi trebuie sa fie corecti.
		const obligatoriu = !pentruActualizare && cheie === 'calorii';
		const rezultat = valideazaNumar(corp[cheie], cheie, { obligatoriu });
		if (!rezultat.ok) return rezultat;
		if (rezultat.prezent) payload[cheie] = rezultat.valoare;
		else if (!pentruActualizare) payload[cheie] = 0;
	}

	if (corp.tip_masa !== undefined && corp.tip_masa !== null) {
		const tip = String(corp.tip_masa).trim();
		if (!TIPURI_MASA.includes(tip)) {
			return {
				ok: false,
				eroare: `Tipul mesei este invalid. Valori acceptate: ${TIPURI_MASA.join(', ')}.`,
			};
		}
		payload.tip_masa = tip;
	} else if (!pentruActualizare) {
		payload.tip_masa = 'gustare';
	}

	const alimente = valideazaAlimente(corp.alimente);
	if (!alimente.ok) return alimente;
	if (alimente.prezent) payload.alimente = alimente.valoare;
	else if (!pentruActualizare) payload.alimente = [];

	if (pentruActualizare && Object.keys(payload).length === 0) {
		return { ok: false, eroare: 'Nu ai trimis niciun camp de actualizat.' };
	}

	return { ok: true, payload };
}

module.exports = { valideazaMasa, LIMITE, TIPURI_MASA, MAX_ALIMENTE };
