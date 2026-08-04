'use strict';

/**
 * Parsarea raspunsurilor JSON venite de la modele.
 *
 * Aceeasi logica era rescrisa in cinci locuri din server.js, in cinci variante
 * usor diferite: undeva se taia doar ```json, altundeva se cauta prima acolada,
 * altundeva un regex cu lookahead. Divergenta insemna ca un raspuns care trecea
 * pe o ruta esua pe alta, pentru acelasi model.
 *
 * O singura implementare, testabila, folosita peste tot.
 */

function curataMarcaje(text) {
	return String(text ?? '')
		.replace(/^\uFEFF/, '')
		.replace(/```(?:json|JSON)?/g, '')
		.replace(/```/g, '')
		.trim();
}

function eliminaVirguleFinale(text) {
	return text.replace(/,\s*([}\]])/g, '$1');
}

function extrageBloc(text, deschis, inchis) {
	const inceput = text.indexOf(deschis);
	const sfarsit = text.lastIndexOf(inchis);
	if (inceput === -1 || sfarsit === -1 || sfarsit <= inceput) return null;
	return text.slice(inceput, sfarsit + 1);
}

function incearcaParsare(text) {
	if (!text) return null;
	try {
		return JSON.parse(text);
	} catch {
		try {
			return JSON.parse(eliminaVirguleFinale(text));
		} catch {
			return null;
		}
	}
}

/**
 * @param {string} textBrut Raspunsul modelului.
 * @param {{ asteapta?: 'obiect'|'array'|'orice' }} [optiuni]
 * @returns {unknown|null} Valoarea parsata sau null daca nu se poate extrage JSON.
 */
function parseJsonFromLlm(textBrut, { asteapta = 'orice' } = {}) {
	const text = curataMarcaje(textBrut);
	if (!text) return null;

	const direct = incearcaParsare(text);
	if (direct !== null && potrivesteAsteptarea(direct, asteapta)) return direct;

	const ordine =
		asteapta === 'array'
			? [
					['[', ']'],
					['{', '}'],
			  ]
			: [
					['{', '}'],
					['[', ']'],
			  ];

	for (const [deschis, inchis] of ordine) {
		const bloc = extrageBloc(text, deschis, inchis);
		const valoare = incearcaParsare(bloc);
		if (valoare !== null && potrivesteAsteptarea(valoare, asteapta)) return valoare;
	}

	return null;
}

function potrivesteAsteptarea(valoare, asteapta) {
	if (asteapta === 'array') return Array.isArray(valoare);
	if (asteapta === 'obiect') {
		return valoare !== null && typeof valoare === 'object' && !Array.isArray(valoare);
	}
	return valoare !== null && typeof valoare === 'object';
}

module.exports = { parseJsonFromLlm, curataMarcaje };
